#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const meta = require('./lib/release-meta')

const required = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html', 'build/icon.png', 'build/icon.ico', 'build/icon.icns']
const missing = required.filter((file) => !fs.existsSync(path.join(meta.paths.repoRoot, file)))
const pkg = meta.readJson(meta.paths.packageJson)
const lock = meta.readJson(meta.paths.packageLock)
const problems = []
if (pkg.name !== 'glaia' || lock.name !== pkg.name || lock.packages?.['']?.name !== pkg.name) problems.push('npm/Debian package name must remain glaia everywhere')
if (missing.length) problems.push(`missing assets: ${missing.join(', ')}`)
if (lock.version !== pkg.version) problems.push(`package-lock.json version is ${lock.version}, expected ${pkg.version}`)
if (lock.packages?.['']?.version !== pkg.version) problems.push(`package-lock root version is ${lock.packages?.['']?.version}, expected ${pkg.version}`)
if (pkg.build?.artifactName !== 'glaia_v${version}.${ext}') problems.push('build.artifactName must be the literal glaia_v${version}.${ext}')
if (pkg.build?.nsis?.artifactName !== 'glaia_v${version}.${ext}') problems.push('build.nsis.artifactName must use the version macro')
if (pkg.build?.afterAllArtifactBuild !== 'scripts/after-all-artifact-build.js') problems.push('afterAllArtifactBuild hook is missing')
if (pkg.build?.executableName !== 'glaia-desktop' || pkg.build?.linux?.executableName !== 'glaia-desktop') problems.push('executableName must remain glaia-desktop')
if (pkg.build?.deb?.packageCategory !== 'misc' || pkg.build?.deb?.priority !== 'optional') problems.push('Debian category/priority are inconsistent')
if (!meta.readHistory().releases.some((r) => r.version === pkg.version)) problems.push(`release-history.json has no ${pkg.version}`)
if (!meta.readChangelog().includes(`## [${pkg.version}]`)) problems.push(`CHANGELOG.md has no ${pkg.version}`)
if (problems.length) {
  console.error('[verify-packaging-assets] Packaging is inconsistent:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`[verify-packaging-assets] Packaging assets are consistent (version ${pkg.version}).`)
