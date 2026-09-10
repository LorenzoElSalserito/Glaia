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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const mainEntry = process.env.GLAIA_E2E_MAIN || path.join(root, 'out', 'main', 'index.js')
const fixtureName = 'Provider con nome molto lungo ' + 'W'.repeat(65)
const fixtureUrl = 'https://fixture.test/' + 'segmento-lungo-'.repeat(30)

let app
let page
let testDir

function launchOptions() {
  return {
    ...(process.env.GLAIA_E2E_EXECUTABLE ? { executablePath: process.env.GLAIA_E2E_EXECUTABLE } : {}),
    args: [...(process.env.GLAIA_E2E_EXECUTABLE ? [] : [path.join(root, 'tests/e2e/launch.cjs')]), '--no-sandbox', '--disable-gpu'],
    cwd: root,
    env: { ...process.env, GLAIA_TEST_DIR: testDir, GLAIA_TEST_MAIN: mainEntry, XDG_CONFIG_HOME: path.join(testDir, 'config'), XDG_CACHE_HOME: path.join(testDir, 'cache') },
    timeout: 30_000,
  }
}

before(async () => {
  testDir = await mkdtemp(path.join(os.tmpdir(), 'glaia-e2e-'))
  await mkdir(path.join(testDir, 'profile'))
  await mkdir(path.join(testDir, 'config'))
  await writeFile(path.join(testDir, 'config', 'user-dirs.dirs'), `XDG_DOCUMENTS_DIR="${testDir}"\n`)
  app = await electron.launch(launchOptions())
  for (let i = 0; i < 100; i++) {
    page = app.windows().find((window) => window.url().startsWith('file:'))
    if (page) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(page, 'main renderer opened')
  await page.locator('.sidebar').waitFor()
})

after(async () => {
  await app?.close()
  await rm(testDir, { recursive: true, force: true })
})

test('app boots: single main window with renderer loaded', async () => {
  const count = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => w.isVisible() || !w.isDestroyed()).length
  )
  assert.ok(count >= 1, 'at least one window exists')

  const documents = await app.evaluate(({ app }) => app.getPath('documents'))
  assert.equal(documents, testDir, 'documents remain isolated')
  if (process.env.GLAIA_E2E_EXECUTABLE) assert.equal(await app.evaluate(({ app }) => app.isPackaged), true)
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
    BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:')).webContents.copy()
  })

  // copy() dispatches to the renderer asynchronously; poll briefly.
  let clip = ''
  for (let i = 0; i < 20 && clip !== token; i++) {
    await new Promise((r) => setTimeout(r, 50))
    clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  }

  assert.equal(clip, token, 'selected in-app text is copied to the system clipboard')
})


async function poll(check, message) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(message)
}

async function nativeState() {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'))
    const view = window.contentView.children[0]
    return { size: window.getContentSize(), zoom: window.webContents.getZoomFactor(),
      bounds: view?.getBounds(), providerZoom: view?.webContents.getZoomFactor() }
  })
}

async function assertTextNotClipped(scope = 'body') {
  const failures = await page.locator(scope).evaluate((root) => {
    const failures = []
    for (const el of root.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || el.classList.contains('sr-only')) continue
      if (!Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue
      if (['OPTION', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(el.tagName)) continue
      if (!el.getClientRects().length) continue
      const name = `${el.tagName}.${el.className}: ${el.textContent.slice(0, 60)}`
      if (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none') failures.push(`truncation: ${name}`)
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 2 && !['auto', 'scroll'].includes(style.overflowX)) failures.push(`horizontal: ${name}`)
      if (el.clientHeight && el.scrollHeight > el.clientHeight + 2 && !['auto', 'scroll'].includes(style.overflowY)) failures.push(`vertical: ${name}`)
      const range = document.createRange()
      range.selectNodeContents(el)
      for (const rect of range.getClientRects()) {
        let ancestor = el
        while (ancestor && ancestor !== root.parentElement) {
          const css = getComputedStyle(ancestor)
          const bounds = ancestor.getBoundingClientRect()
          if (['auto', 'scroll'].includes(css.overflowY)) break // content is reachable by scrolling
          if (['hidden', 'clip'].includes(css.overflowY) && (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2)) {
            failures.push(`ancestor clips text: ${name}`); break
          }
          ancestor = ancestor.parentElement
        }
      }
    }
    return failures
  })
  assert.deepEqual(failures, [], 'all GUI text wraps or remains reachable by scrolling')
}

async function assertLayout(factor) {
  await poll(async () => {
    const native = await nativeState()
    const rect = await page.locator('.webview-host').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    return native.bounds && Object.keys(rect).every((key) => Math.abs(native.bounds[key] - rect[key] * factor) <= 2)
  }, 'native provider bounds match scaled DOM host')
  const state = await nativeState()
  assert.ok(Math.abs(state.zoom - factor) < 0.001)
  assert.ok(Math.abs(state.providerZoom - factor) < 0.001)
  assert.ok(state.bounds.width > 100 && state.bounds.height > 100, 'provider remains usable')
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return { horizontal: root.scrollWidth > innerWidth + 1, vertical: root.scrollHeight > innerHeight + 1,
      sidebar: document.querySelector('.sidebar').getBoundingClientRect().right,
      width: innerWidth }
  })
  assert.equal(overflow.horizontal, false, 'no page horizontal overflow')
  assert.equal(overflow.vertical, false, 'no page vertical overflow')
  assert.ok(overflow.sidebar < overflow.width / 2 + 1, 'provider retains most of viewport')
}

