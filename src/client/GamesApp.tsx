/**
 * The floating pet app — a single React root mounted on document.body (the
 * pet is host-global, no session dimension, mirroring the dsh-pet pattern).
 * Owns the poll loops (own state ~2s, room heartbeat+snapshot ~3s while
 * joined), the draggable DeepSeek-whale pet with token hats, and the
 * nickname / room popover.
 * @module @linxin666/dsh-games/client/GamesApp
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  clearStoredRoom,
  gamesApi,
  loadStoredRoom,
  roomApi,
  storeRoom,
  type GamesState,
  type JoinedRoom,
} from './api.ts'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { formatTokens } from './locales.ts'
import { DeepSeekWhale, MAX_RENDERED_HATS, renderHats } from './whale.tsx'
import { RoomPanel } from './RoomPanel.tsx'

/** Poll cadence for the own host snapshot. */
const STATE_POLL_MS = 2_000
/** Heartbeat + snapshot cadence while joined to a room. */
const ROOM_POLL_MS = 3_000

interface GamesAppProps {
  t: Translate
}

/** Build a member report from the current own state. */
function memberOf(state: GamesState): {
  memberId: string
  nickname: string
  tokens: number
  hats: number
  phase: GamesState['phase']
} {
  return {
    memberId: state.memberId,
    nickname: state.nickname,
    tokens: state.tokens,
    hats: state.hats,
    phase: state.phase,
  }
}

