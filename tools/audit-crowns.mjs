/**
 * Crown pyramid geometry audit: loads the live GUI at 127.0.0.1:3080 and
 * checks the pile against the layout contract — at most seven rows with
 * 7→1 capacities, higher tiers on lower/right slots, ±2..4° tilts, rows
 * growing toward the tip, and the pile hovering just above the pet.
 * @module dsh-games/tools/audit-crowns
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/_MY_WORK/dsh-skin/dsh-web-ui/node_modules/playwright')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = 'http://127.0.0.1:3080'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="games-summon"], [data-testid="games-pet"]', { timeout: 20_000 })
if (await page.locator('[data-testid="games-summon"]').count()) {
  await page.click('[data-testid="games-summon"]')
  await page.waitForTimeout(1_500)
}
await page.waitForSelector('[data-testid="games-pet"]', { timeout: 10_000 })
await page.waitForTimeout(2_500)

const crowns = await page.evaluate(() => {
  const pet = document.querySelector('[data-testid="games-pet"]')
  const petRect = pet.getBoundingClientRect()
  return [...document.querySelectorAll('[data-testid="games-app"] .dsg-crown:not(.dsg-crown-ghost)')].map((el) => {
    const rect = el.getBoundingClientRect()
    // the wrapper translates; the tilt lives on the inner svg rotate(var)
    const svgEl = el.querySelector('svg')
    const svgTransform = svgEl !== null ? getComputedStyle(svgEl).transform : 'none'
    const m = svgTransform.match(/matrix\(([^)]+)\)/)
    const rotParts = m !== null ? m[1].split(/[,\s]+/).map(Number) : [1, 0, 0, 1]
    return {
      tier: Number(el.dataset.tier),
      key: el.dataset.key,
      x: rect.left + rect.width / 2 - (petRect.left + petRect.width / 2),
      y: rect.top - petRect.top,
      size: rect.width,
      rot: Math.atan2(rotParts[1], rotParts[0]) * 180 / Math.PI,
      magic: el.classList.contains('dsg-crown-magic'),
      merging: el.classList.contains('dsg-crown-merged') || el.classList.contains('dsg-crown-in'),
      svgSize: svgEl !== null ? [svgEl.getAttribute('width'), svgEl.getAttribute('height')] : null,
    }
  })
})

const failures = []
const sorted = [...crowns].sort((a, b) => b.y - a.y) // bottom first
console.log(`[audit] ${crowns.length} crowns (pet-relative)`)

// 1. rows: group by y within a 4px band; capacities are 7,6,...,1.
const rows = []
for (const crown of sorted) {
  const last = rows[rows.length - 1]
  if (last === undefined || Math.abs(last.y - crown.y) > 4) rows.push({ y: crown.y, crowns: [crown] })
  else last.crowns.push(crown)
}
const capacities = [7, 6, 5, 4, 3, 2, 1]
if (rows.length > capacities.length) failures.push(`rows = ${rows.length} > ${capacities.length}`)
for (let i = 0; i < rows.length; i += 1) {
  const expected = i === rows.length - 1 ? capacities[i] : capacities[i]
  if (i < rows.length - 1 && rows[i].crowns.length !== expected) {
    failures.push(`row ${i} has ${rows[i].crowns.length}, expected full capacity ${expected}`)
  }
  if (rows[i].crowns.length > expected) {
    failures.push(`row ${i} has ${rows[i].crowns.length} > capacity ${expected}`)
  }
}
console.log(`[audit] rows=${rows.length}`, rows.map((r) => `y=${r.y.toFixed(0)} [${r.crowns.map((c) => c.tier).join(',')}]`).join(' | '))

// 2. Lower rows hold stronger crowns; each row ascends left→right.
for (let i = 1; i < rows.length; i += 1) {
  const lowerMin = Math.min(...rows[i - 1].crowns.map((c) => c.tier))
  const upperMax = Math.max(...rows[i].crowns.map((c) => c.tier))
  if (upperMax > lowerMin) {
    failures.push(`upper row ${i} contains tier ${upperMax} above lower-row tier ${lowerMin}`)
  }
}
for (let i = 0; i < rows.length; i += 1) {
  const row = [...rows[i].crowns].sort((a, b) => a.x - b.x)
  for (let j = 1; j < row.length; j += 1) {
    if (row[j].tier < row[j - 1].tier) {
      failures.push(`row ${i} is not ordered low→high from left to right`)
      break
    }
  }
}

// 3. tilt within ±2..4° (compare the rounded value; the layout emits exact
//    integer degrees but the computed matrix carries float noise)
for (const crown of crowns) {
  const tilt = Math.round(Math.abs(crown.rot) * 10) / 10
  if (tilt < 2 || tilt > 4) failures.push(`rot ${crown.rot.toFixed(1)}° out of ±2..4 (tier ${crown.tier})`)
}

// 4. sizes grow toward the tip
function maxSize(row) {
  const y = row.y
  return Math.max(...crowns.filter((c) => Math.abs(c.y - y) <= 4).map((c) => c.size))
}
const sizeAscending = rows.every((row, i) => i === 0 || maxSize(row) >= maxSize(rows[i - 1]))
if (!sizeAscending) failures.push('sizes do not grow toward the tip')

// 5. pile hovers above the pet head (bottom row's visual bottom ≈ −0.16×size)
const bottom = sorted[0]
const clearance = bottom.y + bottom.size * 0.68
if (!(clearance < 10 && clearance > -20)) failures.push(`pile clearance off: visual bottom ≈ ${clearance.toFixed(0)}px vs pet top`)

console.log(`[audit] tiers: ${crowns.map((c) => c.tier).join(',')}`)
console.log(`[audit] sizes: ${crowns.map((c) => c.size.toFixed(0)).join(',')}`)
console.log(`[audit] rots:  ${crowns.map((c) => c.rot.toFixed(1)).join(',')}`)
console.log(`[audit] magic classes: ${crowns.filter((c) => c.magic).map((c) => c.tier).join(',')} ; svg size sample: ${JSON.stringify(crowns[0]?.svgSize)}`)
console.log(`[audit] ${failures.length > 0 ? 'FAIL' : 'OK'}: ${failures.join('; ') || 'all invariants hold'}`)
await browser.close()
