/**
 * Room chat surfaces — the hover hint on the pet, the message composer, and
 * the floating message bubble that pops from a pet for a few seconds. Chat
 * lives in the room protocol: messages are posted to the game server and
 * delivered to every client through the 3s room heartbeat.
 * @module @kasidia/dsh-games/client/chat
 */

import type { ReactElement } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

/** How long a chat bubble stays on screen (matches the server cooldown). */
export const CHAT_BUBBLE_MS = 4_000

/** How long the fade-out (leaving) phase lasts before the bubble unmounts. */
export const CHAT_EXIT_MS = 250

/** Maximum message length (matches the server-side MESSAGE_MAX_LENGTH). */
export const CHAT_MAX_CHARS = 20

/** The hover hint: "click to chat". Shown above the bottom label bar. */
export function ChatHint(props: {
  t: Translate
  disabled: boolean
  onClick: () => void
}): ReactElement {
  const { t, disabled, onClick } = props
  // pointerdown (not click): the pet's own onPointerDown takes pointer capture
  // for dragging, which would steal the click away from this button.
  return (
    <button
      type="button"
      className="dsg-chat-hint"
      data-disabled={disabled}
      title={disabled ? t('chat.cooldown') : t('chat.hint')}
      aria-label={t('chat.hint')}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!disabled) onClick()
      }}
    >
      <span aria-hidden>💬</span>
      {disabled ? t('chat.cooldown') : t('chat.hint')}
    </button>
  )
}

/** The one-line composer (input + send), Enter submits. */
export function ChatComposer(props: {
  t: Translate
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onSend: () => void
  onClose: () => void
}): ReactElement {
  const { t, value, disabled, onChange, onSend, onClose } = props
  const send = (): void => {
    if (!disabled && value.trim() !== '') onSend()
  }
  return (
    <span
      className="dsg-chat-composer"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className="dsg-chat-input"
        value={value}
        maxLength={CHAT_MAX_CHARS}
        placeholder={t('chat.placeholder')}
        aria-label={t('chat.placeholder')}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key === 'Enter') send()
        }}
      />
      <button type="button" className="dsg-btn" disabled={disabled || value.trim() === ''} onClick={send}>
        {t('chat.send')}
      </button>
      <button
        type="button"
        className="dsg-chat-close"
        title={t('chat.close')}
        aria-label={t('chat.close')}
        onClick={onClose}
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  )
}

/** A floating message bubble. Player identity stays in the pet label. */
export function ChatBubble(props: { text: string; leaving?: boolean }): ReactElement {
  const { text, leaving } = props
  return (
    <span className={`dsg-chat-bubble${leaving === true ? ' dsg-chat-leaving' : ''}`} aria-live="polite">
      {text}
    </span>
  )
}
