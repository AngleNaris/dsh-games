/**
 * Games host service — the `games` capability. Owns the lifetime token
 * ledger (folded from live session events), the pet phase mirror, the
 * display layout, and the in-memory room store. The API gateway maps this
 * service onto the `/api/games/*` HTTP routes for browser consumers.
 * @module @linxin666/dsh-games/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { join } from 'node:path'
import {
  countStepUsage,
  StepMemo,
  type StepKey,
  type UsageLike,
} from './ledger.ts'
import {
  crownCounts,
  crownUnits,
  DEFAULT_CROWN_BASE,
  DEFAULT_CROWN_TOKEN_STEP,
} from './crowns.ts'
import {
  DEFAULT_GAME_SERVER_AUTH_TOKEN,
  DEFAULT_GAME_SERVER_URL,
} from './default-server.ts'
import {
  DEFAULT_NICKNAME,
  DISPLAY_INSET_MAX,
  DISPLAY_SIZE_MAX,
  DISPLAY_SIZE_MIN,
  gamesHomeDir,
  loadGamesPersist,
  NICKNAME_MAX_LENGTH,
  PETS_DIR,
  saveGamesPersist,
  type GamesDisplayConfig,
  type GamesPersist,
  type PetMeta,
} from './persist.ts'
import {
  RoomStore,
  type MemberPhase,
  type RoomStoreOptions,
} from './rooms.ts'
import { PetStore } from './pets.ts'
import { AntiCheatGuard, normalizeAntiCheatPolicy } from './anticheat.ts'
import { defaultGameRules } from './gameconfig.ts'

/** Settings-section shape the web settings surface edits. */
export interface GamesSection {
  /** Master switch for the plugin (browser half + host routes). */
  enabled?: boolean
  /** Player nickname shown on the pet and in rooms. */
  nickname: string
  /** Tokens per bronze crown (host fallback; the game server rules win). */
  crownTokenStep: number
  /** Built-in pet pattern variant id. */
  petVariant: string
  /** Game-server base URL ('' = same-origin in-process mount). */
  serverUrl: string
  /** Shared secret for the game server (Bearer auth), '' = open. */
  authToken: string
}

/** Plugin configuration. */
export interface GamesConfig extends RoomStoreOptions {
  /** Master switch for the plugin. */
  enabled?: boolean
  /** Default nickname (settings override when the surface is attached). */
  nickname?: string
  /** Tokens per crown (settings override when the surface is attached). */
  crownTokenStep?: number
  /** Legacy settings key for tokens per crown. */
  hatTokenStep?: number
  /** Default pet pattern variant. */
  petVariant?: string
  /** Default game-server base URL. */
  serverUrl?: string
  /** Default game-server shared secret ('' = open). */
  authToken?: string
  /** Persistence directory override (defaults to $DSH_HOME). */
  persistDir?: string
}

/** Snapshot returned by `games.state`. */
export interface GamesStateView {
  /** Stable per-instance player id. */
  memberId: string
  /** Player nickname. */
  nickname: string
  /** Lifetime usage tokens. */
  tokens: number
  /** Crown units (tokens / crownTokenStep, floored). */
  crownUnits: number
  /** Crown counts per level, lowest first (see crowns.ts). */
  crowns: number[]
  /** Current model-activity phase. */
  phase: MemberPhase
  /** Short output-activity window refreshed by assistant stream events. */
  tokenActiveUntil: number
  /** Tokens per crown in effect (host fallback; server rules win). */
  crownTokenStep: number
  /** Master switch (false hides the pet and stops counting). */
  enabled: boolean
  /** Built-in pet pattern variant in effect. */
  petVariant: string
  /** Game-server base URL ('' = same-origin). */
  serverUrl: string
  /** Game-server shared secret ('' = open server). */
  authToken: string
  /** Uploaded custom pet image meta, when set. */
  pet?: PetMeta | undefined
  /** Server clock (ms epoch), for client-side staleness math. */
  serverTime: number
  /** Floating-pet display layout. */
  display: GamesDisplayConfig
}

/** Result of `games.setNickname`. */
export type SetNicknameResult = { ok: true; nickname: string } | { ok: false; error: string }

/** Result of `games.boost`. */
export interface BoostResult {
  ok: true
  tokens: number
  crownUnits: number
  crowns: number[]
}

/** Result of `games.setDisplay`. */
export interface SetDisplayResult {
  ok: true
  display: GamesDisplayConfig
}

