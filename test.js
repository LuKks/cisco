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

  t.is(await node(path.join(cwd, 'lib/hi.js')), 'Hello World!\n')

  await cisco.receive('Change the log message to "Hi World!".')

  t.is(await node(path.join(cwd, 'lib/hi.js')), 'Hi World!\n')
})

function node (filename, args) {
  if (!args) {
    args = []
  }

  args.unshift(filename)

  return cp.execFileSync(process.execPath, args.filter(v => v), { encoding: 'utf8' })
}
