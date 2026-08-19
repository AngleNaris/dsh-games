/**
 * Room pet scene — the other members' floating pets around your anchor pet.
 * Every client arranges the members it sees on its own screen, so the
 * arrangement preference and the free-drag positions live in localStorage
 * (per browser), not on the game server.
 *
 * Modes:
 * - `free`   — fully manual; each member keeps its dragged position.
 * - `row`    — horizontal line centered on the anchor pet.
 * - `column` — vertical line centered on the anchor pet.
 * - `grid`   — automatic rows × columns layout beside the anchor pet.
 * - `orbit`  — ring around the anchor pet.
 * @module @anglenaris/dsh-games/client/scene
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoomMemberView } from './api.ts'
import { formatTokens } from './locales.ts'
import { DeepSeekWhale } from './whale.tsx'
import { useCrownPyramid } from './crowns.tsx'
import { ChatBubble } from './chat.tsx'
import { isPetActive } from './activity.ts'

/** Arrangement modes (order is the UI order too). */
export type ArrangeMode = 'free' | 'row' | 'column' | 'grid' | 'orbit'

/** All modes in UI order. */
export const ARRANGE_MODES: readonly ArrangeMode[] = ['free', 'row', 'column', 'grid', 'orbit']

/** Local visual ordering of room members. */
export type SceneSort = 'tokens-desc' | 'tokens-asc' | 'joined'

/** Sort choices in UI order. */
export const SCENE_SORTS: readonly SceneSort[] = ['tokens-desc', 'tokens-asc', 'joined']

/** One floating-pet position (right/bottom insets). */
export interface PetPos {
  right: number
  bottom: number
}

/** Per-member free-drag memory (mode `free`). */
export interface ScenePrefs {
  mode: ArrangeMode
  /** Local visual order; never synchronized to the room server. */
  sort: SceneSort
  /** Gap between pet edges, px. */
  spacing: number
  /** Maximum columns in automatic grid mode. */
  gridColumns: number
  /** Maximum rows in automatic grid mode. */
  gridRows: number
  /** Whether every room member label remains visible without hover. */
  showLabels: boolean
  /** Free positions keyed by member id. */
  free: Record<string, PetPos>
}

/** One pet in the scene (anchor included). */
export interface SceneMember {
  id: string
  size: number
}

/** The anchor pet (your own): fixed position, everything arranges around it. */
export interface SceneAnchor extends SceneMember {
  right: number
  bottom: number
}

export interface SceneViewport {
  width: number
  height: number
}

/** Spacing slider bounds. */
export const SCENE_SPACING_MIN = 24
export const SCENE_SPACING_MAX = 240
export const SCENE_SPACING_DEFAULT = 24
export const SCENE_GRID_MIN = 1
export const SCENE_GRID_MAX = 8
export const SCENE_GRID_COLUMNS_DEFAULT = 3
export const SCENE_GRID_ROWS_DEFAULT = 3

/** localStorage key for the scene prefs. */
export const SCENE_KEY = 'dsh.games.scene.v2'

/** Stable local-only sort for room snapshots. */
export function sortRoomMembers(
  members: readonly RoomMemberView[],
  sort: SceneSort,
): RoomMemberView[] {
  return [...members].sort((left, right) => {
    const tokenOrder = sort === 'tokens-desc'
      ? right.tokens - left.tokens
      : sort === 'tokens-asc'
        ? left.tokens - right.tokens
        : 0
    return tokenOrder ||
      left.joinedAt - right.joinedAt ||
      left.memberId.localeCompare(right.memberId)
  })
}

/** Keep a pet's full square hit area inside the current viewport. */
export function clampPetPos(
  pos: PetPos,
  size: number,
  viewport: SceneViewport,
): PetPos {
  return {
    right: Math.min(Math.max(0, Math.round(pos.right)), Math.max(0, viewport.width - size)),
    bottom: Math.min(Math.max(0, Math.round(pos.bottom)), Math.max(0, viewport.height - size)),
  }
}

/** Snap a position to the spacing grid (grid mode). */
export function snapPos(pos: PetPos, spacing: number): PetPos {
  const cell = Math.max(1, spacing)
  return {
    right: Math.max(0, Math.round(pos.right / cell) * cell),
    bottom: Math.max(0, Math.round(pos.bottom / cell) * cell),
  }
}

