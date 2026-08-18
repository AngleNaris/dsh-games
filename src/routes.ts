/**
 * Games HTTP routes (host half) — the browser talks to its own DSH host for
 * personal state (`/api/games/state`, nickname, boost, display, config, pet
 * meta), and to the **game server** for everything multiplayer: the shared
 * room + pet surface from gameserver.ts is mounted in-process under
 * `/api/games/rooms*` and `/api/games/pets*` so local prototype play works
 * without a separate deployment. The standalone `lib/server.js` serves that
 * same surface in Docker.
 * @module @anglenaris/dsh-games/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { GamesService } from './service.ts'
import {
  handleGameServer,
  HEALTH_API_PATH,
  PET_API_PREFIX,
  ROOM_API_PREFIX,
  RULES_API_PATH,
} from './gameserver.ts'

/** Browser-facing base path of the games API. */
export const GAMES_API_PREFIX = '/api/games'

/** Re-exported shared-surface prefixes (browser consumers). */
export { PET_API_PREFIX, ROOM_API_PREFIX } from './gameserver.ts'

/** Write one JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    let overflowed = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return
      size += chunk.length
      if (size > 64 * 1024) {
        overflowed = true
        reject(new Error('body-too-large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (overflowed) return
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', (error) => {
      if (!overflowed) reject(error)
    })
  })
}

/** One GET JSON route. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (!requireMethod(req, res, 'GET')) return
      run().then((value) => json(res, 200, value), (error) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** One POST JSON route (body passed through). */
function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      return readJsonBody(req).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          (value) => json(res, 200, value),
          (error) => {
            json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          },
        )
      }, (error) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** Adapter: mount the shared game-server handler as a CORS-open prefix route. */
function sharedRoute(prefix: string, service: GamesService): WebRoute {
  return {
    kind: 'prefix',
    path: prefix,
    handler: (req: IncomingMessage, res: ServerResponse): void | Promise<void> => {
      return handleGameServer(req, res, {
        rooms: service.rooms(),
        pets: service.pets(),
        rules: service.gameRules(),
        // The host's in-process mount enforces auth only when the plugin is
        // configured with a token (same value the browser sends to the game
        // server); '' keeps the local prototype open.
        ...(service.authToken() !== '' ? { authToken: service.authToken() } : {}),
      })
    },
  }
}

/** Build the full route family for one games service. */
export function makeGamesRoutes(service: GamesService): WebRoute[] {
  return [
    getRoute(`${GAMES_API_PREFIX}/state`, () => service.state()),
    postRoute(`${GAMES_API_PREFIX}/nickname`, (body) => {
      const name = body.name
      if (typeof name !== 'string') return Promise.reject(new Error('invalid-name'))
      return service.setNickname(name)
    }),
    postRoute(`${GAMES_API_PREFIX}/boost`, (body) => {
      const tokens = body.tokens
      if (typeof tokens !== 'number') return Promise.reject(new Error('invalid-boost'))
      return service.boost(tokens)
    }),
    postRoute(`${GAMES_API_PREFIX}/display`, (body) => service.setDisplay({
      ...(typeof body.visible === 'boolean' ? { visible: body.visible } : {}),
      ...(typeof body.size === 'number' ? { size: body.size } : {}),
      ...(typeof body.right === 'number' ? { right: body.right } : {}),
      ...(typeof body.bottom === 'number' ? { bottom: body.bottom } : {}),
      ...(typeof body.locked === 'boolean' ? { locked: body.locked } : {}),
    })),
    postRoute(`${GAMES_API_PREFIX}/config`, (body) => service.setConfig({
      ...(typeof body.nickname === 'string' ? { nickname: body.nickname } : {}),
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(typeof body.petVariant === 'string' ? { petVariant: body.petVariant } : {}),
      ...(typeof body.serverUrl === 'string' ? { serverUrl: body.serverUrl } : {}),
      ...(typeof body.authToken === 'string' ? { authToken: body.authToken } : {}),
    })),
    // POST sets the host mirror of the uploaded pet meta; DELETE (or POST
    // with `pet: null`) clears it. One exact route, method-dispatched.
    {
      kind: 'exact',
      path: `${GAMES_API_PREFIX}/pet-meta`,
      handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (req.method === 'DELETE') {
          return service.setPetMeta(undefined).then(
            (value) => json(res, 200, value),
            (error) => {
              json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
            },
          )
        }
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'method-not-allowed' })
          return Promise.resolve()
        }
        return readJsonBody(req).then((body) => {
          const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
          const pet = record.pet
          if (pet === null || pet === undefined) return service.setPetMeta(undefined)
          if (typeof pet !== 'object') return Promise.reject(new Error('invalid-pet-meta'))
          const meta = pet as Record<string, unknown>
          if (meta.ext !== 'png' && meta.ext !== 'gif') return Promise.reject(new Error('invalid-pet-meta'))
          if (typeof meta.version !== 'number' || typeof meta.width !== 'number' || typeof meta.height !== 'number') {
            return Promise.reject(new Error('invalid-pet-meta'))
          }
          return service.setPetMeta({
            ext: meta.ext,
            version: meta.version,
            width: meta.width,
            height: meta.height,
          })
        }).then(
          (value) => json(res, 200, value),
          (error) => {
            json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          },
        )
      },
    },
    // The shared multiplayer surface: rooms + pets (CORS-open, same code as
    // the standalone game server in Docker).
    sharedRoute(ROOM_API_PREFIX, service),
    sharedRoute(PET_API_PREFIX, service),
    {
      // The rule set the shared surface enforces (defaults on the host mount;
      // the standalone server reads its config.json).
      kind: 'exact',
      path: RULES_API_PATH,
      handler: (req: IncomingMessage, res: ServerResponse): void | Promise<void> => {
        return handleGameServer(req, res, {
          rooms: service.rooms(),
          pets: service.pets(),
          rules: service.gameRules(),
          ...(service.authToken() !== '' ? { authToken: service.authToken() } : {}),
        })
      },
    },
    {
      kind: 'exact',
      path: HEALTH_API_PATH,
      handler: (req: IncomingMessage, res: ServerResponse): void | Promise<void> => {
        return handleGameServer(req, res, {
          rooms: service.rooms(),
          pets: service.pets(),
          rules: service.gameRules(),
          ...(service.authToken() !== '' ? { authToken: service.authToken() } : {}),
        })
      },
    },
  ]
}
