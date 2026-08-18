/**
 * dsh-games browser half — mounts the floating DeepSeek-whale pet (with the
 * crown pyramid and the nickname / room / customization UI) as a global
 * surface on document.body, and seats the plugin settings card directly in
 * the top-level plugin configuration section (设置 → 插件 → 可配置), NOT inside
 * the Web UI plugin group — this plugin is standalone and does not depend on
 * any other plugin's surfaces.
 *
 * The pet surface lives inside a `ctx.effect` with a full cleanup: on HMR
 * reload the old root unmounts instead of stacking a second overlapping pet
 * (the module re-apply used to leave the old root mounted on document.body).
 * @module @anglenaris/dsh-games/client
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
     * The top-level plugin configuration section (设置 → 插件 → 可配置) lists
     * one card per configurable plugin. Registering here — instead of the
     * `web-ui.plugin.item` group slot — keeps this plugin's settings card a
     * standalone entry, independent of any other plugin's UI group. The
     * section supplies no owner props.
     */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
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
  crownTokenStep?: number
  petVariant?: string
  serverUrl?: string
}

/** DOM marker of the pet root container (cleaned up on re-apply). */
const PET_ROOT_MARKER = 'data-dsh-games-root'

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Client plugin body: register dictionaries, seat the settings card, and
 * mount the global pet surface while the plugin is enabled.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'games: dictionaries')

  // HMR re-apply (or a previously stacked instance) may have left a pet root
  // on document.body — drop any leftovers before mounting the new one, so the
  // page never shows two overlapping whales.
  for (const stale of document.querySelectorAll<HTMLElement>(`[${PET_ROOT_MARKER}]`)) {
    stale.remove()
  }

  const settingsScope = ctx.settingsScope.bind<GamesSettings>({ namespace: GAMES_SETTINGS_NS })
  const enabled = (): boolean => {
    const snapshot = settingsScope.getSnapshot()
    return snapshot.status === 'ready'
      ? snapshot.value?.enabled ?? true
      : snapshot.status === 'unavailable'
  }

  // Plugin configuration card: a self-contained form over the games HTTP API,
  // contributed as its own card in the top-level plugin configuration list
  // (the settings namespace is not apiproxy-exposed for third parties).
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'games',
    order: 150,
    locale: NS,
    inject: () => ({}),
  }, GamesSettingsCard))

  // The global pet surface and its poll loops live inside an effect with a
  // real cleanup: on plugin dispose / HMR reload the root unmounts and the
  // container leaves the DOM. The `enabled` setting only decides what the
  // root renders — the surface itself stays mounted while the plugin runs.
  ctx.effect(() => {
    // The stylesheet is idempotent and shared with any concurrently mounted
    // instance (HMR overlap) — inject it, but never remove it on dispose.
    injectStyles()
    const container = document.createElement('div')
    container.dataset.dshGamesRoot = ''
    document.body.appendChild(container)
    const petRoot = createRoot(container)

    const render = (): void => {
      if (enabled()) {
        petRoot.render(createElement(GamesApp, { t }))
      } else {
        // Master switch off: render nothing (the summon/hide UI is gone too);
        // the root stays mounted so it returns the moment the setting flips.
        petRoot.render(null)
      }
    }
    const unsubscribe = settingsScope.subscribe(render)
    render()

    return () => {
      unsubscribe()
      petRoot.unmount()
      container.remove()
    }
  }, 'games: pet surface')
}
