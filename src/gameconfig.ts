/**
 * Game server configuration — the deployable server reads its rules from
 * `<dataDir>/config.json` (the Docker volume mount, editable without a
 * rebuild). The DSH host's in-process mount uses the same defaults so both
 * deployments behave identically; clients fetch the live rules through
 * `GET /api/games/rules`.
 *
 * ```json
 * {
 *   "authToken": "…",                 // required on the deployed server:
 *                                     // JSON/mutation APIs use Bearer auth
 *   "crown": {
 *     "tokenStep": 1000000,           // tokens per bronze crown (1M)
 *     "base": 3,                      // 3 crowns of a level = 1 of the next
 *     "levels": ["bronze", "silver", "gold", "platinum", "amethyst",
 *                "magic-bronze", "magic-silver", "magic-gold",
 *                "magic-platinum", "magic-amethyst"]
 *   },
 *   "pet": {
 *     "maxBytes": 2097152,            // upload size cap (2MB)
 *     "maxDimension": 1024            // longest edge cap (px)
 *   },
 *   "antiCheat": {
 *     "burstTokens": 500000,
 *     "tokensPerMinute": 1000000,
 *     "strikeLimit": 3,
 *     "strikeWindowMs": 600000,
 *     "lockMs": 60000
 *   }
 * }
 * ```
 * @module @anglenaris/dsh-games/gameconfig
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CROWN_LEVELS,
  DEFAULT_CROWN_BASE,
  DEFAULT_CROWN_TOKEN_STEP,
} from './crowns.ts'
import { PET_MAX_BYTES, PET_MAX_DIMENSION } from './persist.ts'
import {
  normalizeAntiCheatPolicy,
  type AntiCheatPolicy,
} from './anticheat.ts'

/** Crown rules served to clients. */
export interface CrownRules {
  /** Tokens per bronze crown. */
  tokenStep: number
  /** Crafting base: `base` crowns of one level = 1 of the next. */
  base: number
  /** Crown level ids, lowest first (must be CROWN_LEVELS ids). */
  levels: string[]
}

/** Pet upload rules served to clients. */
export interface PetRules {
  /** Upload size cap in bytes. */
  maxBytes: number
  /** Longest-edge cap in pixels. */
  maxDimension: number
}

/** Full rule set the server enforces and serves. */
export interface GameRules {
  crown: CrownRules
  pet: PetRules
}

/** The server's own configuration (rules + auth). */
export interface GameServerConfig extends GameRules {
  /** Shared secret: when set, protected APIs require Bearer authentication. */
  authToken?: string
  /** Server-only report validation thresholds. */
  antiCheat: AntiCheatPolicy
}

/** The default rule set (also used by the host's in-process mount). */
export function defaultGameRules(): GameRules {
  return {
    crown: {
      tokenStep: DEFAULT_CROWN_TOKEN_STEP,
      base: DEFAULT_CROWN_BASE,
      levels: CROWN_LEVELS.map((level) => level.id),
    },
    pet: {
      maxBytes: PET_MAX_BYTES,
      maxDimension: PET_MAX_DIMENSION,
    },
  }
}

/** Clamp a finite positive integer (non-finite -> fallback). */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.round(value)
    : fallback
}

/** Tolerant reader: missing/corrupt files fall back to defaults. */
export function loadGameServerConfig(dataDir: string): GameServerConfig {
  const rules = defaultGameRules()
  try {
    const raw = readFileSync(join(dataDir, 'config.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const crown = (parsed.crown ?? {}) as Record<string, unknown>
    const pet = (parsed.pet ?? {}) as Record<string, unknown>
    const levels = Array.isArray(crown.levels)
      ? (crown.levels as unknown[]).filter((id): id is string => typeof id === 'string')
      : rules.crown.levels
    return {
      ...(typeof parsed.authToken === 'string' && parsed.authToken !== ''
        ? { authToken: parsed.authToken }
        : {}),
      crown: {
        tokenStep: positiveInt(crown.tokenStep, rules.crown.tokenStep),
        base: positiveInt(crown.base, rules.crown.base),
        levels: levels.length > 0 ? levels : rules.crown.levels,
      },
      pet: {
        maxBytes: positiveInt(pet.maxBytes, rules.pet.maxBytes),
        maxDimension: positiveInt(pet.maxDimension, rules.pet.maxDimension),
      },
      antiCheat: normalizeAntiCheatPolicy(parsed.antiCheat),
    }
  } catch {
    return {
      ...rules,
      antiCheat: normalizeAntiCheatPolicy(undefined),
    }
  }
}

/** Write a config file (used by the deploy flow to seed the volume). */
export function saveGameServerConfig(dataDir: string, config: GameServerConfig): void {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}
