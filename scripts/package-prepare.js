#!/usr/bin/env node
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
function run(label, command, args) {
  console.log(`[package-prepare] ${label}`)
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status}`)
}
try {
  run('application build and icon generation', 'npm', ['run', 'build'])
  run('packaging verification', process.execPath, ['scripts/verify-packaging-assets.js'])
} catch (error) {
  console.error(`[package-prepare] ${error.message}`)
  process.exit(1)
}
