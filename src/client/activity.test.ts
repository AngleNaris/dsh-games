import { describe, expect, it } from 'vitest'
import { isPetActive } from './activity.ts'

describe('shared pet activity', () => {
  it('activates every output-producing phase and plain token streaming', () => {
    expect(isPetActive('idle', true)).toBe(true)
    expect(isPetActive('waiting', false)).toBe(true)
    expect(isPetActive('thinking', false)).toBe(true)
    expect(isPetActive('tool', false)).toBe(true)
  })

  it('keeps idle and completed pets in the sleeping state', () => {
    expect(isPetActive('idle', false)).toBe(false)
    expect(isPetActive('done', false)).toBe(false)
  })
})
