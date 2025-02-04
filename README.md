# cisco

AI pair programming in your terminal

```
npm i -g the-cisco
```

Warning: Experimental and early stages of development.

I recommend using it in new folders with no sensitive files for now.

https://github.com/user-attachments/assets/2a8023d8-108d-45ff-a404-ceb4deecbe4a

## Usage (CLI)

```sh
cisco [options]

Options:
  -V, --version     output the version number
  -c, --cwd <path>  the path to the working directory (default: ".")
  -q, --quiet       stay silent (default: false)
  --verbose         print logs (default: false)
  -h, --help        display help for command
```

## Settings

Use the file `~/.env` for global configuration.

Otherwise, use a `.env` file relative to where you run the commands.

If you use OpenAI API:

```sh
OPENAI_API_KEY = "sk-proj-abc123"
```

Your own API:

```sh
CISCO_BASE_URL = "https://openrouter.ai/api/v1"
CISCO_API_KEY = "sk-or-v1-abc123"
CISCO_MODEL = "deepseek/deepseek-chat"
```

## Usage (Module)

```js
const { execFileSync } = require('child_process')
const Cisco = require('the-cisco')

const cisco = new Cisco()

// This can be from user input, request, etcetera
const message = 'Create a Node.js script named temp.js that prints \
                the temperature of Argentina, Buenos Aires \
                without using libraries or requiring an API key. \
                Use a free API like open-meteo.com'

await cisco.receive(message)

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

## API

#### `cisco = new Cisco([options])`

Create a new Cisco instance.

Options:

```js
{
  baseURL: process.env.CISCO_BASE_URL,
  apiKey: process.env.CISCO_API_KEY || process.env.OPENAI_API_KEY,
  cwd: '.',
  interactive: false,
  quiet: true,
  verbose: false
}
```

#### `await cisco.receive(message)`

Completes the request of the message.

It will create or edit files automatically.

#### `cisco.cancel()`

Signal to cancel the current stream of the answer.

Can be used several times.

#### `await cisco.commands.add(filename)`

Add a new file for editing and context.

#### `await cisco.commands.drop(filename)`

Remove a file from the context.

#### `cisco.files`

List of current files in the context.

#### `cisco.chat`

History of messages.

Currently, it's stateless. E.g. Closing the terminal resets the chat.

## Notes

There are more methods but I'm limiting the documentation.

API is not stable due very early stages of development.

## License

MIT
