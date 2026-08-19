/**
 * Room chat verification: hover the pet to reveal the chat hint, click it to
 * open the composer, send a message — the pet pops a bubble for 4s and the
 * sender is locked until it fades; the bubble fits short text, wraps longer
 * text within its viewport-safe cap, and fades out; the other player's pet
 * shows the message text (via the room heartbeat) without duplicating the
 * nickname already shown in the pet label, and they can reply back.
 * @module dsh-games/tools/verify-chat
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
const GAME_SERVER = process.env.DSG_VERIFY_SERVER ?? ''
const GAME_AUTH = process.env.DSG_VERIFY_AUTH ?? ''
const ROOM_SERVER = GAME_SERVER || A
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const waitForGameConfig = async (base, serverUrl, authToken) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await fetch(`${base}/api/games/state`).then((response) => response.json())
    if (state.serverUrl === serverUrl && state.authToken === authToken) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`game config did not settle on ${base}: ${serverUrl}`)
}

const stateA = await fetch(`${A}/api/games/state`).then((r) => r.json())
const stateB = await fetch(`${B}/api/games/state`).then((r) => r.json())
const origA = { serverUrl: stateA.serverUrl, authToken: stateA.authToken, petVariant: stateA.petVariant }
const origB = { serverUrl: stateB.serverUrl, authToken: stateB.authToken, petVariant: stateB.petVariant }
const origDisplayA = stateA.display
const restore = async () => {
  await post(`${A}/api/games/config`, origA).catch(() => {})
  await post(`${B}/api/games/config`, origB).catch(() => {})
  await post(`${A}/api/games/pet-meta`, { pet: stateA.pet ?? null }).catch(() => {})
  await post(`${B}/api/games/pet-meta`, { pet: stateB.pet ?? null }).catch(() => {})
  await Promise.all([
    waitForGameConfig(A, origA.serverUrl, origA.authToken).catch(() => {}),
    waitForGameConfig(B, origB.serverUrl, origB.authToken).catch(() => {}),
  ])
  await post(`${A}/api/games/display`, origDisplayA).catch(() => {})
}
await post(`${A}/api/games/pet-meta`, { pet: null })
await post(`${B}/api/games/pet-meta`, { pet: null })
await post(`${A}/api/games/config`, { serverUrl: ROOM_SERVER, authToken: GAME_AUTH })
await post(`${B}/api/games/config`, { serverUrl: ROOM_SERVER, authToken: GAME_AUTH })
await Promise.all([
  waitForGameConfig(A, ROOM_SERVER, GAME_AUTH),
  waitForGameConfig(B, ROOM_SERVER, GAME_AUTH),
])
await post(`${A}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })
// Hide B's dsh-pet whale girl so only our pets are on stage.
await post(`${B}/api/pet/set-visible`, { visible: false }).catch(() => {})

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

  // Poll for the fade-out phase (`.dsg-chat-leaving`) of a bubble, then wait
  // for its unmount. `locator` must resolve to the bubble's own element.
  async function expectFadeOut(page, locator, what) {
    let sawLeaving = false
    for (let i = 0; i < 120; i += 1) {
      if (await page.locator(`${locator}.dsg-chat-leaving`).count() > 0) { sawLeaving = true; break }
      await page.waitForTimeout(50)
    }
    if (!sawLeaving) throw new Error(`${what} has no fade-out (dsg-chat-leaving) phase`)
    for (let i = 0; i < 20; i += 1) {
      if (await page.locator(locator).count() === 0) break
      await page.waitForTimeout(50)
    }
    const remaining = await page.locator(locator).count()
    if (remaining !== 0) throw new Error(`${what} never unmounted after fading`)
    console.log(`[chat] ${what} fades out with an exit animation`)
  }

  await pageA.goto(A, { waitUntil: 'networkidle' })
  await dismissModals(pageA)
  await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })

  // ---- (0) set up the room: A creates, B joins ----
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]')
  await pageA.click('[data-testid="games-room-create"]')
  await pageA.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  // The "room created" bubble must auto-fade within 3s.
  const createdBubble = await pageA.locator('[data-testid="games-bubble"]').first().innerText().catch(() => '')
  if (createdBubble !== '房间已创建') throw new Error(`created bubble text: ${createdBubble}`)
  await pageA.waitForTimeout(3_500)
  const createdGone = await pageA.locator('[data-testid="games-bubble"]').count()
  if (createdGone !== 0) throw new Error('"room created" bubble never fades')
  console.log('[chat] "room created" bubble fades after 3s')
  const code = (await pageA.textContent('[data-testid="games-room-joined"]')).match(/[A-Z2-9]{4}/)[0]
  await pageB.goto(B, { waitUntil: 'networkidle' })
  await dismissModals(pageB)
  await pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  // B's dsh-pet summon button shares the corner; hide it so it never
  // intercepts clicks on our pet.
  await pageB.evaluate(() => {
    for (const el of document.querySelectorAll('[data-testid="pet-summon"], [data-dsh-pet-root]')) {
      el.style.display = 'none'
    }
  })
  await pageB.click('[data-testid="games-pet"]')
  await pageB.waitForSelector('[data-testid="games-popover"]')
  await pageB.click('[data-testid="games-room-empty"] button:has-text("用代码加入")')
  await pageB.fill('#dsg-room-code', code)
  await pageB.click('[data-testid="games-room-join"]')
  await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  await pageA.waitForTimeout(4_000)
  console.log('[chat] room ready (A + B)')

  // ---- (1) hover reveals the chat hint ----
  // The room panel popover is open after creating/joining; close it first.
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]', { state: 'hidden', timeout: 5_000 })
  await pageA.hover('[data-testid="games-pet"]')
  await pageA.waitForTimeout(400)
  const hintOpacity = await pageA.locator('.dsg-chat-hint').first().evaluate(
    (el) => getComputedStyle(el).opacity,
  )
  if (Number(hintOpacity) < 0.9) throw new Error(`chat hint not visible on hover: ${hintOpacity}`)
  console.log('[chat] hover shows the chat hint')

  // ---- (2) the composer can close without sending and preserves its draft ----
  await pageA.click('.dsg-chat-hint')
  await pageA.waitForSelector('.dsg-chat-composer input')
  const composerLayers = await pageA.locator('.dsg-chat-composer').evaluate((composer) => {
    const pet = composer.closest('.dsg-pet')
    const root = composer.closest('.dsg-pet-root')
    const remote = root?.querySelector('.dsg-scene-root')
    return {
      root: root instanceof HTMLElement ? Number(getComputedStyle(root).zIndex) : 0,
      pet: pet instanceof HTMLElement ? Number(getComputedStyle(pet).zIndex) : 0,
      composer: Number(getComputedStyle(composer).zIndex),
      remote: remote instanceof HTMLElement ? Number(getComputedStyle(remote).zIndex) : 0,
    }
  })
  if (composerLayers.root < 990 || composerLayers.pet <= composerLayers.remote || composerLayers.composer < 40) {
    throw new Error(`composer is not the top interaction layer: ${JSON.stringify(composerLayers)}`)
  }
  const maxLen = await pageA.locator('.dsg-chat-composer input').getAttribute('maxlength')
  if (maxLen !== '20') throw new Error(`composer maxlength: ${maxLen}`)
  const composerRect = await pageA.locator('.dsg-chat-composer').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth }
  })
  if (composerRect.left < 8 || composerRect.right > composerRect.viewportWidth - 8) {
    throw new Error(`composer escaped the viewport: ${JSON.stringify(composerRect)}`)
  }
  console.log(`[chat] composer caps input at 20 chars, stays above remote pets, and remains in view: ${JSON.stringify({ ...composerLayers, ...composerRect })}`)
  await pageA.fill('.dsg-chat-composer input', '保留草稿')
  await pageA.keyboard.press('Escape')
  await pageA.waitForSelector('.dsg-chat-composer', { state: 'hidden' })
  await pageA.hover('[data-testid="games-pet"]')
  await pageA.click('.dsg-chat-hint')
  const restoredDraft = await pageA.locator('.dsg-chat-composer input').inputValue()
  if (restoredDraft !== '保留草稿') throw new Error(`composer draft was not preserved: ${restoredDraft}`)
  await pageA.click('.dsg-chat-close')
  await pageA.waitForSelector('.dsg-chat-composer', { state: 'hidden' })
  await pageA.hover('[data-testid="games-pet"]')
  await pageA.click('.dsg-chat-hint')
  await pageA.mouse.click(8, 8)
  await pageA.waitForSelector('.dsg-chat-composer', { state: 'hidden' })
  console.log('[chat] Escape, close button, and outside click close the composer')

  // ---- (3) Enter sends a 20-char message ----
  await pageA.hover('[data-testid="games-pet"]')
  await pageA.click('.dsg-chat-hint')
  const longText = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸' // 20 chars
  await pageA.fill('.dsg-chat-composer input', longText)
  await pageA.keyboard.press('Enter')
  await pageA.waitForTimeout(400)
  const ownBubble = await pageA.locator('.dsg-pet .dsg-chat-bubble').first().innerText()
  if (ownBubble !== longText) throw new Error(`own bubble text: ${ownBubble}`)
  // The chat hint must hide while the content bubble is up.
  const hintDuring = await pageA.locator('.dsg-chat-hint').count()
  if (hintDuring !== 0) throw new Error('chat hint still visible during own bubble')
  // A maximum-length message stays within the viewport-safe cap and wraps.
  const geom = await pageA.locator('.dsg-pet .dsg-chat-bubble').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return { width: el.offsetWidth, minWidth: parseFloat(cs.minWidth), height: el.offsetHeight, font: cs.fontSize }
  })
  if (geom.minWidth !== 0 || geom.width > 280) throw new Error(`chat bubble width cap is wrong: ${JSON.stringify(geom)}`)
  if (geom.height < 48 || geom.height > 80) throw new Error(`chat bubble did not wrap cleanly: ${geom.height}`)
  if (Number.parseFloat(geom.font) < 13.5) throw new Error(`chat bubble font too small: ${geom.font}`)
  console.log(`[chat] A sent 20 chars, bubble wraps within ${geom.width}px (height ${geom.height})`)
  await pageA.screenshot({ path: join(ARTIFACTS, '40-chat-A-sent.png') })

  // ---- (4) cooldown: no chat UI at all while the own bubble is up ----
  const hintDuringCooldown = await pageA.locator('.dsg-chat-hint').count()
  if (hintDuringCooldown !== 0) throw new Error('hint present during cooldown')
  const composerDuringCooldown = await pageA.locator('.dsg-chat-composer').count()
  if (composerDuringCooldown !== 0) throw new Error('composer present during cooldown')
  console.log('[chat] cooldown blocks sending for 4s (no chat UI)')

  // ---- (5) the own bubble fades out with an animation, then B replies ----
  await expectFadeOut(pageA, '.dsg-pet .dsg-chat-bubble', 'own bubble')
  // B sends a message; A's page must show it on B's member pet.
  // Close B's popover first, then hover its pet.
  await pageB.click('[data-testid="games-pet"]')
  await pageB.waitForSelector('[data-testid="games-popover"]', { state: 'hidden', timeout: 5_000 })
  await pageB.hover('[data-testid="games-pet"]')
  await pageB.waitForTimeout(400)
  await pageB.click('.dsg-chat-hint')
  await pageB.waitForSelector('.dsg-chat-composer input', { timeout: 5_000 })
  const shortReply = '收到！'
  await pageB.fill('.dsg-chat-composer input', shortReply)
  await pageB.keyboard.press('Enter')
  await pageA.waitForSelector('[data-testid="games-scene-pet"] .dsg-chat-bubble', { timeout: 8_000 })
  const memberBubbleLocator = pageA.locator('[data-testid="games-scene-pet"] .dsg-chat-bubble').first()
  const memberBubble = await memberBubbleLocator.innerText()
  if (memberBubble !== shortReply) throw new Error(`member bubble text includes an unexpected prefix: ${memberBubble}`)
  const nicknamePrefixes = await pageA.locator('[data-testid="games-scene-pet"] .dsg-chat-from').count()
  if (nicknamePrefixes !== 0) throw new Error(`member bubble still renders nickname prefixes: ${nicknamePrefixes}`)
  await memberBubbleLocator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(async (animation) => {
      await animation.finished.catch(() => {})
    }))
  })
  const shortGeom = await memberBubbleLocator.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const textWidth = range.getBoundingClientRect().width
    return { outerWidth: element.getBoundingClientRect().width, textWidth }
  })
  const bubbleChrome = shortGeom.outerWidth - shortGeom.textWidth
  if (shortGeom.outerWidth >= 168 || bubbleChrome < 24 || bubbleChrome > 36) {
    throw new Error(`short bubble does not fit its text: ${JSON.stringify(shortGeom)}`)
  }
  console.log(`[chat] A saw B's short message in a content-fit ${shortGeom.outerWidth.toFixed(0)}px bubble: ${memberBubble}`)
  await pageA.screenshot({ path: join(ARTIFACTS, '41-chat-B-to-A.png') })

  // ---- (6) the member bubble also fades out with an animation ----
  await expectFadeOut(pageA, '[data-testid="games-scene-pet"] .dsg-chat-bubble', 'member bubble')

  // ---- (7) chat hint returns once every bubble is gone ----
  await pageA.hover('[data-testid="games-pet"]')
  await pageA.waitForTimeout(300)
  const hintBack = await pageA.locator('.dsg-chat-hint').count()
  if (hintBack !== 1) throw new Error(`chat hint did not return: ${hintBack}`)
  console.log('[chat] bubbles gone, chat hint returns')

  await pageA.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })
  await pageB.evaluate(() => {
    localStorage.removeItem('dsh.games.room.v1')
    localStorage.removeItem('dsh.games.room.v3')
  })

  console.log(`[chat] console errors: ${errors.length}`)
  for (const e of errors) console.log(`  - ${e}`)
} finally {
  await restore()
  await browser.close()
}