/**
 * Compute every member's position for the current mode. The anchor keeps its
 * own spot in every mode; `members` must include the anchor. All member
 * positions are clamped inside the viewport (a pet that would leave the
 * screen sticks to the nearest edge instead of jumping to the opposite one).
 */
export function arrangeScene(
  mode: ArrangeMode,
  members: readonly SceneMember[],
  anchor: SceneAnchor,
  spacing: number,
  free: Readonly<Record<string, PetPos>>,
  viewport: SceneViewport,
  gridColumns = SCENE_GRID_COLUMNS_DEFAULT,
  gridRows = SCENE_GRID_ROWS_DEFAULT,
): Record<string, PetPos> {
  const exact = tryArrangeScene(
    mode,
    members,
    anchor,
    spacing,
    free,
    viewport,
    gridColumns,
    gridRows,
  )
  if (exact !== undefined) return exact

  if (mode === 'grid') {
    const columns = normalizeGridCount(gridColumns, SCENE_GRID_COLUMNS_DEFAULT)
    const memberCount = members.filter((member) => member.id !== anchor.id).length
    const requiredRows = Math.ceil(memberCount / columns)
    const adaptiveRows = Math.max(normalizeGridCount(gridRows, SCENE_GRID_ROWS_DEFAULT), requiredRows)
    if (adaptiveRows <= SCENE_GRID_MAX) {
      const adaptive = tryArrangeScene(
        mode,
        members,
        anchor,
        spacing,
        free,
        viewport,
        columns,
        adaptiveRows,
      )
      if (adaptive !== undefined) return adaptive
    }
  }

  return tryArrangeScene(
    mode,
    members,
    anchor,
    0,
    free,
    viewport,
    gridColumns,
    gridRows,
  ) ?? overflowLinearPositions(members, anchor)
}

/**
 * Attempt a complete layout with the requested edge gap. `undefined` means
 * at least one pet cannot fit inside the viewport without overlap.
 */
export function tryArrangeScene(
  mode: ArrangeMode,
  members: readonly SceneMember[],
  anchor: SceneAnchor,
  spacing: number,
  free: Readonly<Record<string, PetPos>>,
  viewport: SceneViewport,
  gridColumns = SCENE_GRID_COLUMNS_DEFAULT,
  gridRows = SCENE_GRID_ROWS_DEFAULT,
): Record<string, PetPos> | undefined {
  if (anchor.size > viewport.width || anchor.size > viewport.height) return undefined
  const safeAnchor = { ...anchor, ...clampPetPos(anchor, anchor.size, viewport) }
  const ordered = members.some((member) => member.id === anchor.id)
    ? members
    : [anchor, ...members]
  const out: Record<string, PetPos> = {
    [anchor.id]: { right: safeAnchor.right, bottom: safeAnchor.bottom },
  }
  const others = ordered.filter((member) => member.id !== anchor.id)
  const gap = Math.max(0, spacing)

  if (mode === 'free') {
    const defaults = linearPositions(ordered, safeAnchor, gap, false)
    others.forEach((member) => {
      const raw = free[member.id] ?? defaults[member.id]
      if (raw === undefined) return
      out[member.id] = raw
    })
    return resolveCollisions(out, others, safeAnchor, gap, viewport)
  }

  if (mode === 'grid') {
    return gridPositions(
      others,
      safeAnchor,
      gap,
      normalizeGridCount(gridColumns, SCENE_GRID_COLUMNS_DEFAULT),
      normalizeGridCount(gridRows, SCENE_GRID_ROWS_DEFAULT),
      viewport,
    )
  }

  if (mode === 'row') {
    Object.assign(out, linearPositions(ordered, safeAnchor, gap, false))
    return resolveCollisions(out, others, safeAnchor, gap, viewport)
  }

  if (mode === 'column') {
    Object.assign(out, linearPositions(ordered, safeAnchor, gap, true))
    return resolveCollisions(out, others, safeAnchor, gap, viewport)
  }

  // orbit: even ring around the anchor center, starting straight above.
  const n = others.length
  if (n > 0) {
    const maxMemberSize = Math.max(...others.map((member) => member.size))
    const radius = Math.max(
      safeAnchor.size / 2 + maxMemberSize / 2 + gap,
      Math.ceil(((maxMemberSize + gap) * n) / (2 * Math.PI)),
    )
    const cx = viewport.width - safeAnchor.right - safeAnchor.size / 2
    const cy = safeAnchor.bottom + safeAnchor.size / 2
    others.forEach((member, index) => {
      const theta = -Math.PI / 2 + (2 * Math.PI * index) / n
      const mx = cx + radius * Math.cos(theta)
      // bottom grows upward, so the y-axis flips vs the screen's sin sign.
      const my = cy - radius * Math.sin(theta)
      out[member.id] = {
        right: Math.round(viewport.width - mx - member.size / 2),
        bottom: Math.round(my - member.size / 2),
      }
    })
  }
  return resolveCollisions(out, others, safeAnchor, gap, viewport)
}

