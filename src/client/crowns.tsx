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

import {
  cloneElement,
  createElement,
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { CROWN_SVGS } from './crownAssets.ts'
import {
  CROWN_LEVEL_COUNT,
  CROWN_LEVELS,
  crownLevel,
} from '../crowns.ts'

/** Max pyramid layers. */
export const MAX_PYRAMID_ROWS = 7

/** Crown slots per layer, bottom first: a true 7→1 pyramid (28 total). */
export const ROW_CAPACITY: readonly number[] = [7, 6, 5, 4, 3, 2, 1]

/** Row size factor, tip first: crowns grow ~3% per layer going up. */
const ROW_SCALE: readonly number[] = [1.12, 1.10, 1.08, 1.06, 1.04, 1.02, 1.00]

/** Vertical gap between layers' crown-bottom lines, × crownSize. */
const ROW_GAP = 0.34

/** Small border-to-border gap between the bottom crowns and the pet box, × size. */
const BOTTOM_CLEARANCE = 0.04

/** Horizontal gap between crowns in a layer, × that layer's crown size —
 * ~0.55 keeps the crowns near-touching (their artwork is ~0.55..0.61 of the
 * box wide, so they read as one piled-up row). */
const H_SPACING = 0.55

/** Fallback visual band (fractions of the 512 viewBox) when bounds can't be measured. */
const FALLBACK_TIER_BOUNDS = { top: 0.3, bottom: 0.68 }

/* ------------------------------------------------------------------ */
/* asset parsing: SVG strings → cached React elements                  */
/* ------------------------------------------------------------------ */

const svgElementCache = new Map<string, ReactElement>()

/** The parsed `<svg>` root for a tier, cloned per instance by <Crown>. */
function cachedSvgElement(tierId: string): ReactElement | null {
  let element: ReactElement | null | undefined = svgElementCache.get(tierId)
  if (element === undefined) {
    const source = CROWN_SVGS[tierId]
    const parsed = source !== undefined ? parseSvgElement(source) : null
    if (parsed !== null) {
      element = parsed
      svgElementCache.set(tierId, parsed)
    } else {
      element = null
    }
  }
  return element ?? null
}

function parseSvgElement(source: string): ReactElement | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
    const root = doc.documentElement
    if (root === null || root.namespaceURI !== 'http://www.w3.org/2000/svg') return null
    return nodeToElement(root) as ReactElement
  } catch {
    return null
  }
}

/** DOM node → React element (attributes pass through verbatim, e.g. SMIL). */
function nodeToElement(node: Node): ReactNode | null {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = (node.textContent ?? '').trim()
    return text === '' ? null : text
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return null
  const element = node as Element
  const props: Record<string, unknown> = {}
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes[i]
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
    props[attr.name] = attr.value
  }
  const children: ReactNode[] = []
  for (const child of Array.from(element.childNodes)) {
    const converted = nodeToElement(child)
    if (converted !== null) children.push(converted)
  }
  return createElement(element.tagName, props, ...children)
}

/* ------------------------------------------------------------------ */
/* per-tier visual bounds (fractions of the 512 viewBox)               */
/* ------------------------------------------------------------------ */

const tierBoundsCache = new Map<number, { top: number; bottom: number }>()

/**
 * Where the crown artwork actually sits inside its 512×512 box. Measured
 * once per tier from the real asset (the `g#crown` body group); tiers have
 * different heights, which drives how much the rows press into each other.
 */