/** Runtime-config patch accepted by `games.setConfig`. */
export interface GamesConfigPatch {
  nickname?: string
  crownTokenStep?: number
  hatTokenStep?: number
  enabled?: boolean
  petVariant?: string
  serverUrl?: string
  authToken?: string
}

/** Result of `games.setConfig`. */
export type SetConfigResult = { ok: true } | { ok: false; error: string }

/** Result of `games.setPetMeta`. */
export type SetPetMetaResult = { ok: true; pet?: PetMeta } | { ok: false; error: string }

/** Settings namespace of the games capability (spelled here, mirrored in the browser half). */
export const GAMES_SETTINGS_NAMESPACE = 'games'

/** The room protocol's phase vocabulary (re-exported for routes). */
export type { MemberPhase } from './rooms.ts'

/** Loose shape of bus events (the firehose also carries non-session event payloads). */
interface BusEvent {
  type: string
  data?: unknown
}

/** Keep output activity visible long enough for the browser's 2s state poll. */
export const TOKEN_ACTIVITY_WINDOW_MS = 3_000

/** Default pet pattern variant. */
export const DEFAULT_PET_VARIANT = 'default'

/**
 * Cordis service exposing the games RPC domain. Token counting is live-only:
 * the `session/event` firehose never replays constructor seeds, and the
 * ledger's per-session frontiers make restart-safe dedupe.
 */
export class GamesService extends Service {
  static inject: string[] = []

  private readonly persistDir: string
  private persist: GamesPersist
  private readonly memo = new StepMemo()
  private readonly roomStore: RoomStore
  private readonly petStore: PetStore
  private readonly crownTokenStepDefault: number
  private readonly petVariantDefault: string
  private readonly serverUrlDefault: string
  private readonly authTokenDefault: string
  private sectionSource: (() => GamesSection) | undefined
  private phase: MemberPhase = 'idle'
  private tokenActiveUntil = 0
  private enabled: boolean
  private disposeListeners: (() => void) | undefined
  private sweepTimer: NodeJS.Timeout | undefined

  constructor(ctx: Context, config: GamesConfig = {}) {
    super(ctx, 'games')
    this.persistDir = config.persistDir ?? gamesHomeDir()
    this.persist = loadGamesPersist(this.persistDir)
    const rules = defaultGameRules()
    this.roomStore = new RoomStore({
      ...config,
      antiCheat: new AntiCheatGuard({
        rules: rules.crown,
        policy: normalizeAntiCheatPolicy(undefined),
        stateFile: join(this.persistDir, 'anticheat.json'),
      }),
    })
    this.petStore = new PetStore(this.petDir())
    this.crownTokenStepDefault = config.crownTokenStep ?? config.hatTokenStep ?? DEFAULT_CROWN_TOKEN_STEP
    this.petVariantDefault = config.petVariant ?? DEFAULT_PET_VARIANT
    this.serverUrlDefault = typeof config.serverUrl === 'string'
      ? config.serverUrl.trim()
      : DEFAULT_GAME_SERVER_URL
    this.authTokenDefault = typeof config.authToken === 'string'
      ? config.authToken.trim()
      : DEFAULT_GAME_SERVER_AUTH_TOKEN
    this.enabled = config.enabled ?? true
    this.setEnabled(this.enabled)
  }

  private petDir(): string {
    return join(this.persistDir, PETS_DIR)
  }

  /** Point the service at the authoritative settings section (set by index.ts). */
  setSectionSource(source: () => GamesSection): void {
    this.sectionSource = source
  }

  /** Whether the service consumes session events while enabled. */
  isEnabled(): boolean {
    return this.enabled
  }

  /** Start or stop the session listeners and the room sweep. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (this.disposeListeners !== undefined) {
      this.disposeListeners()
      this.disposeListeners = undefined
    }
    if (this.sweepTimer !== undefined) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = undefined
    }
    if (!this.enabled) return
    this.disposeListeners = (() => {
      const disposers = [
        this.ctx.on('session/event', (session: Session, event: BusEvent) => {
          this.onSessionEvent(session.id, event)
        }),
        this.ctx.on('session/disposed', () => {
          this.onSessionDisposed()
        }),
      ]
      return () => { for (const dispose of disposers) dispose() }
    })()
    this.sweepTimer = setInterval(() => { this.roomStore.sweep() }, 10_000)
    this.sweepTimer.unref?.()
  }

  /** Apply a committed settings section (called by index.ts onChange). */
  applySection(section: GamesSection): void {
    this.setEnabled(section.enabled ?? true)
    const nickname = section.nickname?.trim()
    if (typeof nickname === 'string' && nickname !== '' && nickname.length <= NICKNAME_MAX_LENGTH) {
      this.persist = { ...this.persist, nickname }
      this.flush()
    }
  }

