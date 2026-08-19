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
 * @module @kasidia/dsh-games/client/api
 */
import type { MemberPhase } from '../rooms.ts';
import type { GameRules } from '../rules.ts';
export type { CrownRules, GameRules, PetRules, } from '../rules.ts';
/** Meta of the user's custom pet image (mirrored by the host). */
export interface PetMeta {
    ext: 'png' | 'gif';
    version: number;
    width: number;
    height: number;
}
/** Own-state snapshot (host `/api/games/state`). */
export interface GamesState {
    memberId: string;
    nickname: string;
    tokens: number;
    /** Crown units derived with the built-in default rules. */
    crownUnits: number;
    /** Crown counts per level using the built-in default rules. */
    crowns: number[];
    phase: MemberPhase;
    /** Short output-activity window refreshed by assistant stream events. */
    tokenActiveUntil: number;
    /** Master switch (false hides the pet and stops counting). */
    enabled: boolean;
    /** Built-in pet pattern variant. */
    petVariant: string;
    /** Game-server base URL ('' = same-origin). */
    serverUrl: string;
    /** Game-server shared secret ('' = open server). */
    authToken: string;
    /** Uploaded custom pet image meta, when set. */
    pet?: PetMeta;
    serverTime: number;
    display: {
        visible: boolean;
        size: number;
        right: number;
        bottom: number;
        locked: boolean;
    };
}
/** One room member as the room snapshot exposes it. */
export interface RoomMemberView {
    memberId: string;
    nickname: string;
    tokens: number;
    crowns: number[];
    hats: number;
    phase: MemberPhase;
    /** True while the member is currently receiving model output. */
    active?: boolean;
    joinedAt: number;
    lastSeen: number;
    petUrl?: string;
    petVersion?: number;
    /** Built-in pet pattern variant the member's whale renders in. */
    petVariant?: string;
}
/** One chat message a member sent (bubbles show for a few seconds). */
export interface RoomMessageView {
    memberId: string;
    nickname: string;
    text: string;
    at: number;
}
/** Room snapshot. */
export interface RoomView {
    protocolVersion: 3;
    code: string;
    name: string;
    public: boolean;
    createdAt: number;
    members: RoomMemberView[];
    messages: RoomMessageView[];
}
/** Generic JSON envelope from the games API. */
export interface GamesEnvelope<T> {
    ok: true;
    [key: string]: unknown;
}
/** A joined room the browser tracks: game-server base + code. */
export interface JoinedRoom {
    /** Game-server base URL the room lives on. */
    base: string;
    code: string;
    /** Opaque member-session bearer for heartbeat, chat, and leave. */
    memberToken: string;
    name: string;
    public: boolean;
    members: RoomMemberView[];
    /** True while the latest poll/heartbeat failed (transient). */
    offline: boolean;
    /** Human-readable join error, if the room was rejected. */
    error?: string;
}
/** Normalize a game-server base URL (strip trailing slashes). */
export declare function normalizeServerUrl(raw: string): string;
/** Normalize a room code (trim + uppercase). */
export declare function normalizeRoomCode(raw: string): string;
/** Structured HTTP failure from the game server. */
export declare class GameServerError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(status: number, code?: string, detail?: string);
}
/** Bound every room/server request so one stalled fetch cannot freeze polling forever. */
export declare const REQUEST_TIMEOUT_MS = 10000;
export interface MemberReport {
    memberId: string;
    nickname: string;
    tokens: number;
    crowns: number[];
    phase: MemberPhase;
    active?: boolean;
    petUrl?: string;
    petVersion?: number;
    petVariant?: string;
}
/** The browser-facing host API (same-origin personal state). */
export declare const gamesApi: {
    state(): Promise<GamesState>;
    setNickname(name: string): Promise<{
        ok: boolean;
    }>;
    boost(tokens: number): Promise<{
        ok: true;
        tokens: number;
        crownUnits: number;
        crowns: number[];
    }>;
    setDisplay(patch: {
        right?: number;
        bottom?: number;
        size?: number;
        visible?: boolean;
        locked?: boolean;
    }): Promise<{
        ok: true;
    }>;
    config(patch: {
        nickname?: string;
        enabled?: boolean;
        petVariant?: string;
        serverUrl?: string;
        authToken?: string;
    }): Promise<{
        ok: boolean;
    }>;
    setPetMeta(pet: PetMeta | null): Promise<{
        ok: boolean;
    }>;
    clearPetMeta(): Promise<{
        ok: boolean;
    }>;
};
/** The absolute base URL a member's pet image is served from. */
export declare function petBaseUrl(serverUrl: string): string;
/** Absolute URL of the user's custom pet image on the game server. */
export declare function petImageUrl(serverUrl: string, memberId: string, pet: PetMeta, authToken: string): string;
/** Cross-origin game-server endpoints (rules + rooms + pets on the shared server). */
export declare const gameServerApi: {
    /** Absolute base for one game server ('' = the host's in-process mount). */
    base(serverUrl: string): string;
    rules(serverUrl: string, authToken: string): Promise<{
        ok: true;
        rules: GameRules;
    }>;
    listRooms(serverUrl: string, authToken: string): Promise<{
        ok: true;
        rooms: RoomView[];
    }>;
    createRoom(serverUrl: string, authToken: string, options: {
        name?: string;
        public?: boolean;
    }): Promise<{
        ok: true;
        room: RoomView;
    }>;
    state(serverUrl: string, authToken: string, code: string): Promise<{
        ok: true;
        room: RoomView;
    }>;
    join(serverUrl: string, authToken: string, code: string, member: MemberReport): Promise<{
        ok: true;
        room: RoomView;
        memberToken: string;
    }>;
    heartbeat(serverUrl: string, authToken: string, code: string, memberToken: string, member: MemberReport, signal?: AbortSignal): Promise<{
        ok: true;
        room: RoomView;
    }>;
    leave(serverUrl: string, authToken: string, code: string, memberId: string, memberToken: string): Promise<{
        ok: true;
        removed: boolean;
    }>;
    sendMessage(serverUrl: string, authToken: string, code: string, memberToken: string, message: {
        memberId: string;
        text: string;
    }): Promise<{
        ok: true;
        room: RoomView;
    }>;
    uploadPet(serverUrl: string, authToken: string, memberId: string, file: Blob): Promise<{
        ok: true;
        pet: PetMeta;
    }>;
    removePet(serverUrl: string, authToken: string, memberId: string): Promise<{
        ok: true;
        removed: boolean;
    }>;
};
export declare function loadStoredRoom(): {
    base: string;
    code: string;
    memberToken: string;
} | undefined;
export declare function storeRoom(base: string, code: string, memberToken: string): void;
export declare function clearStoredRoom(): void;
//# sourceMappingURL=api.d.ts.map