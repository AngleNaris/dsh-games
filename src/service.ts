/**
 * Games host service — the `games` capability. Owns the lifetime token
 * ledger (folded from live session events), the pet phase mirror, the
 * display layout, and the in-memory room store. The API gateway maps this
 * service onto the `/api/games/*` HTTP routes for browser consumers.
 * @module @linxin666/dsh-games/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  countStepUsage,
  StepMemo,
  type StepKey,
  type UsageLike,
} from './ledger.ts'
import {
  DEFAULT_HAT_TOKEN_STEP,
  DEFAULT_NICKNAME,
  DISPLAY_INSET_MAX,
  DISPLAY_SIZE_MAX,
  DISPLAY_SIZE_MIN,
  gamesHomeDir,
  loadGamesPersist,
  NICKNAME_MAX_LENGTH,
  saveGamesPersist,
  type GamesDisplayConfig,
  type GamesPersist,
} from './persist.ts'
import {
  normalizePhase,
  RoomStore,
  type MemberPhase,
  type RoomStoreOptions,
} from './rooms.ts'

/** Settings-section shape the web settings surface edits. */
export interface GamesSection {
  /** Master switch for the plugin (browser half + host routes). */
  enabled?: boolean
  /** Player nickname shown on the pet and in rooms. */
  nickname: string
  /** Tokens per hat. */
  hatTokenStep: number
}

/** Plugin configuration. */
export interface GamesConfig extends RoomStoreOptions {
  /** Master switch for the plugin. */
  enabled?: boolean
  /** Default nickname (settings override when the surface is attached). */
  nickname?: string
  /** Tokens per hat (settings override when the surface is attached). */
  hatTokenStep?: number
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
  /** Hat count (tokens / hatTokenStep, floored). */
  hats: number
  /** Current model-activity phase. */
  phase: MemberPhase
  /** Tokens per hat in effect. */
  hatTokenStep: number
  /** Master switch (false hides the pet and stops counting). */
  enabled: boolean
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
  hats: number
}

/** Result of `games.setDisplay`. */
export interface SetDisplayResult {
  ok: true
  display: GamesDisplayConfig
}

/** Runtime-config patch accepted by `games.setConfig`. */
export interface GamesConfigPatch {
  nickname?: string
  hatTokenStep?: number
  enabled?: boolean
}

/** Result of `games.setConfig`. */
export type SetConfigResult = { ok: true } | { ok: false; error: string }

/** Settings namespace of the games capability (spelled here, mirrored in the browser half). */
export const GAMES_SETTINGS_NAMESPACE = 'games'

/** The room protocol's phase vocabulary (re-exported for routes). */
export type { MemberPhase } from './rooms.ts'

/** Loose shape of bus events (the firehose also carries non-session event payloads). */
interface BusEvent {
  type: string
  data?: unknown
}

/** Known model-activity phases (the set the harness activity tracker emits). */
const ACTIVITY_PHASES: readonly string[] = ['idle', 'waiting', 'thinking', 'tool', 'done']

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
  private readonly hatTokenStepDefault: number
  private sectionSource: (() => GamesSection) | undefined
  private phase: MemberPhase = 'idle'
  private enabled: boolean
  private disposeListeners: (() => void) | undefined
  private sweepTimer: NodeJS.Timeout | undefined

  constructor(ctx: Context, config: GamesConfig = {}) {
    super(ctx, 'games')
    this.persistDir = config.persistDir ?? gamesHomeDir()
    this.persist = loadGamesPersist(this.persistDir)
    this.roomStore = new RoomStore(config)
    this.hatTokenStepDefault = config.hatTokenStep ?? DEFAULT_HAT_TOKEN_STEP
    this.enabled = config.enabled ?? true
    this.setEnabled(this.enabled)
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
          this.phase = 'idle'
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
      hatTokenStep: this.hatTokenStepDefault,
    }
  }

  private onSessionEvent(sessionId: string, event: BusEvent): void {
    switch (event.type) {
      case 'assistant/message': {
        const data = (event.data ?? {}) as { turn?: number; step?: number; usage?: UsageLike }
        this.countUsage(sessionId, data, data.usage)
        return
      }
      case 'assistant/chunk': {
        const data = (event.data ?? {}) as { turn?: number; step?: number; chunk?: { type?: string; usage?: UsageLike } }
        if (data.chunk?.type === 'usage') this.countUsage(sessionId, data, data.chunk.usage)
        return
      }
      case 'activity/status': {
        const payload = (event.data ?? {}) as { phase?: unknown }
        if (typeof payload.phase !== 'string') return
        if (!ACTIVITY_PHASES.includes(payload.phase)) return
        this.phase = normalizePhase(payload.phase)
        return
      }
    }
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
   * RPC: apply a runtime-config patch (nickname / hatTokenStep / enabled).
   * Values are mirrored into the `games` settings namespace so the web
   * settings surface stays consistent; when the settings provider is absent
   * the patch still applies locally.
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
    if (patch.hatTokenStep !== undefined) {
      const step = Math.round(patch.hatTokenStep)
      if (!Number.isFinite(step) || step < 1 || step > 1_000_000_000_000) {
        return { ok: false, error: 'invalid-hat-token-step' }
      }
      settingsPatch.hatTokenStep = step
    }
    if (patch.enabled !== undefined) {
      if (typeof patch.enabled !== 'boolean') return { ok: false, error: 'invalid-enabled' }
      settingsPatch.enabled = patch.enabled
      this.setEnabled(patch.enabled)
    }
    if (Object.keys(settingsPatch).length > 0) this.mirrorSettings(settingsPatch)
    return { ok: true }
  }

  /** Current persisted nickname (the composition base for the settings section). */
  nickname(): string {
    return this.persist.nickname
  }

  /** RPC: demo helper — add tokens to the ledger and recompute hats. */
  async boost(tokens: number): Promise<BoostResult> {
    const delta = Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0
    if (delta <= 0) throw new Error('invalid-boost')
    this.persist = { ...this.persist, tokens: this.persist.tokens + delta }
    this.flush()
    const view = this.view()
    return { ok: true, tokens: view.tokens, hats: view.hats }
  }

  /** RPC: update display layout (clamped to whole pixels). */
  async setDisplay(patch: Partial<GamesDisplayConfig>): Promise<SetDisplayResult> {
    const next = { ...this.persist.display, ...patch }
    next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, next.size)))
    next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.right)))
    next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.bottom)))
    this.persist = { ...this.persist, display: next }
    this.flush()
    return { ok: true, display: this.persist.display }
  }

  /** The room store (routes call into it). */
  rooms(): RoomStore {
    return this.roomStore
  }

  private view(): GamesStateView {
    const section = this.section()
    const hatTokenStep = Math.max(1, Math.round(section.hatTokenStep ?? this.hatTokenStepDefault))
    return {
      memberId: this.persist.memberId,
      nickname: section.nickname?.trim() !== '' ? section.nickname : DEFAULT_NICKNAME,
      tokens: this.persist.tokens,
      hats: Math.floor(this.persist.tokens / hatTokenStep),
      phase: this.phase,
      hatTokenStep,
      enabled: this.enabled,
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
