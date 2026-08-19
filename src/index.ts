/**
 * dsh-games host half — mounts the games service (token ledger, phase
 * mirror, room store) and its `/api/games/*` HTTP routes. The browser half
 * (the `./client` entry) renders the floating DeepSeek-whale pet with token
 * hats, the nickname + room UI, and the settings card. Install via
 * `dsh plugin --profile web add link:<this repo>`; cordis.patch.yml inserts
 * this plugin row.
 * @module @kasidia/dsh-games
 */

import { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_NICKNAME,
  NICKNAME_MAX_LENGTH,
} from './persist.ts'
import {
  DEFAULT_GAME_SERVER_AUTH_TOKEN,
  DEFAULT_GAME_SERVER_URL,
} from './default-server.ts'
import { makeGamesRoutes } from './routes.ts'
import {
  DEFAULT_PET_VARIANT,
  GAMES_SETTINGS_NAMESPACE,
  GamesService,
  type GamesConfig,
  type GamesSection,
} from './service.ts'

export { GamesService } from './service.ts'
export type {
  BoostResult,
  GamesConfig,
  GamesConfigPatch,
  GamesSection,
  GamesStateView,
  MemberPhase,
  SetConfigResult,
  SetDisplayResult,
  SetNicknameResult,
} from './service.ts'
export {
  DEFAULT_NICKNAME,
  NICKNAME_MAX_LENGTH,
} from './persist.ts'
export {
  makeGamesRoutes,
  GAMES_API_PREFIX,
  ROOM_API_PREFIX,
} from './routes.ts'
export {
  countStepUsage,
  StepMemo,
  usageTotal,
  type LedgerResult,
  type LedgerState,
  type StepKey,
  type UsageLike,
} from './ledger.ts'
export {
  normalizeCode,
  normalizePhase,
  RoomStore,
  type MemberReport,
  type MemberPhase as RoomMemberPhase,
  type RoomMemberView,
  type RoomStoreOptions,
  type RoomView,
} from './rooms.ts'
export { PetStore, validatePet, sniffImage } from './pets.ts'
export {
  CROWN_LEVELS,
  crownCounts,
  crownTotal,
  crownUnits,
  DEFAULT_CROWN_TOKEN_STEP,
} from './crowns.ts'
export {
  DEFAULT_GAME_SERVER_AUTH_TOKEN,
  DEFAULT_GAME_SERVER_URL,
} from './default-server.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'games'

/** Services required before the games plugin can mount its surfaces. */
export const inject = ['webServer']

/** Settings section schema: the fields the web settings surface edits. */
export const GAMES_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  nickname: z.string().min(1).max(NICKNAME_MAX_LENGTH).pattern(/\S/).default(DEFAULT_NICKNAME),
  petVariant: z.string().min(1).max(64).default(DEFAULT_PET_VARIANT),
  serverUrl: z.string().max(512).default(DEFAULT_GAME_SERVER_URL),
  authToken: z.string().max(256).default(DEFAULT_GAME_SERVER_AUTH_TOKEN),
})

/**
 * Register the games service, its settings namespace, and its API routes.
 * @param ctx - host plugin context carrying webServer + settings.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config: GamesConfig = {}): void {
  const service = new GamesService(ctx, { ...config })

  // The settings surface edits nickname / enabled / pet pattern / server URL
  // through the `games` namespace. The composition `base` starts
  // as the persisted values, so an empty user layer resolves to exactly what
  // the pet already shows. `current()` stays the authoritative section for
  // the service.
  const base: GamesSection = {
    nickname: service.nickname(),
    petVariant: config.petVariant ?? DEFAULT_PET_VARIANT,
    serverUrl: typeof config.serverUrl === 'string'
      ? config.serverUrl.trim()
      : DEFAULT_GAME_SERVER_URL,
    authToken: typeof config.authToken === 'string'
      ? config.authToken.trim()
      : DEFAULT_GAME_SERVER_AUTH_TOKEN,
    enabled: config.enabled ?? true,
  }
  let current: () => GamesSection = () => base
  service.setSectionSource(() => current())

  // The routes stay registered while the plugin row is loaded, so the games
  // API always answers — toggling `enabled` off only stops counting and
  // hides the pet, and the settings card can turn it back on any time.
  const routes = makeGamesRoutes(service)
  const disposeRoutes = ctx.effect(
    () => {
      const disposers = routes.map((route) => ctx.webServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    },
    'games: routes',
  )

  installSettingsSection(ctx, settingsNamespace(GAMES_SETTINGS_NAMESPACE), GAMES_SETTINGS_SCHEMA, base, {
    setSource: (source) => { current = source },
    onChange: () => {
      service.applySection(current())
    },
  })
}