/** Whether a preference change can produce a complete collision-free layout. */
export function canArrangeScene(
  prefs: ScenePrefs,
  members: readonly SceneMember[],
  anchor: SceneAnchor,
  viewport: SceneViewport,
): boolean {
  return tryArrangeScene(
    prefs.mode,
    members,
    anchor,
    prefs.spacing,
    prefs.free,
    viewport,
    prefs.gridColumns,
    prefs.gridRows,
  ) !== undefined
}

/** Linear row/column positions whose visual order matches the member order. */
function linearPositions(
  members: readonly SceneMember[],
  anchor: SceneAnchor,
  gap: number,
  vertical: boolean,
): Record<string, PetPos> {
  const out: Record<string, PetPos> = {
    [anchor.id]: { right: anchor.right, bottom: anchor.bottom },
  }
  const others = members.filter((member) => member.id !== anchor.id)
  // Place the last sorted member nearest the anchor, so the first member
  // remains the visual leftmost/topmost one.
  let cursor = (vertical ? anchor.bottom : anchor.right) + anchor.size + gap
  for (let index = others.length - 1; index >= 0; index -= 1) {
    const member = others[index]
    out[member.id] = vertical
      ? {
          right: Math.round(anchor.right + (anchor.size - member.size) / 2),
          bottom: Math.round(cursor),
        }
      : {
          right: Math.round(cursor),
          bottom: Math.round(anchor.bottom + (anchor.size - member.size) / 2),
        }
    cursor += member.size + gap
  }
  return out
}

function overflowLinearPositions(
  members: readonly SceneMember[],
  anchor: SceneAnchor,
): Record<string, PetPos> {
  return linearPositions(members, anchor, 0, false)
}

function gridPositions(
  members: readonly SceneMember[],
  anchor: SceneAnchor,
  gap: number,
  columns: number,
  rows: number,
  viewport: SceneViewport,
): Record<string, PetPos> | undefined {
  const out: Record<string, PetPos> = {
    [anchor.id]: { right: anchor.right, bottom: anchor.bottom },
  }
  if (members.length === 0) return out
  if (members.length > columns * rows) return undefined

  const usedColumns = Math.min(columns, members.length)
  const usedRows = Math.ceil(members.length / columns)
  const cellSize = Math.max(...members.map((member) => member.size))
  const blockWidth = usedColumns * cellSize + Math.max(0, usedColumns - 1) * gap
  const blockHeight = usedRows * cellSize + Math.max(0, usedRows - 1) * gap
  if (blockWidth > viewport.width || blockHeight > viewport.height) return undefined

  const anchorRect = {
    left: viewport.width - anchor.right - anchor.size,
    top: viewport.height - anchor.bottom - anchor.size,
    width: anchor.size,
    height: anchor.size,
  }
  const maxLeft = viewport.width - blockWidth
  const maxTop = viewport.height - blockHeight
  const nearTop = Math.min(Math.max(0, anchorRect.top), maxTop)
  const nearLeft = Math.min(Math.max(0, anchorRect.left), maxLeft)
  const candidates = [
    { left: anchorRect.left - gap - blockWidth, top: nearTop },
    { left: nearLeft, top: anchorRect.top - gap - blockHeight },
    { left: anchorRect.left + anchorRect.width + gap, top: nearTop },
    { left: nearLeft, top: anchorRect.top + anchorRect.height + gap },
    { left: 0, top: 0 },
    { left: maxLeft, top: 0 },
    { left: 0, top: maxTop },
    { left: maxLeft, top: maxTop },
  ]
  const origin = candidates.find((candidate) => {
    if (candidate.left < 0 || candidate.top < 0 ||
      candidate.left > maxLeft || candidate.top > maxTop) return false
    return !screenRectsOverlap(
      { ...candidate, width: blockWidth, height: blockHeight },
      anchorRect,
      gap,
    )
  })
  if (origin === undefined) return undefined

  members.forEach((member, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const left = origin.left + column * (cellSize + gap) + (cellSize - member.size) / 2
    const top = origin.top + row * (cellSize + gap) + (cellSize - member.size) / 2
    out[member.id] = {
      right: Math.round(viewport.width - left - member.size),
      bottom: Math.round(viewport.height - top - member.size),
    }
  })
  return out
}

