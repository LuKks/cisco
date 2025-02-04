# cisco

AI pair programming in your terminal

```
npm i -g the-cisco
```

Warning: Experimental and early stage of development.

## Usage

CLI

```sh
cisco [options]

Options:
  -V, --version     output the version number
  -c, --cwd <path>  the path to the working directory (default: ".")
  -q, --quiet       stay silent (default: false)
  --verbose         print logs (default: false)
  -h, --help        display help for command
```

https://github.com/user-attachments/assets/2a8023d8-108d-45ff-a404-ceb4deecbe4a

Module

```js
const { execFileSync } = require('child_process')
const Cisco = require('the-cisco')

const cisco = new Cisco()

// This can be from user input, request, etcetera
const prompt = 'Create a Node.js script named temp.js that prints \
                the temperature of Argentina, Buenos Aires \
                without using libraries or requiring an API key. \
                Use a free API like open-meteo.com'

await cisco.receive(prompt)

// File created! You will have a ./temp.js file that you can run!
console.log(node('./temp.js'))

await cisco.receive('Change it to print the temperature of \
                    Santa Fe instead of Buenos Aires, \
                    update the log also.')

// File updated!
console.log(node('./temp.js'))

function node (filename) {
  return execFileSync(process.execPath, [filename], { encoding: 'utf8' })
}
```
