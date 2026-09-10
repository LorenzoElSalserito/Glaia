const fs = require('node:fs')
const path = require('node:path')

function verifyArtifact(root, extension) {
  if (!['deb', 'exe', 'dmg', 'rpm', 'AppImage'].includes(extension)) throw new Error(`Unsupported artifact extension: ${extension}`)
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const template = extension === 'exe' ? pkg.build.nsis.artifactName : pkg.build.artifactName
  const name = template.replace('${version}', pkg.version).replace('${ext}', extension)
  const relativePath = path.posix.join(pkg.build.directories.output, name)
  const stat = fs.statSync(path.join(root, relativePath))
  if (!stat.isFile() || stat.size === 0) throw new Error(`Empty or invalid release artifact: ${relativePath}`)
  return { path: relativePath, version: pkg.version }
}

if (require.main === module) {
  try {
    const result = verifyArtifact(path.resolve(__dirname, '..'), process.argv[2])
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${result.path}\nversion=${result.version}\n`)
    }
    console.log(`Verified ${result.path}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { verifyArtifact }
