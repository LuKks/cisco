#!/usr/bin/env node

const os = require('os')
const path = require('path')
const dotenv = require('dotenv')
const { program, createOption } = require('commander')
const safetyCatch = require('safety-catch')
const pkg = require('./package.json')

// TODO: Double check this
dotenv.config()
dotenv.config({ path: path.join(os.homedir(), '.env') })

const main = program
  .version(pkg.version)
  .description(pkg.description)
  .addOption(
    createOption('-c, --cwd <path>', 'the path to the working directory')
      .default(path.resolve('.'))
  )
  .addOption(
    createOption('-q, --quiet', 'stay silent')
      .conflicts(['verbose'])
      .default(false)
  )
  .addOption(
    createOption('--verbose', 'print logs')
      .conflicts(['quiet'])
      .default(false)
  )
  .action(require('./lib/app.js'))

main.parseAsync().catch(err => {
  safetyCatch(err)
  console.error('error: ' + err.message)
  process.exit(1)
})
