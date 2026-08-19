/**
 * dsh-games settings card — a collapsible DSH-style plugin item: a card
 * header (name + description + chevron) that reveals the form below, like the
 * official plugin cards in DSH's own 设置 → 插件 list. The form is a
 * self-contained editor over the games HTTP API (enabled / hide-pet /
 * server URL + auth token). Game rules (crown ladder, upload caps) are
 * configured on the game server and shown read-only here.
 *
 * It deliberately does not depend on the settings-surface namespace exposure:
 * the official dsh-host-apiproxy allowlists third-party namespaces out, so
 * the card talks to `/api/games/*` directly (the host mirrors values into the
 * settings document itself).
 * @module @kasidia/dsh-games/client/SettingsCard
 */
import { type ReactElement } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** The registration-side face (empty: the card drives itself via the API). */
export interface GamesSettingsCardFace {
    /** Marker field: no injected share is needed. */
    children?: never;
}
/** Props the renderer binds for the games settings card. */
export type GamesSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'games'> & GamesSettingsCardFace;
/** The games settings card body. */
export declare function GamesSettingsCard(props: GamesSettingsCardProps): ReactElement;
//# sourceMappingURL=SettingsCard.d.ts.map