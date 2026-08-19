/**
 * Room chat surfaces — the hover hint on the pet, the message composer, and
 * the floating message bubble that pops from a pet for a few seconds. Chat
 * lives in the room protocol: messages are posted to the game server and
 * delivered to every client through the 3s room heartbeat.
 * @module @kasidia/dsh-games/client/chat
 */
import type { ReactElement } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
/** How long a chat bubble stays on screen (matches the server cooldown). */
export declare const CHAT_BUBBLE_MS = 4000;
/** How long the fade-out (leaving) phase lasts before the bubble unmounts. */
export declare const CHAT_EXIT_MS = 250;
/** Maximum message length (matches the server-side MESSAGE_MAX_LENGTH). */
export declare const CHAT_MAX_CHARS = 20;
/** The hover hint: "click to chat". Shown above the bottom label bar. */
export declare function ChatHint(props: {
    t: Translate;
    disabled: boolean;
    onClick: () => void;
}): ReactElement;
/** The one-line composer (input + send), Enter submits. */
export declare function ChatComposer(props: {
    t: Translate;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
    onSend: () => void;
    onClose: () => void;
}): ReactElement;
/** A floating message bubble. Player identity stays in the pet label. */
export declare function ChatBubble(props: {
    text: string;
    leaving?: boolean;
}): ReactElement;
//# sourceMappingURL=chat.d.ts.map