/**
 * The floating pet app — a single React root mounted on document.body (the
 * pet is host-global, no session dimension, mirroring the dsh-pet pattern).
 * Owns the poll loops (own state ~2s, room heartbeat+snapshot ~3s while
 * joined), the draggable pet with its crown pyramid, the token-usage effects
 * (label shimmer while consuming, burst + crown bubbles on gains), and the
 * nickname / room / pet-customization popover.
 * @module @anglenaris/dsh-games/client/GamesApp
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import {
  clearStoredRoom,
  GameServerError,
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
  DEFAULT_CROWN_BASE,
  crownUnits,
} from '../crowns.ts'
import { DeepSeekWhale, PET_VARIANTS, customVariantId, isCustomVariant, petVariantOf } from './whale.tsx'
import { useCrownPyramid } from './crowns.tsx'
import { RoomPanel } from './RoomPanel.tsx'
import { ChatBubble, ChatComposer, ChatHint, CHAT_BUBBLE_MS, CHAT_EXIT_MS } from './chat.tsx'
import {
  createTokenProgressBaseline,
  crownsAtTokens,
  settleTokenProgress,
  type TokenProgressBaseline,
} from './progress.ts'
import {
  arrangeScene,
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

function canRefreshRoomMember(error: unknown): error is GameServerError {
  return error instanceof GameServerError &&
    (error.code === 'member-not-found' || error.code === 'unauthorized')
}

function isMissingRoom(error: unknown): error is GameServerError {
  return error instanceof GameServerError && error.code === 'room-not-found'
}

function isAntiCheatError(error: unknown): error is GameServerError {
  return error instanceof GameServerError && (
    error.code === 'anti-cheat-locked' ||
    error.code === 'crowns-mismatch' ||
    error.code === 'token-jump' ||
    error.code === 'token-regression'
  )
}

function antiCheatMessage(error: GameServerError, t: Translate): string {
  switch (error.code) {
    case 'crowns-mismatch':
      return t('room.antiCheatCrowns')
    case 'token-jump':
      return t('room.antiCheatJump')
    case 'token-regression':
      return t('room.antiCheatRegression')
    default:
      return t('room.antiCheatLocked')
  }
}

/**
 * Whether two poll snapshots render identically. The 2s poll returns a fresh
 * object each time; returning `prev` from the state updater on equality lets
 * React skip the re-render entirely, so typing/slider interactions are never
 * interleaved with a full refresh. `serverTime` is excluded (it always
 * changes); `crowns` is compared element-wise (fresh arrays arrive each poll).
 */
function sameGamesState(a: GamesState, b: GamesState): boolean {
  return a.memberId === b.memberId &&
    a.nickname === b.nickname &&
    a.tokens === b.tokens &&
    a.crownUnits === b.crownUnits &&
    a.phase === b.phase &&
    a.tokenActiveUntil === b.tokenActiveUntil &&
    a.crownTokenStep === b.crownTokenStep &&
    a.enabled === b.enabled &&
    a.petVariant === b.petVariant &&
    a.serverUrl === b.serverUrl &&
    a.authToken === b.authToken &&
    a.pet?.ext === b.pet?.ext &&
    a.pet?.version === b.pet?.version &&
    a.pet?.width === b.pet?.width &&
    a.pet?.height === b.pet?.height &&
    a.crowns.length === b.crowns.length &&
    a.crowns.every((value, index) => value === b.crowns[index]) &&
    a.display.visible === b.display.visible &&
    a.display.size === b.display.size &&
    a.display.right === b.display.right &&
    a.display.bottom === b.display.bottom &&
    a.display.locked === b.display.locked
}

interface GamesStateIdentity {
  base: string
  authToken: string
  memberId: string
}

function gamesStateIdentity(state: GamesState): GamesStateIdentity {
  return {
    base: gameServerApi.base(state.serverUrl),
    authToken: state.authToken,
    memberId: state.memberId,
  }
}

function matchesGamesStateIdentity(
  state: GamesState | null,
  identity: GamesStateIdentity,
): state is GamesState {
  return state !== null &&
    gameServerApi.base(state.serverUrl) === identity.base &&
    state.authToken === identity.authToken &&
    state.memberId === identity.memberId
}

interface GamesAppProps {
  t: Translate
}

/** Crown counts per the game server's rules (host state as local fallback). */
function effectiveCrowns(state: GamesState, rules: GameRules | null): number[] {
  return crownsAtTokens(state.tokens, state.crownTokenStep, rules)
}

