/**
 * dsh-games browser API — same-origin `/api/games/*` endpoints on the DSH
 * host for personal state (tokens/crowns/display/settings), plus the
 * game-server API (rules, rooms, custom pets) which the client talks to at a
 * configurable base URL — the standalone deployed server, or the host's own
 * in-process mount when `serverUrl` is empty.
 *
 * When the plugin is configured with an `authToken`, protected game-server
 * requests carry it as a Bearer token. Plain img tags cannot attach headers,
 * so authenticated pet image GETs retain a query-token compatibility path.
 * @module @linxin666/dsh-games/client/api
 */

import type { MemberPhase } from '../rooms.ts'

/** Meta of the user's custom pet image (mirrored by the host). */
export interface PetMeta {
  ext: 'png' | 'gif'
  version: number
  width: number
  height: number
}

/** Crown rules served by the game server (see gameconfig.ts). */
export interface CrownRules {
  tokenStep: number
  base: number
  levels: string[]
}

/** Pet upload rules served by the game server. */
export interface PetRules {
  maxBytes: number
  maxDimension: number
}

/** The rule set the game server enforces. */
export interface GameRules {
  crown: CrownRules
  pet: PetRules
}

/** Own-state snapshot (host `/api/games/state`). */
export interface GamesState {
  memberId: string
  nickname: string
  tokens: number
  /** Crown units (tokens / crownTokenStep, floored). */
  crownUnits: number
  /** Crown counts per level, lowest first (host fallback; server rules win). */
  crowns: number[]
  phase: MemberPhase
  /** Short output-activity window refreshed by assistant stream events. */
  tokenActiveUntil: number
  /** Tokens per bronze crown (host fallback). */
  crownTokenStep: number
  /** Master switch (false hides the pet and stops counting). */
  enabled: boolean
  /** Built-in pet pattern variant. */
  petVariant: string
  /** Game-server base URL ('' = same-origin). */
  serverUrl: string
  /** Game-server shared secret ('' = open server). */
  authToken: string
  /** Uploaded custom pet image meta, when set. */
  pet?: PetMeta
  serverTime: number
  display: {
    visible: boolean
    size: number
    right: number
    bottom: number
    locked: boolean
  }
}

/** One room member as the room snapshot exposes it. */
export interface RoomMemberView {
  memberId: string
  nickname: string
  tokens: number
  crowns: number[]
  hats: number
  phase: MemberPhase
  /** True while the member is currently receiving model output. */
  active?: boolean
  joinedAt: number
  lastSeen: number
  petUrl?: string
  petVersion?: number
  /** Built-in pet pattern variant the member's whale renders in. */
  petVariant?: string
  /** The member's floating-pet size (px), for the room pet scene. */
  size?: number
}

/** One chat message a member sent (bubbles show for a few seconds). */
export interface RoomMessageView {
  memberId: string
  nickname: string
  text: string
  at: number
}

/** Room snapshot. */
export interface RoomView {
  protocolVersion: 3
  code: string
  name: string
  public: boolean
  createdAt: number
  members: RoomMemberView[]
  messages: RoomMessageView[]
}

/** Generic JSON envelope from the games API. */
export interface GamesEnvelope<T> {
  ok: true
  [key: string]: unknown
}

/** A joined room the browser tracks: game-server base + code. */
export interface JoinedRoom {
  /** Game-server base URL the room lives on. */
  base: string
  code: string
  /** Opaque member-session bearer for heartbeat, chat, and leave. */
  memberToken: string
  name: string
  public: boolean
  members: RoomMemberView[]
  /** True while the latest poll/heartbeat failed (transient). */
  offline: boolean
  /** Human-readable join error, if the room was rejected. */
  error?: string
}

/** Normalize a game-server base URL (strip trailing slashes). */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed === '' ? trimmed : trimmed
}

