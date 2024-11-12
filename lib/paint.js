const spectrum = {
  modifiers1: { reset: [0, 0], bold: [1, 22], dim: [2, 22], italic: [3, 23], underline: [4, 24] },
  modifiers2: { overline: [53, 55], inverse: [7, 27], hidden: [8, 28], strikethrough: [9, 29] },
  colors: { index: 30, list: ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'], close: 39 },
  colorsBright: { index: 90, list: ['blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'], close: 39 },
  bgColor: { index: 40, list: ['bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite'], close: 49 },
  bgColorBright: { index: 100, list: ['bgBlackBright', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'], close: 49 }
}

/* Example
paintOut('colorsBright', 'greenBright', 'open')
paintOut('modifiers1', 'bold', 'open')

const out = await ask('> ')

paintOut('modifiers1', 'bold', 'close')
paintOut('colorsBright', 'greenBright', 'close') */

module.exports = {
  spectrum,
  paintOut,
  colorful,
  paint
}

function paintOut (category, name, action) {
  process.stdout.write(paint(colorful(category, name, action)))
}

function colorful (category, name, action) {
  if (category === 'colors' || category === 'colorsBright' || category === 'bgColor') {
    if (action === 'open') {
      return spectrum[category].index + spectrum[category].list.findIndex(c => c === name)
    } else {
      return spectrum[category].close
    }
  } else {
    return spectrum[category][name][action === 'open' ? 0 : 1]
  }
}

function paint (code) {
  return '\x1B[' + code + 'm'
}
