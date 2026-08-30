const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const meta = require('./lib/release-meta')

function hasCommand(command) { return spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' }).status === 0 }
exports.default = async function (context) {
  const debs = (context.artifactPaths || []).filter((file) => file.endsWith('.deb'))
  if (debs.length && !hasCommand('fakeroot')) throw new Error('fakeroot is required to finalize .deb packages (apt install fakeroot)')
  for (const deb of debs) {
    const result = spawnSync('fakeroot', [process.execPath, path.join(__dirname, 'deb-finalize.js'), deb], { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`deb-finalize failed for ${deb}`)
  }
  if (fs.existsSync(meta.paths.pendingRelease)) fs.unlinkSync(meta.paths.pendingRelease)
}
