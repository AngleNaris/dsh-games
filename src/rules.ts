/**
 * Browser-safe game-rule contracts and defaults.
 *
 * The standalone server may override these values from its data-volume
 * config. Clients fetch that live rule set from `/api/games/rules`; when the
 * server is unavailable they fall back to this exact default snapshot.
 * @module @anglenaris/dsh-games/rules
 */

import {
  CROWN_LEVELS,
  DEFAULT_CROWN_BASE,
  DEFAULT_CROWN_TOKEN_STEP,
} from './crowns.ts'

/** Default custom-pet upload size cap (2 MiB). */
export const PET_MAX_BYTES = 2 * 1024 * 1024

/** Default custom-pet longest-edge cap. */
export const PET_MAX_DIMENSION = 1024

/** Crown rules served to clients. */
export interface CrownRules {
  /** Tokens per bronze crown. */
  tokenStep: number
  /** Crafting base: `base` crowns of one level = 1 of the next. */
  base: number
  /** Crown level ids, lowest first. */
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

/** Fresh default rules for the in-process server and offline clients. */
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
