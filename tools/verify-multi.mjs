/**
 * Cross-instance multiplayer demo: two dsh web instances (3080 = player A,
 * 3081 = player B) join one room; both GUIs must show both pets, and a hat
 * boost on B must appear on A's member list.
 * @module dsh-games/tools/verify-multi
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

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const pageA = await ctx.newPage()
const pageB = await ctx.newPage()
const errors = []
for (const [name, page] of [['A', pageA], ['B', pageB]]) {
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`) })
  page.on('pageerror', (err) => errors.push(`${name}: pageerror: ${err.message}`))
}

// Load both GUIs.
await pageA.goto(A, { waitUntil: 'networkidle' })
await pageB.goto(B, { waitUntil: 'networkidle' })
await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
await pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
console.log('[multi] both pets visible')

// Instance B has a fresh DSH_HOME, so the dsh-pet whale girl defaults to
// visible and overlaps our pet at the same corner; hide it via its API.
await fetch(`${B}/api/pet/set-visible`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ visible: false }),
})
await pageB.waitForTimeout(1_000)

// A creates a room.
await pageA.click('[data-testid="games-pet"]')
await pageA.waitForSelector('[data-testid="games-popover"]')
await pageA.click('[data-testid="games-room-create"]')
await pageA.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
const joinedText = await pageA.textContent('[data-testid="games-room-joined"]')
const code = joinedText.match(/[A-Z2-9]{4}/)[0]
console.log(`[multi] A created room ${code}`)

// B joins A's room.
await pageB.click('[data-testid="games-pet"]')
await pageB.waitForSelector('[data-testid="games-popover"]')
// The join form: click 加入房间 (ghost button next to 创建房间).
await pageB.click('[data-testid="games-room-empty"] button:has-text("加入房间")')
await pageB.fill('#dsg-room-url', A)
await pageB.fill('#dsg-room-code', code)
await pageB.click('[data-testid="games-room-join"]')
await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
console.log('[multi] B joined the room')

// Wait for a heartbeat cycle, then count members on both pages.
await pageA.waitForTimeout(4_000)
await pageB.waitForTimeout(1_000)
const membersA = await pageA.locator('[data-testid="games-room-members"] .dsg-member').count()
const membersB = await pageB.locator('[data-testid="games-room-members"] .dsg-member').count()
console.log(`[multi] members on A: ${membersA}, on B: ${membersB}`)
const namesA = await pageA.locator('[data-testid="games-room-members"] .dsg-member-name').allInnerTexts()
const namesB = await pageB.locator('[data-testid="games-room-members"] .dsg-member-name').allInnerTexts()
console.log(`[multi] names on A: ${JSON.stringify(namesA)}`)
console.log(`[multi] names on B: ${JSON.stringify(namesB)}`)
await pageA.screenshot({ path: join(ARTIFACTS, '10-multi-A-room.png') })
await pageB.screenshot({ path: join(ARTIFACTS, '11-multi-B-room.png') })

// Boost B by one hat (100M) and verify A sees B's hats grow.
await fetch(`${B}/api/games/boost`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tokens: 100_000_000 }),
})
await pageA.waitForTimeout(4_500) // B heartbeats every 3s; A polls every 3s
const subsA = await pageA.locator('[data-testid="games-room-members"] .dsg-member-sub').allInnerTexts()
console.log(`[multi] A member subs after B boost: ${JSON.stringify(subsA)}`)
await pageA.screenshot({ path: join(ARTIFACTS, '12-multi-A-after-boost.png') })

// B's own pet should now show one hat.
const labelB = await pageB.textContent('[data-testid="games-label"]')
console.log(`[multi] B pet label: ${labelB}`)

console.log(`[multi] console errors: ${errors.length}`)
for (const e of errors) console.log(`  - ${e}`)
await browser.close()
