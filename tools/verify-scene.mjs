/**
 * Room pet scene demo: two dsh web instances (3080 = player A, 3081 = player B)
 * join one room on A's local host; A's page must show B's pet floating around
 * A's anchor pet, and the arrangement controls must reflow it (free / row /
 * column / orbit / configurable grid). Also verifies the room protocol carries
 * the member's pet variant. Screenshots land in tools/artifacts/.
 *
 * The instances normally point at a remote game server with auth; the script
 * temporarily clears serverUrl/authToken so the room lives on A's local host,
 * then restores both instances' config at the end.
 * @module dsh-games/tools/verify-scene
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

const A = process.env.DSG_VERIFY_A ?? 'http://127.0.0.1:3080'
const B = process.env.DSG_VERIFY_B ?? 'http://127.0.0.1:3081'

const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// ---- snapshot and localize the instances (restored at the end) ----
const stateA = await fetch(`${A}/api/games/state`).then((r) => r.json())
const stateB = await fetch(`${B}/api/games/state`).then((r) => r.json())
const origA = { serverUrl: stateA.serverUrl, authToken: stateA.authToken, petVariant: stateA.petVariant }
const origB = { serverUrl: stateB.serverUrl, authToken: stateB.authToken, petVariant: stateB.petVariant }
const origDisplayA = stateA.display
const origDisplayB = stateB.display
const restore = async () => {
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await post(`${B}/api/games/config`, origB).catch(() => {})
  await post(`${A}/api/games/display`, origDisplayA).catch(() => {})
  await post(`${B}/api/games/display`, origDisplayB).catch(() => {})
}
await post(`${A}/api/games/config`, { serverUrl: '', authToken: '' })
await post(`${B}/api/games/config`, { serverUrl: A, authToken: '' })

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

  // Both pets use a stable 100px test size; B flips to the ocean pattern so the
  // protocol round-trip of petVariant is observable.
  for (const base of [A, B]) {
    await post(`${base}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })
  }
  await post(`${B}/api/games/config`, { petVariant: 'ocean' })
  // Hide B's dsh-pet whale girl so only our pets are on stage.
  await post(`${B}/api/pet/set-visible`, { visible: false }).catch(() => {})

  /** Dismiss DSH modal dialogs (first-run 内测声明 / setup wizard etc.). */
  async function dismissModals(page) {
    for (let i = 0; i < 4; i += 1) {
      const mask = page.locator('._mask_15u5s_14').first()
      if (await mask.count() === 0) return
      const root = mask.locator('xpath=ancestor::div[contains(@class,"_root_15u5s_2")]')
      const buttons = root.locator('button')
      const n = await buttons.count()
      if (n === 0) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        continue
      }
      let clicked = false
      for (let j = 0; j < n; j += 1) {
        const button = buttons.nth(j)
        if (await button.isEnabled().catch(() => false)) {
          await button.click({ timeout: 3_000 }).catch(() => {})
          clicked = true
          break
        }
      }
      if (!clicked) await buttons.last().click({ force: true, timeout: 3_000 }).catch(() => {})
      await page.waitForTimeout(600)
    }
  }

  await pageA.goto(A, { waitUntil: 'networkidle' })
  await pageB.goto(B, { waitUntil: 'networkidle' })
  await dismissModals(pageA)
  await dismissModals(pageB)
  await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  await pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  console.log('[scene] both pets visible at 100px')

  // A creates a room on its local host.
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]')
  await pageA.click('[data-testid="games-room-create"]')
  await pageA.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  const joinedText = await pageA.textContent('[data-testid="games-room-joined"]')
  const code = joinedText.match(/[A-Z2-9]{4}/)[0]
  console.log(`[scene] A created room ${code}`)

  // B joins A's room.
  await dismissModals(pageB)
  await pageB.click('[data-testid="games-pet"]')
  await pageB.waitForSelector('[data-testid="games-popover"]')
  await pageB.click('[data-testid="games-room-empty"] button:has-text("用代码加入")')
  await pageB.fill('#dsg-room-code', code)
  await pageB.click('[data-testid="games-room-join"]')
  await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  console.log('[scene] B joined the room')

  // Wait for a heartbeat cycle so A sees B as a member.
  await pageA.waitForTimeout(5_000)
  const scenePets = pageA.locator('[data-testid="games-scene-pet"]')
  const count = await scenePets.count()
  if (count !== 1) throw new Error(`expected 1 scene pet on A, got ${count}`)
  console.log('[scene] A sees B\'s floating pet')

  // The room protocol must carry B's pet variant into A's scene.
  const stops = await scenePets.first().locator('svg stop').evaluateAll(
    (els) => els.map((el) => el.getAttribute('stop-color')),
  )
  if (!stops.includes('#67e8f9') || !stops.includes('#0284c7')) {
    throw new Error(`B's whale should render in the ocean variant, got ${JSON.stringify(stops)}`)
  }
  console.log('[scene] protocol: B\'s petVariant reached A\'s scene')

  const anchor = await pageA.locator('[data-testid="games-pet"]').boundingBox()
  const member = await scenePets.first().boundingBox()
  const centerX = (b) => b.x + b.width / 2
  const centerY = (b) => b.y + b.height / 2
  console.log(`[scene] anchor(${Math.round(anchor.x)},${Math.round(anchor.y)}) member(${Math.round(member.x)},${Math.round(member.y)})`)

  // ---- free mode: B's pet defaults to the left of A's anchor ----
  if (!(member.x + member.width <= anchor.x + 1)) {
    throw new Error('free-mode default seat should be left of the anchor')
  }
  console.log('[scene] free mode: member queued left of anchor')
  await pageA.screenshot({ path: join(ARTIFACTS, '20-scene-free.png') })

  // Open the arrangement controls and exercise every mode.
  const controls = '[data-testid="games-scene-controls"]'
  await pageA.waitForSelector(controls)
  await pageA.locator(`${controls} .dsg-slider`).evaluate((element) => {
    element.value = '24'
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await pageA.waitForTimeout(300)
  const clickMode = async (label) => {
    await pageA.click(`${controls} .dsg-radio:has-text("${label}")`)
    await pageA.waitForTimeout(400)
  }

  // ---- row: y-centers align ----
  await clickMode('水平对齐')
  const rowBox = await scenePets.first().boundingBox()
  if (Math.abs(centerY(rowBox) - centerY(anchor)) > 3) {
    throw new Error(`row mode: y-centers differ by ${Math.abs(centerY(rowBox) - centerY(anchor)).toFixed(1)}px`)
  }
  console.log('[scene] row mode: y-centers aligned')
  await pageA.screenshot({ path: join(ARTIFACTS, '21-scene-row.png') })

  // ---- column: x-centers align ----
  await clickMode('垂直对齐')
  const colBox = await scenePets.first().boundingBox()
  if (Math.abs(centerX(colBox) - centerX(anchor)) > 3) {
    throw new Error(`column mode: x-centers differ by ${Math.abs(centerX(colBox) - centerX(anchor)).toFixed(1)}px`)
  }
  console.log('[scene] column mode: x-centers aligned')
  await pageA.screenshot({ path: join(ARTIFACTS, '22-scene-column.png') })

  // ---- orbit: center distance = both pet radii + configured edge gap ----
  await clickMode('环绕排列')
  const orbBox = await scenePets.first().boundingBox()
  const distance = Math.hypot(centerX(orbBox) - centerX(anchor), centerY(orbBox) - centerY(anchor))
  const expectedDistance = anchor.width / 2 + orbBox.width / 2 + 24
  if (Math.abs(distance - expectedDistance) > 6) {
    throw new Error(`orbit mode: distance ${distance.toFixed(1)}px != ${expectedDistance.toFixed(1)}px`)
  }
  console.log(`[scene] orbit mode: on the ${expectedDistance.toFixed(1)}px ring`)
  await pageA.screenshot({ path: join(ARTIFACTS, '23-scene-orbit.png') })

  // ---- grid: rows × columns are configurable and the layout owns position ----
  await clickMode('网格排列')
  await pageA.fill('[data-testid="games-scene-grid-columns"]', '2')
  await pageA.fill('[data-testid="games-scene-grid-rows"]', '2')
  await pageA.waitForTimeout(300)
  const gridBox = await scenePets.first().boundingBox()
  await pageA.mouse.move(gridBox.x + gridBox.width / 2, gridBox.y + gridBox.height / 2)
  await pageA.mouse.down()
  await pageA.mouse.move(gridBox.x + 87, gridBox.y - 53, { steps: 8 })
  await pageA.mouse.up()
  await pageA.waitForTimeout(400)
  const gridAfterDrag = await scenePets.first().boundingBox()
  if (Math.abs(gridAfterDrag.x - gridBox.x) > 2 || Math.abs(gridAfterDrag.y - gridBox.y) > 2) {
    throw new Error('grid mode allowed manual dragging')
  }
  console.log('[scene] grid mode: 2x2 controls applied and manual dragging disabled')
  await pageA.screenshot({ path: join(ARTIFACTS, '24-scene-grid.png') })

  // ---- free: drag is remembered ----
  if (await pageA.locator(controls).count() === 0) {
    await pageA.click('[data-testid="games-pet"]')
    await pageA.waitForSelector(controls)
  }
  await clickMode('自由')
  const freeBox = await scenePets.first().boundingBox()
  const dragFromX = freeBox.x + freeBox.width / 2
  const dragFromY = freeBox.y + freeBox.height / 2
  const dragToX = freeBox.x - 120
  const dragToY = freeBox.y - 90
  await pageA.mouse.move(dragFromX, dragFromY)
  await pageA.mouse.down()
  await pageA.mouse.move(dragToX, dragToY, { steps: 8 })
  await pageA.mouse.up()
  await pageA.waitForTimeout(400)
  const moved = await scenePets.first().boundingBox()
  // The pet follows the pointer: x shifts by (dragToX - dragFromX) etc.
  const expectX = freeBox.x + (dragToX - dragFromX)
  const expectY = freeBox.y + (dragToY - dragFromY)
  if (Math.abs(moved.x - expectX) > 4 || Math.abs(moved.y - expectY) > 4) {
    throw new Error(`free mode: drag not remembered (${Math.round(moved.x)},${Math.round(moved.y)}) vs (${Math.round(expectX)},${Math.round(expectY)})`)
  }
  console.log('[scene] free mode: drag remembered')

  // Reload A: the remembered free position must survive (localStorage).
  await pageA.reload({ waitUntil: 'networkidle' })
  await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  await pageA.waitForTimeout(5_000)
  const reloaded = await pageA.locator('[data-testid="games-scene-pet"]').first().boundingBox()
  if (Math.abs(reloaded.x - moved.x) > 4 || Math.abs(reloaded.y - moved.y) > 4) {
    throw new Error('free position did not survive reload')
  }
  console.log('[scene] free position survived reload')

  // Hover the member pet: its name label appears.
  await pageA.locator('[data-testid="games-scene-pet"]').first().hover()
  await pageA.waitForTimeout(300)
  const labelVisible = await pageA.locator('[data-testid="games-scene-pet"] .dsg-scene-label').first().evaluate(
    (el) => getComputedStyle(el).opacity,
  )
  if (Number(labelVisible) < 0.9) throw new Error(`scene label opacity ${labelVisible}`)
  console.log('[scene] hover label visible')
  await pageA.screenshot({ path: join(ARTIFACTS, '25-scene-free-reload-label.png') })

  // Dark-theme popover screenshot (token-driven colors).
  await pageA.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]')
  await pageA.waitForTimeout(300)
  await pageA.screenshot({ path: join(ARTIFACTS, '26-scene-popover-dark.png') })
  await pageA.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await pageA.waitForTimeout(300)
  await pageA.screenshot({ path: join(ARTIFACTS, '27-scene-popover-light.png') })

  // Leave the room so no stale seat stays stored.
  await pageA.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })
  await pageB.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })

  console.log(`[scene] console errors: ${errors.length}`)
  for (const e of errors) console.log(`  - ${e}`)
} finally {
  await restore()
  await browser.close()
}
