/**
 * Room pet scene — the other members' floating pets around your anchor pet.
 * Every client arranges the members it sees on its own screen, so the
 * arrangement preference and the free-drag positions live in localStorage
 * (per browser), not on the game server.
 *
 * Modes:
 * - `free`   — fully manual; each member keeps its dragged position.
 * - `row`    — horizontal line centered on the anchor pet.
 * - `column` — vertical line centered on the anchor pet.
 * - `grid`   — automatic rows × columns layout beside the anchor pet.
 * - `orbit`  — ring around the anchor pet.
 * @module @kasidia/dsh-games/client/scene
 */
import { type ReactElement } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { RoomMemberView } from './api.ts';
/** Arrangement modes (order is the UI order too). */
export type ArrangeMode = 'free' | 'row' | 'column' | 'grid' | 'orbit';
/** All modes in UI order. */
export declare const ARRANGE_MODES: readonly ArrangeMode[];
/** Local visual ordering of room members. */
export type SceneSort = 'tokens-desc' | 'tokens-asc' | 'joined';
/** Sort choices in UI order. */
export declare const SCENE_SORTS: readonly SceneSort[];
/** One floating-pet position (right/bottom insets). */
export interface PetPos {
    right: number;
    bottom: number;
}
/** Per-member free-drag memory (mode `free`). */
export interface ScenePrefs {
    mode: ArrangeMode;
    /** Local visual order; never synchronized to the room server. */
    sort: SceneSort;
    /** Gap between pet edges, px. */
    spacing: number;
    /** Maximum columns in automatic grid mode. */
    gridColumns: number;
    /** Maximum rows in automatic grid mode. */
    gridRows: number;
    /** Whether every room member label remains visible without hover. */
    showLabels: boolean;
    /** Free positions keyed by member id. */
    free: Record<string, PetPos>;
}
/** One pet in the scene (anchor included). */
export interface SceneMember {
    id: string;
    size: number;
}
/** The anchor pet (your own): fixed position, everything arranges around it. */
export interface SceneAnchor extends SceneMember {
    right: number;
    bottom: number;
}
export interface SceneViewport {
    width: number;
    height: number;
}
/** Spacing slider bounds. */
export declare const SCENE_SPACING_MIN = 24;
export declare const SCENE_SPACING_MAX = 240;
export declare const SCENE_SPACING_DEFAULT = 24;
export declare const SCENE_GRID_MIN = 1;
export declare const SCENE_GRID_MAX = 8;
export declare const SCENE_GRID_COLUMNS_DEFAULT = 3;
export declare const SCENE_GRID_ROWS_DEFAULT = 3;
/** localStorage key for the scene prefs. */
export declare const SCENE_KEY = "dsh.games.scene.v2";
/** Stable local-only sort for room snapshots. */
export declare function sortRoomMembers(members: readonly RoomMemberView[], sort: SceneSort): RoomMemberView[];
/** Keep a pet's full square hit area inside the current viewport. */
export declare function clampPetPos(pos: PetPos, size: number, viewport: SceneViewport): PetPos;
/** Snap a position to the spacing grid (grid mode). */
export declare function snapPos(pos: PetPos, spacing: number): PetPos;
/**
 * Compute every member's position for the current mode. The anchor keeps its
 * own spot in every mode; `members` must include the anchor. All member
 * positions are clamped inside the viewport (a pet that would leave the
 * screen sticks to the nearest edge instead of jumping to the opposite one).
 */
export declare function arrangeScene(mode: ArrangeMode, members: readonly SceneMember[], anchor: SceneAnchor, spacing: number, free: Readonly<Record<string, PetPos>>, viewport: SceneViewport, gridColumns?: number, gridRows?: number): Record<string, PetPos>;
/**
 * Attempt a complete layout with the requested edge gap. `undefined` means
 * at least one pet cannot fit inside the viewport without overlap.
 */
export declare function tryArrangeScene(mode: ArrangeMode, members: readonly SceneMember[], anchor: SceneAnchor, spacing: number, free: Readonly<Record<string, PetPos>>, viewport: SceneViewport, gridColumns?: number, gridRows?: number): Record<string, PetPos> | undefined;
/** Whether a preference change can produce a complete collision-free layout. */
export declare function canArrangeScene(prefs: ScenePrefs, members: readonly SceneMember[], anchor: SceneAnchor, viewport: SceneViewport): boolean;
/** Resolve a manual drag against every currently visible pet. */
export declare function resolveSceneMove(memberId: string, size: number, desired: PetPos, members: readonly SceneMember[], positions: Readonly<Record<string, PetPos>>, viewport: SceneViewport, spacing: number): PetPos;
/** Tolerant load of the scene prefs (corrupt storage falls back to defaults). */
export declare function loadScenePrefs(): ScenePrefs;
/** Persist the scene prefs (storage failures are ignored). */
export declare function saveScenePrefs(prefs: ScenePrefs): void;
/** Stateful scene prefs: read once, committed to localStorage on change. */
export declare function useScenePrefs(): {
    prefs: ScenePrefs;
    update: (patch: Partial<ScenePrefs>) => void;
    moveMember: (id: string, pos: PetPos) => void;
    resetMembers: () => void;
};
/** One floating member pet: image or whale in the owner's variant, crowns, phase. */
export declare function MemberPetScene(props: {
    member: RoomMemberView;
    size: number;
    pos: PetPos;
    /** Collision-safe outer width for the local observer's labels. */
    labelMaxWidth: number;
    /** False in auto-arrange modes: the layout owns the position. */
    draggable: boolean;
    onMove: (pos: PetPos) => void;
    /** Local observer preference; never synchronized through room state. */
    showLabel: boolean;
    /** Incoming chat bubble (null when none). */
    chat?: {
        text: string;
        key: string;
        leaving?: boolean;
    } | null;
}): ReactElement;
/** The arrangement controls inside the pet popover (only while in a room). */
export declare function SceneControls(props: {
    t: Translate;
    prefs: ScenePrefs;
    onChange: (patch: Partial<ScenePrefs>) => void;
    onReset: () => void;
    note?: string | null;
}): ReactElement;
//# sourceMappingURL=scene.d.ts.map