function screenRectsOverlap(
  left: { left: number; top: number; width: number; height: number },
  right: { left: number; top: number; width: number; height: number },
  gap: number,
): boolean {
  return left.left < right.left + right.width + gap &&
    left.left + left.width + gap > right.left &&
    left.top < right.top + right.height + gap &&
    left.top + left.height + gap > right.top
}

interface OccupiedPet extends SceneMember {
  pos: PetPos
}

function overlaps(left: OccupiedPet, right: OccupiedPet, gap: number): boolean {
  return left.pos.right < right.pos.right + right.size + gap &&
    left.pos.right + left.size + gap > right.pos.right &&
    left.pos.bottom < right.pos.bottom + right.size + gap &&
    left.pos.bottom + left.size + gap > right.pos.bottom
}

function nearestFreePosition(
  preferred: PetPos,
  member: SceneMember,
  occupied: readonly OccupiedPet[],
  gap: number,
  viewport: SceneViewport,
): PetPos | undefined {
  const clamped = clampPetPos(preferred, member.size, viewport)
  const rights = new Set<number>([clamped.right, 0, Math.max(0, viewport.width - member.size)])
  const bottoms = new Set<number>([clamped.bottom, 0, Math.max(0, viewport.height - member.size)])
  for (const other of occupied) {
    rights.add(other.pos.right + other.size + gap)
    rights.add(other.pos.right - member.size - gap)
    bottoms.add(other.pos.bottom + other.size + gap)
    bottoms.add(other.pos.bottom - member.size - gap)
  }
  let best: PetPos | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const right of rights) {
    for (const bottom of bottoms) {
      const candidate = clampPetPos({ right, bottom }, member.size, viewport)
      const placed: OccupiedPet = { ...member, pos: candidate }
      if (occupied.some((other) => overlaps(placed, other, gap))) continue
      const distance = (candidate.right - clamped.right) ** 2 + (candidate.bottom - clamped.bottom) ** 2
      if (distance < bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
  }
  return best
}

function placeWithoutOverlap(
  preferred: PetPos,
  member: SceneMember,
  occupied: readonly OccupiedPet[],
  gap: number,
  viewport: SceneViewport,
): PetPos | undefined {
  return nearestFreePosition(preferred, member, occupied, gap, viewport)
}

/** Clamp and de-overlap members while preserving the ordered members first. */
function resolveCollisions(
  out: Record<string, PetPos>,
  others: readonly SceneMember[],
  anchor: SceneAnchor,
  gap: number,
  viewport: SceneViewport,
): Record<string, PetPos> | undefined {
  const resolved: Record<string, PetPos> = {
    [anchor.id]: clampPetPos(anchor, anchor.size, viewport),
  }
  const occupied: OccupiedPet[] = [{
    id: anchor.id,
    size: anchor.size,
    pos: clampPetPos(anchor, anchor.size, viewport),
  }]
  for (const member of others) {
    const pos = out[member.id]
    if (pos === undefined) continue
    const placed = placeWithoutOverlap(pos, member, occupied, gap, viewport)
    if (placed === undefined) return undefined
    resolved[member.id] = placed
    occupied.push({ ...member, pos: placed })
  }
  return resolved
}

/** Resolve a manual drag against every currently visible pet. */
export function resolveSceneMove(
  memberId: string,
  size: number,
  desired: PetPos,
  members: readonly SceneMember[],
  positions: Readonly<Record<string, PetPos>>,
  viewport: SceneViewport,
  spacing: number,
): PetPos {
  const occupied = members
    .filter((member) => member.id !== memberId && positions[member.id] !== undefined)
    .map((member) => ({
      ...member,
      pos: clampPetPos(positions[member.id], member.size, viewport),
    }))
  const next = placeWithoutOverlap(
    desired,
    { id: memberId, size },
    occupied,
    Math.max(0, spacing),
    viewport,
  ) ?? placeWithoutOverlap(
    desired,
    { id: memberId, size },
    occupied,
    0,
    viewport,
  )
  if (next !== undefined) return next

  const current = positions[memberId]
  if (current !== undefined) return clampPetPos(current, size, viewport)
  return clampPetPos(desired, size, viewport)
}

function normalizeGridCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(SCENE_GRID_MAX, Math.max(SCENE_GRID_MIN, Math.round(value)))
    : fallback
}

