const path = require('path')
const crayon = require('tiny-crayon')
const ask = require('./ask.js')
const Cisco = require('./cisco.js')
const pkg = require('../package.json')

module.exports = async function app (opts = {}) {
  const {
    cwd = path.resolve('.'),
    quiet = true,
    verbose = false
  } = opts

  const cisco = new Cisco({ cwd, quiet, verbose })

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

    const out = await ask(crayon.greenBright(crayon.bold('> ')))

    if (out === null) break
    if (out === '') continue

    try {
      const answer = await cisco.receive(out)

      // It's a command (probably we should know it beforehand)
      if (!answer) {
        continue
      }

      // It's handled inside the receive method for now
    } catch (err) {
      console.error(err)
    }
  }
}

function startup () {
  const width = Math.max(3, Math.min(16, process.stdout.columns))

  console.log('─'.repeat(width))
  console.log(crayon.cyan(crayon.bold('Cisco')) + ' ' + crayon.gray('v' + pkg.version))
  // console.log('Use /help or run "cisco --help"')
  // console.log('─'.repeat(width))
}
