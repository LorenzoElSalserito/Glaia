#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { spawnSync } = require('child_process')
const meta = require('./lib/release-meta')

// Debian package identity follows Glaia's npm name. The installed executable
// intentionally remains `glaia-desktop`; these are separate concerns.
const PKG_NAME = 'glaia'
const SECTION = 'misc'
const FIELD_ORDER = ['Package', 'Source', 'Version', 'Section', 'Priority', 'Architecture', 'Essential', 'Pre-Depends', 'Depends', 'Recommends', 'Suggests', 'Enhances', 'Breaks', 'Conflicts', 'Provides', 'Replaces', 'Installed-Size', 'Maintainer', 'Homepage', 'Description']
function log(message) { console.log(`[deb-finalize] ${message}`) }
function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}\n${result.stderr || ''}`)
  return result.stdout
}
function hasCommand(command) { return spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' }).status === 0 }
function parseControl(text) {
  const fields = new Map(); let current
  for (const line of text.split('\n')) {
    if (/^[ \t]/.test(line) && current) fields.set(current, `${fields.get(current)}\n${line}`)
    else { const match = /^([A-Za-z0-9][A-Za-z0-9-]*):\s?(.*)$/.exec(line); if (match) { current = match[1]; fields.set(current, match[2]) } }
  }
  return fields
}
function renderControl(fields) {
  const keys = [...fields.keys()]
  const find = (name) => keys.find((key) => key.toLowerCase() === name.toLowerCase())
  const ordered = [...FIELD_ORDER.map(find).filter(Boolean), ...keys.filter((key) => !FIELD_ORDER.some((name) => name.toLowerCase() === key.toLowerCase()))]
  const description = find('Description')
  return `${[...new Set(ordered.filter((key) => key !== description).concat(description || []))].map((key) => `${key}: ${fields.get(key)}`).join('\n')}\n`
}
function wrapText(text, width) {
  const lines = []; let line = ''
  for (const word of text.split(/\s+/)) {
    if (!line) line = word
    else if (line.length + word.length + 1 <= width) line += ` ${word}`
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}
function normalizeDescription(value) {
  const [first, ...rest] = value.split('\n'); let synopsis = first.trim(); const body = []
  if (synopsis.length > 80) {
    rest.unshift(synopsis)
    const cut = synopsis.slice(0, 80); synopsis = cut.slice(0, cut.lastIndexOf(' ')).replace(/[ ,;:.]+$/, '')
  }
  for (const raw of rest) {
    const line = raw.replace(/^[ \t]+/, '').trim()
    if (!line || line === '.') { if (body.length && body.at(-1) !== ' .') body.push(' .') }
    else for (const wrapped of wrapText(line, 79)) body.push(` ${wrapped}`)
  }
  while (body.at(-1) === ' .') body.pop()
  return [synopsis, ...body].join('\n')
}
function fixControl(file, version) {
  const fields = parseControl(fs.readFileSync(file, 'utf8'))
  for (const key of [...fields.keys()]) if (['license', 'vendor'].includes(key.toLowerCase())) fields.delete(key)
  const set = (name, value) => { const key = [...fields.keys()].find((item) => item.toLowerCase() === name.toLowerCase()); fields.set(key || name, value) }
  set('Version', version); set('Section', SECTION); set('Priority', 'optional')
  const description = [...fields.keys()].find((key) => key.toLowerCase() === 'description')
  if (description) set(description, normalizeDescription(fields.get(description)))
  fs.writeFileSync(file, renderControl(fields))
}
function buildCopyright(pkg) {
  const holder = `${pkg.author.name} <${pkg.author.email}>`
  return `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: ${PKG_NAME}\nUpstream-Contact: ${holder}\nSource: ${pkg.homepage || 'https://github.com/LorenzoElSalserito/Glaia'}\n\nFiles: *\nCopyright: 2026 ${holder}\nLicense: AGPL-3\n\nLicense: AGPL-3\n This program is free software: you can redistribute it and/or modify\n it under the terms of the GNU Affero General Public License version 3\n as published by the Free Software Foundation.\n .\n On Debian systems, the complete license text is available in\n /usr/share/common-licenses/AGPL-3.\n`
}
function buildAutostartEntry(pkg) {
  return `[Desktop Entry]\nType=Application\nName=${pkg.build.productName}\nComment=${pkg.build.linux.synopsis}\nExec=/opt/${pkg.build.productName}/${pkg.build.linux.executableName} %U\nIcon=${PKG_NAME}\nTerminal=false\nStartupWMClass=${pkg.build.linux.executableName}\nCategories=Office;\nHidden=true\nNoDisplay=true\nX-GNOME-Autostart-enabled=false\n`
}
function installFile(root, relative, content, mode = 0o644) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); fs.chmodSync(file, mode)
}
function walk(root, base = root, output = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) walk(file, base, output)
    else if (entry.isFile() || entry.isSymbolicLink()) output.push(path.relative(base, file))
  }
  return output
}
function normalizePermissions(root) {
  const control = path.join(root, 'DEBIAN')
  const output = sh('find', [root, '-mindepth', '0', '-printf', '%m %y %p\n'])
  for (const line of output.trimEnd().split('\n')) {
    const match = /^(\d+) (.) (.*)$/.exec(line); if (!match || match[2] === 'l') continue
    const mode = parseInt(match[1], 8); const file = match[3]; let target
    if (match[2] === 'd') target = 0o755
    else if (file.startsWith(`${control}${path.sep}`)) target = ['preinst', 'postinst', 'prerm', 'postrm', 'config'].includes(path.basename(file)) ? 0o755 : 0o644
    else if (/\.so(\.\d+)*$/.test(file)) target = 0o644
    else target = mode & 0o111 ? 0o755 : 0o644
    fs.chmodSync(file, (mode & 0o7000) | target)
  }
}
function writeConffiles(root) {
  const etc = path.join(root, 'etc'); const target = path.join(root, 'DEBIAN', 'conffiles')
  if (!fs.existsSync(etc)) { if (fs.existsSync(target)) fs.unlinkSync(target); return }
  fs.writeFileSync(target, `${walk(etc, root).map((file) => `/${file}`).sort().join('\n')}\n`)
}
function regenerateMd5sums(root) {
  const lines = walk(root).filter((file) => !file.startsWith(`DEBIAN${path.sep}`) && fs.lstatSync(path.join(root, file)).isFile()).sort().map((file) => `${crypto.createHash('md5').update(fs.readFileSync(path.join(root, file))).digest('hex')}  ${file.split(path.sep).join('/')}`)
  fs.writeFileSync(path.join(root, 'DEBIAN', 'md5sums'), `${lines.join('\n')}\n`)
}
function changelogFileName(version) { return version.includes('-') ? 'changelog.Debian.gz' : 'changelog.gz' }
function gzipDeterministic(text) { return zlib.gzipSync(Buffer.from(text), { level: 9, mtime: 0 }) }
function verifyChangelog(text, version) {
  if (!hasCommand('dpkg-parsechangelog')) return
  const file = path.join(os.tmpdir(), `glaia-changelog-${process.pid}`); fs.writeFileSync(file, text)
  try { const output = sh('dpkg-parsechangelog', ['-l', file]); if (!output.includes(`Version: ${version}`)) throw new Error(`changelog does not start with ${version}`) } finally { fs.unlinkSync(file) }
}
function finalize(deb) {
  if (!fs.existsSync(deb)) throw new Error(`no such .deb: ${deb}`)
  for (const tool of ['dpkg-deb', 'md5sum', 'find']) if (!hasCommand(tool)) throw new Error(`required tool not found: ${tool}`)
  const pkg = meta.readJson(meta.paths.packageJson); const history = meta.readHistory()
  if (!history.releases.some((release) => release.version === pkg.version)) throw new Error(`release-history.json has no entry for ${pkg.version}`)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glaia-deb-'))
  try {
    sh('dpkg-deb', ['-R', deb, root])
    const docs = `usr/share/doc/${PKG_NAME}`
    for (const stale of ['changelog.gz', 'changelog.Debian.gz', 'LICENSE']) { const file = path.join(root, docs, stale); if (fs.existsSync(file)) fs.unlinkSync(file) }
    const changelog = meta.renderDebianChangelog(history, PKG_NAME, `${pkg.author.name} <${pkg.author.email}>`); verifyChangelog(changelog, pkg.version)
    installFile(root, `${docs}/${changelogFileName(pkg.version)}`, gzipDeterministic(changelog)); installFile(root, `${docs}/copyright`, buildCopyright(pkg))
    const icon = path.join(meta.paths.repoRoot, 'build', 'icon.png'); if (fs.existsSync(icon)) installFile(root, `usr/share/pixmaps/${PKG_NAME}.png`, fs.readFileSync(icon))
    installFile(root, `etc/xdg/autostart/${PKG_NAME}.desktop`, buildAutostartEntry(pkg))
    normalizePermissions(root); fixControl(path.join(root, 'DEBIAN', 'control'), pkg.version); writeConffiles(root); regenerateMd5sums(root)
    sh('md5sum', ['-c', '--quiet', path.join(root, 'DEBIAN', 'md5sums')], { cwd: root }); sh('dpkg-deb', ['--build', root, deb])
    if (hasCommand('lintian')) { const result = spawnSync('lintian', [deb], { encoding: 'utf8' }); log(`${result.stdout || ''}${result.stderr || ''}`.trim() || 'lintian: clean') }
    log(`done: ${deb}`)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
if (require.main === module) try { if (!process.argv[2]) throw new Error('usage: fakeroot node scripts/deb-finalize.js <package.deb>'); finalize(process.argv[2]) } catch (error) { console.error(`[deb-finalize] ${error.message}`); process.exit(1) }
module.exports = { finalize, parseControl, renderControl, normalizeDescription, normalizePermissions, changelogFileName, buildCopyright, buildAutostartEntry, gzipDeterministic, PKG_NAME, SECTION }
