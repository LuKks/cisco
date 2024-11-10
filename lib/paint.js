const colors = {
  modifiers1: { reset: [0, 0], bold: [1, 22], dim: [2, 22], italic: [3, 23], underline: [4, 24] },
  colorsBright: { index: 90, list: ['blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'], close: 39 }
}

/* Example
paintOut('colorsBright', 'greenBright', 'open')
paintOut('modifiers1', 'bold', 'open')

const out = await ask('> ')

paintOut('modifiers1', 'bold', 'close')
paintOut('colorsBright', 'greenBright', 'close') */

module.exports = function paintOut (category, name, action) {
  process.stdout.write(paint(colorful(category, name, action)))
}

function colorful (category, name, action) {
  if (category === 'colorsBright') {
    if (action === 'open') {
      return colors[category].index + colors[category].list.findIndex(c => c === name)
    } else {
      return colors[category].close
    }
  } else {
    return colors[category][name][action === 'open' ? 0 : 1]
  }
}

function paint (code) {
  return '\x1B[' + code + 'm'
}
