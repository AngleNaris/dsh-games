/**
 * Browser verification for dsh-games: loads the live GUI at 127.0.0.1:3080,
 * checks the pet surface (summon → whale + crown pyramid), the popover
 * (nickname / size / pattern / pet upload), the public room list, room
 * creation, crown growth after a boost (with the token-use FX), the member
 * list, and the settings card. Captures screenshots into tools/artifacts/.
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

// 1. Load the GUI. The pet may be hidden (display.visible=false) — summon it.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="games-summon"], [data-testid="games-pet"]', { timeout: 20_000 })
if (await page.locator('[data-testid="games-summon"]').count()) {
  await page.click('[data-testid="games-summon"]')
  await page.waitForTimeout(1_500)
}
await page.waitForSelector('[data-testid="games-pet"]', { timeout: 10_000 })
await page.waitForTimeout(2_500)
await shot(page, '01-pet-visible')

// 2. Pet label shows nickname + tokens (+ crown summary).
const label = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label: ${label}`)

// 3. Crown pyramid renders above the pet (instance A has 3 bronze crowns).
const crownCount = await page.locator('[data-testid="games-app"] .dsg-crown').count()
console.log(`[verify] crown elements: ${crownCount}`)

// 4. Open the popover by clicking the pet.
await page.click('[data-testid="games-pet"]')
await page.waitForSelector('[data-testid="games-popover"]', { timeout: 5_000 })
await shot(page, '02-popover')

// 5. Set a nickname via the popover. The popover scrolls internally now that
// it holds the size/pattern/upload controls — scroll it into view first.
await page.fill('#dsg-nickname-input', '深海测试员')
await page.locator('.dsg-popover').evaluate((el) => { el.scrollTop = el.scrollHeight })
await page.click('[data-testid="games-popover"] button:has-text("保存")')
await page.waitForTimeout(2_500)
const labelAfter = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label after rename: ${labelAfter}`)

// 6. The public room list loads (from the same-origin game-server mount).
await page.waitForSelector('[data-testid="games-room-list"]', { timeout: 8_000 })
const rowsBefore = await page.locator('[data-testid="games-room-row"]').count()
console.log(`[verify] public room rows (before create): ${rowsBefore}`)

// 7. Create a public room from the panel.
await page.click('[data-testid="games-room-create"]')
await page.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
await page.waitForTimeout(1_000)
await shot(page, '03-room-created')
const roomCode = (await page.textContent('[data-testid="games-room-joined"]')).match(/[A-Z2-9]{4}/)?.[0]
console.log(`[verify] room code: ${roomCode}`)

const ownState = await (await fetch(`${BASE}/api/games/state`)).json()
const serverHeaders = ownState.authToken === ''
  ? {}
  : { authorization: `Bearer ${ownState.authToken}` }

// 8. Join a second member via protocol v3, then check the list.
const bobJoin = await fetch(`${BASE}/api/games/rooms/${roomCode}/join`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...serverHeaders },
  body: JSON.stringify({
    member: {
      memberId: 'player-bob',
      nickname: 'Bob',
      tokens: 10,
      crowns: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      phase: 'thinking',
    },
  }),
})
console.log(`[verify] bob join: ${bobJoin.status}`)
await page.waitForTimeout(4_000) // next room poll
await shot(page, '04-room-members')
const memberCount = await page.locator('[data-testid="games-room-members"] .dsg-member').count()
console.log(`[verify] member rows: ${memberCount}`)
const bobSub = await page.locator('[data-testid="games-room-members"] .dsg-member-sub').nth(1).innerText().catch(() => '(none)')
console.log(`[verify] bob sub: ${bobSub}`)

// 9. Boost one crown's worth of tokens (100M default): the label should flash
// the +token chip and the crown pyramid should grow.
await fetch(`${BASE}/api/games/boost`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tokens: 100_000_000 }),
})
await page.waitForSelector('[data-testid="games-token-chip"]', { timeout: 6_000 }).catch(() => {})
await page.waitForTimeout(1_000)
await shot(page, '05-crown-grown')
const crownCountAfter = await page.locator('[data-testid="games-app"] .dsg-crown').count()
console.log(`[verify] crown elements after boost: ${crownCountAfter}`)
const labelFinal = await page.textContent('[data-testid="games-label"]')
console.log(`[verify] pet label final: ${labelFinal}`)

// 10. Custom pet upload via the API (a real PNG), then the pet turns into an
// image and the room heartbeat carries its URL.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const upload = await fetch(`${BASE}/api/games/pets/${ownState.memberId}`, {
  method: 'POST',
  headers: { 'content-type': 'image/png', ...serverHeaders },
  body: new Uint8Array(png),
})
const uploadJson = await upload.json()
console.log(`[verify] pet upload: ${JSON.stringify(uploadJson)}`)
if (uploadJson.ok) {
  await fetch(`${BASE}/api/games/pet-meta`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pet: uploadJson.pet }),
  })
  await page.waitForSelector('[data-testid="games-app"] .dsg-pet-img', { timeout: 8_000 })
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="games-app"] .dsg-pet-img')
    return img instanceof HTMLImageElement && img.naturalWidth > 0
  }, { timeout: 8_000 })
  await shot(page, '08-custom-pet')
  console.log('[verify] custom pet image rendered (real pixels loaded)')
}

// 11. Open the settings page and find the plugin card (under 插件 → Web UI 插件).
await page.click('[data-testid="games-pet"]') // close popover
await page.waitForTimeout(500)
const settingsButton = page.locator('button[aria-haspopup="dialog"]').last()
if (await settingsButton.count()) {
  await settingsButton.click()
  await page.waitForTimeout(2_000)
  const dialog = page.locator('[role="dialog"]').last()
  const pluginNav = dialog.getByText('插件', { exact: true })
  if (await pluginNav.count()) {
    await pluginNav.first().click()
    await page.waitForTimeout(1_500)
  }
  const group = dialog.getByText('Web UI 插件', { exact: true }).first()
  if (await group.count()) {
    await group.click()
    await page.waitForTimeout(1_500)
  }
  await shot(page, '06-settings-page')
  const hasCard = await page.locator('[data-testid="games-settings-card"]').first().isVisible().catch(() => false)
  console.log(`[verify] games settings card visible: ${hasCard}`)
} else {
  console.log('[verify] settings entry button not found')
}

// 12. The room list on the server includes the public room just created.
const list = await (await fetch(`${BASE}/api/games/rooms`, { headers: serverHeaders })).json()
console.log(`[verify] server room list: ${list.rooms.map((r) => `${r.code}${r.public ? '' : '(invite)'}`).join(', ')}`)

console.log(`[verify] console errors: ${consoleErrors.length}`)
for (const error of consoleErrors) console.log(`  - ${error}`)
console.log(`[verify] screenshots: ${results.join(', ')}`)

await browser.close()
