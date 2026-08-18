/**
 * Room panel — browse the game server's public rooms, create a room (public
 * or invite-only), join by code, leave, and list members with their pets
 * (custom pet image or mini whale) + crowns + nickname + token count + phase.
 * @module @anglenaris/dsh-games/client/RoomPanel
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  gameServerApi,
  normalizeRoomCode,
  type GamesState,
  type JoinedRoom,
  type RoomView,
} from './api.ts'
import { formatTokens } from './locales.ts'
import { DeepSeekWhale, PartyHat, HAT_COLORS } from './whale.tsx'
import { MiniCrown } from './crowns.tsx'

interface RoomPanelProps {
  t: Translate
  room: JoinedRoom | null
  /** Own state (the member this panel reports). */
  own: GamesState
  /** Last join/create error from the parent. */
  error: string | null
  onCreate: (options: { name?: string; public?: boolean }) => Promise<boolean>
  onJoin: (code: string) => Promise<boolean>
  onLeave: () => void
}

/** Mini pet cell for one room member (custom image, or whale + crowns). */
function MemberPet(props: { member: { crowns: number[]; hats: number; petUrl?: string; petVariant?: string }; size: number }): ReactElement {
  const { member, size } = props
  if (member.petUrl !== undefined && member.petUrl !== '') {
    return (
      <span className="dsg-member-whale">
        <img className="dsg-member-pet" src={member.petUrl} alt="" style={{ width: size, height: size }} />
      </span>
    )
  }
  // Legacy fallback: old-version members report hats instead of crowns.
  const hasCrowns = member.crowns.some((count) => count > 0)
  if (!hasCrowns && member.hats > 0) {
    const shown = Math.min(member.hats, 3)
    const hatSize = Math.max(8, Math.round(size * 0.3))
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
        <DeepSeekWhale size={size} variant={member.petVariant} />
      </span>
    )
  }
  return (
    <span className="dsg-member-whale">
      {hasCrowns && <MiniCrown counts={member.crowns} size={Math.max(10, Math.round(size * 0.55))} />}
      <DeepSeekWhale size={size} variant={member.petVariant} />
    </span>
  )
}

/** One public-room row in the room list. */
function RoomListRow(props: {
  t: Translate
  room: RoomView
  busy: boolean
  onJoin: (code: string) => void
}): ReactElement {
  const { t, room, busy } = props
  return (
    <div className="dsg-room-row" data-testid="games-room-row">
      <div className="dsg-room-row-main">
        <span className="dsg-room-row-name">
          {room.name !== '' ? room.name : room.code}
        </span>
        <span className="dsg-room-row-meta">
          {room.code} · {room.members.length} {t('room.people')}
        </span>
      </div>
      <button
        type="button"
        className="dsg-btn-ghost"
        disabled={busy}
        onClick={() => props.onJoin(room.code)}
      >
        {t('room.join')}
      </button>
    </div>
  )
}

