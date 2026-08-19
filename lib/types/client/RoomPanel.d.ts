/**
 * Room panel — browse the game server's public rooms, create a room (public
 * or invite-only), join by code, leave, and list members with their pets
 * (custom pet image or mini whale) + crowns + nickname + token count + phase.
 * @module @kasidia/dsh-games/client/RoomPanel
 */
import { type ReactElement } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { type GamesState, type JoinedRoom } from './api.ts';
interface RoomPanelProps {
    t: Translate;
    room: JoinedRoom | null;
    /** Own state (the member this panel reports). */
    own: GamesState;
    /** Last join/create error from the parent. */
    error: string | null;
    onCreate: (options: {
        name?: string;
        public?: boolean;
    }) => Promise<boolean>;
    onJoin: (code: string) => Promise<boolean>;
    onLeave: () => void;
}
/** The create/join/member-list UI. */
export declare function RoomPanel(props: RoomPanelProps): ReactElement;
export {};
//# sourceMappingURL=RoomPanel.d.ts.map