/** The main app: pet, popover, room lifecycle, poll loops. */
export function GamesApp(props: GamesAppProps): ReactElement {
  const { t } = props
  const [state, setState] = useState<GamesState | null>(null)
  const [room, setRoom] = useState<JoinedRoom | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [nicknameSaved, setNicknameSaved] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const stateRef = useRef<GamesState | null>(null)
  stateRef.current = state

  // ---- own-state polling (visible tab only) ----
  useEffect(() => {
    let timer: number | undefined
    const stop = (): void => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const poll = (): void => {
      gamesApi.state().then((next) => {
        setState(next)
      }, () => {
        // Transient; the next poll resyncs.
      })
    }
    const start = (): void => {
      if (timer === undefined && document.visibilityState === 'visible') {
        timer = window.setInterval(poll, STATE_POLL_MS)
      }
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        poll()
        start()
      } else {
        stop()
      }
    }
    poll()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ---- phase bubble: show copy while active phases run, cheer on done ----
  const lastPhase = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (state === null) return
    const phase = state.phase
    if (phase === lastPhase.current) return
    lastPhase.current = phase
    if (phase === 'thinking' || phase === 'waiting' || phase === 'tool') {
      setBubble(t(`pet.phase.${phase}`))
      const timer = window.setTimeout(() => setBubble(null), 4_000)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'done') {
      setBubble(t('pet.phase.done'))
      const timer = window.setTimeout(() => setBubble(null), 3_000)
      return () => window.clearTimeout(timer)
    }
    setBubble(null)
  }, [state?.phase, t])

  // ---- room heartbeat + snapshot polling ----
  const roomKey = room === null ? null : `${room.url}#${room.code}`
  useEffect(() => {
    if (room === null || state === null) return
    const { url, code } = room
    let timer: number | undefined
    const tick = (): void => {
      if (document.visibilityState !== 'visible') return
      const member = memberOf(stateRef.current ?? state)
      roomApi.heartbeat(url, code, member).then((result) => {
        setRoom((prev) => prev === null ? prev : {
          ...prev,
          members: result.room.members,
          offline: false,
        })
      }, () => {
        setRoom((prev) => prev === null ? prev : { ...prev, offline: true })
      })
    }
    timer = window.setInterval(tick, ROOM_POLL_MS)
    tick()
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
    }
    // Re-arm only when the room identity or own state changes.
  }, [roomKey, state?.tokens, state?.nickname, state?.hats, state?.phase])

  // ---- room join ----
  const joinRoom = useCallback(async (url: string, code: string): Promise<boolean> => {
    setRoomError(null)
    try {
      const result = await roomApi.state(url, code)
      setRoom({ url, code, members: result.room.members, offline: false })
      storeRoom(url, code)
      return true
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : String(error))
      return false
    }
  }, [])

  const createRoom = useCallback(async (): Promise<boolean> => {
    setRoomError(null)
    try {
      const result = await gamesApi.createRoom()
      const origin = window.location.origin
      const ok = await joinRoom(origin, result.room.code)
      if (ok) setBubble(t('room.created'))
      return ok
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : String(error))
      return false
    }
  }, [joinRoom, t])

  const leaveRoom = useCallback(async (): Promise<void> => {
    const current = roomRef.current
    const memberId = stateRef.current?.memberId
    if (current !== null && memberId !== undefined) {
      try {
        await roomApi.leave(current.url, current.code, memberId)
      } catch {
        // Best-effort; the room sweeps the member on heartbeat timeout anyway.
      }
    }
    clearStoredRoom()
    setRoom(null)
    setRoomError(null)
  }, [])
  const roomRef = useRef<JoinedRoom | null>(null)
  roomRef.current = room

  // ---- restore a previously joined room on mount ----
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const stored = loadStoredRoom()
    if (stored === undefined) return
    // Re-validate silently; the join form surfaces errors for manual joins.
    roomApi.state(stored.url, stored.code).then((result) => {
      setRoom({ url: stored.url, code: stored.code, members: result.room.members, offline: false })
    }, () => {
      setRoom({ url: stored.url, code: stored.code, members: [], offline: true })
    })
  }, [])

  // ---- nickname ----
  const saveNickname = useCallback(async (): Promise<void> => {
    const name = nicknameDraft.trim()
    if (name === '') return
    setNicknameSaving(true)
    try {
      const result = await gamesApi.setNickname(name)
      if (result.ok) {
        setNicknameSaved(true)
        window.setTimeout(() => setNicknameSaved(false), 1_500)
        // The next state poll picks the new nickname up.
      }
    } catch {
      // Ignore; next poll resyncs.
    } finally {
      setNicknameSaving(false)
    }
  }, [nicknameDraft])

  // ---- drag ----
  const drag = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null)
  const movedRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const onPointerDown = useCallback((event: React.PointerEvent): void => {
    if (state === null) return
    event.preventDefault()
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      right: state.display.right,
      bottom: state.display.bottom,
    }
    movedRef.current = false
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [state])
  const onPointerMove = useCallback((event: React.PointerEvent): void => {
    const start = drag.current
    if (start === null || state === null) return
    const dx = event.clientX - start.startX
    const dy = event.clientY - start.startY
    if (Math.abs(dx) + Math.abs(dy) > 5) movedRef.current = true
    const right = Math.max(0, start.right - dx)
    const bottom = Math.max(0, start.bottom - dy)
    setState({ ...state, display: { ...state.display, right, bottom } })
  }, [state])
  const onPointerUp = useCallback((): void => {
    const start = drag.current
    drag.current = null
    setDragging(false)
    if (start === null || state === null) return
    void gamesApi.setDisplay({ right: state.display.right, bottom: state.display.bottom }).catch(() => {
      // Ignore; next poll resyncs.
    })
  }, [state])

  if (state === null) {
    // First snapshot not in yet — render nothing to avoid a flicker.
    return <span data-dsh-games data-testid="games-pending" />
  }

  if (!state.enabled) {
    // Master switch off (settings): hide the pet entirely; polling keeps
    // running so the pet returns as soon as it is turned back on.
    return <span data-dsh-games data-testid="games-disabled" />
  }

  const display = state.display
  const hatSize = Math.max(14, Math.round(display.size * 0.28))
  const { hats, overflow } = renderHats(state.hats, hatSize)
  const label = `${state.nickname} · ${formatTokens(state.tokens)}${state.hats > 0 ? ` · ${t('pet.hats', { n: state.hats })}` : ''}`

  return (
    <span data-dsh-games data-testid="games-app">
      <span
        className="dsg-pet-root"
        data-dragging={dragging}
        style={{ right: display.right, bottom: display.bottom }}
      >
        {menuOpen && (
          <div className="dsg-popover" data-testid="games-popover" onClick={(e) => e.stopPropagation()}>
            <h3>{t('menu.title')}</h3>
            <div className="dsg-field">
              <label htmlFor="dsg-nickname-input">{t('menu.nickname')}</label>
              <div className="dsg-row">
                <input
                  id="dsg-nickname-input"
                  className="dsg-input"
                  value={nicknameDraft}
                  maxLength={24}
                  placeholder={state.nickname}
                  onChange={(e) => { setNicknameDraft(e.target.value); setNicknameSaved(false) }}
                />
                <button
                  type="button"
                  className="dsg-btn"
                  disabled={nicknameSaving || nicknameDraft.trim() === ''}
                  onClick={() => { void saveNickname() }}
                >
                  {nicknameSaved ? t('menu.saved') : t('menu.save')}
                </button>
              </div>
            </div>
            <div className="dsg-divider" />
            <RoomPanel
              t={t}
              room={room}
              own={state}
              error={roomError}
              onCreate={() => { void createRoom() }}
              onJoin={(url, code) => { void joinRoom(url, code) }}
              onLeave={() => { void leaveRoom() }}
            />
            <div className="dsg-divider" />
            <div className="dsg-row" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="dsg-btn-ghost"
                onClick={() => {
                  void gamesApi.setDisplay({ visible: false }).catch(() => { /* resync */ })
                }}
              >
                {t('menu.hide')}
              </button>
            </div>
          </div>
        )}
        <div
          className="dsg-pet"
          data-phase={state.phase}
          data-testid="games-pet"
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false
              return
            }
            setMenuOpen((open) => !open)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {bubble !== null && <div className="dsg-pet-bubble" data-testid="games-bubble">{bubble}</div>}
          <span className="dsg-whale-wrap">
            {hats.length > 0 && <>{hats}</>}
            {overflow > 0 && <span className="dsg-hat-badge">+{overflow}</span>}
            <DeepSeekWhale size={display.size} title={state.nickname} />
          </span>
          <span className="dsg-phase-dot" data-phase={state.phase} />
          <span className="dsg-pet-label" data-testid="games-label">{label}</span>
        </div>
      </span>
      {!display.visible && (
        <button
          type="button"
          className="dsg-summon"
          data-testid="games-summon"
          style={{ right: display.right, bottom: display.bottom }}
          onClick={() => {
            void gamesApi.setDisplay({ visible: true }).catch(() => { /* resync */ })
          }}
        >
          <DeepSeekWhale size={18} />
          {t('pet.summon')}
        </button>
      )}
    </span>
  )
}
