import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GamesService,
  TOKEN_ACTIVITY_WINDOW_MS,
} from './service.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })))
})

describe('GamesService token activity', () => {
  it('follows the real session lifecycle before the first output chunk', async () => {
    const persistDir = await mkdtemp(join(tmpdir(), 'dsh-games-service-'))
    tempDirs.push(persistDir)
    const service = new GamesService(new Context(), { enabled: false, persistDir })
    const internal = service as unknown as {
      onSessionEvent(sessionId: string, event: { type: string; data?: unknown }): void
    }

    internal.onSessionEvent('session-lifecycle', {
      type: 'turn/start',
      data: { turn: 1 },
    })
    expect((await service.state()).phase).toBe('waiting')

    internal.onSessionEvent('session-lifecycle', {
      type: 'step/start',
      data: { turn: 1, step: 1 },
    })
    expect((await service.state()).phase).toBe('thinking')

    internal.onSessionEvent('session-lifecycle', {
      type: 'tool/call',
      data: { turn: 1, step: 1 },
    })
    expect((await service.state()).phase).toBe('tool')

    internal.onSessionEvent('session-lifecycle', {
      type: 'tool/result',
      data: { turn: 1, step: 1 },
    })
    expect((await service.state()).phase).toBe('thinking')

    internal.onSessionEvent('session-lifecycle', {
      type: 'step/end',
      data: { turn: 1, step: 1 },
    })
    expect((await service.state()).phase).toBe('done')

    internal.onSessionEvent('session-lifecycle', {
      type: 'turn/end',
      data: { turn: 1, reason: 'completed' },
    })
    expect((await service.state()).phase).toBe('idle')
  })

  it('marks plain assistant output active even without thinking or tool phases', async () => {
    const persistDir = await mkdtemp(join(tmpdir(), 'dsh-games-service-'))
    tempDirs.push(persistDir)
    const service = new GamesService(new Context(), { enabled: false, persistDir })
    const internal = service as unknown as {
      onSessionEvent(sessionId: string, event: { type: string; data?: unknown }): void
    }
    const before = Date.now()

    internal.onSessionEvent('session-a', {
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', textDelta: 'Once upon a time' } },
    })

    const state = await service.state()
    expect(state.phase).toBe('idle')
    expect(state.tokens).toBe(0)
    expect(state.tokenActiveUntil).toBeGreaterThanOrEqual(before + TOKEN_ACTIVITY_WINDOW_MS)
  })

  it('keeps the output activity window after the session is disposed', async () => {
    const persistDir = await mkdtemp(join(tmpdir(), 'dsh-games-service-'))
    tempDirs.push(persistDir)
    const context = new Context()
    const service = new GamesService(context, { persistDir })
    const internal = service as unknown as {
      onSessionEvent(sessionId: string, event: { type: string; data?: unknown }): void
      onSessionDisposed(): void
    }
    const before = Date.now()

    internal.onSessionEvent('session-b', {
      type: 'assistant/message',
      data: { turn: 1, step: 1 },
    })
    internal.onSessionDisposed()

    const state = await service.state()
    expect(state.phase).toBe('idle')
    expect(state.tokenActiveUntil).toBeGreaterThanOrEqual(before + TOKEN_ACTIVITY_WINDOW_MS)
    service.setEnabled(false)
  })
})
