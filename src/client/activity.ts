import type { MemberPhase } from '../rooms.ts'

/** One shared definition of the visual "active" state for every pet. */
export function isPetActive(phase: MemberPhase, tokenStreamActive: boolean): boolean {
  return tokenStreamActive ||
    phase === 'waiting' ||
    phase === 'thinking' ||
    phase === 'tool'
}
