/**
 * UI polish verification: (1) bubbles sit above the bottom label bar with a
 * top z-index, (2) no phase dot on pets, (3) the own-player label is a compact
 * bold two-line bar, (4) resize clamps the pet into the viewport, (5) the
 * settings card is a collapsible DSH-style sub-menu, and (6) hiding the pet is
 * settings-only and leaves no floating UI on the page.
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
let createdRoomCode = ''
let createdRoomBase = A
const fakeSessions = []
await post(`${A}/api/games/pet-meta`, { pet: null })
await post(`${A}/api/games/config`, { serverUrl: GAME_SERVER, authToken: GAME_AUTH })
await waitForGameConfig(GAME_SERVER, GAME_AUTH)
// Default pet size: with a small pet the hover chat hint covers the lower
// half, so "click the pet" targets the upper half (menu/position area).
await post(`${A}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  const failedResponses = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
  })

  const dismissHostModals = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const mask = page.locator('._mask_15u5s_14').first()
      if (await mask.count() === 0) return
      const root = mask.locator('xpath=ancestor::div[contains(@class,"_root_15u5s_2")]')
      const buttons = root.locator('button')
      const count = await buttons.count()
      if (count === 0) {
        await page.keyboard.press('Escape')
      } else {
        let clicked = false
        for (let index = 0; index < count; index += 1) {
          const button = buttons.nth(index)
          if (await button.isEnabled().catch(() => false)) {
            await button.click({ timeout: 3_000 }).catch(() => {})
            clicked = true
            break
          }
        }
        if (!clicked) await buttons.last().click({ force: true, timeout: 3_000 }).catch(() => {})
      }
      await page.waitForTimeout(600)
    }
  }

  await page.goto(A, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  await dismissHostModals()
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

  // ---- (3) compact own-player label: identity and tokens occupy two rows ----
  const label = await page.locator('[data-testid="games-label"]').evaluate((element) => {
    const player = element.querySelector('.dsg-label-player')
    const tokens = element.querySelector('.dsg-label-tokens')
    if (!(player instanceof HTMLElement) || !(tokens instanceof HTMLElement)) {
      throw new Error('two-line label rows are missing')
    }
    const playerRect = player.getBoundingClientRect()
    const tokenRect = tokens.getBoundingClientRect()
    return {
      player: player.textContent?.trim() ?? '',
      tokens: tokens.textContent?.trim() ?? '',
      playerBottom: playerRect.bottom,
      tokenTop: tokenRect.top,
      playerWeight: getComputedStyle(player).fontWeight,
      tokenWeight: getComputedStyle(tokens).fontWeight,
      maxWidth: getComputedStyle(element).maxWidth,
    }
  })
  if (label.player === '' || !/^.+ tokens$/.test(label.tokens)) {
    throw new Error(`label rows are incomplete: ${JSON.stringify(label)}`)
  }
  if (label.tokenTop < label.playerBottom || Number(label.playerWeight) < 700 || Number(label.tokenWeight) < 700) {
    throw new Error(`own label is not two-line and bold: ${JSON.stringify(label)}`)
  }
  if (Number.parseFloat(label.maxWidth) > 160) throw new Error(`label is too wide: ${label.maxWidth}`)
  console.log(`[ui] own label is compact, bold, and two-line: ${label.player} / ${label.tokens}`)

  // Hover raises the active pet root and its label surface above other pets.
  await page.locator('[data-testid="games-pet"]').hover()
  const hoverLayers = await page.locator('[data-testid="games-pet"]').evaluate((pet) => ({
    root: getComputedStyle(pet.closest('.dsg-pet-root')).zIndex,
    label: getComputedStyle(pet.querySelector('.dsg-pet-label')).zIndex,
  }))
  if (Number(hoverLayers.root) < 970 || Number(hoverLayers.label) < 30) {
    throw new Error(`hover layers are too low: ${JSON.stringify(hoverLayers)}`)
  }
  console.log(`[ui] hovered pet layers raised: root=${hoverLayers.root}, label=${hoverLayers.label}`)

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
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await dismissHostModals()
  await page.click('[data-testid="games-room-create"]')
  const joinedRoom = page.locator('[data-testid="games-room-joined"]')
  await joinedRoom.waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  createdRoomCode = await joinedRoom.getAttribute('data-room-code')
  if (createdRoomCode === null || createdRoomCode === '') throw new Error('created room did not expose its code')
  createdRoomBase = await page.evaluate(() => {
    const raw = localStorage.getItem('dsh.games.room.v3')
    if (raw === null) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed.base === 'string' ? parsed.base : ''
  }) || GAME_SERVER || A
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
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

  // Three synthetic members exercise token sorting, collision handling,
  // multiplayer resize clamping, two-line labels, and hover stacking without
  // modifying either real client's token ledger.
  const suffix = Date.now().toString(36)
  const synthetic = [
    { memberId: `codex-high-${suffix}`, nickname: '繁星之子卡萨帝亚', tokens: 300 },
    { memberId: `codex-mid-${suffix}`, nickname: 'Mid', tokens: 200 },
    { memberId: `codex-low-${suffix}`, nickname: 'Low', tokens: 100 },
  ]
  for (const member of synthetic) {
    const response = await post(`${createdRoomBase}/api/games/rooms/${createdRoomCode}/join`, {
      member: {
        ...member,
        crowns: new Array(10).fill(0),
        phase: 'idle',
        active: false,
      },
    })
    if (!response.ok) throw new Error(`synthetic member join failed: ${response.status} ${await response.text()}`)
    const joined = await response.json()
    fakeSessions.push({ memberId: member.memberId, memberToken: joined.memberToken })
  }
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="games-scene-pet"]').length === 3, undefined, {
    timeout: 8_000,
  })
  const controls = '[data-testid="games-scene-controls"]'
  await page.click(`${controls} .dsg-radio:has-text("水平对齐")`)
  await page.click(`${controls} .dsg-radio:has-text("高到低")`)
  await page.waitForTimeout(400)
  const memberBox = async (memberId) => page.locator(
    `[data-testid="games-scene-pet"][data-member-id="${memberId}"]`,
  ).boundingBox()
  const highBox = await memberBox(synthetic[0].memberId)
  const midBox = await memberBox(synthetic[1].memberId)
  const lowBox = await memberBox(synthetic[2].memberId)
  if (highBox === null || midBox === null || lowBox === null ||
      !(highBox.x < midBox.x && midBox.x < lowBox.x)) {
    throw new Error(`descending token order is wrong: ${JSON.stringify({ highBox, midBox, lowBox })}`)
  }
  assertNoOverlap([highBox, midBox, lowBox], 'descending row')

  await page.click(`${controls} .dsg-radio:has-text("低到高")`)
  await page.waitForTimeout(400)
  const ascHigh = await memberBox(synthetic[0].memberId)
  const ascMid = await memberBox(synthetic[1].memberId)
  const ascLow = await memberBox(synthetic[2].memberId)
  if (ascHigh === null || ascMid === null || ascLow === null ||
      !(ascLow.x < ascMid.x && ascMid.x < ascHigh.x)) {
    throw new Error(`ascending token order is wrong: ${JSON.stringify({ ascHigh, ascMid, ascLow })}`)
  }
  assertNoOverlap([ascHigh, ascMid, ascLow], 'ascending row')
  console.log('[ui] token sorting switches high-first and low-first without overlap')

  const highPet = page.locator(
    `[data-testid="games-scene-pet"][data-member-id="${synthetic[0].memberId}"]`,
  )
  const highLabel = highPet.locator('[data-testid="games-scene-label"]')
  const remoteRows = await highLabel.evaluate((element) => {
    const root = element.closest('.dsg-pet-root')
    const rect = element.getBoundingClientRect()
    return {
      players: element.querySelectorAll('.dsg-label-player').length,
      tokens: element.querySelectorAll('.dsg-label-tokens').length,
      width: rect.width,
      left: rect.left,
      right: rect.right,
      maxWidth: getComputedStyle(element).maxWidth,
      configuredMaxWidth: root instanceof HTMLElement
        ? getComputedStyle(root).getPropertyValue('--dsg-label-max-width').trim()
        : '',
    }
  })
  if (remoteRows.players !== 1 || remoteRows.tokens !== 1) {
    throw new Error(`remote label is not two-line: ${JSON.stringify(remoteRows)}`)
  }
  const midLabelRect = await page.locator(
    `[data-testid="games-scene-pet"][data-member-id="${synthetic[1].memberId}"] [data-testid="games-scene-label"]`,
  ).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right }
  })
  const labelsSeparated = remoteRows.right <= midLabelRect.left || remoteRows.left >= midLabelRect.right
  if (remoteRows.width < 108 || Number.parseFloat(remoteRows.maxWidth) > 120 ||
      remoteRows.configuredMaxWidth !== '120px' || !labelsSeparated) {
    throw new Error(`long label did not use its collision-safe width: ${JSON.stringify({ remoteRows, midLabelRect })}`)
  }
  await highPet.hover()
  const remoteLayers = await highPet.evaluate((element) => ({
    root: getComputedStyle(element).zIndex,
    label: getComputedStyle(element.querySelector('.dsg-pet-label')).zIndex,
  }))
  if (Number(remoteLayers.root) < 970 || Number(remoteLayers.label) < 30) {
    throw new Error(`remote hover layers are too low: ${JSON.stringify(remoteLayers)}`)
  }
  console.log(`[ui] remote two-line label and hover stacking verified: ${JSON.stringify(remoteLayers)}`)

  const remoteChatText = '只显示消息正文'
  const remoteChat = await fetch(`${createdRoomBase}/api/games/rooms/${createdRoomCode}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dsh-member-token': fakeSessions[0].memberToken,
    },
    body: JSON.stringify({
      message: {
        memberId: synthetic[0].memberId,
        text: remoteChatText,
      },
    }),
  })
  if (!remoteChat.ok) throw new Error(`synthetic remote chat failed: ${remoteChat.status} ${await remoteChat.text()}`)
  const remoteBubble = highPet.locator('.dsg-chat-bubble')
  await remoteBubble.waitFor({ state: 'visible', timeout: 8_000 })
  const remoteBubbleText = await remoteBubble.innerText()
  if (remoteBubbleText !== remoteChatText) {
    throw new Error(`remote chat contains an unexpected nickname prefix: ${remoteBubbleText}`)
  }
  if (await remoteBubble.locator('.dsg-chat-from').count() !== 0) {
    throw new Error('remote chat still renders a nickname prefix element')
  }
  console.log('[ui] remote chat bubble renders message text without a nickname prefix')

  // Grid mode is a real configurable rows × columns layout. An undersized
  // grid is rejected transactionally instead of allowing pets to overlap.
  await page.click(`${controls} .dsg-radio:has-text("网格排列")`)
  await page.fill('[data-testid="games-scene-grid-columns"]', '2')
  await page.fill('[data-testid="games-scene-grid-rows"]', '2')
  await page.waitForTimeout(400)
  const gridBoxes = await Promise.all(synthetic.map((member) => memberBox(member.memberId)))
  if (gridBoxes.some((box) => box === null)) throw new Error('grid mode hid a synthetic pet')
  assertNoOverlap(gridBoxes, '2x2 grid')
  const gridAxes = {
    columns: new Set(gridBoxes.map((box) => Math.round(box.x))).size,
    rows: new Set(gridBoxes.map((box) => Math.round(box.y))).size,
  }
  if (gridAxes.columns !== 2 || gridAxes.rows !== 2) {
    throw new Error(`grid dimensions were not applied: ${JSON.stringify(gridAxes)}`)
  }
  await page.fill('[data-testid="games-scene-grid-rows"]', '1')
  await page.waitForTimeout(200)
  const keptRows = await page.locator('[data-testid="games-scene-grid-rows"]').inputValue()
  if (keptRows !== '2') throw new Error(`invalid grid capacity was accepted: rows=${keptRows}`)
  await page.waitForSelector('[data-testid="games-scene-note"]')
  const rejectedBoxes = await Promise.all(synthetic.map((member) => memberBox(member.memberId)))
  if (rejectedBoxes.some((box) => box === null)) throw new Error('capacity rejection hid a synthetic pet')
  assertNoOverlap(rejectedBoxes, 'rejected grid capacity')
  console.log('[ui] configurable 2x2 grid stays collision-free and rejects insufficient capacity')

  // Drag the low-token pet directly onto the mid-token pet. Collision
  // resolution must move it to the nearest available non-overlapping seat.
  await page.click(`${controls} .dsg-radio:has-text("自由")`)
  await page.waitForTimeout(400)
  const dragFrom = await memberBox(synthetic[2].memberId)
  const dragTarget = await memberBox(synthetic[1].memberId)
  if (dragFrom === null || dragTarget === null) throw new Error('free-mode drag targets are missing')
  await page.mouse.move(dragFrom.x + dragFrom.width / 2, dragFrom.y + dragFrom.height / 2)
  await page.mouse.down()
  await page.mouse.move(dragTarget.x + dragTarget.width / 2, dragTarget.y + dragTarget.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const afterDrag = await Promise.all(synthetic.map((member) => memberBox(member.memberId)))
  if (afterDrag.some((box) => box === null)) throw new Error('a synthetic pet disappeared after dragging')
  assertNoOverlap(afterDrag, 'free drag')
  console.log('[ui] manual multiplayer drag cannot overlap another pet')

  // Park the anchor at the far edge, shrink the window, and ensure every pet
  // remains fully operable and separated inside the compact viewport.
  await post(`${A}/api/games/display`, { size: 100, right: 1100, bottom: 650 })
  await page.waitForTimeout(2_500)
  await page.setViewportSize({ width: 390, height: 720 })
  try {
    await page.waitForFunction(() => {
      const pets = [...document.querySelectorAll('[data-testid="games-pet"], [data-testid="games-scene-pet"]')]
      return pets.length === 4 && pets.every((pet) => {
        const rect = pet.getBoundingClientRect()
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      })
    }, undefined, { timeout: 8_000 })
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      pets: [...document.querySelectorAll('[data-testid="games-pet"], [data-testid="games-scene-pet"]')].map((pet) => {
        const rect = pet.getBoundingClientRect()
        const root = pet.closest('.dsg-pet-root')
        return {
          testId: pet.getAttribute('data-testid'),
          memberId: root?.getAttribute('data-member-id'),
          rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
          style: root instanceof HTMLElement ? { right: root.style.right, bottom: root.style.bottom } : null,
        }
      }),
    }))
    throw new Error(`multiplayer resize did not settle: ${JSON.stringify(diagnostics)}`, { cause: error })
  }
  const compactPets = await page.locator(
    '[data-testid="games-pet"], [data-testid="games-scene-pet"]',
  ).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }))
  assertNoOverlap(compactPets, 'compact multiplayer viewport')
  await page.setViewportSize({ width: 1280, height: 800 })
  await post(`${A}/api/games/display`, { size: 100, right: 24, bottom: 20 })
  await page.waitForTimeout(2_500)
  console.log('[ui] compact resize keeps every multiplayer pet in view and separated')

  for (const session of fakeSessions.splice(0)) {
    await fetch(`${createdRoomBase}/api/games/rooms/${createdRoomCode}/members/${session.memberId}`, {
      method: 'DELETE',
      headers: { 'x-dsh-member-token': session.memberToken },
    })
  }

  // Leave the created room, then join it again using plugin settings only.
  // The room form must not expose a second server URL field, and two
  // synchronous clicks must still issue one request.
  if (!await page.locator('[data-testid="games-room-leave"]').isVisible().catch(() => false)) {
    await clickPet()
    await page.waitForSelector('[data-testid="games-popover"]')
  }
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

  // A pet parked at the far edge of a large viewport is clamped back into a
  // compact viewport, then its panel and controls remain inside the page.
  await post(`${A}/api/games/display`, { size: 100, right: 1100, bottom: 650 })
  await page.waitForTimeout(2_500)
  await page.setViewportSize({ width: 390, height: 720 })
  await page.waitForFunction(() => {
    const pet = document.querySelector('[data-testid="games-pet"]')
    if (!(pet instanceof HTMLElement)) return false
    const rect = pet.getBoundingClientRect()
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
  }, undefined, { timeout: 8_000 })
  const compactPet = await page.locator('[data-testid="games-pet"]').boundingBox()
  if (compactPet === null || compactPet.x < 0 || compactPet.y < 0 ||
      compactPet.x + compactPet.width > 390 || compactPet.y + compactPet.height > 720) {
    throw new Error(`resized pet escaped viewport: ${JSON.stringify(compactPet)}`)
  }
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
  console.log('[ui] resize clamps the pet and keeps the compact popover in bounds')

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
  console.log(`[ui] failed responses: ${failedResponses.length}`)
  for (const response of failedResponses) console.log(`  - ${response}`)
} finally {
  for (const session of fakeSessions) {
    await fetch(`${createdRoomBase}/api/games/rooms/${createdRoomCode}/members/${session.memberId}`, {
      method: 'DELETE',
      headers: { 'x-dsh-member-token': session.memberToken },
    }).catch(() => {})
  }
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await post(`${A}/api/games/pet-meta`, { pet: stateA.pet ?? null }).catch(() => {})
  await waitForGameConfig(origA.serverUrl, origA.authToken).catch(() => {})
  await post(`${A}/api/games/display`, { visible: stateA.display.visible, size: stateA.display.size, right: stateA.display.right, bottom: stateA.display.bottom, locked: stateA.display.locked }).catch(() => {})
  await browser.close()
}

function assertNoOverlap(boxes, label) {
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex]
      const right = boxes[rightIndex]
      const overlap = left.x < right.x + right.width &&
        left.x + left.width > right.x &&
        left.y < right.y + right.height &&
        left.y + left.height > right.y
      if (overlap) {
        throw new Error(`${label}: pets ${leftIndex}/${rightIndex} overlap: ${JSON.stringify({ left, right })}`)
      }
    }
  }
}
