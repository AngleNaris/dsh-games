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
 * - `grid`   — free drag, but positions snap to the spacing grid.
 * - `orbit`  — ring around the anchor pet.
 * @module @linxin666/dsh-games/client/scene
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoomMemberView } from './api.ts'
import { formatTokens } from './locales.ts'
import { DeepSeekWhale } from './whale.tsx'
import { MiniCrown } from './crowns.tsx'
import { ChatBubble } from './chat.tsx'

/** Arrangement modes (order is the UI order too). */
export type ArrangeMode = 'free' | 'row' | 'column' | 'grid' | 'orbit'

/** All modes in UI order. */
export const ARRANGE_MODES: readonly ArrangeMode[] = ['free', 'row', 'column', 'grid', 'orbit']

/** One floating-pet position (right/bottom insets). */
export interface PetPos {
  right: number
  bottom: number
}

/** Per-member free-drag memory (mode `free` / `grid`). */
export interface ScenePrefs {
  mode: ArrangeMode
  /** Gap between pet edges (grid cell too), px. */
  spacing: number
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
export const SCENE_SPACING_DEFAULT = 110

/** localStorage key for the scene prefs. */
const SCENE_KEY = 'dsh.games.scene.v1'

/** Clamp a member-reported size into the legal pet range. */
export function clampMemberSize(size: number | undefined, fallback: number): number {
  const value = typeof size === 'number' && Number.isFinite(size) ? size : fallback
  return Math.min(512, Math.max(24, Math.round(value)))
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
 * Default seat for a member with no remembered position: queued to the left
 * of the anchor, vertically centered on it.
 */
function defaultPos(anchor: SceneAnchor, member: SceneMember, spacing: number, index: number): PetPos {
  // Cursor walks leftward from the anchor's left edge.
  const cursor = anchor.right + anchor.size / 2 + spacing + index * spacing
  return {
    right: Math.max(0, Math.round(cursor + member.size / 2)),
    bottom: Math.max(0, Math.round(anchor.bottom + (anchor.size - member.size) / 2)),
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
): Record<string, PetPos> {
  const out: Record<string, PetPos> = { [anchor.id]: { right: anchor.right, bottom: anchor.bottom } }
  const others = members.filter((member) => member.id !== anchor.id)
  const gap = Math.max(1, spacing)

  if (mode === 'free' || mode === 'grid') {
    others.forEach((member, index) => {
      const raw = free[member.id] ?? defaultPos(anchor, member, gap, index)
      out[member.id] = mode === 'grid' ? snapPos(raw, gap) : raw
    })
    return clampAll(out, others, viewport)
  }

  if (mode === 'row') {
    // Alternate left / right around the anchor; y-centers align with it.
    const lefts = others.filter((_, i) => i % 2 === 0)
    const rights = others.filter((_, i) => i % 2 === 1)
    let leftCursor = anchor.right + anchor.size / 2 + gap
    for (const member of lefts) {
      out[member.id] = {
        right: Math.round(leftCursor + member.size / 2),
        bottom: Math.round(anchor.bottom + (anchor.size - member.size) / 2),
      }
      leftCursor += member.size + gap
    }
    let rightCursor = anchor.right - anchor.size / 2 - gap
    for (const member of rights) {
      out[member.id] = {
        right: Math.round(rightCursor - member.size / 2),
        bottom: Math.round(anchor.bottom + (anchor.size - member.size) / 2),
      }
      rightCursor -= member.size + gap
    }
    return clampAll(out, others, viewport)
  }

  if (mode === 'column') {
    // Alternate above / below the anchor; x-centers align with it.
    const ups = others.filter((_, i) => i % 2 === 0)
    const downs = others.filter((_, i) => i % 2 === 1)
    let upCursor = anchor.bottom - anchor.size / 2 - gap
    for (const member of ups) {
      out[member.id] = {
        right: Math.round(anchor.right + (anchor.size - member.size) / 2),
        bottom: Math.round(upCursor - member.size / 2),
      }
      upCursor -= member.size + gap
    }
    let downCursor = anchor.bottom + anchor.size / 2 + gap
    for (const member of downs) {
      out[member.id] = {
        right: Math.round(anchor.right + (anchor.size - member.size) / 2),
        bottom: Math.round(downCursor + member.size / 2),
      }
      downCursor += member.size + gap
    }
    return clampAll(out, others, viewport)
  }

  // orbit: even ring around the anchor center, starting straight above.
  const n = others.length
  if (n > 0) {
    const radius = Math.max(gap, Math.round((gap * n) / 4))
    const cx = viewport.width - anchor.right - anchor.size / 2
    const cy = anchor.bottom + anchor.size / 2
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
  return clampAll(out, others, viewport)
}

/** Clamp member positions into the viewport (edge-sticking, not wrapping). */
function clampAll(
  out: Record<string, PetPos>,
  others: readonly SceneMember[],
  viewport: SceneViewport,
): Record<string, PetPos> {
  for (const member of others) {
    const pos = out[member.id]
    if (pos === undefined) continue
    out[member.id] = {
      right: Math.min(Math.max(0, pos.right), Math.max(0, viewport.width - member.size)),
      bottom: Math.min(Math.max(0, pos.bottom), Math.max(0, viewport.height - member.size)),
    }
  }
  return out
}

/** Tolerant load of the scene prefs (corrupt storage falls back to defaults). */
export function loadScenePrefs(): ScenePrefs {
  const base: ScenePrefs = { mode: 'free', spacing: SCENE_SPACING_DEFAULT, free: {} }
  try {
    const raw = localStorage.getItem(SCENE_KEY)
    if (raw === null) return base
    const parsed = JSON.parse(raw) as Partial<ScenePrefs>
    const mode: ArrangeMode = (ARRANGE_MODES as readonly string[]).includes(parsed.mode ?? '')
      ? parsed.mode as ArrangeMode
      : base.mode
    const spacing = typeof parsed.spacing === 'number' && Number.isFinite(parsed.spacing)
      ? Math.min(SCENE_SPACING_MAX, Math.max(SCENE_SPACING_MIN, Math.round(parsed.spacing)))
      : base.spacing
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
    return { mode, spacing, free }
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
    setPrefs((prev) => ({ ...prev, ...patch }))
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
  /** False in auto-arrange modes: the layout owns the position. */
  draggable: boolean
  onMove: (pos: PetPos) => void
  /** Incoming chat bubble (null when none). */
  chat?: { text: string; key: string; leaving?: boolean } | null
}): ReactElement {
  const { member, size, pos, draggable, onMove, chat } = props
  const dragRef = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null)

  const onPointerDown = (event: React.PointerEvent): void => {
    if (!draggable) return
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startY: event.clientY, right: pos.right, bottom: pos.bottom }
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
  }
  useEffect(() => {
    window.addEventListener('blur', stopDrag)
    return () => window.removeEventListener('blur', stopDrag)
  }, [])

  const hasCrowns = member.crowns.some((count) => count > 0)
  const label = `${member.nickname} · ${formatTokens(member.tokens)}`
  const active = member.active === true ||
    member.phase === 'waiting' ||
    member.phase === 'thinking' ||
    member.phase === 'tool'
  return (
    <span
      className="dsg-pet-root dsg-scene-root"
      data-dragging={draggable}
      data-testid="games-scene-pet"
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      <span
        className="dsg-pet"
        data-active={active}
        data-phase={member.phase}
        data-token-active={member.active === true}
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
            {hasCrowns && <MiniCrown counts={member.crowns} size={Math.max(10, Math.round(size * 0.55))} />}
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
          <ChatBubble key={chat.key} text={chat.text} from={member.nickname} leaving={chat.leaving} />}
        <span className="dsg-scene-label">{label}</span>
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
}): ReactElement {
  const { t, prefs, onChange, onReset } = props
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
      <div className="dsg-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 2 }}>
        <span className="dsg-hint" style={{ margin: 0, flex: 1 }}>{t('scene.hint')}</span>
        <button type="button" className="dsg-btn-ghost" onClick={onReset} data-testid="games-scene-reset">
          {t('scene.reset')}
        </button>
      </div>
    </div>
  )
}
