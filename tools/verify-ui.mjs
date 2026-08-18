/**
 * UI polish verification: (1) bubbles sit above the bottom label bar with a
 * top z-index, (2) no phase dot on pets, (3) label ends with " tokens",
 * (4) the settings card is a collapsible DSH-style sub-menu, (5) hiding the
 * pet is settings-only and leaves no floating UI on the page.
 * @module dsh-games/tools/verify-ui
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

const A = process.env.DSG_VERIFY_BASE ?? 'http://127.0.0.1:3080'
const GAME_SERVER = process.env.DSG_VERIFY_SERVER ?? ''
const GAME_AUTH = process.env.DSG_VERIFY_AUTH ?? ''
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const waitForGameConfig = async (serverUrl, authToken) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await fetch(`${A}/api/games/state`).then((response) => response.json())
    if (state.serverUrl === serverUrl && state.authToken === authToken) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`game config did not settle: ${serverUrl}`)
}

const stateA = await fetch(`${A}/api/games/state`).then((r) => r.json())
const origA = { serverUrl: stateA.serverUrl, authToken: stateA.authToken, petVariant: stateA.petVariant }
await post(`${A}/api/games/config`, { serverUrl: GAME_SERVER, authToken: GAME_AUTH })
await waitForGameConfig(GAME_SERVER, GAME_AUTH)
// Default pet size: with a small pet the hover chat hint covers the lower
// half, so "click the pet" targets the upper half (menu/position area).
await post(`${A}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await page.goto(A, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  const clickPet = async () => {
    await page.locator('[data-testid="games-pet"]').evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('pet trigger is not an HTMLElement')
      element.click()
    })
  }
  // Clear any host drawer/menu persisted from an earlier browser session so
  // the pet-panel screenshot captures the plugin UI without unrelated chrome.
  const closeDetails = page.locator('button[aria-label="关闭详情"]')
  if (await closeDetails.isVisible().catch(() => false)) await closeDetails.click({ force: true })
  await page.waitForTimeout(200)
  const collapsePanel = page.locator('button[aria-label="收起面板"]')
  if (await collapsePanel.isVisible().catch(() => false)) await collapsePanel.click({ force: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---- (1) bubble CSS: above the label bar, top z-index ----
  const bubble = await page.evaluate(() => {
    const pet = document.querySelector('.dsg-pet')
    const bubbleEl = document.createElement('div')
    bubbleEl.className = 'dsg-pet-bubble'
    pet.appendChild(bubbleEl)
    const labelEl = pet.querySelector('.dsg-pet-label')
    const b = bubbleEl.getBoundingClientRect()
    const l = labelEl.getBoundingClientRect()
    const z = getComputedStyle(bubbleEl).zIndex
    bubbleEl.remove()
    return { bubbleBottom: b.bottom, labelTop: l.top, z }
  })
  if (Number(bubble.z) < 5 || bubble.bubbleBottom > bubble.labelTop) {
    throw new Error(`bubble not above the label bar: bottom=${bubble.bubbleBottom} labelTop=${bubble.labelTop} z=${bubble.z}`)
  }
  console.log(`[ui] bubble sits above the label bar (bottom ${Math.round(bubble.bubbleBottom)} < label top ${Math.round(bubble.labelTop)}, z ${bubble.z})`)

  // ---- (2) no phase dot on the pet ----
  const dots = await page.locator('.dsg-pet-root .dsg-phase-dot').count()
  if (dots !== 0) throw new Error(`phase dot still rendered: ${dots}`)
  console.log('[ui] no phase dot on the pet')

  // ---- (3) label ends with " tokens" ----
  const label = (await page.textContent('[data-testid="games-label"]')).trim()
  if (!/^.+ · .+ tokens$/.test(label)) throw new Error(`label missing " tokens": ${label}`)
  console.log(`[ui] label OK: ${label}`)

  // ---- (4) polished popover: semantics, viewport bounds, and close paths ----
  await clickPet()
  await page.waitForSelector('[data-testid="games-popover"]')
  const popover = page.locator('[data-testid="games-popover"]')
  if (await popover.getAttribute('role') !== 'dialog') throw new Error('pet popover is missing dialog semantics')
  if (await page.locator('[data-testid="games-pet"]').getAttribute('aria-expanded') !== 'true') {
    throw new Error('pet trigger does not expose its open state')
  }
  const panelBox = await popover.boundingBox()
  if (panelBox === null || panelBox.x < 11 || panelBox.y < 11 || panelBox.x + panelBox.width > 1269 || panelBox.y + panelBox.height > 789) {
    throw new Error(`popover escaped viewport: ${JSON.stringify(panelBox)}`)
  }
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(ARTIFACTS, '34-ui-pet-popover.png') })

  // The joined-room information block, copy action, and arrangement controls
  // must all resolve to dark theme surfaces rather than gray-white fills.
  await page.click('[data-testid="games-room-create"]')
  const joinedRoom = page.locator('[data-testid="games-room-joined"]')
  await joinedRoom.waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  const createdRoomCode = await joinedRoom.getAttribute('data-room-code')
  if (createdRoomCode === null || createdRoomCode === '') throw new Error('created room did not expose its code')
  const darkSurfaces = await page.evaluate(() => {
    const selectors = {
      info: '.dsg-room-info',
      copy: '.dsg-room-info .dsg-btn-ghost',
      arrangement: '[data-testid="games-scene-controls"] .dsg-radio',
    }
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) throw new Error(`missing dark-surface target: ${selector}`)
      return [name, getComputedStyle(element).backgroundColor]
    }))
  })
  const darkColor = (color) => {
    const values = color.match(/[\d.]+/g)?.map(Number)
    if (values === undefined || values.length < 3) return false
    const alpha = values.length >= 4 ? values[3] : 1
    const average = values.slice(0, 3).reduce((sum, channel) => sum + channel, 0) / 3
    return alpha >= 0.8 && average <= 80
  }
  for (const [name, color] of Object.entries(darkSurfaces)) {
    if (!darkColor(color)) throw new Error(`${name} surface is not an opaque dark fill: ${color}`)
  }
  console.log(`[ui] room surfaces use dark fills: ${JSON.stringify(darkSurfaces)}`)
  await page.screenshot({ path: join(ARTIFACTS, '36-ui-room-dark.png') })

  // Leave the created room, then join it again using plugin settings only.
  // The room form must not expose a second server URL field, and two
  // synchronous clicks must still issue one request.
  await page.click('[data-testid="games-room-leave"]')
  await page.click('[data-testid="games-room-mode-join"]')
  if (await page.locator('#dsg-room-url').count() !== 0) {
    throw new Error('join form still exposes a server URL input')
  }
  await page.locator('#dsg-room-code').fill(createdRoomCode)
  const joinButton = page.locator('[data-testid="games-room-join"]')
  if (await joinButton.isDisabled()) throw new Error('join is disabled with a configured room code')
  let joinRequests = 0
  const countJoin = (request) => {
    if (request.method() === 'POST' && request.url().includes(`/rooms/${createdRoomCode}/join`)) joinRequests += 1
  }
  page.on('request', countJoin)
  await joinButton.evaluate((element) => {
    element.click()
    element.click()
  })
  await joinedRoom.waitFor({ state: 'visible' })
  page.off('request', countJoin)
  if (joinRequests !== 1) throw new Error(`duplicate join issued ${joinRequests} member requests`)
  console.log('[ui] join uses plugin settings, exposes no URL input, and duplicate clicks issue one request')

  // Interacting inside the panel must not dismiss it.
  await page.click('#dsg-nickname-input')
  if (await popover.count() !== 1) throw new Error('popover closed after an internal click')

  // Clicking blank page space dismisses the panel.
  await page.mouse.click(8, 8)
  await popover.waitFor({ state: 'detached' })
  console.log('[ui] outside click closes the pet popover')

  // Escape is the keyboard dismissal path and returns focus to the pet.
  await clickPet()
  await page.waitForSelector('[data-testid="games-popover"]')
  await page.keyboard.press('Escape')
  await popover.waitFor({ state: 'detached' })
  await page.waitForTimeout(100)
  const focusedPet = await page.locator('[data-testid="games-pet"]').evaluate((element) => element === document.activeElement)
  if (!focusedPet) throw new Error('Escape did not return focus to the pet')
  console.log('[ui] Escape closes the pet popover and restores focus')

  // Parking the pet at the left edge must not push the fixed panel off-screen.
  await post(`${A}/api/games/display`, { right: 1150 })
  await page.waitForTimeout(2_500)
  await clickPet()
  await page.waitForSelector('[data-testid="games-popover"]')
  const edgeBox = await popover.boundingBox()
  if (edgeBox === null || edgeBox.x < 11 || edgeBox.x + edgeBox.width > 1269) {
    throw new Error(`edge-parked popover escaped viewport: ${JSON.stringify(edgeBox)}`)
  }
  await page.mouse.click(8, 8)
  await popover.waitFor({ state: 'detached' })
  await post(`${A}/api/games/display`, { right: 24 })
  await page.waitForTimeout(2_500)
  console.log('[ui] edge-parked pet keeps its popover inside the viewport')

  // Compact viewport keeps the panel and its controls inside the page.
  await page.setViewportSize({ width: 390, height: 720 })
  await post(`${A}/api/games/display`, { size: 80, right: 12, bottom: 20 })
  await page.waitForTimeout(2_500)
  await clickPet()
  await page.waitForSelector('[data-testid="games-popover"]')
  await page.waitForTimeout(300)
  const mobilePanel = await popover.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }
  })
  if (mobilePanel.x < 11 || mobilePanel.y < 11 || mobilePanel.right > 379 || mobilePanel.bottom > 709 || mobilePanel.scrollWidth > mobilePanel.clientWidth) {
    throw new Error(`compact popover overflowed: ${JSON.stringify(mobilePanel)}`)
  }
  await page.screenshot({ path: join(ARTIFACTS, '35-ui-pet-popover-compact.png') })
  await page.mouse.click(4, 4)
  await popover.waitFor({ state: 'detached' })
  await page.setViewportSize({ width: 1280, height: 800 })
  await post(`${A}/api/games/display`, { size: 100, right: 24, bottom: 20 })
  await page.waitForTimeout(2_500)
  console.log('[ui] compact viewport keeps the popover readable and in bounds')

  // ---- (5) no hide button in the popover ----
  await clickPet()
  await page.waitForSelector('[data-testid="games-popover"]')
  const hideButtons = await page.locator('[data-testid="games-popover"] button:has-text("隐藏宠物")').count()
  if (hideButtons !== 0) throw new Error('popover still has a hide-pet button')
  console.log('[ui] popover has no hide-pet button')

  // ---- (6) collapsible settings card ----
  const settingsButton = page.locator('button[aria-haspopup="dialog"]').last()
  await settingsButton.click()
  await page.waitForTimeout(2_000)
  const dialog = page.locator('[role="dialog"]').last()
  const pluginNav = dialog.getByText('插件', { exact: true })
  if (await pluginNav.count()) {
    await pluginNav.first().click()
    await page.waitForTimeout(1_500)
  }
  const card = page.locator('[data-testid="games-settings-card"]').first()
  await card.waitFor({ state: 'visible', timeout: 8_000 })
  // Collapsed by default: no save button until the header is clicked.
  const saveVisibleBefore = await page.locator('[data-testid="games-settings-save"]').isVisible().catch(() => false)
  if (saveVisibleBefore) throw new Error('settings card body should be collapsed by default')
  console.log('[ui] settings card collapsed by default')
  await page.screenshot({ path: join(ARTIFACTS, '32-ui-settings-collapsed.png') })
  await page.click('[data-testid="games-settings-toggle"]')
  await page.waitForTimeout(400)
  const saveVisibleAfter = await page.locator('[data-testid="games-settings-save"]').isVisible().catch(() => false)
  if (!saveVisibleAfter) throw new Error('settings card body did not expand')
  console.log('[ui] settings card expands on header click')
  await page.screenshot({ path: join(ARTIFACTS, '33-ui-settings-expanded.png') })
  await page.keyboard.press('Escape')

  // ---- (7) hide via the API leaves no floating UI at all ----
  await post(`${A}/api/games/display`, { visible: false })
  await page.waitForTimeout(3_000)
  const petCount = await page.locator('[data-testid="games-pet"]').count()
  const summonCount = await page.locator('[data-testid="games-summon"]').count()
  const sceneCount = await page.locator('[data-testid="games-scene-pet"]').count()
  if (petCount !== 0 || summonCount !== 0 || sceneCount !== 0) {
    throw new Error(`hidden pet still renders UI: pet=${petCount} summon=${summonCount} scene=${sceneCount}`)
  }
  console.log('[ui] hidden pet leaves no floating UI')
  await post(`${A}/api/games/display`, { visible: true })

  console.log(`[ui] console errors: ${errors.length}`)
  for (const e of errors) console.log(`  - ${e}`)
} finally {
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await waitForGameConfig(origA.serverUrl, origA.authToken).catch(() => {})
  await post(`${A}/api/games/display`, { visible: stateA.display.visible, size: stateA.display.size, right: stateA.display.right, bottom: stateA.display.bottom, locked: stateA.display.locked }).catch(() => {})
  await browser.close()
}
