const path = require('path')
const crayon = require('tiny-crayon')
const GitHub = require('like-github')
const ask = require('./ask.js')
const Cisco = require('./cisco.js')
// const pkg = require('../package.json')

const URL_MATCH = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/ig

module.exports = async function app (opts = {}) {
  const {
    cwd = path.resolve('.'),
    quiet = true,
    verbose = false
  } = opts

  const gh = new GitHub()
  const cisco = new Cisco({ cwd, quiet, verbose })
  let busy = false

  process.on('SIGINT', onSignal)

  while (true) {
    if (cisco.once) {
      cisco.once = false
      startup()
    }

    if (cisco.closing) {
      break
    }

    if (cisco.files.length) {
      // console.log('─'.repeat(width))
      console.log(crayon.gray(cisco.files.join(' ')))
    }

    let out = await ask(crayon.greenBright(crayon.bold('> ')))

    if (out === null) break
    if (out === '') continue

    const links = out.match(URL_MATCH)

    if (links && links.length) {
      for (const link of links) {
        if (!link.startsWith('https://github.com')) {
          continue
        }

        const url = new URL(link)
        const [owner, repo] = url.pathname.split('/').filter(Boolean)
        const readme = await gh.users.readme(owner, repo)

        out += '\n\nDocumentation of the link: ' + link + '\n' + (readme || 'No README.md available')
      }
    }

    try {
      busy = true

      await cisco.receive(out)
    } catch (err) {
      console.error(err)
    } finally {
      busy = false
    }
  }

  function onSignal () {
    if (busy) {
      cisco.cancel()
    } else {
      process.exit()
    }
  }
}

function startup () {
  // const width = Math.max(3, Math.min(16, process.stdout.columns))

  // console.log('─'.repeat(width))
  // console.log(crayon.cyan(crayon.bold('Cisco')) + ' ' + crayon.gray('v' + pkg.version))
  console.log(crayon.bgBlack(('CISCO TERMINAL')))
  // console.log('Use /help or run "cisco --help"')
  // console.log('─'.repeat(width))
}
