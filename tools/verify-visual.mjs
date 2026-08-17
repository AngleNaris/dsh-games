/**
 * Visual + settings verification for dsh-games.
 *  - Pixel-samples the pet area for the whale blue and hat colors.
 *  - Opens the settings surface and locates the games card, dumping the
 *    clickable settings entries first.
 * @module dsh-games/tools/verify-visual
 */

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')
const sharp = require('C:/Users/Admin/.dsh/profiles/node_modules/sharp')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARTIFACTS = join(ROOT, 'tools', 'artifacts')
const BASE = 'http://127.0.0.1:3080'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="games-summon"], [data-testid="games-pet"]', { timeout: 20_000 })
if (await page.locator('[data-testid="games-summon"]').count()) {
  await page.click('[data-testid="games-summon"]')
  await page.waitForTimeout(1_500)
}
await page.waitForSelector('[data-testid="games-pet"]', { timeout: 10_000 })
await page.waitForTimeout(2_000)

// ---- 1. pet geometry (custom pet image or the built-in whale SVG) ----
const box = await (await page.locator('[data-testid="games-pet"]').boundingBox())
console.log(`[visual] pet box: ${JSON.stringify(box)}`)
const petArt = page.locator('[data-testid="games-pet"] svg[role="img"], [data-testid="games-pet"] .dsg-pet-img').first()
await petArt.waitFor({ state: 'visible', timeout: 5_000 })
const whaleBox = await (await petArt.boundingBox())
console.log(`[visual] pet art box: ${JSON.stringify(whaleBox)}`)

// ---- 2. pixel sample the whale area for brand blue ----
const clip = {
  x: Math.max(0, box.x - 8),
  y: Math.max(0, box.y - 8),
  width: Math.min(1440 - box.x + 8, box.width + 16),
  height: Math.min(900 - box.y + 8, box.height + 16),
}
const buf = await page.screenshot({ clip })
writeFileSync(join(ARTIFACTS, 'pet-clip.png'), buf)
const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
let blue = 0
let hatPixels = 0
for (let i = 0; i < data.length; i += 4) {
  const r = data[i]; const g = data[i + 1]; const b = data[i + 2]
  if (b > 200 && b > r + 60) blue += 1
  if (r > 200 && g > 60 && g < 200 && b < 130) hatPixels += 1
}
console.log(`[visual] blue(whale) pixels: ${blue}, warm(hat) pixels: ${hatPixels}`)

// ---- 3. settings surface ----
const dialogs = page.locator('button[aria-haspopup="dialog"]')
const count = await dialogs.count()
console.log(`[settings] aria-haspopup buttons: ${count}`)
for (let i = 0; i < count; i += 1) {
  const text = (await dialogs.nth(i).textContent() ?? '').trim().slice(0, 40)
  console.log(`[settings]   [${i}] ${text}`)
}
if (count > 0) {
  await dialogs.last().click()
  await page.waitForTimeout(2_000)
  // The games card lives under 插件 -> 插件配置 -> Web UI 插件 group.
  const dialog = page.locator('[role="dialog"]').last()
  const pluginNav = dialog.getByText('插件', { exact: true })
  if (await pluginNav.count()) {
    await pluginNav.first().click()
    await page.waitForTimeout(1_500)
  }
  // Expand the Web UI plugin group card.
  const group = dialog.getByText('Web UI 插件', { exact: true }).first()
  if (await group.count()) {
    await group.click()
    await page.waitForTimeout(1_500)
  }
  const games = page.locator('text=深海小屋')
  console.log(`[settings] 深海小屋 matches: ${await games.count()}`)
  const boost = page.locator('[data-testid="games-settings-boost"]')
  console.log(`[settings] boost button: ${await boost.count()}`)
  if (await boost.count()) {
    const card = page.locator('[data-testid="games-settings-card"]')
    console.log(`[settings] card text (first 500):\n${(await card.innerText()).slice(0, 500)}`)
    await boost.click()
    await page.waitForTimeout(2_000)
    const note = page.locator('[data-testid="games-settings-note"]')
    console.log(`[settings] boost note: ${await note.count() ? (await note.innerText()).trim() : '(none)'}`)
  }
  await page.screenshot({ path: join(ARTIFACTS, '07-settings-surface.png') })
}

console.log(`[visual] console errors: ${errors.length}`)
for (const e of errors) console.log(`  - ${e}`)
await browser.close()
