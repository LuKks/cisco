const path = require('path')
const cp = require('child_process')
const test = require('brittle')
const tmp = require('like-tmp')
const dotenv = require('dotenv')
const safetyCatch = require('safety-catch')
const Cisco = require('./index.js')
const TokenStream = require('./lib/token-stream.js')

dotenv.config()

test('basic', async function (t) {
  const stream = await stringToTokens(`
To add a log message, I will insert a console log statement in the \`main\` function to indicate the start of video and audio processing. 

Here's the *SEARCH/REPLACE* block:

app.js
\`\`\`javascript
<<<<<<< SEARCH
  console.log('Main function started');
=======
  console.log('Main function started');
  console.log('Starting video and audio processing');
>>>>>>> REPLACE
\`\`\`

This log message will help to trace when the video and audio processing starts.
`.trim())

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'app.js',
      language: 'javascript',
      search: '  console.log(\'Main function started\');',
      replace: '  console.log(\'Main function started\');\n' +
               '  console.log(\'Starting video and audio processing\');'
    }
  ])
})

test('basic', async function (t) {
  const stream = await stringToTokens(`
Here are the *SEARCH/REPLACE* blocks for the requested changes, including a message at the end:

app.js
\`\`\`javascript
<<<<<<< SEARCH
    console.log('Starting audio analysis and segment generation for the transcript.');
    console.log('Analyzing audio for transcript generation...');
=======
    console.log('Initiating audio analysis for transcript generation.');
    console.log('Audio analysis in progress for transcript extraction...');
>>>>>>> REPLACE
\`\`\`

app.js
\`\`\`javascript
<<<<<<< SEARCH
  console.log('Done')
=======
  console.log('Done');
  console.log('All processes completed successfully.');
>>>>>>> REPLACE
\`\`\`

After updating the log messages, your application will provide clearer feedback during execution, enhancing overall usability.
`.trim())

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'app.js',
      language: 'javascript',
      search: '    console.log(\'Starting audio analysis and segment generation for the transcript.\');\n' +
        '    console.log(\'Analyzing audio for transcript generation...\');',
      replace: '    console.log(\'Initiating audio analysis for transcript generation.\');\n' +
        '    console.log(\'Audio analysis in progress for transcript extraction...\');'
    },
    {
      filename: 'app.js',
      language: 'javascript',
      search: '  console.log(\'Done\')',
      replace: '  console.log(\'Done\');\n' +
        '  console.log(\'All processes completed successfully.\');'
    }
  ])
})

// TODO
test.skip('unexpected end of input', async function (t) {
  const stream = await stringToTokens(`Here are the *SEARCH/REPLACE* blocks to make the \`lib/hi.js\` file empty:

lib/hi.js
\`\`\`javascript
<<<<<< SEARCH
function helloWorld() {
    console.log("Hello World...");
}

function hiWorld() {
    console.log("Hi World...");
}

// Execute the functions
helloWorld();
hiWorld();
=======
\`\`\`\n\n`)

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [])
})

test('wrong output edge case - filename has a starting space', async function (t) {
  const stream = await stringToTokens(`Here’s how to remove all the content from \`lib/hi.js\` to make it empty:

 lib/hi.js
\`\`\`javascript
<<<<<<< SEARCH
function logHelloWorld() {
    console.log("Hello World...");
}

function logHiWorld() {
    console.log("Hi World...");
}

logHelloWorld();
logHiWorld();
=======
>>>>>>> REPLACE
\`\`\`\n`)

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'lib/hi.js',
      language: 'javascript',
      search: `function logHelloWorld() {
    console.log("Hello World...");
}

function logHiWorld() {
    console.log("Hi World...");
}

logHelloWorld();
logHiWorld();`,
      replace: ''
    }
  ])
})