/** Tolerant load of the scene prefs (corrupt storage falls back to defaults). */
export function loadScenePrefs(): ScenePrefs {
  const base: ScenePrefs = {
    mode: 'row',
    sort: 'tokens-desc',
    spacing: SCENE_SPACING_DEFAULT,
    gridColumns: SCENE_GRID_COLUMNS_DEFAULT,
    gridRows: SCENE_GRID_ROWS_DEFAULT,
    showLabels: true,
    free: {},
  }
  try {
    const raw = localStorage.getItem(SCENE_KEY)
    if (raw === null) return base
    const parsed = JSON.parse(raw) as Partial<ScenePrefs>
    const mode: ArrangeMode = (ARRANGE_MODES as readonly string[]).includes(parsed.mode ?? '')
      ? parsed.mode as ArrangeMode
      : base.mode
    const sort: SceneSort = (SCENE_SORTS as readonly string[]).includes(parsed.sort ?? '')
      ? parsed.sort as SceneSort
      : base.sort
    const spacing = typeof parsed.spacing === 'number' && Number.isFinite(parsed.spacing)
      ? Math.min(SCENE_SPACING_MAX, Math.max(SCENE_SPACING_MIN, Math.round(parsed.spacing)))
      : base.spacing
    const gridColumns = normalizeGridCount(parsed.gridColumns, base.gridColumns)
    const gridRows = normalizeGridCount(parsed.gridRows, base.gridRows)
    const free: Record<string, PetPos> = {}
    if (parsed.free !== undefined && typeof parsed.free === 'object') {
      for (const [id, pos] of Object.entries(parsed.free)) {
        const p = pos as Partial<PetPos> | undefined
        if (p !== undefined && typeof p === 'object'
          && typeof p.right === 'number' && Number.isFinite(p.right)
          && typeof p.bottom === 'number' && Number.isFinite(p.bottom)) {
          free[id] = { right: Math.max(0, Math.round(p.right)), bottom: Math.max(0, Math.round(p.bottom)) }
        }
      }
    }
    const showLabels = typeof parsed.showLabels === 'boolean' ? parsed.showLabels : base.showLabels
    return { mode, sort, spacing, gridColumns, gridRows, showLabels, free }
  } catch {
    return base
  }
}

/** Persist the scene prefs (storage failures are ignored). */
export function saveScenePrefs(prefs: ScenePrefs): void {
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage failure must not break the room scene.
  }
}

/** Stateful scene prefs: read once, committed to localStorage on change. */
export function useScenePrefs(): {
  prefs: ScenePrefs
  update: (patch: Partial<ScenePrefs>) => void
  moveMember: (id: string, pos: PetPos) => void
  resetMembers: () => void
} {
  const [prefs, setPrefs] = useState<ScenePrefs>(() => loadScenePrefs())
  useEffect(() => {
    saveScenePrefs(prefs)
  }, [prefs])
  const update = (patch: Partial<ScenePrefs>): void => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      return {
        ...next,
        spacing: typeof next.spacing === 'number' && Number.isFinite(next.spacing)
          ? Math.min(SCENE_SPACING_MAX, Math.max(SCENE_SPACING_MIN, Math.round(next.spacing)))
          : prev.spacing,
        gridColumns: normalizeGridCount(next.gridColumns, prev.gridColumns),
        gridRows: normalizeGridCount(next.gridRows, prev.gridRows),
      }
    })
  }
  const moveMember = (id: string, pos: PetPos): void => {
    setPrefs((prev) => ({ ...prev, free: { ...prev.free, [id]: pos } }))
  }
  const resetMembers = (): void => {
    setPrefs((prev) => ({ ...prev, free: {} }))
  }
  return { prefs, update, moveMember, resetMembers }
}

