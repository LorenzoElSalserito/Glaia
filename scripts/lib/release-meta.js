const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const paths = {
  repoRoot,
  desktopDir: repoRoot,
  packageJson: path.join(repoRoot, 'package.json'),
  packageLock: path.join(repoRoot, 'package-lock.json'),
  changelogMd: path.join(repoRoot, 'CHANGELOG.md'),
  license: path.join(repoRoot, 'LICENSE'),
  releaseHistory: path.join(repoRoot, 'scripts', 'release-history.json'),
  pendingRelease: path.join(repoRoot, 'scripts', '.release-pending.json')
}
const UNRELEASED_HEADING = '## [Unreleased]'
const FALLBACK_ENTRY = 'Maintenance release.'
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function parseVersion(value) {
  const match = SEMVER_RE.exec(String(value).trim())
  if (!match) throw new Error(`Version "${value}" is not a plain X.Y.Z semver`)
  return { major: +match[1], minor: +match[2], patch: +match[3] }
}
function formatVersion(v) { return `${v.major}.${v.minor}.${v.patch}` }
function bumpVersion(value, level = 'patch') {
  const v = parseVersion(value)
  if (level === 'major') return formatVersion({ major: v.major + 1, minor: 0, patch: 0 })
  if (level === 'minor') return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 })
  if (level === 'patch') return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 })
  throw new Error(`Unknown bump level "${level}"`)
}
function currentVersion() { return readJson(paths.packageJson).version }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function rfc2822(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  return `${DAYS[date.getDay()]}, ${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`
}
function isoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function readChangelog() { return fs.readFileSync(paths.changelogMd, 'utf8') }
function extractUnreleasedBody(markdown) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === UNRELEASED_HEADING)
  if (start < 0) return { found: false, body: '', start: -1, end: -1 }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break }
  return { found: true, body: lines.slice(start + 1, end).join('\n'), start, end }
}
function parseEntries(body) {
  const entries = []
  let category = null
  let current = null
  const flush = () => { if (current && current.trim()) entries.push(current.replace(/\s+/g, ' ').trim()); current = null }
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const heading = /^#{3,6}\s+(.*)$/.exec(line.trim())
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (!line.trim()) flush()
    else if (heading) { flush(); category = heading[1].replace(/[:：]\s*$/, '').trim() }
    else if (bullet) { flush(); current = category ? `${category}: ${bullet[1].trim()}` : bullet[1].trim() }
    else if (current) current += ` ${line.trim()}`
  }
  flush()
  return entries
}
function consolidateChangelog(markdown, version, date, entries) {
  const part = extractUnreleasedBody(markdown)
  if (!part.found) throw new Error('CHANGELOG.md has no ## [Unreleased] section')
  const lines = markdown.split('\n')
  const released = [`## [${version}] - ${date}`, '', ...entries.map((e) => `- ${e}`), '']
  return [...lines.slice(0, part.start + 1), '', ...released, ...lines.slice(part.end)].join('\n').replace(/\n{3,}/g, '\n\n')
}
function readHistory() {
  if (!fs.existsSync(paths.releaseHistory)) return { releases: [] }
  const value = readJson(paths.releaseHistory)
  return Array.isArray(value.releases) ? value : { releases: [] }
}
function wrapEntry(text, width = 76) {
  const lines = []; let line = '  *'
  for (const word of String(text).replace(/\s+/g, ' ').trim().split(' ')) {
    if (line !== '  *' && line.length + word.length + 1 > width) { lines.push(line); line = '   ' }
    line += ` ${word}`
  }
  lines.push(line); return lines.join('\n')
}
function renderDebianChangelog(history, pkgName, maintainer) {
  return history.releases.map((r) => `${pkgName} (${r.version}) ${r.distribution || 'unstable'}; urgency=${r.urgency || 'medium'}\n\n${(r.entries?.length ? r.entries : [FALLBACK_ENTRY]).map((e) => wrapEntry(e)).join('\n')}\n\n -- ${r.maintainer || maintainer}  ${r.date}\n`).join('\n')
}

module.exports = { paths, UNRELEASED_HEADING, FALLBACK_ENTRY, readJson, parseVersion, formatVersion, bumpVersion, currentVersion, rfc2822, isoDate, readChangelog, extractUnreleasedBody, parseEntries, consolidateChangelog, readHistory, renderDebianChangelog, wrapEntry }
