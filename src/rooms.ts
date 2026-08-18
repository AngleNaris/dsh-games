/**
 * Room store — in-memory multiplayer rooms. One DSH host owns the rooms it
 * creates; every player (including the host's own browser) heartbeats its
 * member state into the room, and every player polls the room snapshot.
 * Members are removed after a heartbeat timeout; empty rooms expire.
 *
 * Rooms are either **public** (listed on the host's room list, anyone can
 * join) or **invite-only** (joinable only by code, invisible in the list).
 * @module @anglenaris/dsh-games/rooms
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AntiCheatError, AntiCheatGuard } from './anticheat.ts'

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
  /** True while this member is receiving model output. */
  active?: boolean
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
  active: boolean
  joinedAt: number
  lastSeen: number
  petUrl?: string
  petVersion?: number
  petVariant?: string
  size?: number
}

/** One chat message a member sent (bubbles show for a few seconds). */
export interface RoomMessageView {
  memberId: string
  nickname: string
  text: string
  /** Epoch ms the message was sent. */
  at: number
}

/** Room snapshot. */
export interface RoomView {
  /** Wire contract version for member authentication and report validation. */
  protocolVersion: 3
  code: string
  /** Optional human-readable room name. */
  name: string
  /** Public rooms appear on the room list; invite-only rooms are code-only. */
  public: boolean
  createdAt: number
  members: RoomMemberView[]
  /** Recent chat messages (kept briefly so 3s polls never miss one). */
  messages: RoomMessageView[]
}

/** Successful join result; the token is returned only to the joining client. */
export type JoinMemberResult =
  | { ok: true; room: RoomView; memberToken: string }
  | { ok: false; error: AntiCheatError | 'member-conflict' | 'room-full' | 'room-not-found' }

/** Outcome of an authenticated member heartbeat. */
export type HeartbeatMemberResult =
  | { ok: true; room: RoomView }
  | { ok: false; error: AntiCheatError | 'member-not-found' | 'room-not-found' | 'unauthorized' }

/** Outcome of an authenticated member removal. */
export type RemoveMemberResult =
  | { ok: true; removed: true }
  | { ok: false; error: 'invalid' | 'member-not-found' | 'room-not-found' | 'unauthorized' }

/** Outcome of a chat send. */
export type SendMessageResult =
  | { ok: true; room: RoomView }
  | { ok: false; error: 'cooldown' | 'invalid' | 'member-not-found' | 'room-not-found' | 'unauthorized' }

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
  /** When the room most recently became empty; null while occupied. */
  emptySince: number | null
  members: Map<string, StoredMember>
  messages: RoomMessageView[]
}

interface StoredMember {
  view: RoomMemberView
  /** SHA-256 of the opaque token; the bearer itself is never retained. */
  tokenHash: Buffer
}

/** Current room wire protocol. */
export const ROOM_PROTOCOL_VERSION = 3
/** Member-session entropy: 256 bits, encoded as 43 base64url characters. */
export const MEMBER_TOKEN_BYTES = 32

/** Chat message bounds: 20 chars max, wrapping at ~10 chars per line. */
export const MESSAGE_MAX_LENGTH = 20
/** How long messages stay in the snapshot (must exceed the poll interval). */
export const MESSAGE_TTL_MS = 15_000
/** Per-member send cooldown: a new bubble can only appear after 4s. */
export const MESSAGE_COOLDOWN_MS = 4_000
/** Snapshot cap (oldest dropped). */
export const MESSAGE_CAP = 16

/** Room store options. */
export interface RoomStoreOptions {
  /** Heartbeat timeout before a member is swept, ms. */
  memberTtlMs?: number
  /** Empty-room expiry, ms. */
  roomTtlMs?: number
  /** Member cap per room. */
  maxMembers?: number
  /** Optional server-side validator for token and crown reports. */
  antiCheat?: AntiCheatGuard
}

export const DEFAULT_MEMBER_TTL_MS = 20_000
export const DEFAULT_ROOM_TTL_MS = 10 * 60_000
export const DEFAULT_MAX_MEMBERS = 32
export const ROOM_NAME_MAX_LENGTH = 24

/** Room code alphabet: no 0/O/1/I to keep codes easy to read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4
const CODE_MAX_ATTEMPTS = 8
const CODE_SPACE = CODE_ALPHABET.length ** CODE_LENGTH

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

function memberTokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

function issueMemberToken(): string {
  return randomBytes(MEMBER_TOKEN_BYTES).toString('base64url')
}

function memberTokenMatches(expected: Buffer, token: unknown): boolean {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  return timingSafeEqual(expected, memberTokenHash(token))
}

/** Encode one integer into a valid fixed-width room code. */
function codeFromIndex(raw: number): string {
  let index = raw % CODE_SPACE
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code = CODE_ALPHABET[index % CODE_ALPHABET.length] + code
    index = Math.floor(index / CODE_ALPHABET.length)
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

/** Normalize a UUID-like member id shared by rooms and pet storage. */
export function normalizeMemberId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const memberId = raw.trim()
  return /^[A-Za-z0-9-]{8,64}$/.test(memberId) ? memberId : undefined
}