  /** The section currently in effect (settings surface when attached). */
  private section(): GamesSection {
    return this.sectionSource?.() ?? {
      nickname: this.persist.nickname,
      crownTokenStep: this.crownTokenStepDefault,
      petVariant: this.petVariantDefault,
      serverUrl: this.serverUrlDefault,
      authToken: this.authTokenDefault,
    }
  }

  private onSessionEvent(sessionId: string, event: BusEvent): void {
    switch (event.type) {
      case 'turn/start':
        this.phase = 'waiting'
        return
      case 'step/start':
        this.phase = 'thinking'
        return
      case 'assistant/message': {
        const data = (event.data ?? {}) as { turn?: number; step?: number; usage?: UsageLike }
        // Refresh the short tail even when the provider emits only one final
        // message. session/disposed may follow immediately, before the client
        // poll can observe the output activity.
        this.markTokenActivity()
        this.countUsage(sessionId, data, data.usage)
        return
      }
      case 'assistant/chunk': {
        const data = (event.data ?? {}) as { turn?: number; step?: number; chunk?: { type?: string; usage?: UsageLike } }
        if (data.chunk?.type === 'usage') {
          this.countUsage(sessionId, data, data.chunk.usage)
        } else {
          this.markTokenActivity()
        }
        return
      }
      case 'tool/call':
        this.phase = 'tool'
        return
      case 'tool/result':
        this.phase = 'thinking'
        return
      case 'step/end':
        this.phase = 'done'
        return
      case 'turn/end':
        this.phase = 'idle'
        return
    }
  }

  private onSessionDisposed(): void {
    this.phase = 'idle'
  }

  private markTokenActivity(): void {
    this.tokenActiveUntil = Date.now() + TOKEN_ACTIVITY_WINDOW_MS
  }

  private countUsage(sessionId: string, data: { turn?: number; step?: number }, usage: UsageLike | undefined): void {
    if (typeof data.turn !== 'number' || typeof data.step !== 'number') return
    const key: StepKey = { turn: data.turn, step: data.step }
    const result = countStepUsage(
      { tokens: this.persist.tokens, frontiers: this.persist.frontiers },
      this.memo,
      sessionId,
      key,
      usage,
    )
    if (!result.counted) return
    this.persist = {
      ...this.persist,
      tokens: result.state.tokens,
      frontiers: result.state.frontiers,
    }
    this.flush()
  }

  /** RPC: current games state snapshot. */
  async state(): Promise<GamesStateView> {
    return this.view()
  }

  /** RPC: set the player nickname (trimmed, 1..24 chars). */
  async setNickname(name: string): Promise<SetNicknameResult> {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (trimmed === '') return { ok: false, error: 'name-empty' }
    if (trimmed.length > NICKNAME_MAX_LENGTH) return { ok: false, error: 'name-too-long' }
    this.persist = { ...this.persist, nickname: trimmed }
    this.flush()
    this.mirrorSettings({ nickname: trimmed })
    return { ok: true, nickname: trimmed }
  }

