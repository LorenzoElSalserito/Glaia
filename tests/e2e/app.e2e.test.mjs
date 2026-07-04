/**
 * End-to-end certification for Glaia.
 *
 * Launches the real packaged main process under Electron (via playwright-core's
 * _electron driver) and asserts the copy-to-outside feature works end-to-end,
 * plus that no default menu behavior regressed.
 *
 * Run: npm run test:e2e   (needs a display; DISPLAY or xvfb)
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const mainEntry = path.join(root, 'out', 'main', 'index.js')

let app
let page

before(async () => {
  app = await electron.launch({
    args: [mainEntry, '--no-sandbox', '--disable-gpu'],
    cwd: root,
    env: { ...process.env },
    timeout: 30_000,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

after(async () => {
  await app?.close()
})

test('app boots: single main window with renderer loaded', async () => {
  const count = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => w.isVisible() || !w.isDestroyed()).length
  )
  assert.ok(count >= 1, 'at least one window exists')

  const bodyText = await page.evaluate(() => document.body.innerText)
  assert.match(bodyText, /Glaia/, 'renderer shows Glaia branding')
})

test('Edit menu exposes copy/paste/cut/selectAll roles (keyboard accelerators)', async () => {
  const roles = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return null
    const edit = menu.items.find(
      (i) => i.submenu && i.submenu.items.some((s) => s.role === 'copy')
    )
    if (!edit) return null
    // Electron normalizes role strings to lowercase.
    return edit.submenu.items.map((s) => s.role).filter(Boolean)
  })

  assert.ok(roles, 'application menu with an Edit submenu is set')
  for (const role of ['cut', 'copy', 'paste', 'selectall']) {
    assert.ok(roles.includes(role), `Edit menu has "${role}" role`)
  }
})

test('no regression: default View and Window menus preserved', async () => {
  const topRoles = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((i) => i.role)
  )
  // Electron normalizes role strings to lowercase (viewMenu -> viewmenu).
  assert.ok(topRoles.includes('viewmenu'), 'View menu preserved')
  assert.ok(topRoles.includes('windowmenu'), 'Window menu preserved')
})

test('system clipboard round-trip works (the channel external apps read)', async () => {
  const token = `glaia-e2e-${Date.now()}`
  const readBack = await app.evaluate(({ clipboard }, value) => {
    clipboard.writeText(value)
    return clipboard.readText()
  }, token)
  assert.equal(readBack, token, 'text written by the app is on the system clipboard')
})

test('copy from an in-app selection reaches the system clipboard', async () => {
  const token = `GLAIA_COPY_TOKEN_${Date.now()}`

  // Clear the clipboard so we prove the copy, not a stale value.
  await app.evaluate(({ clipboard }) => clipboard.writeText(''))

  // Insert a known, selectable node and select its contents in the renderer.
  await page.evaluate((value) => {
    const el = document.createElement('div')
    el.id = 'e2e-copy-source'
    el.textContent = value
    document.body.appendChild(el)
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }, token)

  // Trigger the same action the Edit>Copy role / Ctrl+C performs.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.copy()
  })

  // copy() dispatches to the renderer asynchronously; poll briefly.
  let clip = ''
  for (let i = 0; i < 20 && clip !== token; i++) {
    await new Promise((r) => setTimeout(r, 50))
    clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  }

  assert.equal(clip, token, 'selected in-app text is copied to the system clipboard')
})