function tierVisualBounds(tier: number): { top: number; bottom: number } {
  const cached = tierBoundsCache.get(tier)
  if (cached !== undefined) return cached
  let bounds = FALLBACK_TIER_BOUNDS
  const source = CROWN_SVGS[crownLevel(tier).id]
  if (source !== undefined && typeof document !== 'undefined') {
    try {
      const host = document.createElement('div')
      host.setAttribute('aria-hidden', 'true')
      host.style.cssText =
        'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;'
      host.innerHTML = source
      document.body.appendChild(host)
      const group = host.querySelector('svg g[id="crown"]') ?? host.querySelector('svg')
      const box = group !== null && typeof (group as SVGGraphicsElement).getBBox === 'function'
        ? (group as SVGGraphicsElement).getBBox()
        : null
      const viewBox = source.match(/viewBox="[^"]*\s+(\d+\.?\d*)\s+(\d+\.?\d*)"/)
      const height = viewBox !== null ? Number(viewBox[2]) : 512
      if (box !== null && box.height > 0) {
        bounds = { top: box.y / height, bottom: (box.y + box.height) / height }
      }
      host.remove()
    } catch {
      // Measurement failed — the fallback band still stacks fine.
    }
  }
  tierBoundsCache.set(tier, bounds)
  return bounds
}

/* ------------------------------------------------------------------ */
/* pure layout                                                         */
/* ------------------------------------------------------------------ */

/** One positioned crown. */
export interface CrownSlot {
  /** Stable DOM key (a crown keeps it across merges via key inheritance). */
  key: string
  tier: number
  /** px offset from the pile's horizontal center (right = positive). */
  x: number
  /** px from the pet's top edge (up = negative); the crown box's top. */
  y: number
  /** Crown box size in px. */
  size: number
  /** Tilt in degrees (±2..4). */
  rot: number
}

/** Deterministic small hash for a crown key (jitter must be stable). */
function keyHash(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Place crown counts into a bottom-up 7→1 pyramid. Higher tiers reserve the
 * lower layers first; each layer is then ordered low→high so its strongest
 * crown sits on the right. Within one tier, older crowns reserve lower rows
 * while newer crowns rise to the current top row and render on its left.
 * A crafted crown is placed after ordinary crowns of the same tier so its
 * inherited node visibly travels toward the row's right edge.
 */
export function layoutCrownPyramid(
  counts: readonly number[],
  crownSize: number,
  keyOverride: ReadonlyMap<string, string> = EMPTY_KEY_MAP,
): { slots: CrownSlot[]; overflow: number } {
  interface CrownItem {
    key: string
    tier: number
    index: number
    crafted: boolean
  }

  const items: CrownItem[] = []
  for (let tier = 0; tier < CROWN_LEVEL_COUNT; tier += 1) {
    const count = Math.max(0, Math.round(counts[tier] ?? 0))
    for (let i = 0; i < count; i += 1) {
      const natural = `${tier}:${i}`
      items.push({
        key: keyOverride.get(natural) ?? natural,
        tier,
        index: i,
        crafted: keyOverride.has(natural),
      })
    }
  }
  // Strong crowns take the bottom layers. Older crowns of one tier keep the
  // lower slots, so a newly gained low crown naturally enters the top layer.
  items.sort((a, b) => b.tier - a.tier || a.index - b.index)

  const capacity = ROW_CAPACITY.reduce((sum, n) => sum + n, 0)
  const overflow = Math.max(0, items.length - capacity)
  const shown = items.slice(0, capacity)

  const slots: CrownSlot[] = []
  let cursor = 0
  const layers = usedRows(shown.length)
  for (let layer = 0; layer < layers; layer += 1) {
    const layerCount = Math.min(ROW_CAPACITY[layer], shown.length - cursor)
    const layerItems = shown.slice(cursor, cursor + layerCount).sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      if (a.crafted !== b.crafted) return a.crafted ? 1 : -1
      // Fresh ordinary crowns appear on the left; crafted crowns finish on
      // the right, including when several crowns craft in one update.
      return a.crafted ? a.index - b.index : b.index - a.index
    })
    const size = crownSize * ROW_SCALE[layers - 1 - layer]
    const bottomY = -(BOTTOM_CLEARANCE + layer * ROW_GAP) * crownSize
    for (let j = 0; j < layerItems.length; j += 1) {
      const item = layerItems[j]
      const hash = keyHash(item.key)
      const bounds = tierVisualBounds(item.tier)
      const rot = (hash % 2 === 0 ? -1 : 1) * (2 + (Math.floor(hash / 8) % 3))
      const jitterX = ((Math.floor(hash / 16) % 9) - 4) * 0.015 * size
      const jitterY = ((Math.floor(hash / 32) % 5) - 2) * 0.008 * size
      slots.push({
        key: item.key,
        tier: item.tier,
        x: (j - (layerItems.length - 1) / 2) * H_SPACING * size + jitterX,
        y: bottomY - bounds.bottom * size + jitterY,
        size,
        rot,
      })
    }
    cursor += layerCount
  }
  return { slots, overflow }
}