/** Normalize a visible member nickname. */
export function normalizeNickname(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const nickname = raw.trim().slice(0, 24)
  return nickname === '' ? undefined : nickname
}

/** Validate a member pet URL (bounded length, http(s) only). */
function normalizePetUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const url = raw.trim()
  if (url === '' || url.length > 512) return undefined
  if (!/^https?:\/\//i.test(url)) return undefined
  return url
}

/** Validate a pet pattern variant id (preset name or custom color pair). */
function normalizePetVariant(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const variant = raw.trim()
  if (variant === '' || variant.length > 64) return undefined
  // Custom gradient ids: "custom:#rrggbb:#rrggbb" (client sends lowercase).
  if (/^custom:#[0-9a-f]{6}:#[0-9a-f]{6}$/.test(variant)) return variant
  if (/^[a-z0-9-]{1,32}$/.test(variant)) return variant
  return undefined
}

/** Member pet size bounds (mirror the client display clamp). */
export const MEMBER_SIZE_MIN = 24
export const MEMBER_SIZE_MAX = 512

/** Validate a member crowns array (10 counts, clamped). */
function normalizeCrowns(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const counts = new Array<number>(CROWN_LEVEL_COUNT).fill(0)
  for (let i = 0; i < Math.min(raw.length, CROWN_LEVEL_COUNT); i += 1) {
    const value = raw[i]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    counts[i] = Math.max(0, Math.round(value))
  }
  return counts
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
  private readonly antiCheat: AntiCheatGuard | undefined

  constructor(options: RoomStoreOptions = {}) {
    this.memberTtlMs = options.memberTtlMs ?? DEFAULT_MEMBER_TTL_MS
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS
    this.maxMembers = options.maxMembers ?? DEFAULT_MAX_MEMBERS
    this.antiCheat = options.antiCheat
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
        emptySince: now,
        members: new Map(),
        messages: [],
      }
      this.rooms.set(code, room)
      return this.viewOf(room, now)
    }
    // Astronomically unlikely; scan the finite code space from a time-derived
    // offset instead of producing an invalid or colliding fallback code.
    const start = Math.abs(Math.trunc(now)) % CODE_SPACE
    for (let offset = 0; offset < CODE_SPACE; offset += 1) {
      const code = codeFromIndex(start + offset)
      if (this.rooms.has(code)) continue
      const room: Room = {
        code,
        name: normalizeRoomName(options.name),
        public: options.public !== false,
        createdAt: now,
        emptySince: now,
        members: new Map(),
        messages: [],
      }
      this.rooms.set(code, room)
      return this.viewOf(room, now)
    }
    throw new Error('room-code-space-exhausted')
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

  /** Join a room and issue a new member-session token. */
  joinMember(code: string, report: MemberReport, now: number = Date.now()): JoinMemberResult {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return { ok: false, error: 'room-not-found' }
    const room = this.rooms.get(normalized)
    if (room === undefined) return { ok: false, error: 'room-not-found' }
    const memberId = normalizeMemberId(report.memberId)
    const nickname = normalizeNickname(report.nickname)
    if (memberId === undefined || nickname === undefined) return { ok: false, error: 'invalid' }
    if (room.members.has(memberId)) return { ok: false, error: 'member-conflict' }
    if (room.members.size >= this.maxMembers) return { ok: false, error: 'room-full' }
    const checked = this.antiCheat?.validate({ ...report, memberId }, now)
    if (checked !== undefined && !checked.ok) return checked
    const verifiedReport = checked === undefined
      ? report
      : { ...report, tokens: checked.tokens, crowns: checked.crowns }
    const memberToken = issueMemberToken()
    room.members.set(memberId, {
      view: this.memberView(verifiedReport, memberId, nickname, undefined, now),
      tokenHash: memberTokenHash(memberToken),
    })
    room.emptySince = null
    return { ok: true, room: this.viewOf(room, now), memberToken }
  }

  /** Update one member after proving possession of its room-session token. */
  heartbeatMember(
    code: string,
    report: MemberReport,
    memberToken: string,
    now: number = Date.now(),
  ): HeartbeatMemberResult {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return { ok: false, error: 'room-not-found' }
    const room = this.rooms.get(normalized)
    if (room === undefined) return { ok: false, error: 'room-not-found' }
    const memberId = normalizeMemberId(report.memberId)
    const nickname = normalizeNickname(report.nickname)
    if (memberId === undefined || nickname === undefined) return { ok: false, error: 'invalid' }
    const existing = room.members.get(memberId)
    if (existing === undefined) return { ok: false, error: 'member-not-found' }
    if (!memberTokenMatches(existing.tokenHash, memberToken)) return { ok: false, error: 'unauthorized' }
    const checked = this.antiCheat?.validate({ ...report, memberId }, now)
    if (checked !== undefined && !checked.ok) return checked
    const verifiedReport = checked === undefined
      ? report
      : { ...report, tokens: checked.tokens, crowns: checked.crowns }
    existing.view = this.memberView(verifiedReport, memberId, nickname, existing.view, now)
    return { ok: true, room: this.viewOf(room, now) }
  }

  private memberView(
    report: MemberReport,
    memberId: string,
    nickname: string,
    existing: RoomMemberView | undefined,
    now: number,
  ): RoomMemberView {
    const crowns = normalizeCrowns(report.crowns)
    return {
      memberId,
      nickname,
      tokens: clampNum(report.tokens, Number.MAX_SAFE_INTEGER, existing?.tokens ?? 0),
      crowns: crowns ?? existing?.crowns ?? new Array<number>(CROWN_LEVEL_COUNT).fill(0),
      hats: crowns === undefined
        ? clampNum(report.hats, Number.MAX_SAFE_INTEGER, existing?.hats ?? 0)
        : crowns.reduce((sum, count) => sum + count, 0),
      phase: normalizePhase(report.phase),
      active: report.active === true,
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
  }

  /** Remove one member after proving possession of its room-session token. */
  removeMember(code: string, memberId: string, memberToken: string, now: number = Date.now()): RemoveMemberResult {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return { ok: false, error: 'room-not-found' }
    const normalizedMemberId = normalizeMemberId(memberId)
    if (normalizedMemberId === undefined) return { ok: false, error: 'invalid' }
    const room = this.rooms.get(normalized)
    if (room === undefined) return { ok: false, error: 'room-not-found' }
    const member = room.members.get(normalizedMemberId)
    if (member === undefined) return { ok: false, error: 'member-not-found' }
    if (!memberTokenMatches(member.tokenHash, memberToken)) return { ok: false, error: 'unauthorized' }
    room.members.delete(normalizedMemberId)
    if (room.members.size === 0) room.emptySince = now
    return { ok: true, removed: true }
  }

  /**
   * Append one chat message. Per-member cooldown (MESSAGE_COOLDOWN_MS) rejects
   * sends while the previous bubble is still showing.
   */
  addMessage(code: string, message: {
    memberId: string
    text: string
  }, memberToken: string, now: number = Date.now()): SendMessageResult {
    const normalized = normalizeCode(code)
    if (normalized === undefined) return { ok: false, error: 'room-not-found' }
    const room = this.rooms.get(normalized)
    if (room === undefined) return { ok: false, error: 'room-not-found' }
    const memberId = normalizeMemberId(message.memberId)
    if (memberId === undefined) return { ok: false, error: 'invalid' }
    const member = room.members.get(memberId)
    if (member === undefined) return { ok: false, error: 'member-not-found' }
    if (!memberTokenMatches(member.tokenHash, memberToken)) return { ok: false, error: 'unauthorized' }
    const text = message.text.trim()
    if (text === '' || text.length > MESSAGE_MAX_LENGTH) return { ok: false, error: 'invalid' }
    const last = [...room.messages].reverse().find((entry) => entry.memberId === memberId)
    if (last !== undefined && now - last.at < MESSAGE_COOLDOWN_MS) {
      return { ok: false, error: 'cooldown' }
    }
    room.messages.push({ memberId, nickname: member.view.nickname, text, at: now })
    if (room.messages.length > MESSAGE_CAP) room.messages.splice(0, room.messages.length - MESSAGE_CAP)
    return { ok: true, room: this.viewOf(room, now) }
  }

  /** Sweep stale members, expired messages, and expired empty rooms. */
  sweep(now: number = Date.now()): void {
    for (const [code, room] of this.rooms) {
      const hadMembers = room.members.size > 0
      for (const [memberId, member] of room.members) {
        if (now - member.view.lastSeen > this.memberTtlMs) room.members.delete(memberId)
      }
      room.messages = room.messages.filter((message) => now - message.at < MESSAGE_TTL_MS)
      if (room.members.size === 0) {
        if (hadMembers || room.emptySince === null) room.emptySince = now
        if (now - room.emptySince > this.roomTtlMs) this.rooms.delete(code)
      } else {
        room.emptySince = null
      }
    }
    this.antiCheat?.sweep(now)
  }

  /** Flush validator state before a process or plugin shutdown. */
  close(): void {
    this.antiCheat?.close()
  }

  private viewOf(room: Room, now: number = Date.now()): RoomView {
    return {
      protocolVersion: ROOM_PROTOCOL_VERSION,
      code: room.code,
      name: room.name,
      public: room.public,
      createdAt: room.createdAt,
      members: [...room.members.values()]
        .map((member) => member.view)
        .sort((a, b) => a.joinedAt - b.joinedAt),
      messages: room.messages.filter((message) => now - message.at < MESSAGE_TTL_MS),
    }
  }
}
