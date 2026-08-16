/**
 * dsh-games persistence — tiny JSON store under $DSH_HOME (defaults to
 * ~/.dsh) as `games.json`: the member identity, the lifetime token ledger
 * totals, the per-session dedupe frontiers, and the pet display layout.
 * Deliberately minimal: one file, atomic rename write, tolerant read.
 * @module @linxin666/dsh-games/persist
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

/** One counted step's position in a session (dedupe frontier value). */
export interface StepFrontier {
  turn: number
  step: number
}

/** Display layout of the floating pet. */
export interface GamesDisplayConfig {
  visible: boolean
  size: number
  right: number
  bottom: number
}

/** Everything persisted for the games plugin. */
export interface GamesPersist {
  /** Stable per-instance player id (generated on first run). */
  memberId: string
  /** Player nickname (mirrored into the settings section). */
  nickname: string
  /** Lifetime usage tokens accumulated across every session. */
  tokens: number
  /** Per-session last-counted (turn, step) — restart-safe dedupe. */
  frontiers: Record<string, StepFrontier>
  display: GamesDisplayConfig
}

/** Default pet nickname until the user sets one. */
export const DEFAULT_NICKNAME = '深海旅人'

/** Nickname constraints. */
export const NICKNAME_MAX_LENGTH = 24

/** Default hat step: one hat per 100M usage tokens. */
export const DEFAULT_HAT_TOKEN_STEP = 100_000_000

/** Persisted file name. */
export const GAMES_FILE = 'games.json'

export const DISPLAY_SIZE_MIN = 48
export const DISPLAY_SIZE_MAX = 512
export const DISPLAY_INSET_MAX = 10_000

export const defaultDisplayConfig: GamesDisplayConfig = {
  visible: true,
  size: 160,
  right: 24,
  bottom: 20,
}

/** Resolve the persistence directory ($DSH_HOME or ~/.dsh). */
export function gamesHomeDir(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

export function emptyPersist(): GamesPersist {
  return {
    memberId: randomUUID(),
    nickname: DEFAULT_NICKNAME,
    tokens: 0,
    frontiers: {},
    display: { ...defaultDisplayConfig },
  }
}

/** Numeric field guard: finite numbers only, else the fallback. */
function finiteNum(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/** Load persisted state; missing or corrupt files fall back to defaults. */
export function loadGamesPersist(dir: string = gamesHomeDir()): GamesPersist {
  try {
    const raw = readFileSync(join(dir, GAMES_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<GamesPersist>
    const base = emptyPersist()
    const rawDisplay = (parsed.display ?? {}) as Partial<GamesDisplayConfig>
    const display: GamesDisplayConfig = {
      visible: typeof rawDisplay.visible === 'boolean' ? rawDisplay.visible : base.display.visible,
      size: Math.round(clamp(finiteNum(rawDisplay.size, base.display.size), DISPLAY_SIZE_MAX)
        || base.display.size),
      right: Math.round(clamp(finiteNum(rawDisplay.right, base.display.right), DISPLAY_INSET_MAX)),
      bottom: Math.round(clamp(finiteNum(rawDisplay.bottom, base.display.bottom), DISPLAY_INSET_MAX)),
    }
    const rawFrontiers = (parsed.frontiers ?? {}) as Record<string, unknown>
    const frontiers: Record<string, StepFrontier> = {}
    for (const [sessionId, value] of Object.entries(rawFrontiers)) {
      const f = value as Partial<StepFrontier> | undefined
      if (f === undefined || typeof f !== 'object') continue
      const turn = finiteNum(f.turn, NaN)
      const step = finiteNum(f.step, NaN)
      if (Number.isNaN(turn) || Number.isNaN(step)) continue
      frontiers[sessionId] = { turn, step }
    }
    return {
      memberId: typeof parsed.memberId === 'string' && parsed.memberId !== ''
        ? parsed.memberId
        : base.memberId,
      nickname: typeof parsed.nickname === 'string' && parsed.nickname.trim() !== ''
        ? parsed.nickname.trim()
        : base.nickname,
      tokens: Math.max(0, Math.round(finiteNum(parsed.tokens, 0))),
      frontiers,
      display,
    }
  } catch {
    return emptyPersist()
  }
}

/** Atomically persist state (write temp + rename). */
export function saveGamesPersist(data: GamesPersist, dir: string = gamesHomeDir()): void {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, GAMES_FILE)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, target)
}
