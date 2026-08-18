/**
 * Browser regression for smooth pet and token-label state transitions.
 * It overrides the local games-state response inside an isolated browser page,
 * exercising the real React polling path without sending a model request.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const BASE = process.env.DSG_VERIFY_BASE ?? 'http://127.0.0.1:3080'
const browser = await chromium.launch()
const errors = []

function number(value) {
  return Number.parseFloat(value) || 0
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  let forcedActive = false
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  await page.route('**/api/games/state', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    const now = Date.now()
    await route.fulfill({
      response,
      json: {
        ...body,
        phase: 'idle',
        serverTime: now,
        tokenActiveUntil: forcedActive ? now + 10_000 : 0,
      },
    })
  })

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="games-pet"]', { timeout: 20_000 })

  const sample = () => page.evaluate(() => {
    const pet = document.querySelector('[data-testid="games-pet"]')
    const motion = pet?.querySelector('.dsg-whale-wrap')
    const breathe = pet?.querySelector('.dsg-whale-breathe')
    const label = document.querySelector('[data-testid="games-label"]')
    if (!(pet instanceof HTMLElement) ||
        !(motion instanceof HTMLElement) ||
        !(breathe instanceof HTMLElement) ||
        !(label instanceof HTMLElement)) {
      throw new Error('transition targets are missing')
    }
    const motionStyle = getComputedStyle(motion)
    const breatheStyle = getComputedStyle(breathe)
    const labelStyle = getComputedStyle(label)
    const shimmerStyle = getComputedStyle(label, '::before')
    const rect = label.getBoundingClientRect()
    return {
      active: pet.dataset.active,
      tokenActive: pet.dataset.tokenActive,
      motionTransform: motionStyle.transform,
      motionTop: motion.getBoundingClientRect().top,
      motionAnimation: motionStyle.animationName,
      breatheAnimation: breatheStyle.animationName,
      shimmerOpacity: shimmerStyle.opacity,
      labelShadow: labelStyle.boxShadow,
      labelWidth: rect.width,
      labelHeight: rect.height,
    }
  })
  const setActive = async (active) => {
    forcedActive = active
    await page.waitForFunction(
      (next) => document.querySelector('[data-testid="games-pet"]')?.getAttribute('data-active') === String(next),
      active,
      { timeout: 5_000 },
    )
  }

  const idle = await sample()
  await setActive(true)
  const enterStart = await sample()
  await page.waitForTimeout(160)
  const enterMid = await sample()
  await page.waitForTimeout(240)
  const active = await sample()
  const activeMotion = []
  for (let index = 0; index < 8; index += 1) {
    activeMotion.push(await sample())
    await page.waitForTimeout(90)
  }
  await setActive(false)
  const exitStart = await sample()
  await page.waitForTimeout(160)
  const exitMid = await sample()
  await page.waitForTimeout(240)
  const settled = await sample()

  if (idle.motionAnimation !== 'none' ||
      idle.breatheAnimation !== 'dsg-sleep-breathe') {
    throw new Error(`layered animation mismatch: ${JSON.stringify(idle)}`)
  }
  if (idle.motionTransform !== 'matrix(1, 0, 0, 1, 0, 0)' ||
      number(idle.shimmerOpacity) > 0.05) {
    throw new Error(`idle state is not settled: ${JSON.stringify(idle)}`)
  }
  if (enterStart.motionAnimation !== 'dsg-active-float' ||
      enterMid.motionAnimation !== 'dsg-active-float') {
    throw new Error(`float animation did not start with active state: ${JSON.stringify({ enterStart, enterMid })}`)
  }
  if (!(number(enterMid.shimmerOpacity) > 0.05 && number(enterMid.shimmerOpacity) < 0.95)) {
    throw new Error(`shimmer did not fade in: ${JSON.stringify(enterMid)}`)
  }
  if (active.motionAnimation !== 'dsg-active-float' ||
      number(active.shimmerOpacity) < 0.95) {
    throw new Error(`active state did not settle: ${JSON.stringify(active)}`)
  }
  if (active.breatheAnimation !== 'dsg-wake-up') {
    throw new Error(`sleep breathing still active while floating: ${JSON.stringify(active)}`)
  }
  const activeTops = activeMotion.map((entry) => entry.motionTop)
  const activeRange = Math.max(...activeTops) - Math.min(...activeTops)
  if (activeRange < 8) {
    throw new Error(`pet did not visibly float; top range=${activeRange}: ${JSON.stringify(activeMotion)}`)
  }
  if (new Set(activeMotion.map((entry) => entry.motionTransform)).size < 4) {
    throw new Error(`pet transform did not animate: ${JSON.stringify(activeMotion)}`)
  }
  if (exitStart.motionAnimation !== 'none' || exitMid.motionAnimation !== 'none') {
    throw new Error(`float animation did not stop with idle state: ${JSON.stringify({ exitStart, exitMid })}`)
  }
  if (!(number(exitMid.shimmerOpacity) > 0.05 && number(exitMid.shimmerOpacity) < 0.95)) {
    throw new Error(`shimmer did not fade out: ${JSON.stringify(exitMid)}`)
  }
  if (settled.motionTransform !== 'matrix(1, 0, 0, 1, 0, 0)' ||
      number(settled.shimmerOpacity) > 0.05) {
    throw new Error(`idle return did not settle: ${JSON.stringify(settled)}`)
  }
  if (Math.abs(idle.labelWidth - settled.labelWidth) > 0.1 ||
      Math.abs(idle.labelHeight - settled.labelHeight) > 0.1) {
    throw new Error(`label layout shifted: idle=${JSON.stringify(idle)} settled=${JSON.stringify(settled)}`)
  }
  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`)

  console.log(JSON.stringify({
    idle,
    enterStart,
    enterMid,
    active,
    activeMotion: {
      topRange: activeRange,
      samples: activeMotion,
    },
    exitStart,
    exitMid,
    settled,
    browserErrors: errors.length,
  }, null, 2))
} finally {
  await browser.close()
}
