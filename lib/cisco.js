const os = require('os')
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')
const safe = require('like-safe')
const ask = require('ask-readline')
const crayon = require('tiny-crayon')
const highlight = require('./highlight.js')
const { paint, colorful } = require('./paint.js')
const prompts = require('./prompts.js')

const SEARCH_REPLACE = /(.*)?\n```(.*)\n(.*?\n)?(<{3,10} SEARCH\n([\s\S]*?)\n?={3,10}\n([\s\S]+?)>{3,10} REPLACE)\n```/ig

module.exports = class Cisco {
  constructor (opts = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    this.cwd = opts.cwd || '.'
    this.yes = opts.yes || false

    this.quiet = opts.quiet !== false
    this.verbose = !!opts.verbose

    this.once = true

    this.files = []
    this.chat = []

    this.commands = new Commands(this)

    this.closing = false
  }

  async receive (message) {
    const [cmd, arg] = parseCommand(message)

    if (cmd) {
      if (cmd === '/') {
        console.error('Invalid command')
        return
      }

      const commandWithoutSlash = cmd.substring(1)

      if (typeof this.commands[commandWithoutSlash] === 'function') {
        await this.commands[commandWithoutSlash](arg)
      } else {
        console.error('Invalid command:', cmd)
      }

      return
    }

    // Handle chat message

    // Base
    const messages = [
      {
        role: 'system',
        content: prompts.main_system_coder
          .replace('{lazy_prompt}', prompts.lazy_prompt)
          .replace('{shell_cmd_prompt}', prompts.shell_cmd_prompt.replace('{platform}', getPlatformInfo())) +
          prompts.system_reminder
            .replace('{lazy_prompt}', prompts.lazy_prompt)
            .replace('{shell_cmd_reminder}', prompts.shell_cmd_reminder)
      },
      ...prompts.example_messages,
      { role: 'user', content: 'I switched to a new code base. Please don\'t consider the above files or try to edit them any longer.' },
      { role: 'assistant', content: 'Ok.' }
    ]

    // Repo-map
    const contentMap = await this._contentMap()

    if (contentMap.length) {
      messages.push(
        {
          role: 'user',
          content: prompts.repo_content_prefix + (contentMap.length ? '\n\n' : '') + contentMap.map(content => {
            return content.filename
          }).join('\n\n')
        },
        { role: 'assistant', content: 'Ok, I won\'t try and edit those files without asking first.' }
      )
    }

    // Full files
    if (this.files.length === 0) {
      if (contentMap.length === 0) {
        messages.push(
          { role: 'user', content: prompts.files_no_full_files },
          { role: 'assistant', content: 'Ok.' }
        )
      } else {
        messages.push(
          { role: 'user', content: prompts.files_no_full_files_with_repo_map },
          { role: 'assistant', content: prompts.files_no_full_files_with_repo_map_reply }
        )
      }
    } else {
      const fullFiles = await this._fullFiles()

      messages.push(
        {
          role: 'user',
          content: prompts.files_content_prefix + '\n\n' + fullFiles.map(file => {
            return file.filename + '\n```\n' + file.content + '```'
          }).join('\n\n')
        },
        { role: 'assistant', content: prompts.files_content_assistant_reply }
      )
    }

    // Chat
    this.chat.push(
      { role: 'user', content: message }
    )

    messages.push(
      ...this.chat,
      {
        role: 'system',
        content: prompts.system_reminder
          .replace('{lazy_prompt}', prompts.lazy_prompt)
          .replace('{shell_cmd_reminder}', prompts.shell_cmd_reminder)
      }
    )

    // TODO: Stream answer
    const answer = await gpt(this.openai, messages)
    const changes = answer.out.content.matchAll(SEARCH_REPLACE)

    if (this.verbose) {
      console.log('AI answer', [answer.out.content])
    }

    if (!this.quiet) {
      const open = paint(colorful('colors', 'cyan', 'open'))
      const close = paint(colorful('colors', 'cyan', 'close'))

      console.log(open + answer.out.content.replace(SEARCH_REPLACE, function replacer (match, filename1, language, filename2, block, search, replace) {
        return close + crayon.bgBlack(`
${filename1 || filename2}
${crayon.redBright(crayon.bold('<<<<<<<'))} ${crayon.greenBright(crayon.bold('SEARCH'))}${search ? '\n' + highlight(search, { language }) : ''}
${crayon.redBright(crayon.bold('======='))}
${highlight(replace.replace(/\n$/, ''), { language })}
${crayon.redBright(crayon.bold('>>>>>>>'))} ${crayon.greenBright(crayon.bold('REPLACE'))}
        `.trim()) + open
      }) + close)

      if (this.verbose) {
        console.log(crayon.gray('Tokens: ' + answer.usage.prompt_tokens + ' sent, ' + answer.usage.completion_tokens + ' received, ' + answer.usage.prompt_tokens_details.cached_tokens + ' cached.'))
      }
    }

    for (const [, filename1, , filename2, , search, replace] of changes) {
      const absoluteFilename = path.join(this.cwd, filename1 || filename2)

      if (!search) {
        const accept = this.yes || await askYesNo(crayon.greenBright('Create new file? ' + crayon.bold(absoluteFilename) + ' [Y/n]'))

        if (accept) {
          await fs.promises.mkdir(path.dirname(absoluteFilename), { recursive: true })
          await fs.promises.writeFile(absoluteFilename, replace, { flag: 'wx' })
          await this.commands.add(filename1 || filename2)
        }

        continue
      }

      // TODO: Should make it so that it can't go back outside of cwd
      const content = await fs.promises.readFile(absoluteFilename, 'utf8')

      // TODO: Check if the search matches otherwise retry request?
      // TODO: Check syntax errors?

      // TODO: Maybe group all changes for the same file, and apply them more atomically
      await fs.promises.writeFile(absoluteFilename, content.replace(search, replace))
    }

    this.chat.push({ role: 'assistant', content: answer.out.content })

    return answer
  }

  // TODO: This method needs to be very clear due security
  async _contentMap () {
    const contents = []
    const stack = [this.cwd]

    while (stack.length) {
      const dir = stack.pop()
      const iterator = await readdir(dir)

      if (!iterator) {
        continue
      }

      for await (const dirent of iterator) {
        const filename = path.join(dir, dirent.name)

        // TODO: Needs to ignore what .gitignore lists
        // TODO: If git is not being used, it should still ignore .env files etc etc
        // TODO: Probably filter heavy files also

        if ((dirent.name[0] === '.' && dirent.name !== '.github') || dirent.name.endsWith('.env')) {
          continue
        }

        if (dirent.name === 'package-lock.json') {
          continue
        }

        if (dirent.isDirectory()) {
          if (dirent.name === '.git' || dirent.name === 'node_modules' || dirent.name === 'coverage') {
            continue
          }

          // Python
          if (dirent.name === '__pycache__' || dirent.name === 'venv') {
            // Note: Ignore 'venv' especially if it has a pyvenv.cfg file
            continue
          }

          stack.push(filename)

          continue
        }

        // TODO: Get the function definitions, first lines of each func, etc

        contents.push({
          filename: path.relative(this.cwd, filename),
          content: null
        })
      }
    }

    return contents
  }

  async _fullFiles () {
    const contents = []

    for (const filename of this.files) {
      const content = await fs.promises.readFile(path.join(this.cwd, filename), 'utf8')

      contents.push({
        filename,
        content
      })
    }

    return contents
  }

  close () {
    this.closing = true
  }
}

