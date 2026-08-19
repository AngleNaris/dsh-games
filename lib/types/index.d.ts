/**
 * dsh-games host half — mounts the games service (token ledger, phase
 * mirror, room store) and its `/api/games/*` HTTP routes. The browser half
 * (the `./client` entry) renders the floating DeepSeek-whale pet with token
 * hats, the nickname + room UI, and the settings card. Install via
 * `dsh plugin --profile web add link:<this repo>`; cordis.patch.yml inserts
 * this plugin row.
 * @module @kasidia/dsh-games
 */
import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type GamesConfig } from './service.ts';
export { GamesService } from './service.ts';
export type { BoostResult, GamesConfig, GamesConfigPatch, GamesSection, GamesStateView, MemberPhase, SetConfigResult, SetDisplayResult, SetNicknameResult, } from './service.ts';
export { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH, } from './persist.ts';
export { makeGamesRoutes, GAMES_API_PREFIX, ROOM_API_PREFIX, } from './routes.ts';
export { countStepUsage, StepMemo, usageTotal, type LedgerResult, type LedgerState, type StepKey, type UsageLike, } from './ledger.ts';
export { normalizeCode, normalizePhase, RoomStore, type MemberReport, type MemberPhase as RoomMemberPhase, type RoomMemberView, type RoomStoreOptions, type RoomView, } from './rooms.ts';
export { PetStore, validatePet, sniffImage } from './pets.ts';
export { CROWN_LEVELS, crownCounts, crownTotal, crownUnits, DEFAULT_CROWN_TOKEN_STEP, } from './crowns.ts';
export { DEFAULT_GAME_SERVER_AUTH_TOKEN, DEFAULT_GAME_SERVER_URL, } from './default-server.ts';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "games";
/** Services required before the games plugin can mount its surfaces. */
export declare const inject: string[];
/** Settings section schema: the fields the web settings surface edits. */
export declare const GAMES_SETTINGS_SCHEMA: z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
    nickname: z<string, string>;
    petVariant: z<string, string>;
    serverUrl: z<string, string>;
    authToken: z<string, string>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
    nickname: z<string, string>;
    petVariant: z<string, string>;
    serverUrl: z<string, string>;
    authToken: z<string, string>;
}>>;
/**
 * Register the games service, its settings namespace, and its API routes.
 * @param ctx - host plugin context carrying webServer + settings.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export declare function apply(ctx: Context, config?: GamesConfig): void;
//# sourceMappingURL=index.d.ts.map