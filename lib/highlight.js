const crayon = require('tiny-crayon')
const hljs = require('highlight.js')
const { htmlToText } = require('html-to-text')
const { paint, colorful } = require('./paint.js')

const THEMES = {
  javascript: {
    built_in: 'cyan',
    keyword: 'cyan',
    'keyword-class': 'cyanBright',
    'keyword-return': 'red',
    'keyword-new': 'red',
    'keyword-await': 'red',
    'keyword-import': 'red',
    'keyword-from': 'red',
    number: 'magenta',
    literal: 'magenta',
    comment: 'gray',
    'title-class_': 'greenBright',
    'title-function_': 'greenBright',
    'variable-language_': 'cyan',
    'variable-language_-this': 'yellow',
    params: 'yellow',
    property: 'white',
    string: 'yellowBright'
  }
}

module.exports = function highlight (code, opts = {}) {
  if (opts.language !== 'javascript') {
    return code
  }

  const highlighted = hljs.highlight(code, { language: opts.language })
  let prev = null

  return htmlToText(highlighted.value, {
    wordwrap: false,
    decodeEntities: true,
    formatters: {
      highlight: function (elem, walk, builder, formatOptions) {
        const className = elem.attribs.class
        const content = innerText(elem.children)

        const type = className.replace('hljs-', '').replace(' ', '-')
        const color = THEMES[opts.language][type + '-' + content.slice(0, 32)] || THEMES[opts.language][type] || null

        // TODO: Simplify later, just wrote this very quickly for now
        // TODO: Add a helper in tiny-crayon to avoid custom paint/colorful/etc
        // TODO: Double check prev value

        try {
          if (opts.language === 'javascript') {
            if (type === 'title-class_') {
              if (prev?.type === 'keyword' && prev?.content === 'new') {
                builder.addLiteral(paint(colorful('colors', 'white', 'open')))
                walk(elem.children, builder)
                builder.addLiteral(paint(colorful('colors', 'white', 'close')))

                return
              }
            }

            if (type === 'title-function_') {
              if ((prev?.type === 'keyword' && prev?.content !== 'function') || prev?.type === 'variable-language_') {
                builder.addLiteral(paint(colorful('colorsBright', 'cyanBright', 'open')))
                walk(elem.children, builder)
                builder.addLiteral(paint(colorful('colorsBright', 'cyanBright', 'close')))

                return
              }
            }

            if (type === 'params') {
              innerText(elem.children, function (text) {
                return text.split(',').map(arg => crayon.yellow(arg)).join(',')
              })

              walk(elem.children, builder)

              return
            }
          }

          if (color) {
            const category = color.endsWith('Bright') ? 'colorsBright' : 'colors'

            const open = paint(colorful(category, color, 'open'))
            const close = paint(colorful(category, color, 'close'))

            builder.addLiteral(open)
            walk(elem.children, builder)
            builder.addLiteral(close)
          } else {
            const open = paint(colorful('colors', 'white', 'open'))
            const close = paint(colorful('colors', 'white', 'close'))

            builder.addLiteral(open)
            walk(elem.children, builder)
            builder.addLiteral(close)
          }
        } finally {
          prev = { type, content }
        }
      }
    },
    selectors: [
      { selector: 'span', format: 'highlight' }
    ]
  })
}

function innerText (children, replacer) {
  let out = ''

  for (const elem of children) {
    if (elem.type === 'text') {
      if (replacer) {
        elem.data = replacer(elem.data)
      }

      out += elem.data
      continue
    }

    if (elem.type === 'tag') {
      out += innerText(elem.children)
      continue
    }
  }

  return out
}
