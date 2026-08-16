/**
 * dsh-games browser half — mounts the floating DeepSeek-whale pet (with
 * token hats and the nickname / room UI) as a global surface on
 * document.body, and seats the plugin settings card in the Web UI plugin
 * group. The pet is host-global (no session dimension), so it mounts via a
 * single React root rather than a session-scoped slot, mirroring dsh-pet.
 * @module @linxin666/dsh-games/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { GamesApp } from './GamesApp.tsx'
import { GamesSettingsCard } from './SettingsCard.tsx'
import { en, NS, t, zh } from './locales.ts'
import { injectStyles } from './styles.ts'

export { GamesApp } from './GamesApp.tsx'
export { GamesSettingsCard } from './SettingsCard.tsx'
export type { GamesState, JoinedRoom, RoomMemberView, RoomView } from './api.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     * Spelled here with the same shape so this package can register without
     * depending on the sibling UI package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the group card supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Settings namespace the games card edits (the Host plugin registers it). */
const GAMES_SETTINGS_NS = 'games'

/** The games settings fields (the namespace's schema shape). */
interface GamesSettings {
  enabled?: boolean
  nickname?: string
  hatTokenStep?: number
}

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Client plugin body: register dictionaries, seat the settings card, and
 * mount the global pet surface while the plugin is enabled.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'games: dictionaries')

  const settingsScope = ctx.settingsScope.bind<GamesSettings>({ namespace: GAMES_SETTINGS_NS })
  const enabled = (): boolean => {
    const snapshot = settingsScope.getSnapshot()
    return snapshot.status === 'ready'
      ? snapshot.value?.enabled ?? true
      : snapshot.status === 'unavailable'
  }

  // Plugin configuration card: a self-contained form over the games HTTP API
  // (the settings namespace is not apiproxy-exposed for third parties).
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'games-settings',
    order: 150,
    locale: NS,
    inject: () => ({}),
  }, GamesSettingsCard))

  // The global pet surface and its poll loops live while the plugin is
  // enabled; toggling the setting off unmounts the pet and stops polling.
  let disposeUi: (() => void) | undefined
  const syncUi = (): void => {
    if (enabled() && disposeUi === undefined) {
      const styleTag = injectStyles()
      const container = document.createElement('div')
      container.dataset.dshGamesRoot = ''
      document.body.appendChild(container)
      const petRoot = createRoot(container)
      petRoot.render(createElement(GamesApp, { t }))

      disposeUi = () => {
        petRoot.unmount()
        container.remove()
        styleTag?.remove()
        disposeUi = undefined
      }
    } else if (!enabled() && disposeUi !== undefined) {
      disposeUi()
      disposeUi = undefined
    }
  }
  settingsScope.subscribe(syncUi)
  syncUi()
}
