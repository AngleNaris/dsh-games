/**
 * Crown pyramid + merge-animation visual verification (focused).
 * Loads the live GUI at 127.0.0.1:3080 and:
 *   1. screenshots the current static pile,
 *   2. boosts to the next unit count that crafts up (any tier decreases —
 *      computed from the live ledger and the game server's crown base),
 *      then captures the collapse mid-transition (ghosts + flash + flying
 *      crowns) and the settled pile,
 *   3. boosts +3 units and screenshots the second merge + re-layout.
 * State is restored afterwards by the caller (kill → edit games.json →
 * restart dsh web); see the project memory for the baseline.
 * @module dsh-games/tools/verify-crowns
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
const BASE = 'http://127.0.0.1:3080'
/** Repo defaults (the deployed server may serve older values — see rules fetch). */
const DEFAULT_BASE = 6
const DEFAULT_STEP = 1_000_000

const CROWN_SELECTOR = '[data-testid="games-app"] .dsg-crown:not(.dsg-crown-ghost)'

/** Crown decomposition with a craft base (matches src/crowns.ts crownCounts). */
const decompose = (units, base) => {
  const counts = new Array(10).fill(0)
  let rest = units
  for (let i = 0; i < 9; i += 1) {
    counts[i] = rest % base
    rest = Math.floor(rest / base)
  }
  counts[9] += rest
  return counts
}
const total = (counts) => counts.reduce((sum, n) => sum + n, 0)

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
await page.waitForTimeout(1_200)

const apiState = () => fetch(`${BASE}/api/games/state`).then((res) => res.json())
const boost = async (tokens) => {
  const res = await fetch(`${BASE}/api/games/boost`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokens }),
  })
  if (!res.ok) throw new Error(`boost failed: ${res.status}`)
}
/** Boost so the ledger reaches exactly `units` crowns (no fractional dust). */
const boostToUnits = async (units) => {
  const state = await apiState()
  const need = units * STEP - state.tokens
  if (need > 0) await boost(need)
}
const shot = async (name) => {
  await page.screenshot({ path: join(ARTIFACTS, `${name}.png`) })
  console.log(`[crowns] screenshot: ${name}`)
}
const crownCount = () => page.evaluate((selector) => document.querySelectorAll(selector).length, CROWN_SELECTOR)
const waitForCrowns = async (expected, label) => {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if ((await crownCount()) === expected) return
    await page.waitForTimeout(120)
  }
  throw new Error(`${label}: expected ${expected} crowns, have ${await crownCount()}`)
}

// The client crafts with the game server's rules (1M tokenStep, base 3 in
// the repo; the deployed server may still serve an older base).
const start = await apiState()
const rulesRes = await fetch(`${start.serverUrl}/api/games/rules`, {
  headers: start.authToken === '' ? {} : { authorization: `Bearer ${start.authToken}` },
}).catch(() => null)
const served = rulesRes !== null ? await rulesRes.json().catch(() => null) : null
const BASE_N = served?.rules?.crown?.base ?? DEFAULT_BASE
const STEP = served?.rules?.crown?.tokenStep ?? DEFAULT_STEP
const units = Math.floor(start.tokens / STEP)
const nowCounts = decompose(units, BASE_N)
console.log(`[crowns] rules: base=${BASE_N} tokenStep=${STEP}; start tokens ${start.tokens} (${units} units) → ${total(nowCounts)} crowns`)

// Find the next unit count where some tier crafts up (a merge happens).
let target = units + 1
for (; target <= units + 12; target += 1) {
  const next = decompose(target, BASE_N)
  if (next.some((value, tier) => value < nowCounts[tier])) break
}
if (target > units + 12) throw new Error('no merge point within +12 units — ledger too tidy')

console.log(`[crowns] initial crown elements: ${await crownCount()}`)
await shot('crowns-01-initial')

// 1. The crafting cascade: the consumed crowns shrink away, a flash bursts
//    at the merge point, the crafted crown slides up, the pile re-collapses.
await boostToUnits(target)
await waitForCrowns(total(decompose(target, BASE_N)), 'after crafting cascade')
await page.waitForTimeout(130) // mid-transition: ghosts fading, flash bursting
await shot('crowns-02-merge-mid')
console.log(`[crowns] mid-merge: flash=${await page.locator('.dsg-crown-flash').count()}, ghosts=${await page.locator('.dsg-crown-ghost').count()}`)
await page.waitForTimeout(1_300)
await shot('crowns-03-merge-settled')

// 2. +3 units: another tier crafts up; the pile re-lays out again.
const later = target + 3
await boostToUnits(later)
await waitForCrowns(total(decompose(later, BASE_N)), 'after second growth boost')
await page.waitForTimeout(130)
await shot('crowns-04-merge2-mid')
await page.waitForTimeout(1_300)
await shot('crowns-05-settled-grown')

const finalState = await apiState()
console.log(`[crowns] final: tokens ${finalState.tokens} (${Math.floor(finalState.tokens / STEP)} units)`)
console.log(`[crowns] console errors: ${errors.length}`)
for (const error of errors) console.log(`[crowns] console error: ${error}`)
await browser.close()
