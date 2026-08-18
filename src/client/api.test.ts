// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearStoredRoom,
  GameServerError,
  gameServerApi,
  loadStoredRoom,
  REQUEST_TIMEOUT_MS,
  storeRoom,
} from './api.ts'

const MEMBER_TOKEN = 'a'.repeat(43)

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('room protocol v3 client API', () => {
  it('sends server and member tokens in headers, never in the room URL', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(JSON.stringify({
        ok: true,
        room: {
          protocolVersion: 3,
          code: 'ABCD',
          name: '',
          public: true,
          createdAt: 1,
          members: [],
          messages: [],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await gameServerApi.heartbeat(
      'https://games.example',
      'server-auth',
      'ABCD',
      MEMBER_TOKEN,
      {
        memberId: 'member-a1',
        nickname: 'Alice',
        tokens: 1,
        crowns: [],
        phase: 'idle',
      },
    )

    expect(capturedUrl).toBe('https://games.example/api/games/rooms/ABCD/members')
    expect(capturedUrl).not.toContain(MEMBER_TOKEN)
    expect(new Headers(capturedInit?.headers).get('x-dsh-member-token')).toBe(MEMBER_TOKEN)
    expect(new Headers(capturedInit?.headers).get('authorization')).toBe('Bearer server-auth')
  })

  it('uses the dedicated join endpoint without a member token header', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(JSON.stringify({
        ok: true,
        memberToken: MEMBER_TOKEN,
        room: {
          protocolVersion: 3,
          code: 'ABCD',
          name: '',
          public: true,
          createdAt: 1,
          members: [],
          messages: [],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await gameServerApi.join('https://games.example', '', 'ABCD', {
      memberId: 'member-a1',
      nickname: 'Alice',
      tokens: 1,
      crowns: [],
      phase: 'idle',
    })

    expect(capturedUrl).toBe('https://games.example/api/games/rooms/ABCD/join')
    expect(new Headers(capturedInit?.headers).get('x-dsh-member-token')).toBeNull()
  })

  it('persists a complete v3 room session and clears legacy storage', () => {
    localStorage.setItem('dsh.games.room.v1', JSON.stringify({
      base: 'https://old.example',
      code: 'OLD1',
    }))

    storeRoom('https://games.example/', 'abcd', MEMBER_TOKEN)

    expect(loadStoredRoom()).toEqual({
      base: 'https://games.example',
      code: 'ABCD',
      memberToken: MEMBER_TOKEN,
    })
    expect(localStorage.getItem('dsh.games.room.v1')).toBeNull()
    expect(localStorage.getItem('dsh.games.room.v2')).toBeNull()

    clearStoredRoom()
    expect(localStorage.getItem('dsh.games.room.v3')).toBeNull()
  })

  it('invalidates old or malformed room sessions', () => {
    localStorage.setItem('dsh.games.room.v1', JSON.stringify({
      base: 'https://old.example',
      code: 'OLD1',
    }))
    expect(loadStoredRoom()).toBeUndefined()
    expect(localStorage.getItem('dsh.games.room.v1')).toBeNull()

    localStorage.setItem('dsh.games.room.v2', JSON.stringify({
      base: 'https://games.example',
      code: 'ABCD',
      memberToken: MEMBER_TOKEN,
    }))
    expect(loadStoredRoom()).toBeUndefined()
    expect(localStorage.getItem('dsh.games.room.v2')).toBeNull()

    localStorage.setItem('dsh.games.room.v3', JSON.stringify({
      base: 'https://games.example',
      code: 'ABCD',
      memberToken: 'too-short',
    }))
    expect(loadStoredRoom()).toBeUndefined()
    expect(localStorage.getItem('dsh.games.room.v3')).toBeNull()
  })

  it('preserves the server error code and forwards heartbeat cancellation', async () => {
    const controller = new AbortController()
    let capturedSignal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal
      return new Response(JSON.stringify({ ok: false, error: 'member-not-found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    })

    const promise = gameServerApi.heartbeat(
      'https://games.example',
      '',
      'ABCD',
      MEMBER_TOKEN,
      {
        memberId: 'member-a1',
        nickname: 'Alice',
        tokens: 1,
        crowns: [],
        phase: 'thinking',
      },
      controller.signal,
    )

    await expect(promise).rejects.toMatchObject({
      name: 'GameServerError',
      status: 404,
      code: 'member-not-found',
    } satisfies Partial<GameServerError>)
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal).not.toBe(controller.signal)
  })

  it('forwards caller cancellation to the bounded request signal', async () => {
    const controller = new AbortController()
    let capturedSignal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason)
        }, { once: true })
      })
    })

    const pending = gameServerApi.heartbeat(
      'https://games.example',
      '',
      'ABCD',
      MEMBER_TOKEN,
      {
        memberId: 'member-a1',
        nickname: 'Alice',
        tokens: 1,
        crowns: [],
        phase: 'idle',
      },
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('times out a stalled game-server request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason)
        }, { once: true })
      })
    })

    const pending = gameServerApi.listRooms('https://games.example', '')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await assertion
  })
})
