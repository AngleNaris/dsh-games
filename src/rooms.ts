/**
 * Room store — in-memory multiplayer rooms. One DSH host owns the rooms it
 * creates; every player (including the host's own browser) heartbeats its
 * member state into the room, and every player polls the room snapshot.
 * Members are removed after a heartbeat timeout; empty rooms expire.
 *
 * Rooms are either **public** (listed on the host's room list, anyone can
 * join) or **invite-only** (joinable only by code, invisible in the list).
 * @module @linxin666/dsh-games/rooms
 */

/** Player activity phases mirrored from the harness activity tracker. */
export type MemberPhase = 'idle' | 'waiting' | 'thinking' | 'tool' | 'done'

/** The phases the room protocol accepts (unknown phases are coerced to idle). */
export const KNOWN_PHASES: readonly MemberPhase[] = ['idle', 'waiting', 'thinking', 'tool', 'done']

/** Number of crown levels a member may report (see crowns.ts). */
export const CROWN_LEVEL_COUNT = 10

/** What a client reports about itself. */
export interface MemberReport {
  memberId: string
  nickname: string
  tokens: number
  /** Crown counts per level (lowest first); absent for legacy clients. */
  crowns?: number[]
  /** Legacy hat count (prototype-era clients). */
  hats?: number
  phase: string
  /** Absolute URL of the member's custom pet image on their own host. */
  petUrl?: string
  /** Cache-busting version of the pet image. */
  petVersion?: number
  /** Built-in pet pattern variant the member's whale renders in. */
  petVariant?: string
  /** The member's floating-pet size (px), for the room pet scene. */
  size?: number
}

/** One member as the room exposes it. */
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
  petVariant?: string
  size?: number
}

/** Room snapshot. */
export interface RoomView {
  code: string
  /** Optional human-readable room name. */
  name: string
  /** Public rooms appear on the room list; invite-only rooms are code-only. */
  public: boolean
  createdAt: number
  members: RoomMemberView[]
}

/** Room creation options. */
export interface CreateRoomOptions {
  name?: string
  public?: boolean
}

interface Room {
  code: string
  name: string
  public: boolean
  createdAt: number
  members: Map<string, RoomMemberView>
}

/** Room store options. */
export interface RoomStoreOptions {
  /** Heartbeat timeout before a member is swept, ms. */
  memberTtlMs?: number
  /** Empty-room expiry, ms. */
  roomTtlMs?: number
  /** Member cap per room. */
  maxMembers?: number
}

export const DEFAULT_MEMBER_TTL_MS = 20_000
export const DEFAULT_ROOM_TTL_MS = 10 * 60_000
export const DEFAULT_MAX_MEMBERS = 32
export const ROOM_NAME_MAX_LENGTH = 24

/** Room code alphabet: no 0/O/1/I to keep codes easy to read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4
const CODE_MAX_ATTEMPTS = 8

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

/** Normalize an external phase string into the known phase set. */
export function normalizePhase(phase: unknown): MemberPhase {
  return typeof phase === 'string' && (KNOWN_PHASES as readonly string[]).includes(phase)
    ? phase as MemberPhase
    : 'idle'
}

/** Clamp a number into [0, max] (non-finite -> fallback). */
function clampNum(value: unknown, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.round(value)))
    : fallback
}

/** Validate a room code string (normalized to uppercase). */
export function normalizeCode(raw: string): string | undefined {
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z2-9]{4}$/.test(code)) return undefined
  return code
}

/** Normalize a room name (trimmed, capped). */
export function normalizeRoomName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, ROOM_NAME_MAX_LENGTH)
}

/** Validate a member pet URL (bounded length, http(s) only). */
function normalizePetUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const url = raw.trim()
  if (url === '' || url.length > 512) return undefined
  if (!/^https?:\/\//i.test(url)) return undefined
  return url
}

/** Validate a pet pattern variant id (bounded short string). */
function normalizePetVariant(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const variant = raw.trim()
  if (variant === '' || variant.length > 32 || !/^[a-z0-9-]+$/.test(variant)) return undefined
  return variant
}

/** Member pet size bounds (mirror the client display clamp). */
export const MEMBER_SIZE_MIN = 24
export const MEMBER_SIZE_MAX = 512

/** Validate a member crowns array (10 counts, clamped). */
function normalizeCrowns(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const counts = new Array<number>(CROWN_LEVEL_COUNT).fill(0)
  let valid = false
  for (let i = 0; i < Math.min(raw.length, CROWN_LEVEL_COUNT); i += 1) {
    const value = raw[i]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (value !== 0) valid = true
    counts[i] = Math.max(0, Math.round(value))
  }
  return valid ? counts : undefined
}

