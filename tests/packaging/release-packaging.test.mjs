import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const meta = require('../../scripts/lib/release-meta')
const bump = require('../../scripts/version-bump')
const deb = require('../../scripts/deb-finalize')

test('plain semantic versions bump predictably', () => {
  assert.equal(meta.bumpVersion('0.1.1'), '0.1.2')
  assert.equal(meta.bumpVersion('0.1.1', 'minor'), '0.2.0')
  assert.equal(meta.bumpVersion('0.1.1', 'major'), '1.0.0')
  assert.throws(() => meta.parseVersion('0.1.1-beta'))
})

test('Glaia artifact names always derive from version', () => {
  const input = JSON.stringify({ version: '1.0.0', build: { nsis: {} } })
  const output = JSON.parse(bump.updatePackageJson(input, '1.2.3'))
  assert.equal(output.version, '1.2.3')
  assert.equal(output.build.artifactName, 'glaia_v${version}.${ext}')
  assert.equal(output.build.nsis.artifactName, 'glaia_v${version}.${ext}')
})

test('Keep a Changelog entries retain their category', () => {
  assert.deepEqual(meta.parseEntries('### Added\n- Provider catalog\n\n### Fixed\n- Session reset'), [
    'Added: Provider catalog',
    'Fixed: Session reset'
  ])
})

test('Debian changelog is rendered in policy format', () => {
  const text = meta.renderDebianChangelog({ releases: [{ version: '0.1.1', date: 'Sun, 30 Aug 2026 00:00:00 +0200', entries: ['Initial release.'] }] }, 'glaia', 'Lorenzo DM <commercial.lorenzodm@gmail.com>')
  assert.match(text, /^glaia \(0\.1\.1\) unstable; urgency=medium/)
  assert.match(text, /\n -- Lorenzo DM <commercial\.lorenzodm@gmail\.com>  Sun, 30 Aug 2026/)
})

test('Debian control is normalized and Description remains last', () => {
  const fields = deb.parseControl('Package: glaia\nDescription: Short\n long text\nVendor: Test\n')
  fields.delete('Vendor')
  fields.set('Section', deb.SECTION)
  const output = deb.renderControl(fields)
  assert.equal(output.at(-1), '\n')
  assert.ok(output.indexOf('Section: misc') < output.indexOf('Description:'))
})

test('native versions use changelog.gz and gzip is deterministic', () => {
  assert.equal(deb.changelogFileName('0.1.1'), 'changelog.gz')
  assert.equal(deb.changelogFileName('0.1.1-1'), 'changelog.Debian.gz')
  assert.deepEqual(deb.gzipDeterministic('Glaia'), deb.gzipDeterministic('Glaia'))
})

test('DEP-5 metadata preserves Glaia identity', () => {
  const text = deb.buildCopyright({ author: { name: 'Lorenzo DM', email: 'commercial.lorenzodm@gmail.com' }, homepage: 'https://github.com/LorenzoElSalserito/Glaia' })
  assert.match(text, /Upstream-Name: glaia/)
  assert.match(text, /LorenzoElSalserito\/Glaia/)
  assert.match(text, /License: AGPL-3/)
})

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { verifyArtifact } = require('../../scripts/verify-release-artifact.cjs')
for (const extension of ['deb', 'exe', 'dmg']) {
  test(`CI resolves the actual versioned ${extension} and rejects stale/empty artifacts`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glaia-artifact-'))
    try {
      const pkg = JSON.parse(fs.readFileSync(meta.paths.packageJson, 'utf8'))
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg))
      fs.mkdirSync(path.join(root, 'dist'))
      fs.writeFileSync(path.join(root, 'dist', `glaia-desktop.${extension}`), 'old name')
      assert.throws(() => verifyArtifact(root, extension), /ENOENT/)
      const expected = `dist/glaia_v${pkg.version}.${extension}`
      fs.writeFileSync(path.join(root, expected), '')
      assert.throws(() => verifyArtifact(root, extension), /Empty/)
      fs.writeFileSync(path.join(root, expected), 'artifact')
      assert.deepEqual(verifyArtifact(root, extension), { path: expected, version: pkg.version })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
}