function usedRows(count: number): number {
  if (count <= 0) return 0
  let rows = 0
  let rest = count
  for (let row = 0; row < MAX_PYRAMID_ROWS && rest > 0; row += 1) {
    rest -= ROW_CAPACITY[row]
    rows += 1
  }
  return rows
}

/* ------------------------------------------------------------------ */
/* merge planning: which crown keys die, and who inherits them         */
/* ------------------------------------------------------------------ */

export interface MergePlan {
  /** Fresh key (`tier:index`) → the vanished key it inherits. */
  claims: ReadonlyMap<string, string>
  /** Vanished keys with no heir — the consumed crowns (shrink away). */
  vanished: string[]
  /** Fresh keys that appear from nothing (pop in). */
  freshKeys: string[]
}

const EMPTY_KEY_MAP: ReadonlyMap<string, string> = new Map()
const EMPTY_SET: ReadonlySet<string> = new Set()

/**
 * Diff two count snapshots and decide key inheritance: when crowns of tier L
 * crafted into tier L+1, the new tier-L+1 crowns take over the DOM keys of
 * the vanished tier-L crowns (highest indices first), so the same node
 * visibly travels from the old cluster to its new pyramid slot.
 */
export function planMerge(prev: readonly number[], now: readonly number[]): MergePlan {
  const claims = new Map<string, string>()
  const consumed = new Set<string>()
  for (let level = CROWN_LEVEL_COUNT - 1; level >= 1; level -= 1) {
    const fresh = Math.max(0, now[level] - prev[level])
    if (fresh === 0) continue
    const pool: string[] = []
    for (let lower = level; lower >= 0; lower -= 1) {
      const vanished = Math.max(0, prev[lower] - now[lower])
      for (let i = prev[lower] - 1; i >= prev[lower] - vanished; i -= 1) {
        const key = `${lower}:${i}`
        if (!consumed.has(key)) pool.push(key)
      }
    }
    for (let i = now[level] - 1; i >= now[level] - fresh; i -= 1) {
      const heir = pool.shift()
      if (heir !== undefined) {
        claims.set(`${level}:${i}`, heir)
        consumed.add(heir)
      }
    }
  }
  const vanished: string[] = []
  const freshKeys: string[] = []
  for (let level = 0; level < CROWN_LEVEL_COUNT; level += 1) {
    const gone = Math.max(0, prev[level] - now[level])
    for (let i = prev[level] - 1; i >= prev[level] - gone; i -= 1) {
      const key = `${level}:${i}`
      if (!consumed.has(key)) vanished.push(key)
    }
    const fresh = Math.max(0, now[level] - prev[level])
    for (let i = now[level] - 1; i >= now[level] - fresh; i -= 1) {
      const key = `${level}:${i}`
      if (!claims.has(key)) freshKeys.push(key)
    }
  }
  return { claims, vanished, freshKeys }
}