/**
 * In-memory room registry. Not persisted: rooms are demo-time constructs that
 * live while their host process runs and their members keep heartbeating.
 */
export class RoomStore {
  private readonly rooms = new Map<string, Room>()
  private readonly memberTtlMs: number
  private readonly roomTtlMs: number
  private readonly maxMembers: number

  constructor(options: RoomStoreOptions = {}) {
    this.memberTtlMs = options.memberTtlMs ?? DEFAULT_MEMBER_TTL_MS
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS
    this.maxMembers = options.maxMembers ?? DEFAULT_MAX_MEMBERS
  }

  /** Create a room with a fresh, collision-free code. */
  createRoom(options: CreateRoomOptions = {}, now: number = Date.now()): RoomView {
    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt += 1) {
      const code = randomCode()
      if (this.rooms.has(code)) continue
      const room: Room = {
        code,
        name: normalizeRoomName(options.name),
        public: options.public !== false,
        createdAt: now,
        members: new Map(),
      }
      this.rooms.set(code, room)
      return this.viewOf(room)
    }
    // Astronomically unlikely; fall back to a timestamp-scoped code.
    const code = `T${String(Date.now() % 10000).padStart(4, '0')}`
    const room: Room = {
      code,
      name: normalizeRoomName(options.name),
      public: options.public !== false,
      createdAt: now,
      members: new Map(),
    }
    this.rooms.set(code, room)
    return this.viewOf(room)
  }

  /** Read a room snapshot by code (normalized). */
  getRoom(code: string): RoomView | undefined {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return undefined
    const room = this.rooms.get(normalized)
    return room === undefined ? undefined : this.viewOf(room)
  }

  /** All public rooms (the room list; invite-only rooms stay hidden). */
  listPublicRooms(): RoomView[] {
    const rooms = [...this.rooms.values()].filter((room) => room.public)
    return rooms
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => this.viewOf(room))
  }

  /**
   * Upsert one member heartbeat. Returns the room snapshot, or undefined when
   * the room does not exist (or is full for a fresh member).
   */
  upsertMember(code: string, report: MemberReport, now: number = Date.now()): RoomView | undefined {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return undefined
    const room = this.rooms.get(normalized)
    if (room === undefined) return undefined
    const existing = room.members.get(report.memberId)
    if (existing === undefined && room.members.size >= this.maxMembers) return undefined
    const crowns = normalizeCrowns(report.crowns)
    const member: RoomMemberView = {
      memberId: report.memberId,
      nickname: report.nickname,
      tokens: clampNum(report.tokens, Number.MAX_SAFE_INTEGER, existing?.tokens ?? 0),
      crowns: crowns ?? existing?.crowns ?? new Array<number>(CROWN_LEVEL_COUNT).fill(0),
      hats: crowns === undefined
        ? clampNum(report.hats, Number.MAX_SAFE_INTEGER, existing?.hats ?? 0)
        : crowns.reduce((sum, count) => sum + count, 0),
      phase: normalizePhase(report.phase),
      joinedAt: existing?.joinedAt ?? now,
      lastSeen: now,
      petVariant: normalizePetVariant(report.petVariant) ?? existing?.petVariant,
      size: typeof report.size === 'number' && Number.isFinite(report.size)
        ? Math.min(MEMBER_SIZE_MAX, Math.max(MEMBER_SIZE_MIN, Math.round(report.size)))
        : existing?.size,
      ...(report.petUrl !== undefined || existing?.petUrl !== undefined
        ? { petUrl: report.petUrl !== undefined ? normalizePetUrl(report.petUrl) ?? undefined : existing?.petUrl }
        : {}),
      ...(report.petVersion !== undefined || existing?.petVersion !== undefined
        ? { petVersion: report.petVersion ?? existing?.petVersion }
        : {}),
    }
    room.members.set(report.memberId, member)
    return this.viewOf(room)
  }

  /** Remove one member; true when a member was removed. */
  removeMember(code: string, memberId: string): boolean {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return false
    const room = this.rooms.get(normalized)
    if (room === undefined) return false
    return room.members.delete(memberId)
  }

  /** Sweep stale members and expired empty rooms. */
  sweep(now: number = Date.now()): void {
    for (const [code, room] of this.rooms) {
      for (const [memberId, member] of room.members) {
        if (now - member.lastSeen > this.memberTtlMs) room.members.delete(memberId)
      }
      if (room.members.size === 0 && now - room.createdAt > this.roomTtlMs) {
        this.rooms.delete(code)
      }
    }
  }

  private viewOf(room: Room): RoomView {
    return {
      code: room.code,
      name: room.name,
      public: room.public,
      createdAt: room.createdAt,
      members: [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt),
    }
  }
}
