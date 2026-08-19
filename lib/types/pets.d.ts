/**
 * Pet store — file-backed custom pet images keyed by member id. The game
 * server (standalone Docker deployment or the DSH host's in-process mount)
 * owns these bytes; validation is strict: PNG/GIF magic bytes, decoded pixel
 * dimensions, and a hard size cap. Files land in `<dir>/pets/<memberId>.<ext>`
 * with atomic rename writes.
 * @module @kasidia/dsh-games/pets
 */
import type { PetMeta } from './persist.ts';
import type { PetRules } from './rules.ts';
/** Decoded payload of a validated pet image. */
export interface PetPayload {
    meta: PetMeta;
    /** File bytes (already validated). */
    buffer: Buffer;
}
/** Outcome of a save attempt. */
export type SavePetResult = {
    ok: true;
    meta: PetMeta;
} | {
    ok: false;
    error: 'invalid-format' | 'too-large' | 'too-wide' | 'empty';
};
/** Member ids the store accepts (uuid-shaped; keeps paths safe). */
export declare function isMemberId(value: string): boolean;
/** Detect PNG/GIF from magic bytes and decode their pixel dimensions. */
export declare function sniffImage(buffer: Buffer): {
    ext: 'png' | 'gif';
    width: number;
    height: number;
} | undefined;
/** Validate an uploaded pet payload against the configured rules. */
export declare function validatePet(buffer: Buffer, rules: PetRules): SavePetResult;
/**
 * File-backed pet storage. All reads/writes go through this class so the
 * host mount and the standalone game server share identical behavior.
 */
export declare class PetStore {
    private readonly dir;
    constructor(dir: string);
    private pathFor;
    /** Save a validated pet image; returns its meta (or the validation error). */
    save(memberId: string, buffer: Buffer, rules: PetRules): SavePetResult;
    /** The stored pet payload, or undefined when the member has none. */
    get(memberId: string): PetPayload | undefined;
    /** Remove a member's pet; true when a file was removed. */
    remove(memberId: string): boolean;
}
//# sourceMappingURL=pets.d.ts.map