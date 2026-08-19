/**
 * Games host service — the `games` capability. Owns the lifetime token
 * ledger (folded from live session events), the pet phase mirror, the
 * display layout, and the in-memory room store. The API gateway maps this
 * service onto the `/api/games/*` HTTP routes for browser consumers.
 * @module @kasidia/dsh-games/service
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { type GamesDisplayConfig, type PetMeta } from './persist.ts';
import { RoomStore, type MemberPhase, type RoomStoreOptions } from './rooms.ts';
import { PetStore } from './pets.ts';
import { type GameRules } from './rules.ts';
/** Settings-section shape the web settings surface edits. */
export interface GamesSection {
    /** Master switch for the plugin (browser half + host routes). */
    enabled?: boolean;
    /** Player nickname shown on the pet and in rooms. */
    nickname: string;
    /** Built-in pet pattern variant id. */
    petVariant: string;
    /** Game-server base URL ('' = same-origin in-process mount). */
    serverUrl: string;
    /** Shared secret for the game server (Bearer auth), '' = open. */
    authToken: string;
}
/** Plugin configuration. */
export interface GamesConfig extends RoomStoreOptions {
    /** Master switch for the plugin. */
    enabled?: boolean;
    /** Default nickname (settings override when the surface is attached). */
    nickname?: string;
    /** Default pet pattern variant. */
    petVariant?: string;
    /** Default game-server base URL. */
    serverUrl?: string;
    /** Default game-server shared secret ('' = open). */
    authToken?: string;
    /** Persistence directory override (defaults to $DSH_HOME). */
    persistDir?: string;
}
/** Snapshot returned by `games.state`. */
export interface GamesStateView {
    /** Stable per-instance player id. */
    memberId: string;
    /** Player nickname. */
    nickname: string;
    /** Lifetime usage tokens. */
    tokens: number;
    /** Crown units derived with the in-process server's default rules. */
    crownUnits: number;
    /** Crown counts per level, lowest first (see crowns.ts). */
    crowns: number[];
    /** Current model-activity phase. */
    phase: MemberPhase;
    /** Short output-activity window refreshed by assistant stream events. */
    tokenActiveUntil: number;
    /** Master switch (false hides the pet and stops counting). */
    enabled: boolean;
    /** Built-in pet pattern variant in effect. */
    petVariant: string;
    /** Game-server base URL ('' = same-origin). */
    serverUrl: string;
    /** Game-server shared secret ('' = open server). */
    authToken: string;
    /** Uploaded custom pet image meta, when set. */
    pet?: PetMeta | undefined;
    /** Server clock (ms epoch), for client-side staleness math. */
    serverTime: number;
    /** Floating-pet display layout. */
    display: GamesDisplayConfig;
}
/** Result of `games.setNickname`. */
export type SetNicknameResult = {
    ok: true;
    nickname: string;
} | {
    ok: false;
    error: string;
};
/** Result of `games.boost`. */
export interface BoostResult {
    ok: true;
    tokens: number;
    crownUnits: number;
    crowns: number[];
}
/** Result of `games.setDisplay`. */
export interface SetDisplayResult {
    ok: true;
    display: GamesDisplayConfig;
}
/** Runtime-config patch accepted by `games.setConfig`. */
export interface GamesConfigPatch {
    nickname?: string;
    enabled?: boolean;
    petVariant?: string;
    serverUrl?: string;
    authToken?: string;
}
/** Result of `games.setConfig`. */
export type SetConfigResult = {
    ok: true;
} | {
    ok: false;
    error: string;
};
/** Result of `games.setPetMeta`. */
export type SetPetMetaResult = {
    ok: true;
    pet?: PetMeta;
} | {
    ok: false;
    error: string;
};
/** Settings namespace of the games capability (spelled here, mirrored in the browser half). */
export declare const GAMES_SETTINGS_NAMESPACE = "games";
/** The room protocol's phase vocabulary (re-exported for routes). */
export type { MemberPhase } from './rooms.ts';
/** Keep output activity visible long enough for the browser's 2s state poll. */
export declare const TOKEN_ACTIVITY_WINDOW_MS = 3000;
/** Default pet pattern variant. */
export declare const DEFAULT_PET_VARIANT = "default";
/**
 * Cordis service exposing the games RPC domain. Token counting is live-only:
 * the `session/event` firehose never replays constructor seeds, and the
 * ledger's per-session frontiers make restart-safe dedupe.
 */
export declare class GamesService extends Service {
    static inject: string[];
    private readonly persistDir;
    private persist;
    private readonly memo;
    private readonly roomStore;
    private readonly petStore;
    private readonly petVariantDefault;
    private readonly serverUrlDefault;
    private readonly authTokenDefault;
    private sectionSource;
    private phase;
    private tokenActiveUntil;
    private enabled;
    private disposeListeners;
    private sweepTimer;
    constructor(ctx: Context, config?: GamesConfig);
    private petDir;
    /** Point the service at the authoritative settings section (set by index.ts). */
    setSectionSource(source: () => GamesSection): void;
    /** Whether the service consumes session events while enabled. */
    isEnabled(): boolean;
    /** Start or stop the session listeners and the room sweep. */
    setEnabled(enabled: boolean): void;
    /** Apply a committed settings section (called by index.ts onChange). */
    applySection(section: GamesSection): void;
    /** The section currently in effect (settings surface when attached). */
    private section;
    private onSessionEvent;
    private onSessionDisposed;
    private markTokenActivity;
    private countUsage;
    /** RPC: current games state snapshot. */
    state(): Promise<GamesStateView>;
    /** RPC: set the player nickname (trimmed, 1..24 chars). */
    setNickname(name: string): Promise<SetNicknameResult>;
    /**
     * RPC: apply a runtime-config patch (nickname / enabled / petVariant /
     * serverUrl). Values are mirrored into the `games` settings
     * namespace so the web settings surface stays consistent; when the settings
     * provider is absent the patch still applies locally.
     */
    setConfig(patch: GamesConfigPatch): Promise<SetConfigResult>;
    /** Current persisted nickname (the composition base for the settings section). */
    nickname(): string;
    /** RPC: demo helper — add tokens to the ledger and recompute crowns. */
    boost(tokens: number): Promise<BoostResult>;
    /** RPC: update display layout (clamped to whole pixels). */
    setDisplay(patch: Partial<GamesDisplayConfig>): Promise<SetDisplayResult>;
    /**
     * RPC: record the uploaded custom-pet meta (the bytes live on the game
     * server; the host only mirrors the meta so state can rebuild the URL).
     */
    setPetMeta(meta: PetMeta | undefined): Promise<SetPetMetaResult>;
    /** The room store (routes call into it). */
    rooms(): RoomStore;
    /** The pet store (routes mount it under the shared game-server surface). */
    pets(): PetStore;
    /** The configured shared secret ('' = the surface stays open). */
    authToken(): string;
    /** Rules enforced by the host-mounted room server and shown to its client. */
    gameRules(): GameRules;
    private view;
    /** Mirror service-side writes into the settings document (best-effort). */
    private mirrorSettings;
    private flush;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        games: GamesService;
    }
}
//# sourceMappingURL=service.d.ts.map