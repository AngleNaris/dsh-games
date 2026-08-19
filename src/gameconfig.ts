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
 * @module @kasidia/dsh-games/gameconfig
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  defaultGameRules,
  type GameRules,
} from './rules.ts'
import {
  normalizeAntiCheatPolicy,
  type AntiCheatPolicy,
} from './anticheat.ts'

export {
  defaultGameRules,
  type CrownRules,
  type GameRules,
  type PetRules,
} from './rules.ts'

/** The server's own configuration (rules + auth). */
export interface GameServerConfig extends GameRules {
  /** Shared secret: when set, protected APIs require Bearer authentication. */
  authToken?: string
  /** Server-only report validation thresholds. */
  antiCheat: AntiCheatPolicy
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