/** The create/join/member-list UI. */
export function RoomPanel(props: RoomPanelProps): ReactElement {
  const { t, room, own, error } = props
  const [mode, setMode] = useState<'list' | 'join'>('list')
  const [publicRooms, setPublicRooms] = useState<RoomView[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listNote, setListNote] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState('')
  const [roomNameDraft, setRoomNameDraft] = useState('')
  const [roomPublic, setRoomPublic] = useState(true)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const refreshList = useCallback(async (): Promise<void> => {
    setListBusy(true)
    setListNote(null)
    try {
      const result = await gameServerApi.listRooms(own.serverUrl, own.authToken)
      setPublicRooms(result.rooms)
      if (result.rooms.length === 0) setListNote(t('room.listEmpty'))
    } catch {
      setListNote(t('room.listError'))
    } finally {
      setListBusy(false)
    }
  }, [own.serverUrl, own.authToken, t])

  // Load the room list when the panel opens (not joined) or the server URL changes.
  useEffect(() => {
    if (room === null) {
      void refreshList()
    }
  }, [room === null, own.serverUrl, refreshList])

  const runBusy = async (operation: () => Promise<boolean>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await operation()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const doCreate = (): void => {
    void runBusy(() => props.onCreate({ name: roomNameDraft.trim() || undefined, public: roomPublic }))
  }

  const doJoin = (): void => {
    const code = normalizeRoomCode(codeDraft)
    if (code === '') return
    void runBusy(() => props.onJoin(code))
  }

  const copyRoom = async (): Promise<void> => {
    if (room === null) return
    try {
      await navigator.clipboard.writeText(`${room.base}  房间代码 ${room.code}`)
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

        {/* Public room list from the game server. */}
        <div className="dsg-field">
          <div className="dsg-row" style={{ justifyContent: 'space-between' }}>
            <label>{t('room.list')}</label>
            <button type="button" className="dsg-btn-ghost" disabled={listBusy} onClick={() => { void refreshList() }}>
              {t('room.refresh')}
            </button>
          </div>
          <div className="dsg-room-list" data-testid="games-room-list">
            {publicRooms.map((entry) => (
              <RoomListRow
                key={entry.code}
                t={t}
                  room={entry}
                  busy={busy || listBusy}
                  onJoin={(code) => {
                    void runBusy(() => props.onJoin(code))
                  }}
              />
            ))}
            {publicRooms.length === 0 && listNote !== null && <p className="dsg-hint">{listNote}</p>}
          </div>
        </div>

        {mode === 'list' ? (
          <div className="dsg-field">
            <label>{t('room.create')}</label>
            <input
              className="dsg-input"
              value={roomNameDraft}
              maxLength={24}
              placeholder={t('room.namePlaceholder')}
              onChange={(e) => setRoomNameDraft(e.target.value)}
            />
            <div className="dsg-row" style={{ marginTop: 4 }}>
              <label className="dsg-radio" data-on={roomPublic}>
                <input
                  type="radio"
                  name="dsg-room-visibility"
                  checked={roomPublic}
                  onChange={() => setRoomPublic(true)}
                />
                {t('room.public')}
              </label>
              <label className="dsg-radio" data-on={!roomPublic}>
                <input
                  type="radio"
                  name="dsg-room-visibility"
                  checked={!roomPublic}
                  onChange={() => setRoomPublic(false)}
                />
                {t('room.inviteOnly')}
              </label>
            </div>
            <p className="dsg-hint">{roomPublic ? t('room.publicHint') : t('room.inviteHint')}</p>
            <div className="dsg-row">
              <button type="button" className="dsg-btn" disabled={busy} onClick={doCreate} data-testid="games-room-create">
                {t('room.create')}
              </button>
              <button
                type="button"
                className="dsg-btn-ghost"
                data-testid="games-room-mode-join"
                onClick={() => setMode('join')}
              >
                {t('room.joinByCode')}
              </button>
            </div>
          </div>
        ) : (
          <div>
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
                  if (e.key === 'Enter' && !busy) doJoin()
                }}
              />
            </div>
            <div className="dsg-row">
              <button type="button" className="dsg-btn" disabled={busy || codeDraft.trim() === ''} onClick={doJoin} data-testid="games-room-join">
                {t('room.join')}
              </button>
              <button type="button" className="dsg-btn-ghost" onClick={() => setMode('list')}>
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
    <div data-testid="games-room-joined" data-room-code={room.code}>
      <div className="dsg-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{room.name !== '' ? room.name : t('room.title')}</strong>
        <button type="button" className="dsg-btn-danger dsg-btn-ghost" onClick={props.onLeave} data-testid="games-room-leave">
          {t('room.leave')}
        </button>
      </div>
      <div className="dsg-room-info">
        <div className="dsg-row" style={{ justifyContent: 'space-between' }}>
          <span>
            {t('room.joined', { code: room.code })}
            <span className="dsg-room-visibility-tag" data-public={room.public}>
              {room.public ? t('room.public') : t('room.inviteOnly')}
            </span>
            <span style={{ fontSize: 11, opacity: 0.7, display: 'block' }}>{room.base}</span>
          </span>
          <button type="button" className="dsg-btn-ghost dsg-room-copy" onClick={() => { void copyRoom() }}>
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
            <MemberPet member={member} size={30} />
            <div className="dsg-member-meta">
              <div className="dsg-member-name">
                {member.nickname}
                {member.memberId === own.memberId && <span style={{ opacity: 0.6, fontWeight: 400 }}>（{t('room.you')}）</span>}
              </div>
              <div className="dsg-member-sub">
                {formatTokens(member.tokens)} · {t('pet.crowns', { n: member.crowns.reduce((sum, count) => sum + count, 0) })}
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