test('empty state text and actions stay complete across all resolution/zoom combinations', async () => {
  for (const [width, height] of [[800,600], [1024,768], [1280,720], [1366,768], [1920,1080], [2560,1440], [3840,2160]]) {
    await app.evaluate(({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:')).setContentSize(width, height)
    }, [width, height])
    for (const zoomFactor of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) {
      await page.evaluate((zoomFactor) => window.glaia.settings.update({ zoomFactor }), zoomFactor)
      await poll(async () => Math.abs((await nativeState()).zoom - zoomFactor) < 0.001, 'empty state zoom applied')
      await assertTextNotClipped('.empty-state')
      await page.locator('.empty-state').getByRole('button', { name: '+ Aggiungi provider', exact: true }).click()
      await assertTextNotClipped('.modal')
      await page.keyboard.press('Escape')
    }
  }
  await page.evaluate(() => window.glaia.settings.update({ zoomFactor: 1 }))
})

test('local provider fixture opens through the real UI', async () => {
  await page.locator('#e2e-copy-source').evaluate((el) => el.remove())
  await app.evaluate(({ session }) => {
    session.fromPartition('persist:provider.zoom-fixture.default').protocol.handle('https', (request) =>
      new Response(`<!doctype html><html><body><h1>Provider fixture</h1><input aria-label="Messaggio"><a href="https://fixture.test/next">Next</a><p>${request.url}</p></body></html>`,
        { headers: { 'content-type': 'text/html' } }))
  })
  await page.locator('.sidebar').getByRole('button', { name: '+ Aggiungi provider', exact: true }).click()
  await page.getByLabel('Nome provider', { exact: true }).fill(fixtureName)
  await page.getByLabel('URL iniziale (https)', { exact: true }).fill(fixtureUrl)
  await page.locator('#provider-partition').fill('persist:provider.zoom-fixture.default')
  await page.getByRole('button', { name: 'Salva provider', exact: true }).click()
  await page.getByRole('button', { name: fixtureName, exact: true }).click()
  await poll(async () => (await nativeState()).providerZoom === 1, 'provider opened')
  await assertLayout(1)
})

const sizes = [[800, 600], [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]
for (const [width, height] of sizes) {
  for (const factor of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) {
    test(`responsive GUI ${width}x${height} at ${factor * 100}%`, async () => {
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'))
        window.setContentSize(width, height)
      }, { width, height })
      await poll(async () => (await nativeState()).size.join('x') === `${width}x${height}`, 'requested resolution applied')
      await page.getByRole('button', { name: 'Apri impostazioni', exact: true }).click()
      await poll(async () => (await nativeState()).bounds?.width === 0, 'provider hidden behind settings')
      await page.getByLabel('Zoom interfaccia', { exact: true }).selectOption(String(factor))
      await poll(async () => Math.abs((await nativeState()).zoom - factor) < 0.001, 'zoom applied')
      const modalFits = await page.locator('.modal').evaluate((el) => {
        const r = el.getBoundingClientRect()
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1
      })
      assert.ok(modalFits, 'settings fit viewport without horizontal clipping')
      await assertTextNotClipped('.modal')
      if (process.env.GLAIA_E2E_ARTIFACTS && [800, 3840].includes(width) && [0.25, 1.5].includes(factor)) {
        await mkdir(process.env.GLAIA_E2E_ARTIFACTS, { recursive: true })
        await page.evaluate(async () => {
          document.getAnimations().forEach((animation) => animation.finish())
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        })
        const png = await app.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'))
          return (await window.capturePage()).toPNG().toString('base64')
        })
        await writeFile(path.join(process.env.GLAIA_E2E_ARTIFACTS, `settings-${width}x${height}-${factor * 100}.png`), Buffer.from(png, 'base64'))
      }
      await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
      await assertLayout(factor)
      await assertTextNotClipped()
      await page.getByRole('button', { name: 'Informazioni su Glaia', exact: true }).click()
      await poll(async () => (await nativeState()).bounds?.width === 0, 'provider hidden behind about')
      await assertTextNotClipped('.modal')
      await page.keyboard.press('Escape')
      await assertLayout(factor)
      await page.getByRole('button', { name: `Dettagli del provider ${fixtureName}`, exact: true }).click()
      await assertTextNotClipped('.modal')
      await page.getByRole('button', { name: 'Modifica', exact: true }).click()
      await assertTextNotClipped('.modal')
      await page.keyboard.press('Escape')
      await page.evaluate(() => window.glaia.settings.update({ locale: 'en' }))
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await assertTextNotClipped('.modal')
      await page.keyboard.press('Escape')
      await assertTextNotClipped()
      await page.evaluate(() => window.glaia.settings.update({ locale: 'it' }))
    })
  }
}