test('wrong output edge case - replace has a replace starting block', async function (t) {
  const stream = await stringToTokens(`Here is the update to make \`lib/hi.js\` an empty file.

lib/hi.js
\`\`\`javascript
<<<<<<< SEARCH
function sayHello() {
    console.log("Hello World...");
}

function sayHi() {
    console.log("Hi World...");
}

sayHello();
sayHi();
=======
<<<<<<< REPLACE
>>>>>>> REPLACE
\`\`\`\n`)

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'lib/hi.js',
      language: 'javascript',
      search: `function sayHello() {
    console.log("Hello World...");
}

function sayHi() {
    console.log("Hi World...");
}

sayHello();
sayHi();`,
      replace: ''
    }
  ])
})

test('wrong output edge case - replace has a search starting block', async function (t) {
  const stream = await stringToTokens(`Here is the update to make \`lib/hi.js\` an empty file.

lib/hi.js
\`\`\`javascript
<<<<<<< SEARCH
function sayHello() {
    console.log("Hello World...");
}

function sayHi() {
    console.log("Hi World...");
}

sayHello();
sayHi();
=======
<<<<<<< SEARCH
>>>>>>> REPLACE
\`\`\`\n`)

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'lib/hi.js',
      language: 'javascript',
      search: `function sayHello() {
    console.log("Hello World...");
}

function sayHi() {
    console.log("Hi World...");
}

sayHello();
sayHi();`,
      replace: ''
    }
  ])
})

test('wrong output edge case - filename with backticks', async function (t) {
  const stream = await stringToTokens(`Here’s how to create \`lib/hi.js\` with two functions that log "Hello World!" and "Hi World!", and then execute them:

\`lib/hi.js\`
\`\`\`javascript
<<<<<<< SEARCH
=======
function helloWorld() {
    console.log("Hello World!");
}

function hiWorld() {
    console.log("Hi World!");
}

helloWorld();
hiWorld();
>>>>>>> REPLACE
\`\`\`

Let me know if you would like me to create the file!\n`)

  const parser = new TokenStream()
  const loop = parser.loop()

  loop.catch(safetyCatch)

  for await (const data of stream) {
    parser.push(data.delta)
  }

  parser.push(null)

  await loop

  t.alike(parser.changes, [
    {
      filename: 'lib/hi.js',
      language: 'javascript',
      search: '',
      replace: `function helloWorld() {
    console.log("Hello World!");
}

function hiWorld() {
    console.log("Hi World!");
}

helloWorld();
hiWorld();`
    }
  ])
})

test('basic', async function (t) {
  const cwd = await tmp(t)
  const cisco = new Cisco({ cwd, yes: true })

  await cisco.receive('Create a lib/hi.js file that logs "Hello World!".')

  t.is(node(path.join(cwd, 'lib/hi.js')), 'Hello World!\n')

  await cisco.receive('Change the log message to "Hi World!".')

  t.is(node(path.join(cwd, 'lib/hi.js')), 'Hi World!\n')
})

test('basic', async function (t) {
  const cwd = await tmp(t)
  const cisco = new Cisco({ cwd, yes: true })

  await cisco.receive('Create a lib/hi.js file with two functions, one that logs "Hello World!" and another one that logs "Hi World!", and execute them.')

  t.is(node(path.join(cwd, 'lib/hi.js')), 'Hello World!\nHi World!\n')

  await cisco.receive('Change each log message to remove "!" and add "..." at the end.')

  t.is(node(path.join(cwd, 'lib/hi.js')), 'Hello World...\nHi World...\n')

  await cisco.receive('Remove the content to the file to make it empty.')

  t.is(node(path.join(cwd, 'lib/hi.js')), '')
})

function node (filename, args) {
  if (!args) {
    args = []
  }

  args.unshift(filename)

  try {
    return cp.execFileSync(process.execPath, args.filter(v => v), { encoding: 'utf8' })
  } catch (err) {
    if (err.stderr.includes('MODULE_NOT_FOUND')) {
      return null
    }

    throw err
  }
}

async function * stringToTokens (input) {
  const array = input.split('')

  for (const chunk of array) {
    yield { delta: chunk[0] }
  }
}
