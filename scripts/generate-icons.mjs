#!/usr/bin/env node
// Generates build/icon.png (1024), build/icon.ico and build/icon.icns from
// src/renderer/assets/icon.png so electron-builder can package each platform
// with the correct format without relying on macOS-only tools.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import png2icons from 'png2icons'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

const sourcePng = resolve(projectRoot, 'src/renderer/assets/icon.png')
const outDir = resolve(projectRoot, 'build')

if (!existsSync(sourcePng)) {
  console.error(`[icons] source not found: ${sourcePng}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const input = readFileSync(sourcePng)

// electron-builder picks build/icon.png for Linux.
writeFileSync(resolve(outDir, 'icon.png'), input)

const ico = png2icons.createICO(input, png2icons.BILINEAR, 0, false)
if (!ico) {
  console.error('[icons] failed to create .ico')
  process.exit(1)
}
writeFileSync(resolve(outDir, 'icon.ico'), ico)

const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0)
if (!icns) {
  console.error('[icons] failed to create .icns')
  process.exit(1)
}
writeFileSync(resolve(outDir, 'icon.icns'), icns)

console.log('[icons] wrote build/icon.png, build/icon.ico, build/icon.icns')
