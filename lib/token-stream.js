const crayon = require('tiny-crayon')
const countBreakLines = require('count-break-lines')
const highlight = require('./highlight.js')
const { paint, colorful } = require('./paint.js')

const COLOR_OPEN = color => paint(colorful('colors', color, 'open'))
const COLOR_CLOSE = color => paint(colorful('colors', color, 'close'))

const BACKGROUND_OPEN = color => paint(colorful('bgColor', color, 'open'))
const BACKGROUND_CLOSE = color => paint(colorful('bgColor', color, 'close'))

module.exports = class TokenStream {
  constructor (opts = {}) {
    // TODO: Could use a custom stream so output can be ignored externally
    this.quiet = opts.quiet !== false
    this.queue = ''
    this.position = 0
    this.tick = promiseWithResolvers()
    this.changes = []
  }

  push (input) {
    if (this.finished) {
      throw new Error('Finished')
    }

    if (input === null) {
      this.done()
      return
    }

    if (!input) {
      throw new Error('No support for empty values: ' + input)
    }

    // Queue increases in length
    this.queue += input

    this.tick.resolve(true)
    this.tick = promiseWithResolvers()
  }

  done () {
    this.finished = true

    this.tick.resolve(false)
  }

  cancel () {
    if (this.quiet) {
      return
    }

    process.stdout.write(BACKGROUND_CLOSE('bgBlack'))
    process.stdout.write(COLOR_CLOSE('cyan'))
    process.stdout.write('\n')
  }

  async recv () {
    if (this.position >= this.queue.length) {
      const remaining = await this.tick.promise

      if (!remaining) {
        return null
      }
    }

    const char = this.queue[this.position++]

    return char
  }

  async get (index) {
    if (this.position + index >= this.queue.length) {
      const remaining = await this.tick.promise

      if (!remaining) {
        return null
      }
    }

    if (this.position + index < 0) {
      return null
    }

    const char = this.queue[this.position + index]

    return char
  }

  async loop () {
    if (!this.quiet) {
      process.stdout.write(COLOR_OPEN('cyan'))
    }

    while (true) {
      const char = await this.recv()

      if (char === null) {
        break
      }

      if (char === '`') {
        const backticksOpen = await this.getRange(-1, 1)
        let pointer = backticksOpen.length - 1

        if (backticksOpen === '```') {
          const filename1 = await this.getBackward(-3)
          let filename2 = null

          const language = await this.getForward(2)
          pointer += language.length + 1

          let lts = await this.getForward(pointer)
          pointer += lts.length + 1

          // Not a search meaning bad format but potentially recoverable
          if (!lts.match(/^<{3,10} SEARCH$/i)) {
            filename2 = await this.getForward(pointer)
            lts = await this.getForward(pointer)

            // Wrong format
            if (!lts.match(/^<{3,10} SEARCH$/i)) {
              continue
            }
          }

          if (!filename2 && !this.quiet) {
            process.stdout.moveCursor(0, -1)
            process.stdout.clearLine(1)
            process.stdout.cursorTo(0)
          }

          const filename = trimChar((filename2 || filename1).trim(), '`')

          this.position += pointer
          pointer = 0

          if (!this.quiet) {
            process.stdout.write(COLOR_CLOSE('cyan'))

            process.stdout.write(crayon.bgBlack(filename))
            process.stdout.write('\n')

            process.stdout.write(crayon.bgBlack(crayon.redBright(crayon.bold('<<<<<<<')) + ' ' + crayon.greenBright(crayon.bold('SEARCH'))))
            process.stdout.write('\n')

            process.stdout.write(BACKGROUND_OPEN('bgBlack'))
          }

          const search = [] // TODO: Must work with multiple new lines "search: log()\n\n\nlog() replace: ..."
          let stdout = streamCursor(process.stdout)

          while (true) {
            const line = await this.getForward(0, { null: true })

            if (line === null) {
              break
            }

            this.position += line.length + 1

            if (line.match(/^={4,10}$/i)) {
              if (search.length && !this.quiet) {
                stdout.clear()
                stdout(highlight(search.join('\n'), { language }))
              }

              if (!this.quiet) {
                process.stdout.write(BACKGROUND_CLOSE('bgBlack'))

                if (search.length) {
                  process.stdout.write('\n')
                }

                process.stdout.write(crayon.bgBlack(crayon.redBright(crayon.bold('======='))))
                process.stdout.write('\n')
              }

              break
            }

            search.push(line)

            if (!this.quiet) {
              stdout.clear()
              stdout(highlight(search.join('\n'), { language }) + '\n')
            }
          }

          if (!this.quiet) {
            process.stdout.write(BACKGROUND_OPEN('bgBlack'))
          }

          const replace = []
          stdout = streamCursor(process.stdout)

          while (true) {
            const line = await this.getForward(0, { null: true })

            if (line === null) {
              break
            }

            this.position += line.length + 1

            if (line.match(/^>{3,10} REPLACE$/i)) {
              if (replace.length && !this.quiet) {
                stdout.clear()
                stdout(highlight(replace.join('\n'), { language }))
              }

              if (!this.quiet) {
                process.stdout.write(BACKGROUND_CLOSE('bgBlack'))

                if (replace.length) {
                  process.stdout.write('\n')
                }

                process.stdout.write(crayon.bgBlack(crayon.redBright(crayon.bold('>>>>>>>')) + ' ' + crayon.greenBright(crayon.bold('REPLACE'))))
                process.stdout.write('\n')
              }

              break
            }

            replace.push(line)

            if (!this.quiet) {
              stdout.clear()
              stdout(highlight(replace.join('\n'), { language }) + '\n')
            }
          }

          const backticksClose = await this.getForward(0) // Plus newline

          if (backticksClose === '```') {
            this.position += backticksClose.length + 1
          }

          if (!this.quiet) {
            process.stdout.write(BACKGROUND_CLOSE('bgBlack'))
            process.stdout.write(COLOR_OPEN('cyan'))
          }

          if (replace.length === 1 && (replace[0].match(/[<>]{3,10} REPLACE/i) || replace[0].match(/[<>]{3,10} SEARCH/i))) {
            replace.shift(1, 1)
          }

          this.changes.push({
            filename,
            language,
            search: search.join('\n'),
            replace: replace.join('\n')
          })

          continue
        }
      }

      if (!this.quiet) {
        process.stdout.write(char)
      }
    }

    if (!this.quiet) {
      process.stdout.write(COLOR_CLOSE('cyan'))
      process.stdout.write('\n')
    }
  }

  async getRange (from, to, opts = {}) {
    let out = ''

    for (let r = from; r <= to; r++) {
      const char = await this.get(r)

      if (char === null) {
        break
      }

      if (opts.line && char === '\n') {
        break
      }

      out += char
    }

    return out
  }

  async getBackward (from) {
    let out = ''

    for (let i = from; true; i--) {
      const c = await this.get(i)

      if (c === '\n' || c === null) {
        break
      }

      out += c
    }

    return reverse(out)
  }

  async getForward (from, opts = {}) {
    let out = ''

    for (let i = from; true; i++) {
      const c = await this.get(i)

      if (opts.null && c === null && !out) {
        return null
      }

      if (c === '\n' || c === null) {
        break
      }

      out += c
    }

    return out
  }

  async getForwardRange (from, to) {
    return this.getRange(from, to, { line: true })
  }
}

// Based on stream-cursor
// TODO: Remove/simplify, we don't need most of this
function streamCursor (stream) {
  const updating = stream.isTTY
  let totalLines = 0

  cursor.clear = clear
  cursor.end = end
  return cursor

  function cursor (data = '') {
    data = data.toString()
    clear()
    totalLines = 1 + countBreakLines(data, stream.columns) - 1
    stream.write(data)
  }

  function clear () {
    if (!updating) return
    if (!totalLines) return

    stream.cursorTo(0)

    for (let i = 0; i < totalLines; i++) {
      stream.moveCursor(0, -1)
      stream.clearLine(1)
    }

    totalLines = 0
  }

  function end (data = '') {
    data = data.toString()
    clear()
    totalLines = 0
    stream.write(data + '\n')
  }
}

function reverse (str) {
  let out = ''

  for (let i = str.length - 1; i >= 0; i--) {
    out += str[i]
  }

  return out
}

function trimChar (str, char) {
  while (str.startsWith(char)) {
    str = str.substring(1)
  }

  while (str.endsWith(char)) {
    str = str.substring(0, str.length - 1)
  }

  return str
}

function promiseWithResolvers () {
  let resolve = null
  let reject = null

  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  return { promise, resolve, reject }
}
