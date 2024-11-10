const crayon = require('tiny-crayon')
const hljs = require('highlight.js')
const he = require('he')

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

  return highlighted.value.replace(/<span class="(.*?)">(.*?)<\/span>/g, function replacer (match, tokenType, content) {
    const type = tokenType.replace('hljs-', '').replace(' ', '-')
    const color = THEMES[highlighted.language][type + '-' + content.slice(0, 32)] || THEMES[highlighted.language][type] || null

    try {
      if (highlighted.language === 'javascript') {
        const out = highlightJavaScriptExceptions(prev, type, content)

        if (out) {
          return out
        }
      }

      if (opts.verbose && color === null) {
        console.log({ type, content })
      }

      return crayon[color || 'white'](he.decode(content))
    } finally {
      prev = { type, content }
    }
  })
}

function highlightJavaScriptExceptions (prev, type, content) {
  if (type === 'title-class_') {
    if (prev?.type === 'keyword' && prev?.content === 'new') {
      return crayon.white(he.decode(content))
    }
  }

  if (type === 'title-function_') {
    if ((prev?.type === 'keyword' && prev?.content !== 'function') || prev?.type === 'variable-language_') {
      return crayon.cyanBright(he.decode(content))
    }
  }

  if (type === 'params') {
    return content.split(',').map(arg => crayon.yellow(he.decode(arg))).join(',')
  }

  return null
}
