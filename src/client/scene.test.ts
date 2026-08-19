// @vitest-environment jsdom

/**
 * Unit tests for the room pet scene layout engine (pure math, no DOM).
 * @module dsh-games/client/scene.test
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  arrangeScene,
  canArrangeScene,
  clampPetPos,
  loadScenePrefs,
  resolveSceneMove,
  saveScenePrefs,
  SCENE_KEY,
  SCENE_SPACING_DEFAULT,
  snapPos,
  sortRoomMembers,
  type SceneAnchor,
} from './scene.tsx'
import type { RoomMemberView } from './api.ts'

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
    // Members without memory queue left of the anchor without overlapping.
    expect(out.a.right).toBeGreaterThan(anchor.right)
    expect(out.a.bottom).toBe(anchor.bottom)
    expect(out.a.right).toBeGreaterThan(out.c.right)
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

  it('row mode keeps the first member visually leftmost', () => {
    const out = arrangeScene('row', members, anchor, 110, {}, viewport)
    expect(out.a.right).toBeGreaterThan(out.b.right)
    expect(out.b.right).toBeGreaterThan(out.c.right)
    expect(out.c.right).toBeGreaterThanOrEqual(anchor.right + 60)
  })

  it('column mode aligns x-centers with the anchor', () => {
    const out = arrangeScene('column', members, anchor, 110, {}, viewport)
    const rightA = out.a.right + 60 / 2
    const rightAnchor = anchor.right + 60 / 2
    expect(rightA).toBe(rightAnchor)
    const rightB = out.b.right + 60 / 2
    expect(rightB).toBe(rightAnchor)
    // The first sorted member is topmost.
    expect(out.a.bottom).toBeGreaterThan(out.b.bottom)
    expect(out.b.bottom).toBeGreaterThan(out.c.bottom)
    expect(out.c.bottom).toBeGreaterThanOrEqual(anchor.bottom + 60)
  })

  it('grid mode honors configured columns and rows without overlap', () => {
    const gridMembers = [...members, { id: 'd', size: 60 }]
    const out = arrangeScene('grid', gridMembers, anchor, 24, {}, viewport, 2, 2)
    const positions = ['a', 'b', 'c', 'd'].map((id) => out[id])
    expect(new Set(positions.map((pos) => pos.right)).size).toBe(2)
    expect(new Set(positions.map((pos) => pos.bottom)).size).toBe(2)
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        expect(overlap(positions[left], positions[right], 60)).toBe(false)
      }
      expect(overlap(positions[left], out.me, 60)).toBe(false)
    }
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
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThanOrEqual(24)
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

  it('orbit with a corner anchor keeps every member operable and separated', () => {
    const out = arrangeScene('orbit', members, anchor, 110, {}, viewport)
    for (const id of ['a', 'b', 'c']) {
      expect(out[id].right).toBeGreaterThanOrEqual(0)
      expect(out[id].bottom).toBeGreaterThanOrEqual(0)
      expect(out[id].right).toBeLessThanOrEqual(viewport.width - 60)
      expect(out[id].bottom).toBeLessThanOrEqual(viewport.height - 60)
    }
    expect(overlap(out.a, out.b, 60)).toBe(false)
    expect(overlap(out.a, out.c, 60)).toBe(false)
    expect(overlap(out.b, out.c, 60)).toBe(false)
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
      sort: 'tokens-desc',
      spacing: 24,
      gridColumns: 3,
      gridRows: 3,
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
      sort: 'tokens-desc',
      spacing: 24,
      gridColumns: 3,
      gridRows: 3,
      showLabels: true,
    })
    expect(localStorage.getItem(SCENE_KEY)).toBeNull()
  })

  it('persists the local label visibility preference', () => {
    saveScenePrefs({
      mode: 'row',
      sort: 'tokens-desc',
      spacing: 24,
      gridColumns: 3,
      gridRows: 3,
      showLabels: false,
      free: {},
    })
    expect(loadScenePrefs().showLabels).toBe(false)
  })

  it('persists token order and rejects unknown stored values', () => {
    saveScenePrefs({
      mode: 'column',
      sort: 'tokens-asc',
      spacing: 32,
      gridColumns: 4,
      gridRows: 2,
      showLabels: true,
      free: {},
    })
    expect(loadScenePrefs().sort).toBe('tokens-asc')
    expect(loadScenePrefs()).toMatchObject({ gridColumns: 4, gridRows: 2 })
    localStorage.setItem(SCENE_KEY, JSON.stringify({ mode: 'row', sort: 'random', spacing: 24 }))
    expect(loadScenePrefs().sort).toBe('tokens-desc')
  })

  it('rejects grid capacity and viewport changes that would force overlap', () => {
    const prefs = {
      mode: 'grid',
      sort: 'tokens-desc',
      spacing: 24,
      gridColumns: 1,
      gridRows: 2,
      showLabels: true,
      free: {},
    } as const
    expect(canArrangeScene(prefs, members, anchor, viewport)).toBe(false)
    expect(canArrangeScene(
      { ...prefs, gridRows: 3 },
      members,
      { ...anchor, size: 100, right: 0, bottom: 0 },
      { width: 200, height: 200 },
    )).toBe(false)
  })

  it('sorts room members by tokens with stable joined/member fallbacks', () => {
    const roomMembers = [
      member('a', 100, 1),
      member('b', 300, 3),
      member('c', 300, 2),
    ]
    expect(sortRoomMembers(roomMembers, 'tokens-desc').map((entry) => entry.memberId)).toEqual(['c', 'b', 'a'])
    expect(sortRoomMembers(roomMembers, 'tokens-asc').map((entry) => entry.memberId)).toEqual(['a', 'c', 'b'])
    expect(sortRoomMembers(roomMembers, 'joined').map((entry) => entry.memberId)).toEqual(['a', 'c', 'b'])
    expect(roomMembers.map((entry) => entry.memberId)).toEqual(['a', 'b', 'c'])
  })

  it('clamps resized and dragged pets inside the viewport', () => {
    expect(clampPetPos({ right: 900, bottom: 700 }, 100, { width: 640, height: 480 }))
      .toEqual({ right: 540, bottom: 380 })
    expect(clampPetPos({ right: -20, bottom: -30 }, 100, viewport))
      .toEqual({ right: 0, bottom: 0 })
  })

  it('resolves manual movement without overlapping visible pets', () => {
    const positions = {
      me: { right: 24, bottom: 20 },
      a: { right: 120, bottom: 20 },
      b: { right: 220, bottom: 20 },
    }
    const moved = resolveSceneMove('b', 60, { right: 125, bottom: 20 }, members.slice(0, 3), positions, viewport, 24)
    expect(overlap(moved, positions.a, 60)).toBe(false)
    expect(moved.right).toBeGreaterThanOrEqual(0)
    expect(moved.bottom).toBeGreaterThanOrEqual(0)
  })
})

function overlap(left: { right: number; bottom: number }, right: { right: number; bottom: number }, size: number): boolean {
  return left.right < right.right + size &&
    left.right + size > right.right &&
    left.bottom < right.bottom + size &&
    left.bottom + size > right.bottom
}

function member(memberId: string, tokens: number, joinedAt: number): RoomMemberView {
  return {
    memberId,
    nickname: memberId,
    tokens,
    crowns: [],
    hats: 0,
    phase: 'idle',
    joinedAt,
    lastSeen: joinedAt,
  }
}