  /**
   * RPC: apply a runtime-config patch (nickname / crownTokenStep / enabled /
   * petVariant / serverUrl). Values are mirrored into the `games` settings
   * namespace so the web settings surface stays consistent; when the settings
   * provider is absent the patch still applies locally.
   */
  async setConfig(patch: GamesConfigPatch): Promise<SetConfigResult> {
    const settingsPatch: Record<string, unknown> = {}
    if (patch.nickname !== undefined) {
      const trimmed = typeof patch.nickname === 'string' ? patch.nickname.trim() : ''
      if (trimmed === '') return { ok: false, error: 'name-empty' }
      if (trimmed.length > NICKNAME_MAX_LENGTH) return { ok: false, error: 'name-too-long' }
      this.persist = { ...this.persist, nickname: trimmed }
      this.flush()
      settingsPatch.nickname = trimmed
    }
    const step = patch.crownTokenStep ?? patch.hatTokenStep
    if (step !== undefined) {
      const rounded = Math.round(step)
      if (!Number.isFinite(rounded) || rounded < 1 || rounded > 1_000_000_000_000) {
        return { ok: false, error: 'invalid-crown-token-step' }
      }
      settingsPatch.crownTokenStep = rounded
    }
    if (patch.enabled !== undefined) {
      if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'invalid-enabled' }
      settingsPatch.enabled = patch.enabled
      this.setEnabled(patch.enabled)
    }
    if (patch.petVariant !== undefined) {
      if (typeof patch.petVariant !== 'string' || patch.petVariant.trim() === '') {
        return { ok: false, error: 'invalid-pet-variant' }
      }
      settingsPatch.petVariant = patch.petVariant.trim()
    }
    if (patch.serverUrl !== undefined) {
      if (typeof patch.serverUrl !== 'string') return { ok: false, error: 'invalid-server-url' }
      settingsPatch.serverUrl = patch.serverUrl.trim()
    }
    if (patch.authToken !== undefined) {
      if (typeof patch.authToken !== 'string') return { ok: false, error: 'invalid-auth-token' }
      settingsPatch.authToken = patch.authToken.trim()
    }
    if (Object.keys(settingsPatch).length > 0) this.mirrorSettings(settingsPatch)
    return { ok: true }
  }

  /** Current persisted nickname (the composition base for the settings section). */
  nickname(): string {
    return this.persist.nickname
  }

  /** RPC: demo helper — add tokens to the ledger and recompute crowns. */
  async boost(tokens: number): Promise<BoostResult> {
    const delta = Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0
    if (delta <= 0) throw new Error('invalid-boost')
    this.persist = { ...this.persist, tokens: this.persist.tokens + delta }
    this.flush()
    const view = this.view()
    return { ok: true, tokens: view.tokens, crownUnits: view.crownUnits, crowns: view.crowns }
  }

  /** RPC: update display layout (clamped to whole pixels). */
  async setDisplay(patch: Partial<GamesDisplayConfig>): Promise<SetDisplayResult> {
    const next = { ...this.persist.display, ...patch }
    next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, next.size)))
    next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.right)))
    next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.bottom)))
    next.locked = patch.locked !== undefined ? patch.locked : this.persist.display.locked
    this.persist = { ...this.persist, display: next }
    this.flush()
    return { ok: true, display: this.persist.display }
  }

  /**
   * RPC: record the uploaded custom-pet meta (the bytes live on the game
   * server; the host only mirrors the meta so state can rebuild the URL).
   */
  async setPetMeta(meta: PetMeta | undefined): Promise<SetPetMetaResult> {
    if (meta !== undefined) {
      if (meta.ext !== 'png' && meta.ext !== 'gif') return { ok: false, error: 'invalid-pet-meta' }
      if (!Number.isFinite(meta.version) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
        return { ok: false, error: 'invalid-pet-meta' }
      }
      this.persist = { ...this.persist, pet: meta }
    } else {
      const next = { ...this.persist }
      delete next.pet
      this.persist = next
    }
    this.flush()
    return { ok: true, pet: this.persist.pet }
  }

  /** The room store (routes call into it). */
  rooms(): RoomStore {
    return this.roomStore
  }

  /** The pet store (routes mount it under the shared game-server surface). */
  pets(): PetStore {
    return this.petStore
  }

  /** The configured shared secret ('' = the surface stays open). */
  authToken(): string {
    return this.section().authToken ?? this.authTokenDefault
  }

  private view(): GamesStateView {
    const section = this.section()
    const crownTokenStep = Math.max(1, Math.round(section.crownTokenStep ?? this.crownTokenStepDefault))
    const units = crownUnits(this.persist.tokens, crownTokenStep)
    return {
      memberId: this.persist.memberId,
      nickname: section.nickname?.trim() !== '' ? section.nickname : DEFAULT_NICKNAME,
      tokens: this.persist.tokens,
      crownUnits: units,
      crowns: crownCounts(units, DEFAULT_CROWN_BASE),
      phase: this.phase,
      tokenActiveUntil: this.tokenActiveUntil,
      crownTokenStep,
      enabled: this.enabled,
      petVariant: section.petVariant ?? this.petVariantDefault,
      serverUrl: section.serverUrl ?? this.serverUrlDefault,
      authToken: section.authToken ?? this.authTokenDefault,
      ...(this.persist.pet !== undefined ? { pet: this.persist.pet } : {}),
      serverTime: Date.now(),
      display: { ...this.persist.display },
    }
  }

  /** Mirror service-side writes into the settings document (best-effort). */
  private mirrorSettings(patch: object): void {
    const settings = this.ctx.get('settings', false) as { update(ns: string, patch: object): Promise<void> } | undefined
    if (settings === undefined) return
    void settings.update(GAMES_SETTINGS_NAMESPACE, patch).catch(() => {
      // A settings write failure must not break the games persistence.
    })
  }

  private flush(): void {
    try {
      saveGamesPersist(this.persist, this.persistDir)
    } catch {
      // Persistence is best-effort; the in-memory ledger keeps working.
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    games: GamesService
  }
}