test('compact sidebar, provider navigation/reload and menu zoom stay synchronized', async () => {
  await page.evaluate(() => window.glaia.settings.update({ compactSidebar: true, zoomFactor: 1.25 }))
  await assertLayout(1.25)
  await app.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:')).contentView.children[0]
    await view.webContents.executeJavaScript("document.querySelector('a').click()")
  })
  await poll(async () => app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:')).contentView.children[0].webContents
    return wc.getURL().endsWith('/next') && !wc.isLoading()
  }), 'provider navigation completed')
  await assertLayout(1.25)
  await page.evaluate(() => window.glaia.providerView.reload())
  await assertLayout(1.25)
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu().items.find((item) => item.role === 'viewmenu').submenu.items.find((item) => item.label === 'Zoom −').click()
  })
  await poll(async () => (await nativeState()).zoom === 1, 'menu zoom persisted globally')
  await assertLayout(1)
  await page.getByRole('button', { name: 'Apri impostazioni', exact: true }).click()
  assert.equal(await page.getByLabel('Zoom interfaccia', { exact: true }).inputValue(), '1')
  await page.keyboard.press('Escape')
})

test('invalid zoom IPC rejected without changing valid settings', async () => {
  const rejected = await page.evaluate(async () => {
    try { await window.glaia.settings.update({ zoomFactor: 9 }); return false } catch { return true }
  })
  assert.equal(rejected, true)
  assert.equal((await nativeState()).zoom, 1)
})

test('display work-area changes keep the entire window on the monitor', async () => {
  const result = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'))
    const original = screen.getDisplayMatching
    const display = original(window.getBounds())
    try {
      screen.getDisplayMatching = () => ({ ...display, workArea: { x: 0, y: 0, width: 800, height: 600 } })
      screen.emit('display-metrics-changed', {}, display, ['workArea'])
      return window.getBounds()
    } finally { screen.getDisplayMatching = original }
  })
  assert.ok(result.x >= 0 && result.y >= 0)
  assert.ok(result.x + result.width <= 800 && result.y + result.height <= 600)
  await assertLayout(1)
})

test('zoom persists through renderer reload and full app restart', async () => {
  await page.evaluate(() => window.glaia.settings.update({ zoomFactor: 0.75 }))
  await page.reload()
  await page.locator('.sidebar').waitFor()
  await assertLayout(0.75)
  await app.close()
  app = await electron.launch(launchOptions())
  await poll(async () => {
    page = app.windows().find((window) => window.url().startsWith('file:'))
    return Boolean(page)
  }, 'main renderer reopened')
  await page.locator('.sidebar').waitFor()
  await poll(async () => Math.abs((await nativeState()).zoom - 0.75) < 0.001, 'persisted zoom restored')
  assert.equal(await page.evaluate(async () => (await window.glaia.settings.get()).zoomFactor), 0.75)
})
