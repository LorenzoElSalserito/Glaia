#!/usr/bin/env node
const fs = require('fs')
const meta = require('./lib/release-meta')
const ARTIFACT_NAME = 'glaia_v${version}.${ext}'

function parseArgs(argv) {
  const options = { level: 'patch', explicit: null, dryRun: false, bump: true, force: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '-n') options.dryRun = true
    else if (arg === '--major' || arg === '--minor' || arg === '--patch') options.level = arg.slice(2)
    else if (arg === '--no-bump') options.bump = false
    else if (arg === '--force') options.force = true
    else if (arg === '--set') options.explicit = argv[++i]
    else if (arg.startsWith('--set=')) options.explicit = arg.slice(6)
    else throw new Error(`Unknown argument "${arg}"`)
  }
  return options
}
function updatePackageJson(raw, version) {
  const pkg = JSON.parse(raw); pkg.version = version; pkg.build.artifactName = ARTIFACT_NAME
  if (pkg.build.nsis) pkg.build.nsis.artifactName = ARTIFACT_NAME
  return `${JSON.stringify(pkg, null, 2)}\n`
}
function updatePackageLock(raw, version) {
  const lock = JSON.parse(raw); lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  return `${JSON.stringify(lock, null, 2)}\n`
}
function flush(writes) {
  const backups = []
  try {
    for (const write of writes) {
      const existed = fs.existsSync(write.file)
      backups.push({ ...write, existed, old: existed ? fs.readFileSync(write.file) : null })
      fs.writeFileSync(write.file, write.content)
    }
  } catch (error) {
    for (const backup of backups.reverse()) backup.existed ? fs.writeFileSync(backup.file, backup.old) : fs.unlinkSync(backup.file)
    throw error
  }
}
function run(argv) {
  const options = parseArgs(argv); const p = meta.paths
  const packageRaw = fs.readFileSync(p.packageJson, 'utf8'); const lockRaw = fs.readFileSync(p.packageLock, 'utf8')
  const fromVersion = JSON.parse(packageRaw).version; meta.parseVersion(fromVersion)
  const pending = fs.existsSync(p.pendingRelease) ? meta.readJson(p.pendingRelease) : null
  const skip = Boolean(process.env.CI) || process.env.GLAIA_NO_BUMP === '1'
  let bumping = true; let version
  if (!options.bump || (skip && !options.force) || (pending?.version === fromVersion && !options.force)) { version = fromVersion; bumping = false }
  else version = options.explicit ? meta.formatVersion(meta.parseVersion(options.explicit)) : meta.bumpVersion(fromVersion, options.level)
  const history = meta.readHistory(); const alreadyRecorded = history.releases.some((r) => r.version === version)
  let changelog = meta.readChangelog(); let nextHistory = history; let entries = []
  const now = new Date()
  if (bumping || !alreadyRecorded) {
    entries = meta.parseEntries(meta.extractUnreleasedBody(changelog).body)
    if (!entries.length) entries = [meta.FALLBACK_ENTRY]
    changelog = meta.consolidateChangelog(changelog, version, meta.isoDate(now), entries)
    const pkg = JSON.parse(packageRaw); const maintainer = `${pkg.author.name} <${pkg.author.email}>`
    nextHistory = { releases: [{ version, date: meta.rfc2822(now), distribution: 'unstable', urgency: 'medium', maintainer, entries }, ...history.releases.filter((r) => r.version !== version)] }
  }
  const writes = [
    { file: p.packageJson, content: updatePackageJson(packageRaw, version) },
    { file: p.packageLock, content: updatePackageLock(lockRaw, version) },
    { file: p.changelogMd, content: changelog },
    { file: p.releaseHistory, content: `${JSON.stringify(nextHistory, null, 2)}\n` }
  ]
  if (bumping) writes.push({ file: p.pendingRelease, content: `${JSON.stringify({ version, startedAt: now.toISOString() }, null, 2)}\n` })
  console.log(`[version-bump] ${fromVersion} -> ${version}${bumping ? '' : ' (unchanged)'}`)
  if (options.dryRun) { console.log('[version-bump] --dry-run: no file written'); return { written: false, version } }
  flush(writes); return { written: true, version }
}
if (require.main === module) try { run(process.argv.slice(2)) } catch (error) { console.error(`[version-bump] ${error.message}`); process.exit(1) }
module.exports = { run, parseArgs, updatePackageJson, updatePackageLock, ARTIFACT_NAME }