/** Normalize a room code (trim + uppercase). */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Add the shared game-server Bearer without disturbing caller headers. */
function serverAuth(authToken: string, init: RequestInit = {}): RequestInit {
  if (authToken === '') return init
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${authToken}`)
  return { ...init, headers }
}

/** Structured HTTP failure from the game server. */
export class GameServerError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, code?: string, detail = '') {
    super(`HTTP ${status}${code === undefined ? (detail === '' ? '' : `: ${detail}`) : `: ${code}`}`)
    this.name = 'GameServerError'
    this.status = status
    this.code = code
  }
}

async function responseError(response: Response): Promise<GameServerError> {
  const text = await response.text().catch(() => '')
  let code: string | undefined
  if (text !== '') {
    try {
      const parsed = JSON.parse(text) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error !== '') code = parsed.error
    } catch {
      // Non-JSON failures retain a short response excerpt for diagnostics.
    }
  }
  return new GameServerError(response.status, code, text.slice(0, 120))
}

/** Bound every room/server request so one stalled fetch cannot freeze polling forever. */
export const REQUEST_TIMEOUT_MS = 10_000

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const sourceSignal = init?.signal
  const forwardAbort = (): void => {
    controller.abort(sourceSignal?.reason)
  }
  if (sourceSignal?.aborted === true) forwardAbort()
  else sourceSignal?.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
    sourceSignal?.removeEventListener('abort', forwardAbort)
  }
}

function jsonInit(body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  }
}

function memberHeaders(memberToken: string): Record<string, string> {
  return { 'x-dsh-member-token': memberToken }
}

export interface MemberReport {
  memberId: string
  nickname: string
  tokens: number
  crowns: number[]
  phase: MemberPhase
  active?: boolean
  petUrl?: string
  petVersion?: number
  petVariant?: string
  size?: number
}

/** The browser-facing host API (same-origin personal state). */
export const gamesApi = {
  state(): Promise<GamesState> {
    return request('/api/games/state')
  },
  setNickname(name: string): Promise<{ ok: boolean }> {
    return request('/api/games/nickname', jsonInit({ name }))
  },
  boost(tokens: number): Promise<{ ok: true; tokens: number; crownUnits: number; crowns: number[] }> {
    return request('/api/games/boost', jsonInit({ tokens }))
  },
  setDisplay(patch: {
    right?: number
    bottom?: number
    size?: number
    visible?: boolean
    locked?: boolean
  }): Promise<{ ok: true }> {
    return request('/api/games/display', jsonInit(patch))
  },
  config(patch: {
    nickname?: string
    crownTokenStep?: number
    enabled?: boolean
    petVariant?: string
    serverUrl?: string
    authToken?: string
  }): Promise<{ ok: boolean }> {
    return request('/api/games/config', jsonInit(patch))
  },
  setPetMeta(pet: PetMeta | null): Promise<{ ok: boolean }> {
    return request('/api/games/pet-meta', jsonInit({ pet }))
  },
  clearPetMeta(): Promise<{ ok: boolean }> {
    return request('/api/games/pet-meta', { method: 'DELETE' })
  },
}

/** The absolute base URL a member's pet image is served from. */
export function petBaseUrl(serverUrl: string): string {
  const normalized = normalizeServerUrl(serverUrl)
  return normalized === '' ? window.location.origin : normalized
}

/** Absolute URL of the user's custom pet image on the game server. */
export function petImageUrl(serverUrl: string, memberId: string, pet: PetMeta, authToken: string): string {
  // `v` and `token` share one query string — a naive `?v=…` + `?token=…`
  // concatenation would swallow the token into the `v` value and 401.
  const query = authToken === '' ? `?v=${pet.version}` : `?v=${pet.version}&token=${encodeURIComponent(authToken)}`
  return `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}${query}`
}

/** Cross-origin game-server endpoints (rules + rooms + pets on the shared server). */
export const gameServerApi = {
  /** Absolute base for one game server ('' = the host's in-process mount). */
  base(serverUrl: string): string {
    return petBaseUrl(serverUrl)
  },
  rules(serverUrl: string, authToken: string): Promise<{ ok: true; rules: GameRules }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rules`, serverAuth(authToken))
  },
  listRooms(serverUrl: string, authToken: string): Promise<{ ok: true; rooms: RoomView[] }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rooms`, serverAuth(authToken))
  },
  createRoom(
    serverUrl: string,
    authToken: string,
    options: { name?: string; public?: boolean },
  ): Promise<{ ok: true; room: RoomView }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms`,
      serverAuth(authToken, jsonInit(options)),
    )
  },
  state(serverUrl: string, authToken: string, code: string): Promise<{ ok: true; room: RoomView }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/state`,
      serverAuth(authToken),
    )
  },
  join(
    serverUrl: string,
    authToken: string,
    code: string,
    member: MemberReport,
  ): Promise<{ ok: true; room: RoomView; memberToken: string }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/join`,
      serverAuth(authToken, jsonInit({ member })),
    )
  },
  heartbeat(
    serverUrl: string,
    authToken: string,
    code: string,
    memberToken: string,
    member: MemberReport,
    signal?: AbortSignal,
  ): Promise<{ ok: true; room: RoomView }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members`,
      serverAuth(authToken, jsonInit({ member }, memberHeaders(memberToken), signal)),
    )
  },
  leave(
    serverUrl: string,
    authToken: string,
    code: string,
    memberId: string,
    memberToken: string,
  ): Promise<{ ok: true; removed: boolean }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}`,
      serverAuth(authToken, { method: 'DELETE', headers: memberHeaders(memberToken) }),
    )
  },
  sendMessage(
    serverUrl: string,
    authToken: string,
    code: string,
    memberToken: string,
    message: { memberId: string; text: string },
  ): Promise<{ ok: true; room: RoomView }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/messages`,
      serverAuth(authToken, jsonInit({ message }, memberHeaders(memberToken))),
    )
  },
  async uploadPet(
    serverUrl: string,
    authToken: string,
    memberId: string,
    file: Blob,
  ): Promise<{ ok: true; pet: PetMeta }> {
    const response = await fetch(
      `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}`,
      serverAuth(authToken, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      }),
    )
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as { ok: true; pet: PetMeta }
  },
  removePet(serverUrl: string, authToken: string, memberId: string): Promise<{ ok: true; removed: boolean }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}`,
      serverAuth(authToken, { method: 'DELETE' }),
    )
  },
}

