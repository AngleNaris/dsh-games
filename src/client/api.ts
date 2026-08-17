/**
 * dsh-games browser API — same-origin `/api/games/*` endpoints on the DSH
 * host for personal state (tokens/crowns/display/settings), plus the
 * game-server API (rules, rooms, custom pets) which the client talks to at a
 * configurable base URL — the standalone deployed server, or the host's own
 * in-process mount when `serverUrl` is empty.
 *
 * When the plugin is configured with an `authToken`, every game-server
 * request carries it as `?token=…` (query param, so plain `<img>` tags can
 * load pet images too); a server with a configured secret rejects requests
 * without it.
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
  joinedAt: number
  lastSeen: number
  petUrl?: string
  petVersion?: number
  /** Built-in pet pattern variant the member's whale renders in. */
  petVariant?: string
  /** The member's floating-pet size (px), for the room pet scene. */
  size?: number
}

/** Room snapshot. */
export interface RoomView {
  code: string
  name: string
  public: boolean
  createdAt: number
  members: RoomMemberView[]
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

/** Append the auth token query param when the server is locked. */
export function authQuery(authToken: string): string {
  return authToken === '' ? '' : `?token=${encodeURIComponent(authToken)}`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${text === '' ? '' : `: ${text.slice(0, 120)}`}`)
  }
  return (await response.json()) as T
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
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
  return `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}?v=${pet.version}${authQuery(authToken)}`
}

/** Cross-origin game-server endpoints (rules + rooms + pets on the shared server). */
export const gameServerApi = {
  /** Absolute base for one game server ('' = the host's in-process mount). */
  base(serverUrl: string): string {
    return petBaseUrl(serverUrl)
  },
  rules(serverUrl: string, authToken: string): Promise<{ ok: true; rules: GameRules }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rules${authQuery(authToken)}`)
  },
  listRooms(serverUrl: string, authToken: string): Promise<{ ok: true; rooms: RoomView[] }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rooms${authQuery(authToken)}`)
  },
  createRoom(
    serverUrl: string,
    authToken: string,
    options: { name?: string; public?: boolean },
  ): Promise<{ ok: true; room: RoomView }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rooms${authQuery(authToken)}`, jsonInit(options))
  },
  state(serverUrl: string, authToken: string, code: string): Promise<{ ok: true; room: RoomView }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/state${authQuery(authToken)}`)
  },
  heartbeat(serverUrl: string, authToken: string, code: string, member: {
    memberId: string
    nickname: string
    tokens: number
    crowns: number[]
    phase: MemberPhase
    petUrl?: string
    petVersion?: number
    petVariant?: string
    size?: number
  }): Promise<{ ok: true; room: RoomView }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members${authQuery(authToken)}`,
      jsonInit({ member }),
    )
  },
  leave(serverUrl: string, authToken: string, code: string, memberId: string): Promise<{ ok: true; removed: boolean }> {
    return request(
      `${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}${authQuery(authToken)}`,
      { method: 'DELETE' },
    )
  },
  async uploadPet(
    serverUrl: string,
    authToken: string,
    memberId: string,
    file: Blob,
  ): Promise<{ ok: true; pet: PetMeta }> {
    const response = await fetch(
      `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}${authQuery(authToken)}`,
      {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      },
    )
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}${text === '' ? '' : `: ${text.slice(0, 120)}`}`)
    }
    return (await response.json()) as { ok: true; pet: PetMeta }
  },
  removePet(serverUrl: string, authToken: string, memberId: string): Promise<{ ok: true; removed: boolean }> {
    return request(`${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}${authQuery(authToken)}`, {
      method: 'DELETE',
    })
  },
}

/** localStorage seat for the joined room (survives page reloads). */
const ROOM_STORAGE_KEY = 'dsh.games.room.v1'

export function loadStoredRoom(): { base: string; code: string } | undefined {
  try {
    const raw = localStorage.getItem(ROOM_STORAGE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as { base?: unknown; url?: unknown; code?: unknown }
    const base = typeof parsed.base === 'string'
      ? parsed.base
      : typeof parsed.url === 'string' ? parsed.url : ''
    if (typeof parsed.code !== 'string') return undefined
    return { base, code: parsed.code }
  } catch {
    return undefined
  }
}

export function storeRoom(base: string, code: string): void {
  try {
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ base, code }))
  } catch {
    // Storage failure must not break room play.
  }
}

export function clearStoredRoom(): void {
  try {
    localStorage.removeItem(ROOM_STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
