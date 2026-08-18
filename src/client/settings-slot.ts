/** Stable keyed-slot cell occupied by the games settings card. */
export const GAMES_SETTINGS_SLOT = {
  name: 'settings.plugin.item',
  key: 'games',
} as const

/**
 * Compatibility fields for pre-keyed DSH builds. New keyed runtimes ignore
 * them, while older list runtimes still require them during registration.
 */
export const LEGACY_GAMES_SETTINGS_SLOT = {
  id: 'games',
  order: 150,
} as const
