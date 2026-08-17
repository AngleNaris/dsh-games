/**
 * Crown artwork — one SVG crown per tier (ten tiers: bronze → silver → gold
 * → platinum → amethyst, then the magic tier repeats the metals with a
 * Minecraft-style flowing enchantment glint), stacked in a pyramid above the
 * pet: the lowest tier fills the bottom row, each higher tier one row up.
 * All inline SVG + CSS, no external assets.
 * @module @linxin666/dsh-games/client/crowns
 */

import type { CSSProperties, ReactElement } from 'react'
import {
  CROWN_LEVEL_COUNT,
  CROWN_LEVELS,
  crownLevel,
  type CrownLevel,
} from '../crowns.ts'

/** Gradient/pattern ids — unique per page (the pet can render many crowns). */
let crownIdCounter = 0

function nextId(prefix: string): string {
  crownIdCounter += 1
  return `dsg-${prefix}-${crownIdCounter}`
}

/** The crown silhouette (body + band + orbs), viewBox 0 0 40 40. */
export function CrownShape(props: {
  level: CrownLevel
  /** Fill the shape with this gradient/pattern id ('' = plain metal fill). */
  fill: string
}): ReactElement {
  const { level, fill } = props
  const url = fill === '' ? level.metal : `url(#${fill})`
  return (
    <g>
      {/* three-peak body */}
      <path
        d="M5 29 L5 16.5 L13 23.5 L16.5 7.5 L20 15 L23.5 7.5 L27 23.5 L35 16.5 L35 29 Z"
        fill={url}
        stroke={level.dark}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* base band */}
      <rect x="5" y="29" width="30" height="5.5" rx="1.2" fill={level.dark} />
      {/* orbs on the side peaks */}
      <circle cx="16.5" cy="5.6" r="2.9" fill={level.light} stroke={level.dark} strokeWidth="0.6" />
      <circle cx="23.5" cy="5.6" r="2.9" fill={level.light} stroke={level.dark} strokeWidth="0.6" />
      {/* center jewel */}
      <circle cx="20" cy="15" r="2.1" fill={level.light} />
    </g>
  )
}

/** One crown of a given tier, `size` px tall. Magic tiers get the glint. */
export function Crown(props: {
  level: number
  size: number
  style?: CSSProperties
}): ReactElement {
  const { level, size, style } = props
  const tier = crownLevel(level)
  const bodyId = nextId('crown')
  const glintId = nextId('glint')

  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={style} aria-hidden>
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tier.light} />
          <stop offset="55%" stopColor={tier.metal} />
          <stop offset="100%" stopColor={tier.dark} />
        </linearGradient>
        {tier.magic && (
          <pattern id={glintId} patternUnits="userSpaceOnUse" width="14" height="14">
            <animateTransform
              attributeName="patternTransform"
              type="translate"
              values="0 0; 14 14"
              dur="0.9s"
              repeatCount="indefinite"
            />
            <line x1="0" y1="14" x2="14" y2="0" stroke="rgba(255,255,255,0.85)" strokeWidth="3.2" />
          </pattern>
        )}
      </defs>
      <g>
        <CrownShape level={tier} fill={bodyId} />
        {tier.magic && <CrownShape level={tier} fill={glintId} />}
      </g>
    </svg>
  )
}

/** How many crowns to render per pyramid row (the rest collapse into a badge). */
export const MAX_CROWNS_PER_ROW = 12

/** Layer gap between pyramid rows, as a fraction of crown size. */
export const PYRAMID_ROW_GAP = 0.66

/**
 * Stack the crown counts into a pyramid above the pet: row i (bottom = tier
 * 0) holds `counts[i]` crowns, each higher tier one row up. Returns the
 * positioned crown elements plus the total overflow count.
 */
export function renderCrowns(
  counts: readonly number[],
  crownSize: number,
): { crowns: ReactElement[]; overflow: number } {
  const rows: { tier: number; n: number }[] = []
  let overflow = 0
  const tiers = Math.min(CROWN_LEVEL_COUNT, counts.length)
  for (let tier = 0; tier < tiers; tier += 1) {
    const count = Math.max(0, Math.round(counts[tier]))
    if (count === 0) continue
    const shown = Math.min(count, MAX_CROWNS_PER_ROW)
    if (count > shown) overflow += count - shown
    rows.push({ tier, n: shown })
  }
  const crowns: ReactElement[] = []
  const spacing = crownSize * 0.82
  for (let row = 0; row < rows.length; row += 1) {
    const { tier, n } = rows[row]
    const y = -(crownSize * 0.78) - row * crownSize * PYRAMID_ROW_GAP
    for (let i = 0; i < n; i += 1) {
      const x = (i - (n - 1) / 2) * spacing
      crowns.push(
        <div
          key={`${tier}-${i}`}
          className={tier >= 5 ? 'dsg-crown dsg-crown-magic' : 'dsg-crown'}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)`,
          }}
        >
          <Crown level={tier} size={crownSize} />
        </div>,
      )
    }
  }
  return { crowns, overflow }
}

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
    <span className={top >= 5 ? 'dsg-mini-crown dsg-crown-magic' : 'dsg-mini-crown'} style={style}>
      <Crown level={top} size={size} />
      {counts[top] > cap && <em className="dsg-mini-crown-count">×{counts[top]}</em>}
    </span>
  )
}
