/**
 * Dump the settings dialog structure so the games card can be located
 * precisely (which tab/section hosts it).
 * @module dsh-games/tools/verify-settings
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const BASE = 'http://127.0.0.1:3080'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })

const dialogs = page.locator('button[aria-haspopup="dialog"]')
await dialogs.last().click()
await page.waitForTimeout(2_000)

// List role=tab / clickable rows inside the dialog.
const tabs = page.locator('[role="tab"], [role="tablist"] *')
const tabCount = await tabs.count()
console.log(`[settings] tab-ish nodes: ${tabCount}`)
for (let i = 0; i < tabCount; i += 1) {
  const t = (await tabs.nth(i).textContent() ?? '').trim().slice(0, 30)
  if (t !== '') console.log(`[settings]   [${i}] ${t}`)
}

// Try clicking each candidate that reads 插件.
const dialog = page.locator('[role="dialog"]').last()
console.log(`[settings] dialogs: ${await page.locator('[role="dialog"]').count()}`)
const dialogText = await dialog.innerText()
console.log(`[settings] dialog text (first 700):\n${dialogText.slice(0, 700)}`)

await browser.close()
