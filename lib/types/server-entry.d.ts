/**
 * Standalone dsh-games server — the deployable game server the clients talk
 * to. Serves exactly the shared game-server surface (rooms + custom pets +
 * rules) with zero framework dependencies; the DSH host process is NOT
 * involved. Data lives under $GAME_DATA (volume-mount /data):
 *
 *   $GAME_DATA/config.json  rules + auth token (see gameconfig.ts)
 *   $GAME_DATA/pets/        uploaded pet images
 *   $GAME_DATA/anticheat.json  token baselines + anomaly counters
 *
 *   GAME_HOST   bind host (default 0.0.0.0)
 *   GAME_PORT   listen port (default 3080)
 *   GAME_DATA   data dir (default ~/.dsh-games)
 *
 * Deploy: `docker compose up -d --build` (see Dockerfile) or
 * `node lib/server.js` on any node >= 22 host.
 * @module @kasidia/dsh-games/server
 */
export {};
//# sourceMappingURL=server-entry.d.ts.map