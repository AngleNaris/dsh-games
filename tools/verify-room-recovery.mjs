/**
 * Browser regression for synchronized pet phases and expired-member recovery.
 * Requires two isolated DSH web hosts plus one standalone game server.
 * @module dsh-games/tools/verify-room-recovery
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const A = process.env.DSG_VERIFY_A ?? 'http://127.0.0.1:3093'
const B = process.env.DSG_VERIFY_B ?? 'http://127.0.0.1:3094'
const SERVER = process.env.DSG_VERIFY_SERVER ?? 'http://127.0.0.1:3092'
// Default server TTL is two minutes; allow one sweep interval plus margin.
const MEMBER_TTL_WAIT_MS = Number(process.env.DSG_MEMBER_TTL_WAIT_MS ?? 132_000)

const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const originals = new Map()
for (const base of [A, B]) {
  const state = await fetch(`${base}/api/games/state`).then((response) => response.json())
  originals.set(base, {
    config: {
      serverUrl: state.serverUrl,
      authToken: state.authToken,
      petVariant: state.petVariant,
    },
    display: state.display,
  })
  const response = await post(`${base}/api/games/config`, { serverUrl: SERVER, authToken: '' })
  if (!response.ok) throw new Error(`failed to configure ${base}: HTTP ${response.status}`)
  await post(`${base}/api/games/display`, { visible: true, size: 100, right: 24, bottom: 20 })
}

const browser = await chromium.launch()
const errors = []
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageA = await context.newPage()
  const pageB = await context.newPage()
  let recoveryWindow = false
  let expectedNetworkErrors = 0
  let expectedOptionalPetErrors = 0
  for (const [name, page] of [['A', pageA], ['B', pageB]]) {
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      if (name === 'A' &&
          message.location().url.endsWith('/api/pet/pets') &&
          message.text().startsWith('Failed to load resource:')) {
        expectedOptionalPetErrors += 1
        return
      }
      if (name === 'B' && recoveryWindow && message.text().startsWith('Failed to load resource:')) {
        expectedNetworkErrors += 1
        return
      }
      errors.push(`${name}: ${message.text()}`)
    })
    page.on('pageerror', (error) => errors.push(`${name}: pageerror: ${error.message}`))
  }

  let forcedPhase = 'thinking'
  let dropHeartbeats = false
  await pageB.route('**/api/games/rooms/*/members*', async (route) => {
    if (dropHeartbeats) {
      await route.abort('failed')
      return
    }
    const request = route.request()
    const body = request.postDataJSON()
    body.member.phase = forcedPhase
    await route.continue({ postData: JSON.stringify(body) })
  })

  await Promise.all([
    pageA.goto(A, { waitUntil: 'networkidle' }),
    pageB.goto(B, { waitUntil: 'networkidle' }),
  ])
  await Promise.all([
    pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 }),
    pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 }),
  ])

  const dismissHostOverlays = async (page) => {
    const closeDetails = page.locator('button[aria-label="关闭详情"]')
    if (await closeDetails.isVisible().catch(() => false)) await closeDetails.click({ force: true })
    const collapsePanel = page.locator('button[aria-label="收起面板"]')
    if (await collapsePanel.isVisible().catch(() => false)) await collapsePanel.click({ force: true })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  await Promise.all([dismissHostOverlays(pageA), dismissHostOverlays(pageB)])

  const openPet = async (page) => {
    await page.locator('[data-testid="games-pet"]').evaluate((element) => element.click())
    await page.waitForSelector('[data-testid="games-popover"]')
  }

  await openPet(pageA)
  await pageA.locator('[data-testid="games-room-create"]').evaluate((element) => element.click())
  const joinedA = pageA.locator('[data-testid="games-room-joined"]')
  await joinedA.waitFor({ timeout: 10_000 })
  const code = await joinedA.getAttribute('data-room-code')
  if (!code) throw new Error('created room did not expose its code')

  await openPet(pageB)
  await pageB.locator('[data-testid="games-room-mode-join"]').evaluate((element) => element.click())
  await pageB.fill('#dsg-room-code', code)
  await pageB.locator('[data-testid="games-room-join"]').evaluate((element) => element.click())
  await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 10_000 })

  const remotePet = pageA.locator('[data-testid="games-scene-pet"] .dsg-pet')
  await remotePet.waitFor({ timeout: 10_000 })
  await pageA.waitForFunction(() => {
    const pet = document.querySelector('[data-testid="games-scene-pet"] .dsg-pet')
    return pet?.getAttribute('data-phase') === 'thinking'
  }, undefined, { timeout: 12_000 })
  await pageA.waitForTimeout(400)
  const activeMotion = await remotePet.locator('.dsg-whale-wrap').evaluate((element) => {
    const style = getComputedStyle(element)
    const label = element.closest('.dsg-pet')?.querySelector('.dsg-pet-label')
    return {
      animationName: style.animationName,
      labelActive: label?.classList.contains('dsg-label-active') === true,
      shimmerOpacity: label === null ? '' : getComputedStyle(label, '::before').opacity,
    }
  })
  if (activeMotion.animationName !== 'dsg-active-float' ||
      !activeMotion.labelActive ||
      activeMotion.shimmerOpacity !== '1') {
    throw new Error(`remote active motion mismatch: ${JSON.stringify(activeMotion)}`)
  }

  forcedPhase = 'idle'
  await pageA.waitForFunction(() => {
    const pet = document.querySelector('[data-testid="games-scene-pet"] .dsg-pet')
    return pet?.getAttribute('data-phase') === 'idle'
  }, undefined, { timeout: 12_000 })
  await pageA.waitForTimeout(400)
  const sleepingStyle = await remotePet.locator('.dsg-whale-wrap').evaluate((element) => {
    const style = getComputedStyle(element)
    const breathe = element.querySelector('.dsg-whale-breathe')
    const petVisual = breathe?.querySelector(':scope > svg, :scope > .dsg-pet-img')
    const label = element.closest('.dsg-pet')?.querySelector('.dsg-pet-label')
    return {
      animationName: style.animationName,
      breatheAnimation: breathe === null ? '' : getComputedStyle(breathe).animationName,
      petFilter: petVisual === null || petVisual === undefined ? '' : getComputedStyle(petVisual).filter,
      labelActive: label?.classList.contains('dsg-label-active') === true,
      shimmerOpacity: label === null ? '' : getComputedStyle(label, '::before').opacity,
    }
  })
  if (sleepingStyle.animationName !== 'none' ||
      sleepingStyle.breatheAnimation !== 'dsg-sleep-breathe' ||
      sleepingStyle.labelActive ||
      sleepingStyle.shimmerOpacity !== '0') {
    throw new Error(`remote sleeping motion mismatch: ${JSON.stringify(sleepingStyle)}`)
  }
  if (!sleepingStyle.petFilter.includes('drop-shadow')) {
    throw new Error(`pet shadow/filter missing: ${sleepingStyle.petFilter}`)
  }
  const shadowScope = await pageA.evaluate(() => {
    const css = [...document.querySelectorAll('style[data-plugin-css]')]
      .map((style) => style.textContent ?? '')
      .join('\n')
    return {
      petHasShadow: /\.dsg-whale-breathe > svg,[^{]*\.dsg-whale-breathe > \.dsg-pet-img \{[^}]*drop-shadow\(/s.test(css),
      crownHasShadow: /\.dsg-crown[^{]*\{[^}]*drop-shadow\(/s.test(css),
    }
  })
  if (!shadowScope.petHasShadow || shadowScope.crownHasShadow) {
    throw new Error(`pet/crown shadow scope mismatch: ${JSON.stringify(shadowScope)}`)
  }

  const tokenBefore = await pageB.evaluate(() => localStorage.getItem('dsh.games.room.v3'))
  if (tokenBefore === null) throw new Error('room session was not stored before recovery test')

  recoveryWindow = true
  dropHeartbeats = true
  await pageA.bringToFront()
  await pageA.waitForTimeout(MEMBER_TTL_WAIT_MS)
  await pageA.waitForFunction(async (roomCode) => {
    const response = await fetch(`${location.protocol}//127.0.0.1:3092/api/games/rooms/${roomCode}/state`)
    if (!response.ok) return false
    const payload = await response.json()
    return payload.room.members.length === 1
  }, code, { timeout: 12_000 })

  dropHeartbeats = false
  await pageB.bringToFront()
  await pageB.waitForFunction((before) => {
    const current = localStorage.getItem('dsh.games.room.v3')
    return current !== null && current !== before
  }, tokenBefore, { timeout: 15_000 })
  await pageA.waitForFunction(async (roomCode) => {
    const response = await fetch(`${location.protocol}//127.0.0.1:3092/api/games/rooms/${roomCode}/state`)
    if (!response.ok) return false
    const payload = await response.json()
    return payload.room.members.length === 2
  }, code, { timeout: 15_000 })
  await pageB.waitForFunction(() => {
    return document.querySelector('[data-testid="games-room-offline"]') === null
  }, undefined, { timeout: 10_000 })
  recoveryWindow = false
  await pageB.waitForTimeout(4_000)

  if (errors.length > 0) throw new Error(`browser console errors:\n${errors.join('\n')}`)
  console.log(`[room-recovery] room ${code}: remote motion and label FX active -> sleeping passed`)
  console.log('[room-recovery] pet shadow is present while crowns remain shadow-free')
  console.log('[room-recovery] expired member token was replaced and the client rejoined automatically')
  console.log(`[room-recovery] two members present after recovery; expected injected network errors: ${expectedNetworkErrors}; optional pet-plugin 404s: ${expectedOptionalPetErrors}; unexpected console errors: 0`)
} finally {
  await browser.close()
  for (const [base, original] of originals) {
    await post(`${base}/api/games/config`, original.config).catch(() => {})
    await post(`${base}/api/games/display`, original.display).catch(() => {})
  }
}
