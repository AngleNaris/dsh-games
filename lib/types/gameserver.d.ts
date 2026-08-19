/**
 * Shared game-server HTTP surface — the multiplayer room protocol plus the
 * custom-pet store, as plain node:http handlers with permissive CORS. One
 * implementation serves two deployments:
 *
 *  - the DSH host mounts it in-process under `/api/games/rooms*` and
 *    `/api/games/pets*` (local prototype play, no extra server needed);
 *  - the standalone `dsh-games-server` entry serves exactly the same surface
 *    in Docker (the deployable game server the clients talk to).
 *
 * Security posture:
 *  - when the server config carries an `authToken`, EVERY request (rooms,
 *    pets, rules) must pass it as `Authorization: Bearer <authToken>` —
 *    CORS preflights and the public health endpoint excepted. Authenticated
 *    pet image GETs also accept the query token because native img elements
 *    cannot attach headers;
 *  - pet uploads are validated server-side (magic bytes + decoded pixel
 *    dimensions), capped by the configured byte/dimension limits, and the
 *    request body is rejected early via Content-Length when it is obviously
 *    over the cap.
 *
 * Everything is CORS-open (`*`) so any DSH instance's browser may talk to any
 * game server it holds the token for.
 * @module @kasidia/dsh-games/gameserver
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type RoomStore } from './rooms.ts';
import type { PetStore } from './pets.ts';
import type { GameRules } from './gameconfig.ts';
/** Browser-facing base paths of the shared game-server surface. */
export declare const ROOM_API_PREFIX = "/api/games/rooms";
export declare const PET_API_PREFIX = "/api/games/pets";
export declare const RULES_API_PATH = "/api/games/rules";
export declare const HEALTH_API_PATH = "/api/games/health";
/** The stores and policy the shared surface needs. */
export interface GamesServerContext {
    rooms: RoomStore;
    pets: PetStore;
    /** Enforced rule set (served at /api/games/rules too). */
    rules: GameRules;
    /** Shared secret; when set, every non-preflight request must carry it. */
    authToken?: string;
}
/**
 * Route one request across the shared surface (rooms + pets + rules).
 * Returns a promise that settles when the response is written.
 */
export declare function handleGameServer(req: IncomingMessage, res: ServerResponse, ctx: GamesServerContext): void | Promise<void>;
//# sourceMappingURL=gameserver.d.ts.map