/**
 * The floating pet app — a single React root mounted on document.body (the
 * pet is host-global, no session dimension, mirroring the dsh-pet pattern).
 * Owns the poll loops (own state ~2s, room heartbeat+snapshot ~3s while
 * joined), the draggable pet with its crown pyramid, the token-usage effects
 * (label shimmer while consuming, burst + crown bubbles on gains), and the
 * nickname / room / pet-customization popover.
 * @module @kasidia/dsh-games/client/GamesApp
 */
import { type ReactElement } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
interface GamesAppProps {
    t: Translate;
}
export declare function GamesApp(props: GamesAppProps): ReactElement;
export {};
//# sourceMappingURL=GamesApp.d.ts.map