/**
 * Room panel — create/join/leave a multiplayer room and list its members
 * with their pets (mini whale + hats + nickname + token count + phase dot).
 * @module @linxin666/dsh-games/client/RoomPanel
 */

import { useState, type ReactElement } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { normalizeRoomCode, normalizeRoomUrl, type GamesState, type JoinedRoom } from './api.ts'
import { formatTokens } from './locales.ts'
import { DeepSeekWhale, HAT_COLORS, PartyHat } from './whale.tsx'

interface RoomPanelProps {
  t: Translate
  room: JoinedRoom | null
  /** Own state (the member this panel reports). */
  own: GamesState
  /** Last join/create error from the parent. */
  error: string | null
  onCreate: () => void
  onJoin: (url: string, code: string) => void
  onLeave: () => void
}

/** Mini pet cell for one room member (whale + up to 3 hats). */
function MemberPet(props: { hats: number; size: number }): ReactElement {
  const shown = Math.min(props.hats, 3)
  const hatSize = Math.max(8, Math.round(props.size * 0.3))
  const hats = []
  for (let i = 0; i < shown; i += 1) {
    const x = (i - (shown - 1) / 2) * hatSize * 0.55
    const y = -hatSize * 0.45
    hats.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)`,
        }}
      >
        <PartyHat color={HAT_COLORS[i % HAT_COLORS.length]} size={hatSize} />
      </div>,
    )
  }
  return (
    <span className="dsg-member-whale">
      {hats}
      <DeepSeekWhale size={props.size} />
    </span>
  )
}

/** The create/join/member-list UI. */
export function RoomPanel(props: RoomPanelProps): ReactElement {
  const { t, room, own, error } = props
  const [mode, setMode] = useState<'choose' | 'join'>('choose')
  const [urlDraft, setUrlDraft] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const doCreate = (): void => {
    setBusy(true)
    props.onCreate()
    setBusy(false)
  }

  const doJoin = (): void => {
    const url = normalizeRoomUrl(urlDraft)
    const code = normalizeRoomCode(codeDraft)
    if (url === '' || code === '') return
    setBusy(true)
    props.onJoin(url, code)
    setBusy(false)
  }

  const copyRoom = async (): Promise<void> => {
    if (room === null) return
    try {
      await navigator.clipboard.writeText(`${room.url}  房间代码 ${room.code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard unavailable; the code is displayed anyway.
    }
  }

  if (room === null) {
    return (
      <div data-testid="games-room-empty">
        <div className="dsg-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <strong>{t('room.title')}</strong>
        </div>
        {mode === 'choose' ? (
          <div className="dsg-row">
            <button type="button" className="dsg-btn" disabled={busy} onClick={doCreate} data-testid="games-room-create">
              {t('room.create')}
            </button>
            <button type="button" className="dsg-btn-ghost" onClick={() => setMode('join')}>
              {t('room.join')}
            </button>
          </div>
        ) : (
          <div>
            <div className="dsg-field">
              <label htmlFor="dsg-room-url">{t('room.url')}</label>
              <input
                id="dsg-room-url"
                className="dsg-input"
                value={urlDraft}
                placeholder={t('room.urlPlaceholder')}
                onChange={(e) => setUrlDraft(e.target.value)}
              />
            </div>
            <div className="dsg-field">
              <label htmlFor="dsg-room-code">{t('room.code')}</label>
              <input
                id="dsg-room-code"
                className="dsg-input"
                value={codeDraft}
                maxLength={8}
                placeholder={t('room.codePlaceholder')}
                onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doJoin()
                }}
              />
            </div>
            <div className="dsg-row">
              <button type="button" className="dsg-btn" disabled={busy || urlDraft.trim() === '' || codeDraft.trim() === ''} onClick={doJoin} data-testid="games-room-join">
                {t('room.join')}
              </button>
              <button type="button" className="dsg-btn-ghost" onClick={() => setMode('choose')}>
                {t('room.create')}
              </button>
            </div>
          </div>
        )}
        {error !== null && <p className="dsg-error" data-testid="games-room-error">{t('room.joinError', { error })}</p>}
        <p className="dsg-hint">{t('room.empty')}</p>
      </div>
    )
  }

  return (
    <div data-testid="games-room-joined">
      <div className="dsg-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{t('room.title')}</strong>
        <button type="button" className="dsg-btn-danger dsg-btn-ghost" onClick={props.onLeave} data-testid="games-room-leave">
          {t('room.leave')}
        </button>
      </div>
      <div className="dsg-room-info">
        <div className="dsg-row" style={{ justifyContent: 'space-between' }}>
          <span>
            {t('room.joined', { code: room.code })} · <span style={{ fontSize: 11, opacity: 0.7 }}>{room.url}</span>
          </span>
          <button type="button" className="dsg-btn-ghost" onClick={() => { void copyRoom() }}>
            {copied ? t('room.copied') : t('room.copy')}
          </button>
        </div>
        {room.offline && <p className="dsg-error" data-testid="games-room-offline">{t('room.offline')}</p>}
      </div>
      <p className="dsg-hint" style={{ marginTop: 0 }}>{t('room.shareHint')}</p>
      <div className="dsg-members" data-testid="games-room-members">
        {room.members.map((member) => (
          <div
            key={member.memberId}
            className={member.memberId === own.memberId ? 'dsg-member dsg-member-you' : 'dsg-member'}
          >
            <MemberPet hats={member.hats} size={30} />
            <div className="dsg-member-meta">
              <div className="dsg-member-name">
                {member.nickname}
                {member.memberId === own.memberId && <span style={{ opacity: 0.6, fontWeight: 400 }}>（{t('room.you')}）</span>}
              </div>
              <div className="dsg-member-sub">
                {formatTokens(member.tokens)} · {t('pet.hats', { n: member.hats })}
              </div>
            </div>
            <span className="dsg-member-dot" data-phase={member.phase} title={member.phase} />
          </div>
        ))}
        {room.members.length === 0 && <p className="dsg-hint">{t('room.empty')}</p>}
      </div>
    </div>
  )
}
