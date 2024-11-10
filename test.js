const path = require('path')
const cp = require('child_process')
const test = require('brittle')
const tmp = require('like-tmp')
const dotenv = require('dotenv')
const Cisco = require('./index.js')

dotenv.config()

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
