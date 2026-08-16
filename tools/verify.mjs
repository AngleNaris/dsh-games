/**
 * Browser verification for dsh-games: loads the live GUI at 127.0.0.1:3080,
 * checks the pet surface, the popover (nickname + room), room creation, hat
 * growth after a boost, the member list, and the settings card. Captures
 * screenshots into tools/artifacts/.
 * @module dsh-games/tools/verify
 */

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Playwright is not a dependency of this package; resolve the family repo's
// copy (it ships chromium binaries in its dev toolchain).
const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARTIFACTS = join(ROOT, 'tools', 'artifacts')
mkdirSync(ARTIFACTS, { recursive: true })

const BASE = 'http://127.0.0.1:3080'
const results = []
const shot = async (page, name) => {
  await page.screenshot({ path: join(ARTIFACTS, `${name}.png`) })
  results.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

// 1. Load the GUI and wait for the pet surface (the pet div itself — the
// root span is zero-sized since children are fixed-positioned).
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
await page.waitForTimeout(2_500)
await shot(page, '01-pet-visible')

// 2. Pet label shows nickname + tokens.
const label = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label: ${label}`)

// 3. Open the popover by clicking the pet.
await page.click('[data-testid="games-pet"]')
await page.waitForSelector('[data-testid="games-popover"]', { timeout: 5_000 })
await shot(page, '02-popover')

// 4. Set a nickname via the popover.
await page.fill('#dsg-nickname-input', '深海测试员')
await page.click('[data-testid="games-popover"] button:has-text("保存")')
await page.waitForTimeout(2_500)
const labelAfter = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label after rename: ${labelAfter}`)

// 5. Create a room.
await page.click('[data-testid="games-room-create"]')
await page.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
await page.waitForTimeout(1_000)
await shot(page, '03-room-created')
const roomCode = (await page.textContent('[data-testid="games-room-joined"]')).match(/[A-Z2-9]{4}/)?.[0]
console.log(`[verify] room code: ${roomCode}`)

// 6. Add a second member via the API, then check the member list.
const api = BASE.replace('http://', 'http://')
const heartbeat = await fetch(`${api}/api/games/rooms/${roomCode}/members`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    member: {
      memberId: 'player-bob',
      nickname: 'Bob',
      tokens: 245_000_000,
      hats: 2,
      phase: 'thinking',
    },
  }),
})
console.log(`[verify] bob heartbeat: ${heartbeat.status}`)
await page.waitForTimeout(4_000) // next room poll
await shot(page, '04-room-members')
const memberCount = await page.locator('[data-testid="games-room-members"] .dsg-member').count()
console.log(`[verify] member rows: ${memberCount}`)

// 7. Boost one hat's worth of tokens (100M default) and watch the hat appear.
await fetch(`${api}/api/games/boost`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tokens: 100_000_000 }),
})
await page.waitForTimeout(3_500)
await shot(page, '05-hat-grown')
const hatCount = await page.locator('[data-testid="games-app"] .dsg-hat').count()
console.log(`[verify] hat elements: ${hatCount}`)
const labelFinal = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label final: ${labelFinal}`)

// 8. Open the settings page and find the plugin card.
await page.click('[data-testid="games-pet"]') // close popover
await page.waitForTimeout(500)
// Settings entry: sidebar footer button with aria-haspopup dialog.
const settingsButton = page.locator('button[aria-haspopup="dialog"]').last()
if (await settingsButton.count()) {
  await settingsButton.click()
  await page.waitForTimeout(1_500)
  await shot(page, '06-settings-page')
  // Try to find the games card text in the settings surface.
  const hasCard = await page.locator('text=深海小屋').first().isVisible().catch(() => false)
  console.log(`[verify] games settings card visible: ${hasCard}`)
} else {
  console.log('[verify] settings entry button not found')
}

console.log(`[verify] console errors: ${consoleErrors.length}`)
for (const error of consoleErrors) console.log(`  - ${error}`)
console.log(`[verify] screenshots: ${results.join(', ')}`)

await browser.close()
