const os = require('os')
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')
const safe = require('like-safe')
const ask = require('ask-readline')
const crayon = require('tiny-crayon')
const prompts = require('./prompts.js')
const TokenStream = require('./token-stream.js')

module.exports = class Cisco {
  constructor (opts = {}) {
    this.openai = new OpenAI({
      baseURL: opts.baseURL || process.env.CISCO_BASE_URL || null,
      apiKey: opts.apiKey || process.env.CISCO_API_KEY || process.env.OPENAI_API_KEY || null
    })

    this.cwd = opts.cwd || '.'
    this.interactive = !!opts.interactive

    this.quiet = opts.quiet !== false
    this.verbose = !!opts.verbose

    this.once = true

    this.files = []
    this.chat = []

    this.commands = new Commands(this)

    this.canceling = false
    this.closing = false
  }

  cancel () {
    this.canceling = true
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

    if (this.canceling) {
      this.canceling = false
      return
    }

    // TODO: Stream answer
    const stream = await gptStream(this.openai, messages)
    const parser = new TokenStream({ quiet: this.quiet })
    let usage = null

    const loop = parser.loop()

    loop.catch(() => {})

    for await (const data of stream) {
      if (this.canceling) {
        this.canceling = false
        parser.cancel()
        return
      }

      if (data.delta) {
        parser.push(data.delta)
      }

      if (data.stop) {
        continue
      }

      if (data.usage) {
        usage = data.usage
      }
    }

    parser.push(null)

    await loop

    if (this.canceling) {
      this.canceling = false
      return
    }

    if (!this.quiet && this.verbose) {
      if (usage) {
        console.log(crayon.gray('Tokens: ' + usage.prompt_tokens + ' sent, ' + usage.completion_tokens + ' received, ' + usage.prompt_tokens_details.cached_tokens + ' cached.'))
      } else {
        console.log(crayon.red('No usage available!'))
      }
    }

    if (this.verbose) {
      console.log('AI answer', [parser.queue])
    }

    this.chat.push({ role: 'assistant', content: parser.queue })

    for (const { filename, search, replace } of parser.changes) {
      const absoluteFilename = path.join(this.cwd, filename)

      if (!search) {
        const [st] = await safe(fs.promises.stat(absoluteFilename))

        if (!st) {
          const accept = !this.interactive || await askYesNo(crayon.greenBright('Create new file? ' + crayon.bold(absoluteFilename) + ' [Y/n]'))

          if (!accept) {
            continue
          }
        }

        if (st) {
          await fs.promises.writeFile(absoluteFilename, replace, { flag: 'w' })
        } else {
          await fs.promises.mkdir(path.dirname(absoluteFilename), { recursive: true })
          await fs.promises.writeFile(absoluteFilename, replace, { flag: 'wx' })
          await this.commands.add(filename)
        }

        continue
      }

      // TODO: Should make it so that it can't go back outside of cwd
      const content = await fs.promises.readFile(absoluteFilename, 'utf8')

      // TODO: Check if the search matches otherwise retry request?
      // TODO: Check syntax errors?

      if (content.includes(search)) {
        // TODO: Maybe group all changes for the same file, and apply them more atomically
        await fs.promises.writeFile(absoluteFilename, content.replace(search, replace))
      } else {
        // TODO: If this happens then do a full file edit
        console.error('Could not apply SEARCH-REPLACE block', { search, replace })

        await this.receive('This search-replace block is wrong, fix it: <<<<<<< SEARCH\n' + search + '=======\n' + replace + '>>>>>>> REPLACE')
      }
    }
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

        const accept = !this.interactive || await askYesNo(crayon.greenBright('Do you want to create ' + crayon.bold(absoluteFilename) + '? [Y/n]'))

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

async function * gptStream (openai, messages) {
  const response = await openai.chat.completions.create({
    model: process.env.CISCO_MODEL || 'gpt-4o',
    messages,
    stream: true,
    stream_options: {
      include_usage: true
    }
  }, { responseType: 'stream' })

  for await (const data of response) {
    if (data.usage) {
      yield { usage: data.usage }
      break
    }

    if (data.choices.length === 0) {
      console.error(data)
      throw new Error('No reply choices')
    }

    const choice = data.choices[0]

    if (choice.finish_reason === 'stop') {
      // OpenAI doesn't do this but some APIs
      if (choice.delta.role === 'assistant') {
        yield { delta: choice.delta.content }
      }

      yield { stop: true }
      continue
    }

    // Initial message
    if (choice.delta.role && choice.delta.content === '') {
      // Ignore assistant role and empty content

      if (choice.delta.refusal) {
        console.error(data, choice)
        throw new Error('Refusal')
      }

      continue
    }

    // Message chunks
    yield { delta: choice.delta.content }
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