/** localStorage seat for the authenticated room session (survives reloads). */
const ROOM_STORAGE_KEY = 'dsh.games.room.v3'
const LEGACY_ROOM_STORAGE_KEYS = ['dsh.games.room.v1', 'dsh.games.room.v2'] as const

function clearLegacyRoomStorage(): void {
  for (const key of LEGACY_ROOM_STORAGE_KEYS) localStorage.removeItem(key)
}

export function loadStoredRoom(): { base: string; code: string; memberToken: string } | undefined {
  try {
    const raw = localStorage.getItem(ROOM_STORAGE_KEY)
    clearLegacyRoomStorage()
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as { base?: unknown; code?: unknown; memberToken?: unknown }
    if (typeof parsed.base !== 'string' ||
        typeof parsed.code !== 'string' ||
        typeof parsed.memberToken !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(parsed.memberToken)) {
      localStorage.removeItem(ROOM_STORAGE_KEY)
      return undefined
    }
    return {
      base: parsed.base,
      code: normalizeRoomCode(parsed.code),
      memberToken: parsed.memberToken,
    }
  } catch {
    try {
      localStorage.removeItem(ROOM_STORAGE_KEY)
      clearLegacyRoomStorage()
    } catch {
      // Ignore.
    }
    return undefined
  }
}

export function storeRoom(base: string, code: string, memberToken: string): void {
  try {
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({
      base: normalizeServerUrl(base),
      code: normalizeRoomCode(code),
      memberToken,
    }))
    clearLegacyRoomStorage()
  } catch {
    // Storage failure must not break room play.
  }
}

export function clearStoredRoom(): void {
  try {
    localStorage.removeItem(ROOM_STORAGE_KEY)
    clearLegacyRoomStorage()
  } catch {
    // Ignore.
  }
}
