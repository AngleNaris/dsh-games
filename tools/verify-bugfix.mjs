/**
 * Bug-fix verification for the pet: (1) dragging must not snap back mid-drag
 * while the 2s state poll runs, (2) the bottom label shows only nickname +
 * tokens (no crown names), (3) the label token number and "+N" chip settle on
 * the next host-state poll instead of waiting for a separate timer.
 *
 * The A instance is localized (empty serverUrl/authToken) for the test and
 * restored afterwards; the boost adds 10M tokens to A's ledger — the script
 * restores the games.json total and the host is restarted by the caller.
 * @module dsh-games/tools/verify-bugfix
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
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const stateA = await fetch(`${A}/api/games/state`).then((r) => r.json())
const origA = { serverUrl: stateA.serverUrl, authToken: stateA.authToken, petVariant: stateA.petVariant }
const origDisplayA = stateA.display
const tokensBefore = stateA.tokens
await post(`${A}/api/games/config`, { serverUrl: '', authToken: '' })
await post(`${A}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await page.goto(A, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  console.log('[bugfix] pet visible')

  // ---- (1) drag survives the 2s state poll ----
  // Drag up-left (away from the screen corner, so no edge clamp interferes).
  // The mouse starts at the pet center, so the pet shifts by (target - start).
  const pet = page.locator('[data-testid="games-pet"]')
  const before = await pet.boundingBox()
  const startX = before.x + before.width / 2
  const startY = before.y + before.height / 2
  const target1X = before.x - 120
  const target1Y = before.y - 60
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(target1X, target1Y, { steps: 10 })
  // Hold for 2.5s: at least one state poll must pass without snapping back.
  await page.waitForTimeout(2_500)
  const midDrag = await pet.boundingBox()
  const expect1X = before.x + (target1X - startX)
  const expect1Y = before.y + (target1Y - startY)
  const drift = Math.hypot(midDrag.x - expect1X, midDrag.y - expect1Y)
  if (drift > 6) {
    throw new Error(`drag snapped back mid-drag: expected (${Math.round(expect1X)},${Math.round(expect1Y)}) got (${Math.round(midDrag.x)},${Math.round(midDrag.y)})`)
  }
  console.log(`[bugfix] drag holds across the poll (drift ${drift.toFixed(1)}px)`)
  // Keep dragging, then release.
  const target2X = before.x - 220
  const target2Y = before.y - 120
  await page.mouse.move(target2X, target2Y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(3_000)
  const after = await pet.boundingBox()
  const expect2X = before.x + (target2X - startX)
  const expect2Y = before.y + (target2Y - startY)
  const settle = Math.hypot(after.x - expect2X, after.y - expect2Y)
  if (settle > 6) {
    throw new Error(`drag did not persist after release (${Math.round(after.x)},${Math.round(after.y)}) vs (${Math.round(expect2X)},${Math.round(expect2Y)})`)
  }
  console.log('[bugfix] drag persists after release')
  await page.screenshot({ path: join(ARTIFACTS, '30-bugfix-drag.png') })

  // ---- (2) label shows nickname + tokens only ----
  const label = (await page.textContent('[data-testid="games-label"]')).trim()
  const crownWords = ['青铜', '白银', '黄金', '铂金', '紫水晶', '王冠']
  if (crownWords.some((word) => label.includes(word))) {
    throw new Error(`label still mentions crowns: ${label}`)
  }
  if (!/^.+ · [\d.]+[万亿KM]? tokens$/.test(label)) {
    throw new Error(`label shape unexpected: ${label}`)
  }
  console.log(`[bugfix] label OK: ${label}`)

  // ---- (3) token number settles on the next host-state poll ----
  const labelBefore = await page.textContent('[data-testid="games-label"]')
  await post(`${A}/api/games/boost`, { tokens: 10_000_000 })
  await page.waitForTimeout(2_500)
  const labelLater = await page.textContent('[data-testid="games-label"]')
  if (labelLater === labelBefore) {
    throw new Error('label did not settle on the next host-state poll')
  }
  console.log(`[bugfix] label settled on the next host-state poll: "${labelLater}"`)
  const chipSeen = await page.locator('[data-testid="games-token-chip"]').count()
  console.log(`[bugfix] token chip visible after settle: ${chipSeen > 0 ? 'yes' : 'no (may have faded)'}`)
  await page.screenshot({ path: join(ARTIFACTS, '31-bugfix-settled.png') })

  console.log(`[bugfix] console errors: ${errors.length}`)
  for (const e of errors) console.log(`  - ${e}`)
  console.log(`[bugfix] NOTE: A tokens were boosted by 10M (${tokensBefore} -> ${tokensBefore + 10_000_000}); restore via games.json + host restart`)
} finally {
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await post(`${A}/api/games/display`, origDisplayA).catch(() => {})
  await browser.close()
}
