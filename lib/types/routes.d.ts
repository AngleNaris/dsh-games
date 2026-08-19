/**
 * Games HTTP routes (host half) — the browser talks to its own DSH host for
 * personal state (`/api/games/state`, nickname, boost, display, config, pet
 * meta), and to the **game server** for everything multiplayer: the shared
 * room + pet surface from gameserver.ts is mounted in-process under
 * `/api/games/rooms*` and `/api/games/pets*` so local prototype play works
 * without a separate deployment. The standalone `lib/server.js` serves that
 * same surface in Docker.
 * @module @kasidia/dsh-games/routes
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { GamesService } from './service.ts';
/** Browser-facing base path of the games API. */
export declare const GAMES_API_PREFIX = "/api/games";
/** Re-exported shared-surface prefixes (browser consumers). */
export { PET_API_PREFIX, ROOM_API_PREFIX } from './gameserver.ts';
/** Build the full route family for one games service. */
export declare function makeGamesRoutes(service: GamesService): WebRoute[];
//# sourceMappingURL=routes.d.ts.map