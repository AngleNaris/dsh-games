/**
 * The floating pet app — a single React root mounted on document.body (the
 * pet is host-global, no session dimension, mirroring the dsh-pet pattern).
 * Owns the poll loops (own state ~2s, room heartbeat+snapshot ~3s while
 * joined), the draggable pet with its crown pyramid, the token-usage effects
 * (label shimmer while consuming, burst + crown bubbles on gains), and the
 * nickname / room / pet-customization popover.
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
  gameServerApi,
  gamesApi,
  loadStoredRoom,
  petImageUrl,
  storeRoom,
  type GameRules,
  type GamesState,
  type JoinedRoom,
  type PetMeta,
} from './api.ts'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { formatTokens } from './locales.ts'
import {
  CROWN_LEVELS,
  crownCounts,
  crownTotal,
  crownUnits,
  topCrownLevel,
} from '../crowns.ts'
import { DeepSeekWhale, PET_VARIANTS } from './whale.tsx'
import { renderCrowns } from './crowns.tsx'
import { RoomPanel } from './RoomPanel.tsx'
import {
  arrangeScene,
  clampMemberSize,
  MemberPetScene,
  SceneControls,
  snapPos,
  useScenePrefs,
  type SceneAnchor,
  type SceneMember,
} from './scene.tsx'

/** Poll cadence for the own host snapshot. */
const STATE_POLL_MS = 2_000
/** Heartbeat + snapshot cadence while joined to a room. */
const ROOM_POLL_MS = 3_000
/** Reset position for the floating pet (top-right default anchor). */
const DEFAULT_POSITION = { right: 24, bottom: 20 }

interface GamesAppProps {
  t: Translate
}

/** Crown counts per the game server's rules (host state as fallback). */
function effectiveCrowns(state: GamesState, rules: GameRules | null): number[] {
  const step = rules?.crown.tokenStep ?? state.crownTokenStep
  const base = rules?.crown.base ?? 3
  return crownCounts(crownUnits(state.tokens, step), base)
}

/** Build a member report from the current own state. */
function memberOf(state: GamesState, rules: GameRules | null): {
  memberId: string
  nickname: string
  tokens: number
  crowns: number[]
  phase: GamesState['phase']
  petUrl?: string
  petVersion?: number
  petVariant?: string
  size?: number
} {
  return {
    memberId: state.memberId,
    nickname: state.nickname,
    tokens: state.tokens,
    crowns: effectiveCrowns(state, rules),
    phase: state.phase,
    petVariant: state.petVariant,
    size: state.display.size,
    ...(state.pet !== undefined
      ? {
          petUrl: petImageUrl(state.serverUrl, state.memberId, state.pet, state.authToken),
          petVersion: state.pet.version,
        }
      : {}),
  }
}

/** Short crown summary for the pet label ("· 白银王冠×2"). */
function crownLabel(state: GamesState, rules: GameRules | null, t: Translate): string {
  const top = topCrownLevel(effectiveCrowns(state, rules))
  if (top < 0) return ''
  return ` · ${t(`crown.${CROWN_LEVELS[top].id}`)}×${effectiveCrowns(state, rules)[top]}`
}