/** One floating member pet: image or whale in the owner's variant, crowns, phase. */
export function MemberPetScene(props: {
  member: RoomMemberView
  size: number
  pos: PetPos
  /** Collision-safe outer width for the local observer's labels. */
  labelMaxWidth: number
  /** False in auto-arrange modes: the layout owns the position. */
  draggable: boolean
  onMove: (pos: PetPos) => void
  /** Local observer preference; never synchronized through room state. */
  showLabel: boolean
  /** Incoming chat bubble (null when none). */
  chat?: { text: string; key: string; leaving?: boolean } | null
}): ReactElement {
  const { member, size, pos, labelMaxWidth, draggable, onMove, showLabel, chat } = props
  const dragRef = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const previousTokensRef = useRef(member.tokens)
  const [tokenFx, setTokenFx] = useState<{ delta: number; key: number } | null>(null)
  const crownSize = Math.max(14, Math.round(size * 0.36))
  const pyramid = useCrownPyramid(member.crowns, crownSize)

  const onPointerDown = (event: React.PointerEvent): void => {
    if (!draggable) return
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startY: event.clientY, right: pos.right, bottom: pos.bottom }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent): void => {
    const start = dragRef.current
    if (start === null) return
    const right = Math.max(0, start.right - (event.clientX - start.startX))
    const bottom = Math.max(0, start.bottom - (event.clientY - start.startY))
    onMove({ right, bottom })
  }
  const stopDrag = (): void => {
    dragRef.current = null
    setDragging(false)
  }
  useEffect(() => {
    window.addEventListener('blur', stopDrag)
    return () => window.removeEventListener('blur', stopDrag)
  }, [])

  useEffect(() => {
    const previous = previousTokensRef.current
    previousTokensRef.current = member.tokens
    const delta = member.tokens - previous
    if (delta > 0) setTokenFx({ delta, key: Date.now() })
  }, [member.tokens])

  useEffect(() => {
    if (tokenFx === null) return
    const timer = window.setTimeout(() => setTokenFx(null), 1_800)
    return () => window.clearTimeout(timer)
  }, [tokenFx])

  const tokenLabel = `${formatTokens(member.tokens)} tokens`
  const label = `${member.nickname}, ${tokenLabel}`
  const active = isPetActive(member.phase, member.active === true)
  return (
    <span
      className="dsg-pet-root dsg-scene-root"
      data-dragging={dragging}
      data-testid="games-scene-pet"
      data-member-id={member.memberId}
      style={{
        right: pos.right,
        bottom: pos.bottom,
        '--dsg-label-max-width': `${labelMaxWidth}px`,
      } as CSSProperties}
    >
      <span
        className="dsg-pet"
        data-active={active}
        data-phase={member.phase}
        data-token-active={member.active === true}
        data-show-label={showLabel}
        title={label}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
      >
        <span className="dsg-whale-wrap">
          <span className="dsg-whale-breathe">
            {pyramid.crowns.length > 0 && <>{pyramid.crowns}</>}
            {pyramid.flash}
            {pyramid.overflow > 0 && (
              <span className="dsg-crown-badge" style={{ top: pyramid.pileTop }}>+{pyramid.overflow}</span>
            )}
            {member.petUrl !== undefined && member.petUrl !== ''
              ? (
                <img
                  className="dsg-pet-img"
                  src={member.petUrl}
                  alt={member.nickname}
                  draggable={false}
                  style={{ width: size, height: size }}
                />
              )
              : <DeepSeekWhale size={size} title={member.nickname} variant={member.petVariant} />}
          </span>
        </span>
        {chat !== null && chat !== undefined &&
          <ChatBubble key={chat.key} text={chat.text} leaving={chat.leaving} />}
        <span
          className={`dsg-pet-label dsg-scene-label${active ? ' dsg-label-active' : ''}${tokenFx !== null ? ' dsg-label-burst' : ''}`}
          data-testid="games-scene-label"
        >
          <span className="dsg-label-content">
            <span className="dsg-label-player">{member.nickname}</span>
            <span className="dsg-label-tokens">
              {tokenLabel}
              {tokenFx !== null && (
                <em className="dsg-token-chip" key={tokenFx.key} data-testid="games-scene-token-chip">
                  +{formatTokens(tokenFx.delta)}
                </em>
              )}
            </span>
          </span>
        </span>
      </span>
    </span>
  )
}

