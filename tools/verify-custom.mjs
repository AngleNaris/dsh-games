/**
 * Custom pet color + popover polish verification:
 * (1) the popover's custom-color swatch opens color pickers and the picked
 *     gradient lands in petVariant as "custom:#rrggbb:#rrggbb",
 * (2) that custom variant travels through the room protocol to other players
 *     (B's custom whale shows on A's scene),
 * (3) the popover has a fixed 520px height cap and DSH-sized controls.
 * @module dsh-games/tools/verify-custom
 */

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARTIFACTS = join(ROOT, 'tools', 'artifacts')
mkdirSync(ARTIFACTS, { recursive: true })

const A = 'http://127.0.0.1:3080'
const B = 'http://127.0.0.1:3081'
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// Snapshot + localize both instances (restored at the end).
const stateA = await fetch(`${A}/api/games/state`).then((r) => r.json())
const stateB = await fetch(`${B}/api/games/state`).then((r) => r.json())
const origA = { serverUrl: stateA.serverUrl, authToken: stateA.authToken, petVariant: stateA.petVariant }
const origB = { serverUrl: stateB.serverUrl, authToken: stateB.authToken, petVariant: stateB.petVariant }
const restore = async () => {
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await post(`${B}/api/games/config`, origB).catch(() => {})
}
await post(`${A}/api/games/config`, { serverUrl: '', authToken: '' })
await post(`${B}/api/games/config`, { serverUrl: A, authToken: '' })
await post(`${A}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageA = await ctx.newPage()
  const pageB = await ctx.newPage()
  const errors = []
  for (const [name, page] of [['A', pageA], ['B', pageB]]) {
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`) })
    page.on('pageerror', (err) => errors.push(`${name}: pageerror: ${err.message}`))
  }

  async function dismissModals(page) {
    for (let i = 0; i < 4; i += 1) {
      const mask = page.locator('._mask_15u5s_14').first()
      if (await mask.count() === 0) return
      const root = mask.locator('xpath=ancestor::div[contains(@class,"_root_15u5s_2")]')
      const buttons = root.locator('button')
      const n = await buttons.count()
      let clicked = false
      for (let j = 0; j < n; j += 1) {
        if (await buttons.nth(j).isEnabled().catch(() => false)) {
          await buttons.nth(j).click({ timeout: 3_000 }).catch(() => {})
          clicked = true
          break
        }
      }
      if (!clicked && n > 0) await buttons.last().click({ force: true, timeout: 3_000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
  }

  await pageA.goto(A, { waitUntil: 'networkidle' })
  await dismissModals(pageA)
  await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })

  // ---- (1) custom color pickers in the popover ----
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]')

  // Fixed height cap + DSH-sized controls.
  const chrome = await pageA.evaluate(() => {
    const pop = document.querySelector('.dsg-popover')
    const btn = document.querySelector('.dsg-btn')
    const input = document.querySelector('.dsg-input')
    const popStyle = getComputedStyle(pop)
    return {
      popMaxHeight: popStyle.maxHeight,
      btnPadding: btn ? getComputedStyle(btn).padding : null,
      btnFont: btn ? getComputedStyle(btn).fontSize : null,
      inputPadding: input ? getComputedStyle(input).padding : null,
    }
  })
  if (!chrome.popMaxHeight.startsWith('520px')) {
    throw new Error(`popover max-height ${chrome.popMaxHeight} != 520px`)
  }
  if (chrome.btnPadding !== '5px 12px' || chrome.btnFont !== '13px') {
    throw new Error(`button chrome off: padding=${chrome.btnPadding} font=${chrome.btnFont}`)
  }
  if (chrome.inputPadding !== '6px 8px') {
    throw new Error(`input padding ${chrome.inputPadding} != 6px 8px`)
  }
  console.log(`[custom] popover chrome OK: max-height ${chrome.popMaxHeight}, btn ${chrome.btnPadding}/${chrome.btnFont}, input ${chrome.inputPadding}`)

  // Open the custom swatch, pick two colors, and verify petVariant updates.
  const customSwatch = pageA.locator('.dsg-swatch-custom')
  if (await customSwatch.count() !== 1) throw new Error('custom swatch missing')
  await customSwatch.click()
  await pageA.waitForSelector('.dsg-color-field input[type="color"]')
  const pickers = pageA.locator('.dsg-color-field input[type="color"]')
  await pickers.nth(0).fill('#123456')
  await pageA.waitForTimeout(300)
  await pickers.nth(1).fill('#654321')
  await pageA.waitForTimeout(3_000) // state poll picks the config up
  const variantA = (await fetch(`${A}/api/games/state`).then((r) => r.json())).petVariant
  if (variantA !== 'custom:#123456:#654321') {
    throw new Error(`petVariant after custom pick: ${variantA}`)
  }
  console.log(`[custom] A petVariant -> ${variantA}`)
  await pageA.screenshot({ path: join(ARTIFACTS, '34-custom-popover.png') })

  // ---- (2) the custom variant travels through the room protocol ----
  await pageA.click('[data-testid="games-room-create"]')
  await pageA.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  const code = (await pageA.textContent('[data-testid="games-room-joined"]')).match(/[A-Z2-9]{4}/)[0]
  // B picks its own custom color via the API and joins the room.
  await post(`${B}/api/games/config`, { petVariant: 'custom:#ff00ff:#00ffff' })
  await pageB.goto(B, { waitUntil: 'networkidle' })
  await dismissModals(pageB)
  await pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  await pageB.click('[data-testid="games-pet"]')
  await pageB.waitForSelector('[data-testid="games-popover"]')
  await pageB.click('[data-testid="games-room-empty"] button:has-text("用代码加入")')
  await pageB.fill('#dsg-room-code', code)
  await pageB.click('[data-testid="games-room-join"]')
  await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  await pageA.waitForTimeout(5_000)
  const stops = await pageA.locator('[data-testid="games-scene-pet"] svg stop').evaluateAll(
    (els) => els.map((el) => el.getAttribute('stop-color')),
  )
  if (!stops.includes('#ff00ff') || !stops.includes('#00ffff')) {
    throw new Error(`B's custom colors did not reach A's scene: ${JSON.stringify(stops)}`)
  }
  console.log('[custom] B\'s custom gradient reached A\'s scene:', JSON.stringify(stops))
  await pageA.screenshot({ path: join(ARTIFACTS, '35-custom-room.png') })

  await pageA.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })
  await pageB.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })

  console.log(`[custom] console errors: ${errors.length}`)
  for (const e of errors) console.log(`  - ${e}`)
} finally {
  await restore()
  await browser.close()
}
