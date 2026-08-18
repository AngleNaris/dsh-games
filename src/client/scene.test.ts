// @vitest-environment jsdom

/**
 * Unit tests for the room pet scene layout engine (pure math, no DOM).
 * @module dsh-games/client/scene.test
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  arrangeScene,
  loadScenePrefs,
  saveScenePrefs,
  SCENE_KEY,
  SCENE_SPACING_DEFAULT,
  snapPos,
  type SceneAnchor,
} from './scene.tsx'

const viewport = { width: 1280, height: 800 }
const anchor: SceneAnchor = { id: 'me', size: 60, right: 24, bottom: 20 }
const members = [
  { id: 'me', size: 60 },
  { id: 'a', size: 60 },
  { id: 'b', size: 60 },
  { id: 'c', size: 60 },
]

beforeEach(() => {
  localStorage.clear()
})

describe('arrangeScene', () => {
  it('keeps the anchor in its own spot in every mode', () => {
    for (const mode of ['free', 'row', 'column', 'grid', 'orbit'] as const) {
      const out = arrangeScene(mode, members, anchor, 110, {}, viewport)
      expect(out.me).toEqual({ right: 24, bottom: 20 })
    }
  })

  it('free mode uses remembered positions and defaults for new members', () => {
    const free = { b: { right: 300, bottom: 200 } }
    const out = arrangeScene('free', members, anchor, 110, free, viewport)
    expect(out.b).toEqual({ right: 300, bottom: 200 })
    // Members without memory queue to the left of the anchor.
    expect(out.a.right).toBeGreaterThan(anchor.right)
    expect(out.a.bottom).toBe(anchor.bottom)
    expect(out.c.right).toBeGreaterThan(out.a.right)
  })

  it('row mode aligns all y-centers with the anchor', () => {
    const out = arrangeScene('row', members, anchor, 110, {}, viewport)
    // a is the first left member; its center must equal the anchor center.
    const centerA = out.a.bottom + 60 / 2
    const centerAnchor = anchor.bottom + 60 / 2
    expect(centerA).toBe(centerAnchor)
    const centerB = out.b.bottom + 60 / 2
    expect(centerB).toBe(centerAnchor)
  })

  it('row mode alternates left and right of the anchor', () => {
    const out = arrangeScene('row', members, anchor, 110, {}, viewport)
    // a (index 0) sits left of the anchor, b (index 1) right of it.
    expect(out.a.right).toBeGreaterThan(anchor.right)
    expect(out.b.right).toBeLessThan(anchor.right)
    // a and b do not overlap the anchor.
    expect(out.a.right).toBeGreaterThanOrEqual(anchor.right + 60)
  })

  it('column mode aligns x-centers with the anchor', () => {
    const out = arrangeScene('column', members, anchor, 110, {}, viewport)
    const rightA = out.a.right + 60 / 2
    const rightAnchor = anchor.right + 60 / 2
    expect(rightA).toBe(rightAnchor)
    const rightB = out.b.right + 60 / 2
    expect(rightB).toBe(rightAnchor)
    // a (index 0) sits above the anchor, b (index 1) below it.
    expect(out.a.bottom).toBeLessThan(anchor.bottom)
    expect(out.b.bottom).toBeGreaterThan(anchor.bottom)
  })

  it('grid mode snaps remembered positions to the spacing grid', () => {
    const free = { a: { right: 123, bottom: 217 } }
    const out = arrangeScene('grid', members, anchor, 60, free, viewport)
    expect(out.a.right % 60).toBe(0)
    expect(out.a.bottom % 60).toBe(0)
    expect(out.a.right).toBe(120)
    expect(out.a.bottom).toBe(240)
  })

  it('orbit mode places every member at the same distance from the anchor center', () => {
    // Center anchor so no member gets clamped to a screen edge.
    const centerAnchor: SceneAnchor = { id: 'me', size: 60, right: 600, bottom: 400 }
    const out = arrangeScene('orbit', members, centerAnchor, 110, {}, viewport)
    const ax = viewport.width - centerAnchor.right - 30
    const ay = centerAnchor.bottom + 30
    const distances = ['a', 'b', 'c'].map((id) => {
      const mx = viewport.width - out[id].right - 30
      const my = out[id].bottom + 30
      return Math.round(Math.hypot(mx - ax, my - ay))
    })
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThanOrEqual(1)
    expect(distances[0]).toBeGreaterThanOrEqual(110)
  })

  it('never places pets outside the viewport (edge-sticks, no wrap-around)', () => {
    const crowded = [
      { id: 'me', size: 60 },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, size: 60 })),
    ]
    for (const mode of ['free', 'row', 'column', 'grid', 'orbit'] as const) {
      const out = arrangeScene(mode, crowded, { ...anchor, right: 500, bottom: 400 }, 200, {}, viewport)
      for (const [id, pos] of Object.entries(out)) {
        if (id === 'me') continue
        expect(pos.right).toBeGreaterThanOrEqual(0)
        expect(pos.bottom).toBeGreaterThanOrEqual(0)
        expect(pos.right).toBeLessThanOrEqual(viewport.width - 60)
        expect(pos.bottom).toBeLessThanOrEqual(viewport.height - 60)
      }
    }
  })

  it('orbit with a corner anchor sticks overflow members to the nearest edge', () => {
    // The anchor sits at the bottom-right corner; the ring member straight
    // above stays inside, the right/bottom ones stick to their edges.
    const out = arrangeScene('orbit', members, anchor, 110, {}, viewport)
    // a (index 0) is straight above the anchor: bottom = cy + r - half size.
    expect(out.a.bottom).toBe(50 + 110 - 30)
    // b (index 1) goes right of the screen: sticks to the right edge.
    expect(out.b.right).toBe(0)
    // c (index 2) goes below the screen: sticks to the bottom edge.
    expect(out.c.bottom).toBe(0)
  })
})

describe('helpers', () => {
  it('snapPos snaps to the grid', () => {
    expect(snapPos({ right: 137, bottom: 82 }, 40)).toEqual({ right: 120, bottom: 80 })
  })

  it('defaults to horizontal 24px layout with labels visible', () => {
    expect(SCENE_SPACING_DEFAULT).toBe(24)
    expect(loadScenePrefs()).toEqual({
      mode: 'row',
      spacing: 24,
      showLabels: true,
      free: {},
    })
  })

  it('does not let legacy v1 preferences override the new defaults', () => {
    localStorage.setItem('dsh.games.scene.v1', JSON.stringify({
      mode: 'free',
      spacing: 110,
      free: { a: { right: 10, bottom: 20 } },
    }))
    expect(loadScenePrefs()).toMatchObject({
      mode: 'row',
      spacing: 24,
      showLabels: true,
    })
    expect(localStorage.getItem(SCENE_KEY)).toBeNull()
  })

  it('persists the local label visibility preference', () => {
    saveScenePrefs({ mode: 'row', spacing: 24, showLabels: false, free: {} })
    expect(loadScenePrefs().showLabels).toBe(false)
  })
})
