/**
 * Cross-instance multiplayer demo: two dsh web instances (3080 = player A,
 * 3081 = player B) join one room; both GUIs must show both pets, and a hat
 * boost on B must use the authoritative room rules and render the same crown
 * tier on both clients, even when each host's local crown step differs.
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

const A = process.env.DSG_VERIFY_A ?? 'http://127.0.0.1:3080'
const B = process.env.DSG_VERIFY_B ?? 'http://127.0.0.1:3081'

if (process.env.DSG_VERIFY_DISPOSABLE !== '1') {
  throw new Error(
    'verification mutates tokens and requires isolated disposable DSH_HOME values; ' +
    'set DSG_VERIFY_DISPOSABLE=1 after confirming both instances are disposable',
  )
}
console.warn('[multi] disposable verification confirmed; token boosts are intentionally not rolled back')

async function requestJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} failed (${response.status})${detail === '' ? '' : `: ${detail}`}`)
  }
  return response.json()
}

const get = (url) => requestJson(url)
async function optionalGet(url) {
  const response = await fetch(url)
  if (response.status === 404) return undefined
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`GET ${url} failed (${response.status})${detail === '' ? '' : `: ${detail}`}`)
  }
  return response.json()
}
const post = (url, body) => requestJson(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const serverBase = (hostUrl, configuredUrl) =>
  new URL(configuredUrl.trim() === '' ? hostUrl : configuredUrl, hostUrl)
    .toString()
    .replace(/\/+$/, '')

async function bestEffort(label, action) {
  try {
    await action()
  } catch (error) {
    console.warn(`[multi] cleanup warning (${label}): ${error instanceof Error ? error.message : String(error)}`)
  }
}

const [stateA, stateB] = await Promise.all([
  get(`${A}/api/games/state`),
  get(`${B}/api/games/state`),
])
if (stateA.memberId === stateB.memberId) {
  throw new Error(`verification requires isolated DSH_HOME values; both clients use ${stateA.memberId}`)
}
const serverA = serverBase(A, stateA.serverUrl)
const serverB = serverBase(B, stateB.serverUrl)
if (serverA !== serverB || stateA.authToken !== stateB.authToken) {
  throw new Error('both clients must use the same game server URL and authentication token')
}
const [petStateA, petStateB] = await Promise.all([
  optionalGet(`${A}/api/pet/state`),
  optionalGet(`${B}/api/pet/state`),
])

let browser
let pageA
let pageB
try {
  await Promise.all([
    post(`${A}/api/games/config`, { crownTokenStep: 100_000_000 }),
    post(`${B}/api/games/config`, { crownTokenStep: 100_000_000 }),
  ])
  const seededB = await get(`${B}/api/games/state`)
  if (seededB.tokens > 3_000_000) {
    throw new Error(`player B must start at no more than 3M tokens, got ${seededB.tokens}`)
  }
  if (seededB.tokens < 3_000_000) {
    await post(`${B}/api/games/boost`, { tokens: 3_000_000 - seededB.tokens })
  }

  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  pageA = await ctx.newPage()
  pageB = await ctx.newPage()
  const errors = []
  for (const [name, page] of [['A', pageA], ['B', pageB]]) {
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`) })
    page.on('pageerror', (err) => errors.push(`${name}: pageerror: ${err.message}`))
  }

  const dismissModals = async (page) => {
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

  // Load both GUIs.
  await pageA.goto(A, { waitUntil: 'networkidle' })
  await pageB.goto(B, { waitUntil: 'networkidle' })
  await dismissModals(pageA)
  await dismissModals(pageB)
  await pageA.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  await pageB.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })
  console.log('[multi] both pets visible')

  // Fresh DSH_HOME values make the dsh-pet whale girl visible at the same
  // corner. Hide it on both clients so it cannot intercept our pet clicks.
  await Promise.all([
    petStateA === undefined
      ? Promise.resolve()
      : post(`${A}/api/pet/set-visible`, { visible: false }),
    petStateB === undefined
      ? Promise.resolve()
      : post(`${B}/api/pet/set-visible`, { visible: false }),
  ])
  await pageA.waitForTimeout(1_000)
  await pageB.waitForTimeout(1_000)

  // A creates a room.
  await pageA.click('[data-testid="games-pet"]')
  await pageA.waitForSelector('[data-testid="games-popover"]')
  await pageA.click('[data-testid="games-room-create"]')
  await pageA.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  const joinedText = await pageA.textContent('[data-testid="games-room-joined"]')
  const code = joinedText.match(/[A-Z2-9]{4}/)[0]
  console.log(`[multi] A created room ${code}`)

  // B joins A's room using the server URL configured in plugin settings.
  await pageB.click('[data-testid="games-pet"]')
  await pageB.waitForSelector('[data-testid="games-popover"]')
  await pageB.click('[data-testid="games-room-mode-join"]')
  await pageB.fill('#dsg-room-code', code)
  await pageB.click('[data-testid="games-room-join"]')
  await pageB.waitForSelector('[data-testid="games-room-joined"]', { timeout: 8_000 })
  console.log('[multi] B joined the room')

  // Wait for a heartbeat cycle, then count members on both pages.
  await pageA.waitForTimeout(4_000)
  await pageB.waitForTimeout(1_000)
  const membersA = await pageA.locator('[data-testid="games-room-members"] .dsg-member').count()
  const membersB = await pageB.locator('[data-testid="games-room-members"] .dsg-member').count()
  if (membersA !== 2 || membersB !== 2) {
    throw new Error(`expected two members on both clients, got A=${membersA}, B=${membersB}`)
  }
  console.log(`[multi] members on A: ${membersA}, on B: ${membersB}`)
  await pageA.screenshot({ path: join(ARTIFACTS, '10-multi-A-room.png') })
  await pageB.screenshot({ path: join(ARTIFACTS, '11-multi-B-room.png') })

  // Local hosts are configured to 100M/crown, but the room server uses
  // 1M/crown. B joined with a 3M initial baseline, which must therefore become
  // exactly one tier-1 (silver) crown on both clients without tripping the
  // abnormal-growth guard.
  await pageB.waitForFunction(() => {
    const crowns = [...document.querySelectorAll('[data-testid="games-pet"] .dsg-crown:not(.dsg-crown-ghost)')]
    return crowns.length === 1 && crowns[0]?.getAttribute('data-tier') === '1'
  }, undefined, { timeout: 12_000 })
  await pageA.waitForFunction(() => {
    const crowns = [...document.querySelectorAll('[data-testid="games-scene-pet"] .dsg-mini-crown')]
    return crowns.length === 1 && crowns[0]?.getAttribute('data-tier') === '1'
  }, undefined, { timeout: 12_000 })
  console.log('[multi] authoritative crown sync: one silver crown on both clients')
  await pageA.screenshot({ path: join(ARTIFACTS, '12-multi-A-after-boost.png') })

  const labelB = await pageB.textContent('[data-testid="games-label"]')
  console.log(`[multi] B pet label: ${labelB}`)

  if (errors.length > 0) throw new Error(`browser console errors:\n${errors.join('\n')}`)
  console.log('[multi] console errors: 0')
} finally {
  const leave = async (page) => {
    if (page === undefined || page.isClosed()) return
    const button = page.locator('[data-testid="games-room-leave"]')
    if (await button.count() > 0 && await button.first().isVisible().catch(() => false)) {
      await button.first().click({ timeout: 3_000 })
    }
  }
  await bestEffort('leave B', () => leave(pageB))
  await bestEffort('leave A', () => leave(pageA))
  if (browser !== undefined) await bestEffort('close browser', () => browser.close())
  await bestEffort('restore A crown step', () =>
    post(`${A}/api/games/config`, { crownTokenStep: stateA.crownTokenStep }))
  await bestEffort('restore B crown step', () =>
    post(`${B}/api/games/config`, { crownTokenStep: stateB.crownTokenStep }))
  if (petStateA !== undefined) {
    await bestEffort('restore A pet visibility', () =>
      post(`${A}/api/pet/set-visible`, { visible: petStateA.display.visible }))
  }
  if (petStateB !== undefined) {
    await bestEffort('restore B pet visibility', () =>
      post(`${B}/api/pet/set-visible`, { visible: petStateB.display.visible }))
  }
}