/** Build a member report from the current own state. */
function memberOf(state: GamesState, rules: GameRules): {
  memberId: string
  nickname: string
  tokens: number
  crowns: number[]
  phase: GamesState['phase']
  active?: boolean
  petUrl?: string
  petVersion?: number
  petVariant?: string
} {
  return {
    memberId: state.memberId,
    nickname: state.nickname,
    tokens: state.tokens,
    crowns: effectiveCrowns(state, rules),
    phase: state.phase,
    petVariant: state.petVariant,
    ...(state.pet !== undefined
      ? {
          petUrl: petImageUrl(state.serverUrl, state.memberId, state.pet, state.authToken),
          petVersion: state.pet.version,
        }
      : {}),
  }
}

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
  const [tokenStreamActive, setTokenStreamActive] = useState(false)
  const [petNote, setPetNote] = useState<string | null>(null)
  const [petBusy, setPetBusy] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const petRef = useRef<HTMLDivElement | null>(null)
  // ---- room chat ----
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatCooldown, setChatCooldown] = useState(false)
  const chatCooldownRef = useRef(false)
  /** The member's own message bubble (shown locally on send). */
  const [ownChat, setOwnChat] = useState<{ text: string; key: number; leaving?: boolean } | null>(null)
  /** Incoming bubbles keyed by member id (keyed by the message's dedupe key). */
  const [memberChats, setMemberChats] = useState<Record<string, { text: string; key: string; leaving?: boolean }>>({})
  const seenChatRef = useRef<Set<string>>(new Set())
  const stateRef = useRef<GamesState | null>(null)
  const rulesRef = useRef<GameRules | null>(null)
  const rulesIdentityRef = useRef<string | null>(null)
  const roomRef = useRef<JoinedRoom | null>(null)
  const tokenStreamActiveRef = useRef(false)
  stateRef.current = state
  rulesRef.current = rules
  roomRef.current = room
  tokenStreamActiveRef.current = tokenStreamActive
  const viewportWidth = viewport.width > 0
    ? viewport.width
    : (typeof window === 'undefined' ? 1280 : window.innerWidth)
  const viewportHeight = viewport.height > 0
    ? viewport.height
    : (typeof window === 'undefined' ? 800 : window.innerHeight)

  const closeMenu = useCallback((restoreFocus: boolean): void => {
    setMenuOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => petRef.current?.focus())
    }
  }, [])

  const closeChat = useCallback((restoreFocus: boolean): void => {
    setChatOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => petRef.current?.focus())
    }
  }, [])

  const loadAuthoritativeRules = useCallback(async (current: GamesState): Promise<GameRules> => {
    const identity = `${gameServerApi.base(current.serverUrl)}\n${current.authToken}`
    if (rulesIdentityRef.current === identity && rulesRef.current !== null) {
      return rulesRef.current
    }
    const result = await gameServerApi.rules(current.serverUrl, current.authToken)
    const latest = stateRef.current
    if (latest !== null &&
        `${gameServerApi.base(latest.serverUrl)}\n${latest.authToken}` === identity) {
      rulesIdentityRef.current = identity
      rulesRef.current = result.rules
      setRules(result.rules)
    }
    return result.rules
  }, [])

  useEffect(() => {
    const updateViewport = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (!menuOpen && !chatOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (chatOpen && (!(target instanceof Element) || target.closest('.dsg-chat-composer') === null)) {
        closeChat(false)
      }
      if (!menuOpen) return
      if (popoverRef.current?.contains(target) === true) return
      if (petRef.current?.contains(target) === true) return
      closeMenu(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (chatOpen) closeChat(true)
      if (menuOpen) closeMenu(true)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [chatOpen, closeChat, closeMenu, menuOpen])

  // Crown pyramid above the pet: layout + merge animations (hook is called
  // before the early returns below, per the rules of hooks). Sizes are +20%
  // over the original 0.3× to make the pile read more clearly.
  const ownRoomMember = state === null
    ? undefined
    : room?.members.find((member) => member.memberId === state.memberId)
  const crownCountsNow = ownRoomMember?.crowns ?? (state === null ? [] : effectiveCrowns(state, rules))
  const crownSize = state === null ? 14 : Math.max(14, Math.round(state.display.size * 0.36))
  const pyramid = useCrownPyramid(crownCountsNow, crownSize)

  // ---- room pet scene (arrangement + free-drag memory) ----
  const scene = useScenePrefs()
  const roomMembers = room === null ? [] : room.members
  const otherMembers = roomMembers.filter((member) => member.memberId !== stateRef.current?.memberId)
  const scenePositions = (() => {
    if (state === null || room === null) return {}
    const members: SceneMember[] = room.members.map((member) => ({
      id: member.memberId,
      size: state.display.size,
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
      { width: viewportWidth, height: viewportHeight },
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
        setState((prev) => {
          if (prev === null) return next
          // Nothing rendered changed — skip the re-render entirely.
          if (sameGamesState(prev, next)) return prev
          // While a drag is in progress the poll must not overwrite the pet's
          // local position (it would snap back mid-drag); other fields still
          // refresh. The drag's onPointerUp persists the final position.
          return drag.current !== null ? { ...next, display: prev.display } : next
        })
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
    const identity = `${gameServerApi.base(state.serverUrl)}\n${state.authToken}`
    if (rulesIdentityRef.current !== identity) {
      rulesIdentityRef.current = null
      rulesRef.current = null
      setRules(null)
    }
    loadAuthoritativeRules(state).then(() => {
      // loadAuthoritativeRules commits only when the state identity still matches.
    }, () => {
      if (!cancelled) {
        rulesIdentityRef.current = null
        rulesRef.current = null
        setRules(null)
      }
    })
    return () => { cancelled = true }
  }, [loadAuthoritativeRules, state?.serverUrl, state?.authToken])

  // ---- token output activity + immediate token/crown progress FX ----
  useEffect(() => {
    if (state === null) {
      setTokenStreamActive(false)
      return
    }
    const remaining = state.tokenActiveUntil - state.serverTime
    if (remaining <= 0) {
      setTokenStreamActive(false)
      return
    }
    setTokenStreamActive(true)
    const timer = window.setTimeout(() => setTokenStreamActive(false), remaining)
    return () => window.clearTimeout(timer)
  }, [state?.tokenActiveUntil, state?.serverTime])

  const [displayTokens, setDisplayTokens] = useState<number | null>(null)
  const tokenProgressRef = useRef<TokenProgressBaseline | null>(null)
  useEffect(() => {
    if (state === null) return
    if (tokenProgressRef.current === null) {
      tokenProgressRef.current = createTokenProgressBaseline(
        state.tokens,
        state.crownTokenStep,
        rules,
      )
      setDisplayTokens(state.tokens)
      return
    }
    const settled = settleTokenProgress(
      tokenProgressRef.current,
      state.tokens,
      state.crownTokenStep,
      rules,
    )
    tokenProgressRef.current = settled.baseline
    if (settled.delta <= 0) {
      if (displayTokens !== state.tokens) setDisplayTokens(state.tokens)
      return
    }
    setDisplayTokens(state.tokens)
    setTokenFx({ delta: settled.delta, key: Date.now() })
    if (settled.crownTier !== null) {
      setCrownFx({ tier: settled.crownTier, key: Date.now() })
    }
  }, [state?.tokens, state?.crownTokenStep, rules])

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
  const roomKey = room === null ? null : `${room.base}#${room.code}#${room.memberToken}`
  useEffect(() => {
    if (room === null || stateRef.current === null) return
    const { base, code, memberToken } = room
    let timer: number | undefined
    let disposed = false
    let inFlight = false
    let controller: AbortController | undefined
    const matchesRoom = (token = memberToken): boolean => {
      const latest = roomRef.current
      return latest !== null &&
        latest.base === base &&
        latest.code === code &&
        latest.memberToken === token
    }
    const applySnapshot = (
      nextRoom: Awaited<ReturnType<typeof gameServerApi.heartbeat>>['room'],
      clearError = true,
    ): void => {
      if (disposed || !matchesRoom()) return
      if (clearError) setRoomError(null)
      // Incoming chat: surface every unseen message as a member bubble.
      const ownId = stateRef.current?.memberId
      for (const message of nextRoom.messages ?? []) {
        const key = `${message.memberId}:${message.at}`
        if (seenChatRef.current.has(key)) continue
        seenChatRef.current.add(key)
        if (message.memberId === ownId) continue
        setMemberChats((prev) => ({ ...prev, [message.memberId]: { text: message.text, key } }))
        // Fade-out phase first, then unmount (drives the exit animation).
        window.setTimeout(() => {
          setMemberChats((prev) => {
            const next = { ...prev }
            if (next[message.memberId]?.key === key) next[message.memberId] = { ...next[message.memberId], leaving: true }
            return next
          })
        }, CHAT_BUBBLE_MS - CHAT_EXIT_MS)
        window.setTimeout(() => {
          setMemberChats((prev) => {
            const next = { ...prev }
            if (next[message.memberId]?.key === key) delete next[message.memberId]
            return next
          })
        }, CHAT_BUBBLE_MS)
      }
      setRoom((prev) => {
        if (prev === null ||
            prev.base !== base ||
            prev.code !== code ||
            prev.memberToken !== memberToken) return prev
        return {
          ...prev,
          members: nextRoom.members,
          name: nextRoom.name,
          public: nextRoom.public,
          offline: false,
        }
      })
    }
    const markOffline = (): void => {
      if (disposed || !matchesRoom()) return
      setRoom((prev) => {
        if (prev === null ||
            prev.base !== base ||
            prev.code !== code ||
            prev.memberToken !== memberToken) return prev
        return { ...prev, offline: true }
      })
    }
    const discardMissingRoom = (): void => {
      if (disposed || !matchesRoom()) return
      clearStoredRoom()
      setRoom(null)
      setRoomError(t('room.expired'))
      setBubble(t('room.expired'))
      window.setTimeout(() => setBubble(null), 3_200)
    }
    const tick = async (): Promise<void> => {
      if (disposed || inFlight || !matchesRoom()) return
      const current = stateRef.current
      if (current === null) return
      const currentIdentity = gamesStateIdentity(current)
      const matchesState = (): boolean =>
        matchesGamesStateIdentity(stateRef.current, currentIdentity)
      inFlight = true
      controller = new AbortController()
      try {
        const currentRules = await loadAuthoritativeRules(current)
        if (disposed || !matchesRoom() || !matchesState()) return
        const member = {
          ...memberOf(current, currentRules),
          active: tokenStreamActiveRef.current,
        }
        const result = await gameServerApi.heartbeat(
          base,
          current.authToken,
          code,
          memberToken,
          member,
          controller.signal,
        )
        if (!matchesState()) return
        applySnapshot(result.room)
      } catch (error) {
        if (disposed || !matchesState() ||
            (error instanceof DOMException && error.name === 'AbortError')) return
        if (isAntiCheatError(error)) {
          setRoomError(antiCheatMessage(error, t))
          setRoom((prev) => prev === null ? prev : { ...prev, offline: false })
          try {
            rulesIdentityRef.current = null
            rulesRef.current = null
            setRules(null)
            await loadAuthoritativeRules(current)
            if (disposed || !matchesRoom() || !matchesState()) return
            const authoritative = await gameServerApi.state(base, current.authToken, code)
            if (!matchesState()) return
            applySnapshot(authoritative.room, false)
          } catch {
            // Keep the last accepted snapshot; the next heartbeat retries.
          }
        } else if (isMissingRoom(error)) {
          discardMissingRoom()
        } else if (canRefreshRoomMember(error) && matchesRoom()) {
          try {
            const latest = stateRef.current
            if (latest === null) return
            const latestIdentity = gamesStateIdentity(latest)
            const matchesLatest = (): boolean =>
              matchesGamesStateIdentity(stateRef.current, latestIdentity)
            const latestRules = await loadAuthoritativeRules(latest)
            if (disposed || !matchesRoom() || !matchesLatest()) return
            const joined = await gameServerApi.join(
              base,
              latest.authToken,
              code,
              {
                ...memberOf(latest, latestRules),
                active: tokenStreamActiveRef.current,
              },
            )
            if (disposed || !matchesRoom() || !matchesLatest()) return
            storeRoom(base, code, joined.memberToken)
            setRoom((prev) => {
              if (prev === null ||
                  prev.base !== base ||
                  prev.code !== code ||
                  prev.memberToken !== memberToken) return prev
              return {
                ...prev,
                memberToken: joined.memberToken,
                members: joined.room.members,
                name: joined.room.name,
                public: joined.room.public,
                offline: false,
              }
            })
          } catch (joinError) {
            if (isMissingRoom(joinError)) discardMissingRoom()
            else markOffline()
          }
        } else {
          markOffline()
        }
      } finally {
        inFlight = false
        controller = undefined
      }
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void tick()
    }
    timer = window.setInterval(tick, ROOM_POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    void tick()
    return () => {
      disposed = true
      controller?.abort()
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // State and rules are read through refs so report changes do not spawn
    // overlapping intervals; only the authenticated room identity re-arms.
  }, [loadAuthoritativeRules, roomKey, t])

  // ---- room join / create / leave ----
  const joinRoom = useCallback(async (code: string): Promise<boolean> => {
    setRoomError(null)
    const current = stateRef.current
    if (current === null) return false
    const currentIdentity = gamesStateIdentity(current)
    const matchesState = (): boolean =>
      matchesGamesStateIdentity(stateRef.current, currentIdentity)
    try {
      const resolvedBase = currentIdentity.base
      const currentRules = await loadAuthoritativeRules(current)
      if (!matchesState()) return false
      const result = await gameServerApi.join(
        resolvedBase,
        current.authToken,
        code,
        { ...memberOf(current, currentRules), active: tokenStreamActiveRef.current },
      )
      if (!matchesState()) return false
      setRoom({
        base: resolvedBase,
        code,
        memberToken: result.memberToken,
        name: result.room.name,
        public: result.room.public,
        members: result.room.members,
        offline: false,
      })
      storeRoom(resolvedBase, code, result.memberToken)
      return true
    } catch (error) {
      if (!matchesState()) return false
      setRoomError(isAntiCheatError(error)
        ? antiCheatMessage(error, t)
        : error instanceof Error ? error.message : String(error))
      return false
    }
  }, [loadAuthoritativeRules, t])

  const createRoom = useCallback(async (options: { name?: string; public?: boolean }): Promise<boolean> => {
    setRoomError(null)
    const current = stateRef.current
    if (current === null) return false
    try {
      const result = await gameServerApi.createRoom(current.serverUrl, current.authToken, options)
      const ok = await joinRoom(result.room.code)
      if (ok) {
        setBubble(t('room.created'))
        window.setTimeout(() => setBubble(null), 3_000)
      }
      return ok
    } catch (error) {
      setRoomError(isAntiCheatError(error)
        ? antiCheatMessage(error, t)
        : error instanceof Error ? error.message : String(error))
      return false
    }
  }, [joinRoom, t])

  const leaveRoom = useCallback(async (): Promise<void> => {
    const current = roomRef.current
    const memberId = stateRef.current?.memberId
    const authToken = stateRef.current?.authToken ?? ''
    if (current !== null && memberId !== undefined) {
      try {
        await gameServerApi.leave(
          current.base,
          authToken,
          current.code,
          memberId,
          current.memberToken,
        )
      } catch {
        // Best-effort; the room sweeps the member on heartbeat timeout anyway.
      }
    }
    clearStoredRoom()
    setRoom(null)
    setRoomError(null)
    setChatOpen(false)
    setChatDraft('')
    setOwnChat(null)
    setMemberChats({})
    seenChatRef.current = new Set()
  }, [])
  // ---- room chat: send + local bubble + 4s cooldown ----
  const sendChat = useCallback((text: string): void => {
    if (chatCooldownRef.current) return
    const current = stateRef.current
    if (current === null) return
    const trimmed = text.trim()
    if (trimmed === '') return
    const key = Date.now()
    setChatOpen(false)
    setChatDraft('')
    setChatCooldown(true)
    chatCooldownRef.current = true
    window.setTimeout(() => {
      setChatCooldown(false)
      chatCooldownRef.current = false
    }, CHAT_BUBBLE_MS)
    const currentRoom = roomRef.current
    if (currentRoom === null) {
      // Not in a room: surface a hint bubble instead of a doomed send.
      setOwnChat({ text: t('chat.noRoom'), key })
      return
    }
    // The bubble pops locally at once; the server fans it out to the room.
    setOwnChat({ text: trimmed, key })
    void gameServerApi.sendMessage(
      currentRoom.base,
      current.authToken,
      currentRoom.code,
      currentRoom.memberToken,
      {
        memberId: current.memberId,
        text: trimmed,
      },
    ).catch(() => {
      // Send failed (server unreachable / cooldown): the local bubble still
      // shows for its 4s, the room just never receives the message.
    })
  }, [t])

  // Own bubble: fade-out phase first, then unmount after CHAT_BUBBLE_MS.
  // Depends on the bubble's key only — flipping `leaving` re-renders but must
  // not re-arm these timers (an effect re-run would push the removal out).
  useEffect(() => {
    if (ownChat === null) return
    const leave = window.setTimeout(() => {
      setOwnChat((prev) => prev === null || prev.leaving === true ? prev : { ...prev, leaving: true })
    }, CHAT_BUBBLE_MS - CHAT_EXIT_MS)
    const remove = window.setTimeout(() => {
      setOwnChat((prev) => (prev === null || prev.key !== ownChat.key ? prev : null))
    }, CHAT_BUBBLE_MS)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(remove)
    }
  }, [ownChat?.key])

  // ---- restore a previously joined room on mount (auto rejoin) ----
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    const current = stateRef.current
    if (current === null) return
    restoredRef.current = true
    const stored = loadStoredRoom()
    if (stored === undefined) return
    const configuredBase = gameServerApi.base(current.serverUrl)
    if (stored.base !== configuredBase) {
      clearStoredRoom()
      return
    }
    const currentIdentity = gamesStateIdentity(current)
    const matchesState = (): boolean =>
      matchesGamesStateIdentity(stateRef.current, currentIdentity)
    let cancelled = false
    const restore = async (): Promise<void> => {
      let activeToken = stored.memberToken
      try {
        const currentRules = await loadAuthoritativeRules(current)
        if (cancelled || !matchesState()) return
        let result
        try {
          result = await gameServerApi.heartbeat(
            configuredBase,
            current.authToken,
            stored.code,
            activeToken,
            {
              ...memberOf(current, currentRules),
              active: tokenStreamActiveRef.current,
            },
          )
          if (cancelled || !matchesState()) return
        } catch (error) {
          if (cancelled || !matchesState()) return
          if (!canRefreshRoomMember(error)) throw error
          const joined = await gameServerApi.join(
            configuredBase,
            current.authToken,
            stored.code,
            {
              ...memberOf(current, currentRules),
              active: tokenStreamActiveRef.current,
            },
          )
          if (cancelled || !matchesState()) return
          activeToken = joined.memberToken
          storeRoom(configuredBase, stored.code, activeToken)
          result = { ok: true as const, room: joined.room }
        }
        if (cancelled || !matchesState()) return
        setRoom({
          base: configuredBase,
          code: stored.code,
          memberToken: activeToken,
          name: result.room.name,
          public: result.room.public,
          members: result.room.members,
          offline: false,
        })
        setBubble(t('room.autoJoined'))
        window.setTimeout(() => setBubble(null), 3_000)
      } catch (error) {
        if (cancelled || !matchesState()) return
        if (isAntiCheatError(error)) {
          clearStoredRoom()
          setRoom(null)
          setRoomError(antiCheatMessage(error, t))
          return
        }
        if (isMissingRoom(error)) {
          clearStoredRoom()
          setRoom(null)
          setRoomError(t('room.expired'))
          return
        }
        // Network failures remain recoverable; the heartbeat loop retries once
        // the page is visible or the server returns.
        setRoom({
          base: configuredBase,
          code: stored.code,
          memberToken: activeToken,
          name: '',
          public: true,
          members: [],
          offline: true,
        })
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [loadAuthoritativeRules, state?.memberId, t])

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
    // Apply locally first so the pet recolors on click, then sync to the host
    // (the next poll confirms the server value; failures just resync).
    setState((prev) => (prev === null || prev.petVariant === variant ? prev : { ...prev, petVariant: variant }))
    void gamesApi.config({ petVariant: variant }).catch(() => { /* resync */ })
  }, [])
  const [customColorOpen, setCustomColorOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState<{ from: string; to: string } | null>(null)
  const applyCustomColor = useCallback((from: string, to: string): void => {
    // Keep a local draft so editing one end never resets the other end while
    // the server round-trip is pending; apply locally for instant feedback.
    setCustomDraft({ from, to })
    const id = customVariantId(from, to)
    const current = stateRef.current
    if (current === null || id === current.petVariant) return
    setState((prev) => (prev === null ? prev : { ...prev, petVariant: id }))
    void gamesApi.config({ petVariant: id }).catch(() => { /* resync */ })
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
  const finishDrag = useCallback((): void => {
    const start = drag.current
    drag.current = null
    setDragging(false)
    const current = stateRef.current
    if (start === null || current === null) return
    void gamesApi.setDisplay({ right: current.display.right, bottom: current.display.bottom }).catch(() => {
      // Ignore; next poll resyncs.
    })
  }, [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('blur', finishDrag)
    return () => window.removeEventListener('blur', finishDrag)
  }, [dragging, finishDrag])

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
  const popoverWidth = Math.min(380, Math.max(0, viewportWidth - 24))
  const petRightEdge = viewportWidth - display.right
  const desiredPopoverRightEdge = Math.min(
    viewportWidth - 12,
    Math.max(popoverWidth + 12, petRightEdge),
  )
  const popoverStyle: CSSProperties = {
    right: viewportWidth - desiredPopoverRightEdge,
  }
  const petTop = viewportHeight - display.bottom - display.size
  const petBottom = viewportHeight - display.bottom
  const aboveSpace = petTop - 26
  const belowSpace = viewportHeight - petBottom - 26
  if (Math.max(aboveSpace, belowSpace) < 160) {
    popoverStyle.top = 12
    popoverStyle.bottom = 'auto'
    popoverStyle.maxHeight = Math.max(120, viewportHeight - 24)
  } else if (aboveSpace >= 260 || aboveSpace >= belowSpace) {
    popoverStyle.bottom = display.bottom + display.size + 14
    popoverStyle.maxHeight = aboveSpace
  } else {
    popoverStyle.top = petBottom + 14
    popoverStyle.bottom = 'auto'
    popoverStyle.maxHeight = belowSpace
  }
  // The bottom bar shows nickname + tokens only; growth settles on the next
  // host-state poll and shows a short "+N" chip.
  const label = `${state.nickname} · ${formatTokens(displayTokens ?? state.tokens)} tokens`
  const consuming = tokenStreamActive ||
    state.phase === 'waiting' ||
    state.phase === 'thinking' ||
    state.phase === 'tool'
  const customVariant = isCustomVariant(state.petVariant) ? petVariantOf(state.petVariant) : null
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
            ref={popoverRef}
            id="dsg-pet-popover"
            className="dsg-popover"
            data-testid="games-popover"
            role="dialog"
            aria-modal="false"
            aria-labelledby="dsg-popover-title"
            style={popoverStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dsg-popover-header">
              <span className="dsg-popover-avatar" aria-hidden="true">
                {petUrl !== undefined
                  ? <img src={petUrl} alt="" />
                  : <DeepSeekWhale size={38} variant={state.petVariant} />}
              </span>
              <span className="dsg-popover-heading">
                <h3 id="dsg-popover-title">{t('menu.title')}</h3>
                <span className="dsg-popover-meta">
                  <i className="dsg-phase-indicator" data-phase={state.phase} aria-hidden="true" />
                  <span>{state.nickname}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('pet.tokens', { n: formatTokens(displayTokens ?? state.tokens) })}</span>
                </span>
              </span>
              <button
                type="button"
                className="dsg-icon-btn"
                aria-label={t('menu.close')}
                title={t('menu.close')}
                onClick={() => closeMenu(true)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="dsg-popover-body">
              <section className="dsg-popover-section" aria-labelledby="dsg-profile-title">
                <h4 id="dsg-profile-title">{t('menu.profile')}</h4>
                <div className="dsg-field">
                  <label htmlFor="dsg-nickname-input">{t('menu.nickname')}</label>
                  <div className="dsg-row dsg-input-action">
                    <input
                      id="dsg-nickname-input"
                      className="dsg-input"
                      value={nicknameDraft}
                      maxLength={24}
                      placeholder={state.nickname}
                      onChange={(e) => { setNicknameDraft(e.target.value); setNicknameSaved(false) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && nicknameDraft.trim() !== '') void saveNickname()
                      }}
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
                  <div className="dsg-field-heading">
                    <label htmlFor="dsg-size-slider">{t('menu.size')}</label>
                    <output htmlFor="dsg-size-slider">{display.size}px</output>
                  </div>
                  <input
                    id="dsg-size-slider"
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
                  <div className="dsg-row dsg-position-actions">
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
                      aria-pressed={display.locked}
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
              </section>

              <section className="dsg-popover-section" aria-labelledby="dsg-appearance-title">
                <h4 id="dsg-appearance-title">{t('menu.appearance')}</h4>
                <div className="dsg-field">
                  <label>{t('menu.petPattern')}</label>
                  <div className="dsg-swatch-grid">
                    {PET_VARIANTS.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        className="dsg-swatch"
                        data-on={state.petVariant === variant.id}
                        title={t(variant.nameKey)}
                        aria-label={t(variant.nameKey)}
                        aria-pressed={state.petVariant === variant.id}
                        onClick={() => switchVariant(variant.id)}
                        style={{ background: `linear-gradient(135deg, ${variant.from}, ${variant.to})` }}
                      />
                    ))}
                    <button
                      type="button"
                      className="dsg-swatch dsg-swatch-custom"
                      data-on={customVariant !== null}
                      title={t('petVariant.custom')}
                      aria-label={t('petVariant.custom')}
                      aria-pressed={customVariant !== null}
                      onClick={() => setCustomColorOpen((open) => !open)}
                      style={customVariant !== null
                        ? { background: `linear-gradient(135deg, ${customVariant.from}, ${customVariant.to})` }
                        : undefined}
                    />
                  </div>
                  {customColorOpen && (
                    <div className="dsg-custom-colors">
                      <label className="dsg-color-field" title={t('menu.customFrom')}>
                        {t('menu.customFrom')}
                        <input
                          type="color"
                          value={customDraft?.from ?? customVariant?.from ?? '#6d8bff'}
                          onChange={(e) => applyCustomColor(e.target.value, customDraft?.to ?? customVariant?.to ?? '#4d6bfe')}
                        />
                      </label>
                      <label className="dsg-color-field" title={t('menu.customTo')}>
                        {t('menu.customTo')}
                        <input
                          type="color"
                          value={customDraft?.to ?? customVariant?.to ?? '#4d6bfe'}
                          onChange={(e) => applyCustomColor(customDraft?.from ?? customVariant?.from ?? '#6d8bff', e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="dsg-field">
                  <label>{t('menu.uploadPet')}</label>
                  <div className="dsg-upload-row" data-has-preview={petUrl !== undefined}>
                    {petUrl !== undefined && (
                      <img className="dsg-pet-preview" src={petUrl} alt="" />
                    )}
                    <div className="dsg-upload-content">
                      {petUrl !== undefined && (
                        <span className="dsg-upload-meta">
                          {state.pet?.ext === 'gif' ? 'GIF' : 'PNG'} · {state.pet?.width}×{state.pet?.height}
                        </span>
                      )}
                      <div className="dsg-row">
                        <label className="dsg-btn" data-disabled={petBusy}>
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
                    </div>
                  </div>
                  <p className="dsg-hint">{petHint}</p>
                  {petNote !== null && <p className="dsg-note" data-testid="games-pet-note">{petNote}</p>}
                </div>
              </section>

              <section className="dsg-popover-section dsg-popover-section-last">
                <RoomPanel
                  t={t}
                  room={room}
                  own={state}
                  error={roomError}
                  onCreate={createRoom}
                  onJoin={joinRoom}
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
              </section>
            </div>
          </div>
        )}
        <div
          ref={petRef}
          className="dsg-pet"
          data-active={consuming}
          data-phase={state.phase}
          data-token-active={tokenStreamActive}
          data-testid="games-pet"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? 'dsg-pet-popover' : undefined}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setMenuOpen((open) => !open)
          }}
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false
              return
            }
            setMenuOpen((open) => !open)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          {bubble !== null && <div className="dsg-pet-bubble" data-testid="games-bubble">{bubble}</div>}
          {ownChat !== null
            ? <ChatBubble key={ownChat.key} text={ownChat.text} leaving={ownChat.leaving} />
            : chatOpen
              ? (
                <ChatComposer
                  t={t}
                  value={chatDraft}
                  disabled={chatCooldown}
                  onChange={setChatDraft}
                  onSend={() => { void sendChat(chatDraft) }}
                  onClose={() => closeChat(true)}
                />
              )
              : <ChatHint t={t} disabled={chatCooldown} onClick={() => setChatOpen(true)} />}
          <span className="dsg-whale-wrap">
            <span className="dsg-whale-breathe">
              {pyramid.crowns.length > 0 && <>{pyramid.crowns}</>}
              {pyramid.flash}
              {pyramid.overflow > 0 && (
                <span className="dsg-crown-badge" style={{ top: pyramid.pileTop }}>+{pyramid.overflow}</span>
              )}
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
          </span>
          <span
            className={`dsg-pet-label${consuming ? ' dsg-label-active' : ''}${tokenFx !== null ? ' dsg-label-burst' : ''}`}
            data-testid="games-label"
          >
            <span className="dsg-label-content">
              {label}
              {tokenFx !== null && (
                <em className="dsg-token-chip" key={tokenFx.key} data-testid="games-token-chip">
                  +{formatTokens(tokenFx.delta)}
                </em>
              )}
            </span>
          </span>
        </div>
        {otherMembers.map((member) => {
          const pos = scenePositions[member.memberId]
          if (pos === undefined) return null
          const auto = scene.prefs.mode === 'row' || scene.prefs.mode === 'column' || scene.prefs.mode === 'orbit'
          const memberChat = memberChats[member.memberId]
          return (
            <MemberPetScene
              key={member.memberId}
              member={member}
              size={display.size}
              pos={pos}
              draggable={!auto}
              showLabel={scene.prefs.showLabels}
              chat={memberChat ?? null}
              onMove={(next) => {
                scene.moveMember(member.memberId, scene.prefs.mode === 'grid' ? snapPos(next, scene.prefs.spacing) : next)
              }}
            />
          )
        })}
      </span>
      ) : null}
    </span>
  )
}
