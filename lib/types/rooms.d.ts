/**
 * Room store — in-memory multiplayer rooms. One DSH host owns the rooms it
 * creates; every player (including the host's own browser) heartbeats its
 * member state into the room, and every player polls the room snapshot.
 * Members are removed after a heartbeat timeout; empty rooms expire.
 *
 * Rooms are either **public** (listed on the host's room list, anyone can
 * join) or **invite-only** (joinable only by code, invisible in the list).
 * @module @kasidia/dsh-games/rooms
 */
import type { AntiCheatError, AntiCheatGuard } from './anticheat.ts';
/** Player activity phases mirrored from the harness activity tracker. */
export type MemberPhase = 'idle' | 'waiting' | 'thinking' | 'tool' | 'done';
/** The phases the room protocol accepts (unknown phases are coerced to idle). */
export declare const KNOWN_PHASES: readonly MemberPhase[];
/** Number of crown levels a member may report (see crowns.ts). */
export declare const CROWN_LEVEL_COUNT = 10;
/** What a client reports about itself. */
export interface MemberReport {
    memberId: string;
    nickname: string;
    tokens: number;
    /** Crown counts per level (lowest first); absent for legacy clients. */
    crowns?: number[];
    /** Legacy hat count (prototype-era clients). */
    hats?: number;
    phase: string;
    /** True while this member is receiving model output. */
    active?: boolean;
    /** Absolute URL of the member's custom pet image on their own host. */
    petUrl?: string;
    /** Cache-busting version of the pet image. */
    petVersion?: number;
    /** Built-in pet pattern variant the member's whale renders in. */
    petVariant?: string;
}
/** One member as the room exposes it. */
export interface RoomMemberView {
    memberId: string;
    nickname: string;
    tokens: number;
    crowns: number[];
    hats: number;
    phase: MemberPhase;
    active: boolean;
    joinedAt: number;
    lastSeen: number;
    petUrl?: string;
    petVersion?: number;
    petVariant?: string;
}
/** One chat message a member sent (bubbles show for a few seconds). */
export interface RoomMessageView {
    memberId: string;
    nickname: string;
    text: string;
    /** Epoch ms the message was sent. */
    at: number;
}
/** Room snapshot. */
export interface RoomView {
    /** Wire contract version for member authentication and report validation. */
    protocolVersion: 3;
    code: string;
    /** Optional human-readable room name. */
    name: string;
    /** Public rooms appear on the room list; invite-only rooms are code-only. */
    public: boolean;
    createdAt: number;
    members: RoomMemberView[];
    /** Recent chat messages (kept briefly so 3s polls never miss one). */
    messages: RoomMessageView[];
}
/** Successful join result; the token is returned only to the joining client. */
export type JoinMemberResult = {
    ok: true;
    room: RoomView;
    memberToken: string;
} | {
    ok: false;
    error: AntiCheatError | 'member-conflict' | 'room-full' | 'room-not-found';
};
/** Outcome of an authenticated member heartbeat. */
export type HeartbeatMemberResult = {
    ok: true;
    room: RoomView;
} | {
    ok: false;
    error: AntiCheatError | 'member-not-found' | 'room-not-found' | 'unauthorized';
};
/** Outcome of an authenticated member removal. */
export type RemoveMemberResult = {
    ok: true;
    removed: true;
} | {
    ok: false;
    error: 'invalid' | 'member-not-found' | 'room-not-found' | 'unauthorized';
};
/** Outcome of a chat send. */
export type SendMessageResult = {
    ok: true;
    room: RoomView;
} | {
    ok: false;
    error: 'cooldown' | 'invalid' | 'member-not-found' | 'room-not-found' | 'unauthorized';
};
/** Room creation options. */
export interface CreateRoomOptions {
    name?: string;
    public?: boolean;
}
/** Current room wire protocol. */
export declare const ROOM_PROTOCOL_VERSION = 3;
/** Member-session entropy: 256 bits, encoded as 43 base64url characters. */
export declare const MEMBER_TOKEN_BYTES = 32;
/** Chat message bounds: 20 chars max, wrapping at ~10 chars per line. */
export declare const MESSAGE_MAX_LENGTH = 20;
/** How long messages stay in the snapshot (must exceed the poll interval). */
export declare const MESSAGE_TTL_MS = 15000;
/** Per-member send cooldown: a new bubble can only appear after 4s. */
export declare const MESSAGE_COOLDOWN_MS = 4000;
/** Snapshot cap (oldest dropped). */
export declare const MESSAGE_CAP = 16;
/** Room store options. */
export interface RoomStoreOptions {
    /** Heartbeat timeout before a member is swept, ms. */
    memberTtlMs?: number;
    /** Empty-room expiry, ms. */
    roomTtlMs?: number;
    /** Member cap per room. */
    maxMembers?: number;
    /** Optional server-side validator for token and crown reports. */
    antiCheat?: AntiCheatGuard;
}
export declare const DEFAULT_MEMBER_TTL_MS: number;
export declare const DEFAULT_ROOM_TTL_MS: number;
export declare const DEFAULT_MAX_MEMBERS = 32;
export declare const ROOM_NAME_MAX_LENGTH = 24;
/** Normalize an external phase string into the known phase set. */
export declare function normalizePhase(phase: unknown): MemberPhase;
/** Validate a room code string (normalized to uppercase). */
export declare function normalizeCode(raw: string): string | undefined;
/** Normalize a room name (trimmed, capped). */
export declare function normalizeRoomName(raw: unknown): string;
/** Normalize a UUID-like member id shared by rooms and pet storage. */
export declare function normalizeMemberId(raw: unknown): string | undefined;
/** Normalize a visible member nickname. */
export declare function normalizeNickname(raw: unknown): string | undefined;
/**
 * In-memory room registry. Not persisted: rooms are demo-time constructs that
 * live while their host process runs and their members keep heartbeating.
 */
export declare class RoomStore {
    private readonly rooms;
    private readonly memberTtlMs;
    private readonly roomTtlMs;
    private readonly maxMembers;
    private readonly antiCheat;
    constructor(options?: RoomStoreOptions);
    /** Create a room with a fresh, collision-free code. */
    createRoom(options?: CreateRoomOptions, now?: number): RoomView;
    /** Read a room snapshot by code (normalized). */
    getRoom(code: string): RoomView | undefined;
    /** All public rooms (the room list; invite-only rooms stay hidden). */
    listPublicRooms(): RoomView[];
    /** Join a room and issue a new member-session token. */
    joinMember(code: string, report: MemberReport, now?: number): JoinMemberResult;
    /** Update one member after proving possession of its room-session token. */
    heartbeatMember(code: string, report: MemberReport, memberToken: string, now?: number): HeartbeatMemberResult;
    private memberView;
    /** Remove one member after proving possession of its room-session token. */
    removeMember(code: string, memberId: string, memberToken: string, now?: number): RemoveMemberResult;
    /**
     * Append one chat message. Per-member cooldown (MESSAGE_COOLDOWN_MS) rejects
     * sends while the previous bubble is still showing.
     */
    addMessage(code: string, message: {
        memberId: string;
        text: string;
    }, memberToken: string, now?: number): SendMessageResult;
    /** Sweep stale members, expired messages, and expired empty rooms. */
    sweep(now?: number): void;
    /** Flush validator state before a process or plugin shutdown. */
    close(): void;
    private viewOf;
}
//# sourceMappingURL=rooms.d.ts.map