function sameCounts(a: readonly number[], b: readonly number[]): boolean {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* the pyramid hook (layout + merge FX)                                */
/* ------------------------------------------------------------------ */

interface PyramidFx {
  stamp: number
  /** Consumed crowns rendered at their old spot, shrinking away. */
  ghosts: CrownSlot[]
  /** Keys that just crafted up (pop flash on their svg). */
  merged: ReadonlySet<string>
  /** Keys that just appeared (pop-in). */
  fresh: ReadonlySet<string>
  /** Burst position (px, same space as slots) when crowns were consumed. */
  flash: { x: number; y: number } | null
}

const EMPTY_FX: PyramidFx = {
  stamp: 0,
  ghosts: [],
  merged: EMPTY_SET,
  fresh: EMPTY_SET,
  flash: null,
}

export interface CrownPyramidView {
  /** Positioned crown elements, bottom row first (paint order). */
  crowns: ReactElement[]
  /** One-shot merge flash overlay (null unless a merge just happened). */
  flash: ReactElement | null
  /** Crowns beyond the 28-slot pile (the "+N" badge). */
  overflow: number
  /** Pile top (px, negative) so the badge can sit above the tip crown. */
  pileTop: number
}

/**
 * Render the crown pile for a count snapshot and animate it on change:
 * crowns keep their keys across merges (the crafted crown inherits a
 * vanished one's key and slides up), layout changes transition, consumed
 * crowns render as shrinking ghosts, and a flash bursts at the merge point.
 */
export function useCrownPyramid(
  counts: readonly number[],
  crownSize: number,
): CrownPyramidView {
  const now = new Array<number>(CROWN_LEVEL_COUNT).fill(0)
  for (let i = 0; i < Math.min(CROWN_LEVEL_COUNT, counts.length); i += 1) {
    now[i] = Math.max(0, Math.round(counts[i] ?? 0))
  }
  const countsKey = now.join(',')

  const prevCountsRef = useRef<number[] | null>(null)
  const keyMapRef = useRef<ReadonlyMap<string, string>>(EMPTY_KEY_MAP)
  const fxPlanRef = useRef<MergePlan | null>(null)
  const lastSlotsRef = useRef<CrownSlot[]>([])
  const fxTimerRef = useRef<number | undefined>(undefined)
  const [fx, setFx] = useState<PyramidFx>(EMPTY_FX)

  // Key inheritance must land in the same commit as the count change, so it
  // is computed during render (idempotent: re-renders with the same counts
  // skip it). The FX plan is handed to the effect below.
  const prev = prevCountsRef.current
  if (prev !== null && !sameCounts(prev, now)) {
    const plan = planMerge(prev, now)
    keyMapRef.current = plan.claims.size > 0 ? new Map(plan.claims) : EMPTY_KEY_MAP
    fxPlanRef.current = plan
  }
  prevCountsRef.current = now

  const { slots, overflow } = layoutCrownPyramid(now, crownSize, keyMapRef.current)

  useEffect(() => {
    const plan = fxPlanRef.current
    fxPlanRef.current = null
    if (plan === null) return
    const ghosts: CrownSlot[] = []
    for (const key of plan.vanished) {
      const slot = lastSlotsRef.current.find((candidate) => candidate.key === key)
      if (slot !== undefined) ghosts.push(slot)
    }
    let flash: { x: number; y: number } | null = null
    if (ghosts.length > 0) {
      let sumX = 0
      let sumY = 0
      for (const ghost of ghosts) {
        sumX += ghost.x
        sumY += ghost.y + ghost.size * 0.44
      }
      flash = { x: sumX / ghosts.length, y: sumY / ghosts.length }
    }
    const stamp = Date.now()
    setFx({
      stamp,
      ghosts,
      merged: new Set(plan.claims.values()),
      fresh: new Set(plan.freshKeys),
      flash,
    })
    if (fxTimerRef.current !== undefined) window.clearTimeout(fxTimerRef.current)
    fxTimerRef.current = window.setTimeout(() => {
      fxTimerRef.current = undefined
      setFx((current) => (current.stamp === stamp ? EMPTY_FX : current))
    }, 780)
  }, [countsKey])

  useEffect(() => {
    lastSlotsRef.current = slots
  })

  useEffect(() => () => {
    if (fxTimerRef.current !== undefined) window.clearTimeout(fxTimerRef.current)
  }, [])

  // Paint the bottom layer first so higher crowns overlap the ones below
  // (the tip paints last, on top). Each crown is a memoized leaf: typing in
  // the popover or toggling a flag re-renders the app, but an unchanged pile
  // skips diffing the heavy asset SVGs entirely.
  const crowns: ReactElement[] = []
  for (const slot of slots) {
    crowns.push(
      <PyramidCrown
        key={slot.key}
        dataKey={slot.key}
        x={slot.x}
        y={slot.y}
        size={slot.size}
        rot={slot.rot}
        tier={slot.tier}
        merged={fx.merged.has(slot.key)}
        fresh={fx.fresh.has(slot.key)}
      />,
    )
  }
  for (const ghost of fx.ghosts) {
    crowns.push(
      <div
        key={`ghost:${ghost.key}`}
        className="dsg-crown dsg-crown-ghost"
        style={{
          left: '50%',
          top: 0,
          transform: `translate(calc(-50% + ${ghost.x.toFixed(1)}px), ${ghost.y.toFixed(1)}px)`,
          '--dsg-rot': `${ghost.rot.toFixed(1)}deg`,
        } as CSSProperties}
      >
        <Crown level={ghost.tier} size={ghost.size} />
      </div>,
    )
  }

  let flash: ReactElement | null = null
  if (fx.flash !== null) {
    flash = (
      <span
        key={`flash-${fx.stamp}`}
        className="dsg-crown-flash"
        style={{
          left: '50%',
          top: 0,
          transform: `translate(calc(-50% + ${fx.flash.x.toFixed(1)}px), ${fx.flash.y.toFixed(1)}px)`,
        }}
      >
        <i />
        <b />
      </span>
    )
  }

  const pileTop = slots.length > 0
    ? Math.min(...slots.map((slot) => slot.y)) - crownSize * 0.12
    : 0

  return { crowns, flash, overflow, pileTop }
}

/* ------------------------------------------------------------------ */
/* components                                                          */
/* ------------------------------------------------------------------ */

/**
 * One positioned crown in the pile. Memoized on primitive props so an app
 * re-render (typing in the popover, toggling a flag) that leaves the pile
 * untouched skips reconciling the heavy asset SVGs entirely.
 */
const PyramidCrown = memo(function PyramidCrown(props: {
  dataKey: string
  x: number
  y: number
  size: number
  rot: number
  tier: number
  merged: boolean
  fresh: boolean
}): ReactElement {
  const { dataKey, x, y, size, rot, tier, merged, fresh } = props
  return (
    <div
      data-tier={tier}
      data-key={dataKey}
      className={`dsg-crown${tier >= 5 ? ' dsg-crown-magic' : ''}${merged ? ' dsg-crown-merged' : ''}${fresh ? ' dsg-crown-in' : ''}`}
      style={{
        left: '50%',
        top: 0,
        transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)`,
        '--dsg-rot': `${rot.toFixed(1)}deg`,
      } as CSSProperties}
    >
      <Crown level={tier} size={size} />
    </div>
  )
})

/** One crown of a given tier, `size` px tall, using the asset artwork. */
export const Crown = memo(function Crown(props: {
  level: number
  size: number
  style?: CSSProperties
}): ReactElement {
  const { level, size, style } = props
  const tier = crownLevel(level)
  const svg = cachedSvgElement(tier.id)
  if (svg === null) {
    return <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden style={style} />
  }
  return cloneElement(svg, { width: size, height: size, 'aria-hidden': true, style })
})

/** Mini crown cell for room member rows: the member's top tier + count. */
export function MiniCrown(props: {
  counts: readonly number[]
  /** How many of the top tier to show (capped). */
  cap?: number
  size: number
  style?: CSSProperties
}): ReactElement {
  const { counts, size, style } = props
  const cap = props.cap ?? 3
  let top = -1
  for (let i = CROWN_LEVEL_COUNT - 1; i >= 0; i -= 1) {
    if (counts[i] > 0) {
      top = i
      break
    }
  }
  if (top < 0) return <span style={style} />
  const tier = CROWN_LEVELS[top]
  return (
    <span
      className={top >= 5 ? 'dsg-mini-crown dsg-crown-magic' : 'dsg-mini-crown'}
      data-tier={top}
      style={{ ...style, '--dsg-rot': '-3deg' } as CSSProperties}
    >
      <Crown level={top} size={size} />
      {counts[top] > cap && <em className="dsg-mini-crown-count">×{counts[top]}</em>}
    </span>
  )
}
