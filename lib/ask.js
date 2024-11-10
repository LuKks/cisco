const readline = require('readline')

module.exports = function ask (query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    let answer = null

    rl.question(query || '', function ($answer) {
      answer = $answer
      rl.close()
    })

    rl.once('close', function () {
      if (answer === null) process.stdout.write('\r\n')

      if (rl.line.length && answer === null) {
        answer = ''
      }

      resolve(answer)
    })
  })
}
