/**
 * Crown artwork + pyramid layout. The ten crown tiers use the inline SVG
 * assets from assets/crown_*.svg (see tools/gen-crown-assets.mjs), stacked
 * in a seven-layer 7→1 pyramid above the pet:
 *
 *   - the bottom layer holds 7 crowns, then 6, down to a single crown at the
 *     tip (display capacity only — crafting stays base-3 as before);
 *   - higher tiers claim the bottom/right slots first. Fresh low-tier crowns
 *     therefore appear on the current highest layer (or its left edge), then
 *     visibly travel down/right when they craft into a higher tier;
 *   - layers overlap ~25% vertically (the crown above presses into the row
 *     below), crowns in a row sit side by side (near-touching), each crown
 *     tilts ±2..4° with a small jitter, and the layers grow slightly larger
 *     toward the tip;
 *   - when the counts change (a layer filled and crafted N crowns into one
 *     of the next tier), the new crown inherits the DOM key of a vanished
 *     crown, so its node slides from the old cluster to its new slot while
 *     the rest of the pile re-collapses around it (CSS transitions); a
 *     flash bursts at the merge point and the consumed crowns shrink away.
 * @module @kasidia/dsh-games/client/crowns
 */
import { type CSSProperties, type ReactElement } from 'react';
/** Max pyramid layers. */
export declare const MAX_PYRAMID_ROWS = 7;
/** Crown slots per layer, bottom first: a true 7→1 pyramid (28 total). */
export declare const ROW_CAPACITY: readonly number[];
/** One positioned crown. */
export interface CrownSlot {
    /** Stable DOM key (a crown keeps it across merges via key inheritance). */
    key: string;
    tier: number;
    /** px offset from the pile's horizontal center (right = positive). */
    x: number;
    /** px from the pet's top edge (up = negative); the crown box's top. */
    y: number;
    /** Crown box size in px. */
    size: number;
    /** Tilt in degrees (±2..4). */
    rot: number;
}
/**
 * Place crown counts into a bottom-up 7→1 pyramid. Higher tiers reserve the
 * lower layers first; each layer is then ordered low→high so its strongest
 * crown sits on the right. Within one tier, older crowns reserve lower rows
 * while newer crowns rise to the current top row and render on its left.
 * A crafted crown is placed after ordinary crowns of the same tier so its
 * inherited node visibly travels toward the row's right edge.
 */
export declare function layoutCrownPyramid(counts: readonly number[], crownSize: number, keyOverride?: ReadonlyMap<string, string>): {
    slots: CrownSlot[];
    overflow: number;
};
export interface MergePlan {
    /** Fresh key (`tier:index`) → the vanished key it inherits. */
    claims: ReadonlyMap<string, string>;
    /** Vanished keys with no heir — the consumed crowns (shrink away). */
    vanished: string[];
    /** Fresh keys that appear from nothing (pop in). */
    freshKeys: string[];
}
/**
 * Diff two count snapshots and decide key inheritance: when crowns of tier L
 * crafted into tier L+1, the new tier-L+1 crowns take over the DOM keys of
 * the vanished tier-L crowns (highest indices first), so the same node
 * visibly travels from the old cluster to its new pyramid slot.
 */
export declare function planMerge(prev: readonly number[], now: readonly number[]): MergePlan;
export interface CrownPyramidView {
    /** Positioned crown elements, bottom row first (paint order). */
    crowns: ReactElement[];
    /** One-shot merge flash overlay (null unless a merge just happened). */
    flash: ReactElement | null;
    /** Crowns beyond the 28-slot pile (the "+N" badge). */
    overflow: number;
    /** Pile top (px, negative) so the badge can sit above the tip crown. */
    pileTop: number;
}
/**
 * Render the crown pile for a count snapshot and animate it on change:
 * crowns keep their keys across merges (the crafted crown inherits a
 * vanished one's key and slides up), layout changes transition, consumed
 * crowns render as shrinking ghosts, and a flash bursts at the merge point.
 */
export declare function useCrownPyramid(counts: readonly number[], crownSize: number): CrownPyramidView;
/** One crown of a given tier, `size` px tall, using the asset artwork. */
export declare const Crown: import("react").MemoExoticComponent<(props: {
    level: number;
    size: number;
    style?: CSSProperties;
}) => ReactElement>;
/** Mini crown cell for room member rows: the member's top tier + count. */
export declare function MiniCrown(props: {
    counts: readonly number[];
    /** How many of the top tier to show (capped). */
    cap?: number;
    size: number;
    style?: CSSProperties;
}): ReactElement;
//# sourceMappingURL=crowns.d.ts.map