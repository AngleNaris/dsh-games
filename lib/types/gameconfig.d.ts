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
import { type GameRules } from './rules.ts';
import { type AntiCheatPolicy } from './anticheat.ts';
export { defaultGameRules, type CrownRules, type GameRules, type PetRules, } from './rules.ts';
/** The server's own configuration (rules + auth). */
export interface GameServerConfig extends GameRules {
    /** Shared secret: when set, protected APIs require Bearer authentication. */
    authToken?: string;
    /** Server-only report validation thresholds. */
    antiCheat: AntiCheatPolicy;
}
/** Tolerant reader: missing/corrupt files fall back to defaults. */
export declare function loadGameServerConfig(dataDir: string): GameServerConfig;
/** Write a config file (used by the deploy flow to seed the volume). */
export declare function saveGameServerConfig(dataDir: string, config: GameServerConfig): void;
//# sourceMappingURL=gameconfig.d.ts.map