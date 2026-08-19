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
 * @module @kasidia/dsh-games/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { GamesApp } from './GamesApp.tsx';
export { GamesSettingsCard } from './SettingsCard.tsx';
export type { GamesState, JoinedRoom, RoomMemberView, RoomView } from './api.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * The top-level plugin configuration section (设置 → 插件 → 可配置) lists
         * one card per configurable plugin. Registering here — instead of the
         * `web-ui.plugin.item` group slot — keeps this plugin's settings card a
         * standalone entry, independent of any other plugin's UI group. The
         * section supplies no owner props.
         */
        'settings.plugin.item': {
            kind: 'keyed';
            scope: 'root';
            owner: SettingsPluginItemOwnerProps;
        };
    }
}
/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
    /** Marker field: card owner props are intentionally empty. */
    children?: never;
}
/** Required services. */
export declare const inject: string[];
/**
 * Client plugin body: register dictionaries, seat the settings card, and
 * mount the global pet surface while the plugin is enabled.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map