/**
 * dsh-games browser API — same-origin `/api/games/*` JSON endpoints for the
 * host service, plus cross-origin room endpoints for remote rooms.
 * @module @linxin666/dsh-games/client/api
 */

import type { MemberPhase } from '../rooms.ts'

/** Own-state snapshot (host `/api/games/state`). */
export interface GamesState {
  memberId: string
  nickname: string
  tokens: number
  hats: number
  phase: MemberPhase
  hatTokenStep: number
  /** Master switch (false hides the pet and stops counting). */
  enabled: boolean
  serverTime: number
  display: {
    visible: boolean
    size: number
    right: number
    bottom: number
  }
}

/** One room member as the room snapshot exposes it. */
export interface RoomMemberView {
  memberId: string
  nickname: string
  tokens: number
  hats: number
  phase: MemberPhase
  joinedAt: number
  lastSeen: number
}

/** Room snapshot. */
export interface RoomView {
  code: string
  createdAt: number
  members: RoomMemberView[]
}

/** Generic JSON envelope from the games API. */
export interface GamesEnvelope<T> {
  ok: true
  [key: string]: unknown
}

/** A joined room the browser tracks: server origin + code. */
export interface JoinedRoom {
  url: string
  code: string
  members: RoomMemberView[]
  /** True while the latest poll/heartbeat failed (transient). */
  offline: boolean
  /** Human-readable join error, if the room was rejected. */
  error?: string
}

/** Normalize a room server URL (strip trailing slash / path). */
export function normalizeRoomUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed === '' ? trimmed : trimmed
}

/** Normalize a room code (trim + uppercase). */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
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

/** The browser-facing host API (same-origin). */
export const gamesApi = {
  state(): Promise<GamesState> {
    return request('/api/games/state')
  },
  setNickname(name: string): Promise<{ ok: boolean }> {
    return request('/api/games/nickname', jsonInit({ name }))
  },
  boost(tokens: number): Promise<{ ok: true; tokens: number; hats: number }> {
    return request('/api/games/boost', jsonInit({ tokens }))
  },
  setDisplay(patch: { right?: number; bottom?: number; size?: number; visible?: boolean }): Promise<{ ok: true }> {
    return request('/api/games/display', jsonInit(patch))
  },
  config(patch: { nickname?: string; hatTokenStep?: number; enabled?: boolean }): Promise<{ ok: boolean }> {
    return request('/api/games/config', jsonInit(patch))
  },
  createRoom(): Promise<{ ok: true; room: RoomView }> {
    return request('/api/games/rooms', jsonInit({}))
  },
}

/** Cross-origin room endpoints (any player's browser can reach any room server). */
export const roomApi = {
  state(url: string, code: string): Promise<{ ok: true; room: RoomView }> {
    return request(`${normalizeRoomUrl(url)}/api/games/rooms/${encodeURIComponent(code)}/state`)
  },
  heartbeat(url: string, code: string, member: {
    memberId: string
    nickname: string
    tokens: number
    hats: number
    phase: MemberPhase
  }): Promise<{ ok: true; room: RoomView }> {
    return request(`${normalizeRoomUrl(url)}/api/games/rooms/${encodeURIComponent(code)}/members`, jsonInit({ member }))
  },
  leave(url: string, code: string, memberId: string): Promise<{ ok: true; removed: boolean }> {
    return request(`${normalizeRoomUrl(url)}/api/games/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
    })
  },
}

/** localStorage seat for the joined room (survives page reloads). */
const ROOM_STORAGE_KEY = 'dsh.games.room.v1'

export function loadStoredRoom(): { url: string; code: string } | undefined {
  try {
    const raw = localStorage.getItem(ROOM_STORAGE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as { url?: unknown; code?: unknown }
    if (typeof parsed.url !== 'string' || typeof parsed.code !== 'string') return undefined
    return { url: parsed.url, code: parsed.code }
  } catch {
    return undefined
  }
}

export function storeRoom(url: string, code: string): void {
  try {
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ url, code }))
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