async function readdir (dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
}

class Commands {
  constructor (cisco) {
    this.cisco = cisco
  }

  quit () {
    this.cisco.close()
  }

  clear () {
    this.cisco.chat = []
    this.cisco.once = true

    process.stdout.write('\x1Bc')
  }

  reset () {
    this.cisco.chat = []
    this.cisco.files = []
    this.cisco.once = true

    process.stdout.write('\x1Bc')

    if (!this.cisco.quiet) {
      console.log(crayon.blueBright('All files dropped and chat history cleared.'))
    }
  }

  async add (...filenames) {
    for (const filename of filenames) {
      const absoluteFilename = path.resolve(path.join(this.cisco.cwd, filename))

      if (this.cisco.files.find(f => f === filename)) {
        console.error('Already in the chat as an editable file', crayon.bold(absoluteFilename))
        continue
      }

      const [st] = await safe(fs.promises.stat(absoluteFilename))

      if (!st) {
        if (!this.cisco.quiet) {
          console.log(crayon.red('No files matched "' + crayon.bold(filename) + '".'))
        }

        const accept = this.yes || await askYesNo(crayon.greenBright('Do you want to create ' + crayon.bold(absoluteFilename) + '? [Y/n]'))

        if (!accept) {
          continue
        }

        await fs.promises.mkdir(path.dirname(absoluteFilename), { recursive: true })
        await fs.promises.writeFile(absoluteFilename, '\n', { flag: 'wx' })
      }

      this.cisco.files.push(filename)

      if (!this.cisco.quiet) {
        console.log(crayon.blueBright('Added ' + crayon.bold(absoluteFilename) + ' to the chat'))
      }
    }
  }

  drop (...filenames) {
    for (const filename of filenames) {
      const index = this.cisco.files.findIndex(f => f === filename)

      if (index > -1) {
        this.cisco.files.splice(index, 1)

        if (!this.cisco.quiet) {
          console.log(crayon.blueBright('Removed ' + crayon.bold(filename) + ' from the chat'))
        }
      }
    }
  }
}

async function askYesNo (query) {
  while (true) {
    const out = await ask(query ? query + ' ' : '')
    const lc = out ? out.toLowerCase() : ''

    if (out === null || lc === 'n' || lc === 'no') {
      return false
    }

    if (out === '' || lc === 'y' || lc === 'yes') {
      return true
    }

    console.error('Invalid answer, posible values are: yes, no')
  }
}

function parseCommand (message) {
  const isCommand = message[0] === '/'

  if (!isCommand) {
    return [null]
  }

  const space = message.indexOf(' ')
  let separator = null

  if (space > -1) {
    separator = space
  } else {
    separator = message.length
  }

  const cmd = message.slice(0, separator)
  const arg = message.slice(separator + 1)

  return [cmd, arg]
}

async function gpt (openai, messages) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages
  })

  if (!response.choices || !response.choices.length) {
    console.error(response)

    throw new Error('Unexpected response format')
  }

  const out = response.choices[0].message

  if (out.refusal) {
    console.error(out)
    throw new Error('Refusal')
  }

  return {
    out,
    usage: response.usage
  }
}

function getPlatformInfo () {
  const shell = getUserShell()

  const info = {
    platform: `${os.type()}-${os.release()}-${os.arch()}-with-${os.platform()}`,
    shell: `${shell[0]}=${shell[1]}`,
    lang: getUserLanguage(),
    date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  return `
- Platform: ${info.platform}
- Shell: ${info.shell}
- Language: ${info.lang}
- Current date: ${info.date}
- Timezone: ${info.timezone}
`.trim()
}

function getUserShell () {
  const name = os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'
  const value = process.env[name] || ''

  return [name, value]
}

function getUserLanguage () {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale

    if (locale) {
      return locale
    }
  } catch {}

  for (const name of ['LANG', 'LANGUAGE', 'LC_ALL', 'LC_MESSAGES']) {
    const lang = process.env[name]

    if (lang) {
      return lang.split('.')[0]
    }
  }

  return null
}