/** The arrangement controls inside the pet popover (only while in a room). */
export function SceneControls(props: {
  t: Translate
  prefs: ScenePrefs
  onChange: (patch: Partial<ScenePrefs>) => void
  onReset: () => void
  note?: string | null
}): ReactElement {
  const { t, prefs, onChange, onReset, note } = props
  return (
    <div className="dsg-field" data-testid="games-scene-controls">
      <label>{t('scene.title')}</label>
      <div className="dsg-row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {ARRANGE_MODES.map((mode) => (
          <label key={mode} className="dsg-radio" data-on={prefs.mode === mode}>
            <input
              type="radio"
              name="dsg-scene-mode"
              checked={prefs.mode === mode}
              onChange={() => onChange({ mode })}
            />
            {t(`scene.mode.${mode}`)}
          </label>
        ))}
      </div>
      <div className="dsg-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <label>{t('scene.sort')}</label>
      </div>
      <div className="dsg-row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {SCENE_SORTS.map((sort) => (
          <label key={sort} className="dsg-radio" data-on={prefs.sort === sort}>
            <input
              type="radio"
              name="dsg-scene-sort"
              checked={prefs.sort === sort}
              onChange={() => onChange({ sort })}
            />
            {t(`scene.sort.${sort}`)}
          </label>
        ))}
      </div>
      <div className="dsg-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <label>{t('scene.spacing')} · {prefs.spacing}px</label>
      </div>
      <input
        type="range"
        className="dsg-slider"
        min={SCENE_SPACING_MIN}
        max={SCENE_SPACING_MAX}
        step={4}
        value={prefs.spacing}
        onChange={(e) => onChange({ spacing: Number(e.target.value) })}
      />
      {prefs.mode === 'grid' && (
        <div className="dsg-grid-size" data-testid="games-scene-grid-size">
          <label>
            <span>{t('scene.gridColumns')}</span>
            <input
              type="number"
              min={SCENE_GRID_MIN}
              max={SCENE_GRID_MAX}
              step={1}
              value={prefs.gridColumns}
              aria-label={t('scene.gridColumns')}
              data-testid="games-scene-grid-columns"
              onChange={(event) => onChange({ gridColumns: Number(event.target.value) })}
            />
          </label>
          <span aria-hidden>×</span>
          <label>
            <span>{t('scene.gridRows')}</span>
            <input
              type="number"
              min={SCENE_GRID_MIN}
              max={SCENE_GRID_MAX}
              step={1}
              value={prefs.gridRows}
              aria-label={t('scene.gridRows')}
              data-testid="games-scene-grid-rows"
              onChange={(event) => onChange({ gridRows: Number(event.target.value) })}
            />
          </label>
        </div>
      )}
      {note !== null && note !== undefined && (
        <p className="dsg-note dsg-scene-note" role="status" data-testid="games-scene-note">{note}</p>
      )}
      <div className="dsg-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 2 }}>
        <span className="dsg-hint" style={{ margin: 0, flex: 1 }}>{t('scene.hint')}</span>
        <button type="button" className="dsg-btn-ghost" onClick={onReset} data-testid="games-scene-reset">
          {t('scene.reset')}
        </button>
      </div>
      <div className="dsg-field-row" style={{ marginTop: 8 }}>
        <label>{t('scene.showLabels')}</label>
        <button
          type="button"
          className="dsg-toggle"
          data-on={prefs.showLabels}
          aria-pressed={prefs.showLabels}
          onClick={() => onChange({ showLabels: !prefs.showLabels })}
          data-testid="games-scene-label-toggle"
        />
      </div>
    </div>
  )
}
