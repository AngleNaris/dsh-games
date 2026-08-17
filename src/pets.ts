/**
 * Pet store — file-backed custom pet images keyed by member id. The game
 * server (standalone Docker deployment or the DSH host's in-process mount)
 * owns these bytes; validation is strict: PNG/GIF magic bytes, decoded pixel
 * dimensions, and a hard size cap. Files land in `<dir>/pets/<memberId>.<ext>`
 * with atomic rename writes.
 * @module @linxin666/dsh-games/pets
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PetMeta } from './persist.ts'
import type { PetRules } from './gameconfig.ts'

/** Decoded payload of a validated pet image. */
export interface PetPayload {
  meta: PetMeta
  /** File bytes (already validated). */
  buffer: Buffer
}

/** Outcome of a save attempt. */
export type SavePetResult =
  | { ok: true; meta: PetMeta }
  | { ok: false; error: 'invalid-format' | 'too-large' | 'too-wide' | 'empty' }

/** Member ids the store accepts (uuid-shaped; keeps paths safe). */
export function isMemberId(value: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(value)
}

/** Detect PNG/GIF from magic bytes and decode their pixel dimensions. */
export function sniffImage(buffer: Buffer): { ext: 'png' | 'gif'; width: number; height: number } | undefined {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    // PNG: IHDR chunk holds width/height as big-endian u32 at offset 16.
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    if (width > 0 && height > 0) return { ext: 'png', width, height }
    return undefined
  }
  if (buffer.length >= 10
    && (buffer.toString('latin1', 0, 6) === 'GIF87a' || buffer.toString('latin1', 0, 6) === 'GIF89a')) {
    // GIF: logical screen descriptor width/height as little-endian u16 at 6.
    const width = buffer.readUInt16LE(6)
    const height = buffer.readUInt16LE(8)
    if (width > 0 && height > 0) return { ext: 'gif', width, height }
    return undefined
  }
  return undefined
}

/** Validate an uploaded pet payload against the configured rules. */
export function validatePet(buffer: Buffer, rules: PetRules): SavePetResult {
  if (buffer.length === 0) return { ok: false, error: 'empty' }
  if (buffer.length > rules.maxBytes) return { ok: false, error: 'too-large' }
  const sniffed = sniffImage(buffer)
  if (sniffed === undefined) return { ok: false, error: 'invalid-format' }
  if (sniffed.width > rules.maxDimension || sniffed.height > rules.maxDimension) {
    return { ok: false, error: 'too-wide' }
  }
  return { ok: true, meta: { ext: sniffed.ext, version: Date.now(), width: sniffed.width, height: sniffed.height } }
}

/**
 * File-backed pet storage. All reads/writes go through this class so the
 * host mount and the standalone game server share identical behavior.
 */
export class PetStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  private pathFor(memberId: string, ext: 'png' | 'gif'): string {
    return join(this.dir, `${memberId}.${ext}`)
  }

  /** Save a validated pet image; returns its meta (or the validation error). */
  save(memberId: string, buffer: Buffer, rules: PetRules): SavePetResult {
    if (!isMemberId(memberId)) return { ok: false, error: 'invalid-format' }
    const result = validatePet(buffer, rules)
    if (!result.ok) return result
    mkdirSync(this.dir, { recursive: true })
    const target = this.pathFor(memberId, result.meta.ext)
    const tmp = `${target}.tmp`
    try {
      writeFileSync(tmp, buffer)
      renameSync(tmp, target)
    } catch {
      try { unlinkSync(tmp) } catch { /* ignore */ }
      return { ok: false, error: 'invalid-format' }
    }
    // A previous upload with the other extension is now stale — drop it.
    const stale = this.pathFor(memberId, result.meta.ext === 'png' ? 'gif' : 'png')
    try { unlinkSync(stale) } catch { /* not there */ }
    return { ok: true, meta: result.meta }
  }

  /** The stored pet payload, or undefined when the member has none. */
  get(memberId: string): PetPayload | undefined {
    if (!isMemberId(memberId)) return undefined
    for (const ext of ['png', 'gif'] as const) {
      try {
        const buffer = readFileSync(this.pathFor(memberId, ext))
        const sniffed = sniffImage(buffer)
        if (sniffed === undefined || sniffed.ext !== ext) continue
        return {
          meta: { ext, version: 0, width: sniffed.width, height: sniffed.height },
          buffer,
        }
      } catch {
        // Missing or unreadable — try the other extension.
      }
    }
    return undefined
  }

  /** Remove a member's pet; true when a file was removed. */
  remove(memberId: string): boolean {
    if (!isMemberId(memberId)) return false
    let removed = false
    for (const ext of ['png', 'gif'] as const) {
      try {
        unlinkSync(this.pathFor(memberId, ext))
        removed = true
      } catch {
        // Not present.
      }
    }
    return removed
  }
}