/** The main app: pet, popover, room lifecycle, poll loops. */
export function GamesApp(props: GamesAppProps): ReactElement {
  const { t } = props
  const [state, setState] = useState<GamesState | null>(null)
  const [rules, setRules] = useState<GameRules | null>(null)
  const [room, setRoom] = useState<JoinedRoom | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [nicknameSaved, setNicknameSaved] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [tokenFx, setTokenFx] = useState<{ delta: number; key: number } | null>(null)
  const [crownFx, setCrownFx] = useState<{ tier: number; key: number } | null>(null)
  const [petNote, setPetNote] = useState<string | null>(null)
  const [petBusy, setPetBusy] = useState(false)
  const stateRef = useRef<GamesState | null>(null)
  stateRef.current = state

  // ---- room pet scene (arrangement + free-drag memory) ----
  const scene = useScenePrefs()
  const roomMembers = room === null ? [] : room.members
  const otherMembers = roomMembers.filter((member) => member.memberId !== stateRef.current?.memberId)
  const scenePositions = (() => {
    if (state === null || room === null) return {}
    const members: SceneMember[] = room.members.map((member) => ({
      id: member.memberId,
      size: clampMemberSize(member.size, state.display.size),
    }))
    const anchor: SceneAnchor = {
      id: state.memberId,
      size: state.display.size,
      right: state.display.right,
      bottom: state.display.bottom,
    }
    return arrangeScene(
      scene.prefs.mode,
      members,
      anchor,
      scene.prefs.spacing,
      scene.prefs.free,
      { width: window.innerWidth, height: window.innerHeight },
    )
  })()

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

  // ---- game-server rules (crown ladder, upload caps) ----
  useEffect(() => {
    if (state === null) return
    let cancelled = false
    gameServerApi.rules(state.serverUrl, state.authToken).then((result) => {
      if (!cancelled) setRules(result.rules)
    }, () => {
      // Unreachable server: fall back to the host's own numbers.
      if (!cancelled) setRules(null)
    })
    return () => { cancelled = true }
  }, [state?.serverUrl, state?.authToken])

  // ---- token usage FX: shimmer while consuming, burst + crown bubbles on gain ----
  const prevTokens = useRef<number | null>(null)
  const prevCrowns = useRef<number[] | null>(null)
  useEffect(() => {
    if (state === null) return
    const beforeTokens = prevTokens.current
    const beforeCrowns = prevCrowns.current
    prevTokens.current = state.tokens
    prevCrowns.current = effectiveCrowns(state, rules)
    if (beforeTokens === null) return
    const delta = state.tokens - beforeTokens
    if (delta <= 0) return
    // Tokens grew — flash the label and announce the crown(s) it bought.
    setTokenFx({ delta, key: Date.now() })
    if (beforeCrowns !== null) {
      const nowCrowns = effectiveCrowns(state, rules)
      for (let tier = CROWN_LEVELS.length - 1; tier >= 0; tier -= 1) {
        if (nowCrowns[tier] > beforeCrowns[tier]) {
          setCrownFx({ tier, key: Date.now() })
          break
        }
      }
    }
  }, [state?.tokens, rules])

  useEffect(() => {
    if (tokenFx === null) return
    const timer = window.setTimeout(() => setTokenFx(null), 1_800)
    return () => window.clearTimeout(timer)
  }, [tokenFx])

  useEffect(() => {
    if (crownFx === null) return
    const name = t(`crown.${CROWN_LEVELS[crownFx.tier].id}`)
    setBubble(crownFx.tier > 0 ? t('pet.crown.crafted', { name }) : t('pet.crown.gained', { name }))
    const timer = window.setTimeout(() => setBubble(null), 3_200)
    return () => window.clearTimeout(timer)
  }, [crownFx, t])

  // ---- room heartbeat + snapshot polling ----
  const roomKey = room === null ? null : `${room.base}#${room.code}`
  useEffect(() => {
    if (room === null || state === null) return
    const { base, code } = room
    let timer: number | undefined
    const tick = (): void => {
      if (document.visibilityState !== 'visible') return
      const member = memberOf(stateRef.current ?? state, rules)
      gameServerApi.heartbeat(base, state.authToken, code, member).then((result) => {
        setRoom((prev) => prev === null ? prev : {
          ...prev,
          members: result.room.members,
          name: result.room.name,
          public: result.room.public,
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
    // Re-arm only when the room identity or own report changes.
  }, [roomKey, state?.tokens, state?.nickname, state?.phase, state?.pet?.version, state?.authToken, rules])

  // ---- room join / create / leave ----
  const joinRoom = useCallback(async (base: string, code: string): Promise<boolean> => {
    setRoomError(null)
    const current = stateRef.current
    if (current === null) return false
    try {
      const result = await gameServerApi.state(base, current.authToken, code)
      setRoom({
        base,
        code,
        name: result.room.name,
        public: result.room.public,
        members: result.room.members,
        offline: false,
      })
      storeRoom(base, code)
      return true
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : String(error))
      return false
    }
  }, [])

  const createRoom = useCallback(async (options: { name?: string; public?: boolean }): Promise<boolean> => {
    setRoomError(null)
    const current = stateRef.current
    if (current === null) return false
    try {
      const result = await gameServerApi.createRoom(current.serverUrl, current.authToken, options)
      const base = gameServerApi.base(current.serverUrl)
      const ok = await joinRoom(base, result.room.code)
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
    const authToken = stateRef.current?.authToken ?? ''
    if (current !== null && memberId !== undefined) {
      try {
        await gameServerApi.leave(current.base, authToken, current.code, memberId)
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

  // ---- restore a previously joined room on mount (auto rejoin) ----
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const stored = loadStoredRoom()
    if (stored === undefined) return
    const authToken = stateRef.current?.authToken ?? ''
    gameServerApi.state(stored.base, authToken, stored.code).then((result) => {
      setRoom({
        base: stored.base,
        code: stored.code,
        name: result.room.name,
        public: result.room.public,
        members: result.room.members,
        offline: false,
      })
      setBubble(t('room.autoJoined'))
      window.setTimeout(() => setBubble(null), 3_000)
    }, () => {
      // The room may have expired on the server — keep the seat stored but
      // surface the offline state; the heartbeat loop will resync if it
      // recovers, and the user can leave to clear it.
      setRoom({ base: stored.base, code: stored.code, name: '', public: true, members: [], offline: true })
    })
  }, [t])

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

  // ---- pet customization ----
  const switchVariant = useCallback((variant: string): void => {
    void gamesApi.config({ petVariant: variant }).catch(() => { /* resync */ })
  }, [])

  const uploadPet = useCallback(async (file: File | undefined): Promise<void> => {
    const current = stateRef.current
    if (file === undefined || current === null) return
    const petRules = rules?.pet
    if (petRules !== undefined) {
      if (!['image/png', 'image/gif'].includes(file.type)) {
        setPetNote(t('menu.uploadTypeError'))
        return
      }
      if (file.size > petRules.maxBytes) {
        setPetNote(t('menu.uploadSizeError'))
        return
      }
    }
    setPetBusy(true)
    setPetNote(null)
    try {
      const result = await gameServerApi.uploadPet(current.serverUrl, current.authToken, current.memberId, file)
      await gamesApi.setPetMeta(result.pet)
      setPetNote(t('menu.uploaded'))
      const next = await gamesApi.state()
      setState(next)
    } catch (error) {
      setPetNote(t('menu.uploadError', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setPetBusy(false)
    }
  }, [t, rules])

  const removePet = useCallback(async (): Promise<void> => {
    const current = stateRef.current
    if (current === null) return
    setPetBusy(true)
    setPetNote(null)
    try {
      await gameServerApi.removePet(current.serverUrl, current.authToken, current.memberId).catch(() => { /* ignore */ })
      await gamesApi.clearPetMeta()
      setPetNote(t('menu.removed'))
      const next = await gamesApi.state()
      setState(next)
    } catch {
      setPetNote(t('menu.uploadError', { error: '' }))
    } finally {
      setPetBusy(false)
    }
  }, [t])

  // ---- drag (disabled while the position is locked) ----
  const drag = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null)
  const movedRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const onPointerDown = useCallback((event: React.PointerEvent): void => {
    const current = stateRef.current
    if (current === null || current.display.locked) return
    event.preventDefault()
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      right: current.display.right,
      bottom: current.display.bottom,
    }
    movedRef.current = false
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent): void => {
    const start = drag.current
    const current = stateRef.current
    if (start === null || current === null) return
    const dx = event.clientX - start.startX
    const dy = event.clientY - start.startY
    if (Math.abs(dx) + Math.abs(dy) > 5) movedRef.current = true
    const right = Math.max(0, start.right - dx)
    const bottom = Math.max(0, start.bottom - dy)
    setState({ ...current, display: { ...current.display, right, bottom } })
  }, [])
  const onPointerUp = useCallback((): void => {
    const start = drag.current
    drag.current = null
    setDragging(false)
    const current = stateRef.current
    if (start === null || current === null) return
    void gamesApi.setDisplay({ right: current.display.right, bottom: current.display.bottom }).catch(() => {
      // Ignore; next poll resyncs.
    })
  }, [])

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
  // The popover grows upward from the pet; clamp its height so it never
  // extends above the viewport top, whatever the pet's position is.
  const popoverMaxHeight = Math.max(
    220,
    Math.min(
      Math.round(window.innerHeight * 0.66),
      window.innerHeight - display.bottom - display.size - 28,
    ),
  )
  const crownSize = Math.max(14, Math.round(display.size * 0.3))
  const crownCountsNow = effectiveCrowns(state, rules)
  const { crowns, overflow } = renderCrowns(crownCountsNow, crownSize)
  const crownCount = crownTotal(crownCountsNow)
  const label = `${state.nickname} · ${formatTokens(state.tokens)}${crownCount > 0 ? crownLabel(state, rules, t) : ''}`
  const consuming = state.phase === 'thinking' || state.phase === 'tool'
  const petUrl = state.pet !== undefined
    ? petImageUrl(state.serverUrl, state.memberId, state.pet, state.authToken)
    : undefined
  const petHint = rules !== null
    ? t('menu.uploadHintRules', {
        maxBytes: Math.round(rules.pet.maxBytes / 1024 / 1024 * 10) / 10,
        maxDimension: rules.pet.maxDimension,
      })
    : t('menu.uploadHint')

  return (
    <span data-dsh-games data-testid="games-app">
      {display.visible ? (
      <span
        className="dsg-pet-root"
        data-dragging={dragging}
        style={{ right: display.right, bottom: display.bottom }}
      >
        {menuOpen && (
          <div
            className="dsg-popover"
            data-testid="games-popover"
            style={{ maxHeight: popoverMaxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
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

            <div className="dsg-field">
              <label>{t('menu.size')} · {display.size}px</label>
              <input
                type="range"
                className="dsg-slider"
                min={24}
                max={512}
                step={4}
                value={display.size}
                onChange={(e) => {
                  const size = Number(e.target.value)
                  setState((prev) => prev === null ? prev : ({ ...prev, display: { ...prev.display, size } }))
                  void gamesApi.setDisplay({ size }).catch(() => { /* resync */ })
                }}
              />
              <div className="dsg-row" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="dsg-btn-ghost"
                  onClick={() => {
                    void gamesApi.setDisplay({ ...DEFAULT_POSITION }).catch(() => { /* resync */ })
                    setState((prev) => prev === null ? prev
                      : ({ ...prev, display: { ...prev.display, ...DEFAULT_POSITION } }))
                  }}
                >
                  {t('menu.resetPosition')}
                </button>
                <button
                  type="button"
                  className="dsg-btn-ghost"
                  data-on={display.locked}
                  onClick={() => {
                    const locked = !display.locked
                    void gamesApi.setDisplay({ locked }).catch(() => { /* resync */ })
                    setState((prev) => prev === null ? prev : ({ ...prev, display: { ...prev.display, locked } }))
                  }}
                >
                  {display.locked ? t('menu.unlockPosition') : t('menu.lockPosition')}
                </button>
              </div>
            </div>

            <div className="dsg-divider" />
            <div className="dsg-field">
              <label>{t('menu.petPattern')}</label>
              <div className="dsg-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {PET_VARIANTS.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className="dsg-swatch"
                    data-on={state.petVariant === variant.id}
                    title={t(variant.nameKey)}
                    aria-label={t(variant.nameKey)}
                    onClick={() => switchVariant(variant.id)}
                    style={{ background: `linear-gradient(135deg, ${variant.from}, ${variant.to})` }}
                  />
                ))}
              </div>
            </div>
            <div className="dsg-field">
              <label>{t('menu.uploadPet')}</label>
              {petUrl !== undefined && (
                <div className="dsg-row" style={{ marginBottom: 6 }}>
                  <img className="dsg-pet-preview" src={petUrl} alt="" />
                  <span className="dsg-hint" style={{ margin: 0 }}>
                    {state.pet?.ext === 'gif' ? 'GIF' : 'PNG'} · {state.pet?.width}×{state.pet?.height}
                  </span>
                </div>
              )}
              <div className="dsg-row">
                <label className="dsg-btn" style={{ margin: 0, cursor: petBusy ? 'default' : 'pointer', opacity: petBusy ? 0.5 : 1 }}>
                  {petBusy ? t('menu.uploading') : t('menu.chooseFile')}
                  <input
                    type="file"
                    accept="image/png,image/gif"
                    style={{ display: 'none' }}
                    disabled={petBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      void uploadPet(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                {petUrl !== undefined && (
                  <button type="button" className="dsg-btn-ghost" disabled={petBusy} onClick={() => { void removePet() }}>
                    {t('menu.removePet')}
                  </button>
                )}
              </div>
              <p className="dsg-hint">{petHint}</p>
              {petNote !== null && <p className="dsg-note" data-testid="games-pet-note">{petNote}</p>}
            </div>

            <div className="dsg-divider" />
            <RoomPanel
              t={t}
              room={room}
              own={state}
              error={roomError}
              onCreate={(options) => { void createRoom(options) }}
              onJoin={(base, code) => { void joinRoom(base, code) }}
              onLeave={() => { void leaveRoom() }}
            />
            {room !== null && (
              <>
                <div className="dsg-divider" />
                <SceneControls
                  t={t}
                  prefs={scene.prefs}
                  onChange={(patch) => scene.update(patch)}
                  onReset={scene.resetMembers}
                />
              </>
            )}
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
            {crowns.length > 0 && <>{crowns}</>}
            {overflow > 0 && <span className="dsg-crown-badge">+{overflow}</span>}
            {petUrl !== undefined
              ? (
                <img
                  className="dsg-pet-img"
                  src={petUrl}
                  alt={state.nickname}
                  draggable={false}
                  style={{ width: display.size, height: display.size }}
                />
              )
              : <DeepSeekWhale size={display.size} title={state.nickname} variant={state.petVariant} />}
          </span>
          <span className="dsg-phase-dot" data-phase={state.phase} />
          <span
            className={`dsg-pet-label${consuming ? ' dsg-label-active' : ''}${tokenFx !== null ? ' dsg-label-burst' : ''}`}
            data-testid="games-label"
          >
            {label}
            {tokenFx !== null && (
              <em className="dsg-token-chip" key={tokenFx.key} data-testid="games-token-chip">
                +{formatTokens(tokenFx.delta)}
              </em>
            )}
          </span>
        </div>
        {otherMembers.map((member) => {
          const pos = scenePositions[member.memberId]
          if (pos === undefined) return null
          const auto = scene.prefs.mode === 'row' || scene.prefs.mode === 'column' || scene.prefs.mode === 'orbit'
          return (
            <MemberPetScene
              key={member.memberId}
              member={member}
              size={clampMemberSize(member.size, display.size)}
              pos={pos}
              draggable={!auto}
              onMove={(next) => {
                scene.moveMember(member.memberId, scene.prefs.mode === 'grid' ? snapPos(next, scene.prefs.spacing) : next)
              }}
            />
          )
        })}
      </span>
      ) : (
        <button
          type="button"
          className="dsg-summon"
          data-testid="games-summon"
          style={{ right: display.right, bottom: display.bottom }}
          onClick={() => {
            void gamesApi.setDisplay({ visible: true }).catch(() => { /* resync */ })
          }}
        >
          <DeepSeekWhale size={18} variant={state.petVariant} />
          {t('pet.summon')}
        </button>
      )}
    </span>
  )
}
