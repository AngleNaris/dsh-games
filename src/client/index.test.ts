import { describe, expect, it } from 'vitest'
import { GAMES_SETTINGS_SLOT } from './settings-slot.ts'

describe('games settings slot registration', () => {
  it('occupies the keyed settings.plugin.item cell', () => {
    expect(GAMES_SETTINGS_SLOT).toMatchObject({
      name: 'settings.plugin.item',
      key: 'games',
    })
  })
})
