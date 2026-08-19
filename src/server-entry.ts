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

import { createServer } from 'node:http'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { handleGameServer } from './gameserver.ts'
import { loadGameServerConfig } from './gameconfig.ts'
import { PetStore } from './pets.ts'
import { RoomStore } from './rooms.ts'
import { AntiCheatGuard } from './anticheat.ts'

const host = process.env.GAME_HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.GAME_PORT ?? '3080', 10)
const dataDir = process.env.GAME_DATA ?? join(homedir(), '.dsh-games')

const config = loadGameServerConfig(dataDir)
const antiCheat = new AntiCheatGuard({
  rules: config.crown,
  policy: config.antiCheat,
  stateFile: join(dataDir, 'anticheat.json'),
})
const rooms = new RoomStore({ antiCheat })
const pets = new PetStore(join(dataDir, 'pets'))

const server = createServer((req, res) => {
  const result = handleGameServer(req, res, {
    rooms,
    pets,
    rules: { crown: config.crown, pet: config.pet },
    ...(config.authToken !== undefined ? { authToken: config.authToken } : {}),
  })
  if (result instanceof Promise) {
    result.catch((error) => {
      // The handler always writes its own error responses; this is a
      // last-resort guard for unexpected throws.
      if (!res.writableEnded) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
      }
    })
  }
})

// Same sweep cadence as the host-mounted store: stale members leave, empty
// public rooms expire so the room list stays fresh.
const sweepTimer = setInterval(() => rooms.sweep(), 10_000)
sweepTimer.unref?.()

let stopping = false
function shutdown(signal: string): void {
  if (stopping) return
  stopping = true
  clearInterval(sweepTimer)
  rooms.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5_000).unref()
  console.log(`[dsh-games-server] stopping on ${signal}`)
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.listen(port, host, () => {
  console.log(`[dsh-games-server] listening on http://${host}:${port} (data: ${dataDir})`)
  console.log(`[dsh-games-server] crown: ${config.crown.tokenStep} tokens/crown, base ${config.crown.base}, ${config.crown.levels.length} levels`)
  console.log(`[dsh-games-server] pet: max ${config.pet.maxBytes} bytes, ${config.pet.maxDimension}px`)
  console.log(`[dsh-games-server] anti-cheat: ${config.antiCheat.burstTokens} burst, ${config.antiCheat.tokensPerMinute}/min, ${config.antiCheat.strikeLimit} strikes`)
  console.log(config.authToken !== undefined
    ? '[dsh-games-server] auth: ENABLED — protected requests require Authorization: Bearer'
    : '[dsh-games-server] auth: DISABLED — set authToken in config.json to lock the server')
})
