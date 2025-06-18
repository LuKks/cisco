const readline = require('readline')

module.exports = function ask (query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    if (query) process.stdout.write(query)

    const lines = []
    let cancelled = false

    let timeout = null
    let pasted = false

    rl.on('line', line => {
      if (line === '') {
        rl.close()
      } else {
        lines.push(line)

        if (timeout) {
          pasted = true

          clearTimeout(timeout)
        }

        timeout = setTimeout(onTimeout, 10)
      }
    })

    function onTimeout () {
      if (pasted) {
        pasted = false
        clearTimeout(timeout)
        timeout = null
        return
      }

      rl.close()
    }

    rl.on('SIGINT', () => {
      cancelled = true
      rl.close()
    })

    rl.on('close', () => {
      let answer = null

      if (cancelled) {
        process.stdout.write('\r\n')

        answer = rl.line && rl.line.length || lines.length ? '' : null
      } else {
        answer = lines.length ? lines.join('\n') : ''
      }

      resolve(answer)
    })
  })
}
