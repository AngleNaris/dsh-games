#!/usr/bin/env node
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
//#region src/rooms.ts
/**
* Room store — in-memory multiplayer rooms. One DSH host owns the rooms it
* creates; every player (including the host's own browser) heartbeats its
* member state into the room, and every player polls the room snapshot.
* Members are removed after a heartbeat timeout; empty rooms expire.
*
* Rooms are either **public** (listed on the host's room list, anyone can
* join) or **invite-only** (joinable only by code, invisible in the list).
* @module @kasidia/dsh-games/rooms
*/
/** The phases the room protocol accepts (unknown phases are coerced to idle). */
const KNOWN_PHASES = [
	"idle",
	"waiting",
	"thinking",
	"tool",
	"done"
];
/** How long messages stay in the snapshot (must exceed the poll interval). */
const MESSAGE_TTL_MS = 15e3;
/** Room code alphabet: no 0/O/1/I to keep codes easy to read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const CODE_MAX_ATTEMPTS = 8;
const CODE_SPACE = 32 ** CODE_LENGTH;
function randomCode() {
	let code = "";
	for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * 32)];
	return code;
}
function memberTokenHash(token) {
	return createHash("sha256").update(token, "utf8").digest();
}
function issueMemberToken() {
	return randomBytes(32).toString("base64url");
}
function memberTokenMatches(expected, token) {
	if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
	return timingSafeEqual(expected, memberTokenHash(token));
}
/** Encode one integer into a valid fixed-width room code. */
function codeFromIndex(raw) {
	let index = raw % CODE_SPACE;
	let code = "";
	for (let i = 0; i < CODE_LENGTH; i += 1) {
		code = CODE_ALPHABET[index % 32] + code;
		index = Math.floor(index / 32);
	}
	return code;
}
/** Normalize an external phase string into the known phase set. */
function normalizePhase(phase) {
	return typeof phase === "string" && KNOWN_PHASES.includes(phase) ? phase : "idle";
}
/** Clamp a number into [0, max] (non-finite -> fallback). */
function clampNum(value, max, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : fallback;
}
/** Validate a room code string (normalized to uppercase). */
function normalizeCode(raw) {
	const code = raw.trim().toUpperCase();
	if (!/^[A-Z2-9]{4}$/.test(code)) return void 0;
	return code;
}
/** Normalize a room name (trimmed, capped). */
function normalizeRoomName(raw) {
	if (typeof raw !== "string") return "";
	return raw.trim().slice(0, 24);
}
/** Normalize a UUID-like member id shared by rooms and pet storage. */
function normalizeMemberId(raw) {
	if (typeof raw !== "string") return void 0;
	const memberId = raw.trim();
	return /^[A-Za-z0-9-]{8,64}$/.test(memberId) ? memberId : void 0;
}
/** Normalize a visible member nickname. */
function normalizeNickname(raw) {
	if (typeof raw !== "string") return void 0;
	const nickname = raw.trim().slice(0, 24);
	return nickname === "" ? void 0 : nickname;
}
/** Validate a member pet URL (bounded length, http(s) only). */
function normalizePetUrl(raw) {
	if (typeof raw !== "string") return void 0;
	const url = raw.trim();
	if (url === "" || url.length > 512) return void 0;
	if (!/^https?:\/\//i.test(url)) return void 0;
	return url;
}
/** Validate a pet pattern variant id (preset name or custom color pair). */
function normalizePetVariant(raw) {
	if (typeof raw !== "string") return void 0;
	const variant = raw.trim();
	if (variant === "" || variant.length > 64) return void 0;
	if (/^custom:#[0-9a-f]{6}:#[0-9a-f]{6}$/.test(variant)) return variant;
	if (/^[a-z0-9-]{1,32}$/.test(variant)) return variant;
}
/** Validate a member crowns array (10 counts, clamped). */
function normalizeCrowns(raw) {
	if (!Array.isArray(raw)) return void 0;
	const counts = new Array(10).fill(0);
	for (let i = 0; i < Math.min(raw.length, 10); i += 1) {
		const value = raw[i];
		if (typeof value !== "number" || !Number.isFinite(value)) continue;
		counts[i] = Math.max(0, Math.round(value));
	}
	return counts;
}
/**
* In-memory room registry. Not persisted: rooms are demo-time constructs that
* live while their host process runs and their members keep heartbeating.
*/
var RoomStore = class {
	rooms = /* @__PURE__ */ new Map();
	memberTtlMs;
	roomTtlMs;
	maxMembers;
	antiCheat;
	constructor(options = {}) {
		this.memberTtlMs = options.memberTtlMs ?? 12e4;
		this.roomTtlMs = options.roomTtlMs ?? 6e5;
		this.maxMembers = options.maxMembers ?? 32;
		this.antiCheat = options.antiCheat;
	}
	/** Create a room with a fresh, collision-free code. */
	createRoom(options = {}, now = Date.now()) {
		for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt += 1) {
			const code = randomCode();
			if (this.rooms.has(code)) continue;
			const room = {
				code,
				name: normalizeRoomName(options.name),
				public: options.public !== false,
				createdAt: now,
				emptySince: now,
				members: /* @__PURE__ */ new Map(),
				messages: []
			};
			this.rooms.set(code, room);
			return this.viewOf(room, now);
		}
		const start = Math.abs(Math.trunc(now)) % CODE_SPACE;
		for (let offset = 0; offset < CODE_SPACE; offset += 1) {
			const code = codeFromIndex(start + offset);
			if (this.rooms.has(code)) continue;
			const room = {
				code,
				name: normalizeRoomName(options.name),
				public: options.public !== false,
				createdAt: now,
				emptySince: now,
				members: /* @__PURE__ */ new Map(),
				messages: []
			};
			this.rooms.set(code, room);
			return this.viewOf(room, now);
		}
		throw new Error("room-code-space-exhausted");
	}
	/** Read a room snapshot by code (normalized). */
	getRoom(code) {
		const normalized = normalizeCode(code);
		if (normalized === void 0) return void 0;
		const room = this.rooms.get(normalized);
		return room === void 0 ? void 0 : this.viewOf(room);
	}
	/** All public rooms (the room list; invite-only rooms stay hidden). */
	listPublicRooms() {
		return [...this.rooms.values()].filter((room) => room.public).sort((a, b) => b.createdAt - a.createdAt).map((room) => this.viewOf(room));
	}
	/** Join a room and issue a new member-session token. */
	joinMember(code, report, now = Date.now()) {
		const normalized = normalizeCode(code);
		if (normalized === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const room = this.rooms.get(normalized);
		if (room === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const memberId = normalizeMemberId(report.memberId);
		const nickname = normalizeNickname(report.nickname);
		if (memberId === void 0 || nickname === void 0) return {
			ok: false,
			error: "invalid"
		};
		if (room.members.has(memberId)) return {
			ok: false,
			error: "member-conflict"
		};
		if (room.members.size >= this.maxMembers) return {
			ok: false,
			error: "room-full"
		};
		const checked = this.antiCheat?.validate({
			...report,
			memberId
		}, now);
		if (checked !== void 0 && !checked.ok) return checked;
		const verifiedReport = checked === void 0 ? report : {
			...report,
			tokens: checked.tokens,
			crowns: checked.crowns
		};
		const memberToken = issueMemberToken();
		room.members.set(memberId, {
			view: this.memberView(verifiedReport, memberId, nickname, void 0, now),
			tokenHash: memberTokenHash(memberToken)
		});
		room.emptySince = null;
		return {
			ok: true,
			room: this.viewOf(room, now),
			memberToken
		};
	}
	/** Update one member after proving possession of its room-session token. */
	heartbeatMember(code, report, memberToken, now = Date.now()) {
		const normalized = normalizeCode(code);
		if (normalized === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const room = this.rooms.get(normalized);
		if (room === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const memberId = normalizeMemberId(report.memberId);
		const nickname = normalizeNickname(report.nickname);
		if (memberId === void 0 || nickname === void 0) return {
			ok: false,
			error: "invalid"
		};
		const existing = room.members.get(memberId);
		if (existing === void 0) return {
			ok: false,
			error: "member-not-found"
		};
		if (!memberTokenMatches(existing.tokenHash, memberToken)) return {
			ok: false,
			error: "unauthorized"
		};
		const checked = this.antiCheat?.validate({
			...report,
			memberId
		}, now);
		if (checked !== void 0 && !checked.ok) return checked;
		const verifiedReport = checked === void 0 ? report : {
			...report,
			tokens: checked.tokens,
			crowns: checked.crowns
		};
		existing.view = this.memberView(verifiedReport, memberId, nickname, existing.view, now);
		return {
			ok: true,
			room: this.viewOf(room, now)
		};
	}
	memberView(report, memberId, nickname, existing, now) {
		const crowns = normalizeCrowns(report.crowns);
		return {
			memberId,
			nickname,
			tokens: clampNum(report.tokens, Number.MAX_SAFE_INTEGER, existing?.tokens ?? 0),
			crowns: crowns ?? existing?.crowns ?? new Array(10).fill(0),
			hats: crowns === void 0 ? clampNum(report.hats, Number.MAX_SAFE_INTEGER, existing?.hats ?? 0) : crowns.reduce((sum, count) => sum + count, 0),
			phase: normalizePhase(report.phase),
			active: report.active === true,
			joinedAt: existing?.joinedAt ?? now,
			lastSeen: now,
			petVariant: normalizePetVariant(report.petVariant) ?? existing?.petVariant,
			...report.petUrl !== void 0 || existing?.petUrl !== void 0 ? { petUrl: report.petUrl !== void 0 ? normalizePetUrl(report.petUrl) ?? void 0 : existing?.petUrl } : {},
			...report.petVersion !== void 0 || existing?.petVersion !== void 0 ? { petVersion: report.petVersion ?? existing?.petVersion } : {}
		};
	}
	/** Remove one member after proving possession of its room-session token. */
	removeMember(code, memberId, memberToken, now = Date.now()) {
		const normalized = normalizeCode(code);
		if (normalized === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const normalizedMemberId = normalizeMemberId(memberId);
		if (normalizedMemberId === void 0) return {
			ok: false,
			error: "invalid"
		};
		const room = this.rooms.get(normalized);
		if (room === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const member = room.members.get(normalizedMemberId);
		if (member === void 0) return {
			ok: false,
			error: "member-not-found"
		};
		if (!memberTokenMatches(member.tokenHash, memberToken)) return {
			ok: false,
			error: "unauthorized"
		};
		room.members.delete(normalizedMemberId);
		if (room.members.size === 0) room.emptySince = now;
		return {
			ok: true,
			removed: true
		};
	}
	/**
	* Append one chat message. Per-member cooldown (MESSAGE_COOLDOWN_MS) rejects
	* sends while the previous bubble is still showing.
	*/
	addMessage(code, message, memberToken, now = Date.now()) {
		const normalized = normalizeCode(code);
		if (normalized === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const room = this.rooms.get(normalized);
		if (room === void 0) return {
			ok: false,
			error: "room-not-found"
		};
		const memberId = normalizeMemberId(message.memberId);
		if (memberId === void 0) return {
			ok: false,
			error: "invalid"
		};
		const member = room.members.get(memberId);
		if (member === void 0) return {
			ok: false,
			error: "member-not-found"
		};
		if (!memberTokenMatches(member.tokenHash, memberToken)) return {
			ok: false,
			error: "unauthorized"
		};
		const text = message.text.trim();
		if (text === "" || text.length > 20) return {
			ok: false,
			error: "invalid"
		};
		const last = [...room.messages].reverse().find((entry) => entry.memberId === memberId);
		if (last !== void 0 && now - last.at < 4e3) return {
			ok: false,
			error: "cooldown"
		};
		room.messages.push({
			memberId,
			nickname: member.view.nickname,
			text,
			at: now
		});
		if (room.messages.length > 16) room.messages.splice(0, room.messages.length - 16);
		return {
			ok: true,
			room: this.viewOf(room, now)
		};
	}
	/** Sweep stale members, expired messages, and expired empty rooms. */
	sweep(now = Date.now()) {
		for (const [code, room] of this.rooms) {
			const hadMembers = room.members.size > 0;
			for (const [memberId, member] of room.members) if (now - member.view.lastSeen > this.memberTtlMs) room.members.delete(memberId);
			room.messages = room.messages.filter((message) => now - message.at < MESSAGE_TTL_MS);
			if (room.members.size === 0) {
				if (hadMembers || room.emptySince === null) room.emptySince = now;
				if (now - room.emptySince > this.roomTtlMs) this.rooms.delete(code);
			} else room.emptySince = null;
		}
		this.antiCheat?.sweep(now);
	}
	/** Flush validator state before a process or plugin shutdown. */
	close() {
		this.antiCheat?.close();
	}
	viewOf(room, now = Date.now()) {
		return {
			protocolVersion: 3,
			code: room.code,
			name: room.name,
			public: room.public,
			createdAt: room.createdAt,
			members: [...room.members.values()].map((member) => member.view).sort((a, b) => a.joinedAt - b.joinedAt),
			messages: room.messages.filter((message) => now - message.at < MESSAGE_TTL_MS)
		};
	}
};
/** CORS headers applied to every shared-surface response (open relay). */
const CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
	"access-control-allow-headers": "authorization, content-type, x-dsh-member-token"
};
/** Write one CORS + JSON response. */
function json(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		...CORS_HEADERS
	});
	res.end(JSON.stringify(body));
}
/** Answer a shared-surface OPTIONS preflight (no auth needed). */
function preflight(res) {
	res.writeHead(204, CORS_HEADERS);
	res.end();
}
/** Constant-time token comparison (length leak is irrelevant here). */
function tokenMatches(expected, given) {
	if (expected.length !== given.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
	return diff === 0;
}
/** Read the opaque member-session bearer from its dedicated request header. */
function memberTokenOf(req) {
	const value = req.headers["x-dsh-member-token"];
	return typeof value === "string" ? value : "";
}
/** Convert RoomStore result errors into stable HTTP status codes. */
function roomErrorStatus(error) {
	switch (error) {
		case "invalid": return 400;
		case "token-regression": return 409;
		case "crowns-mismatch":
		case "token-jump": return 422;
		case "anti-cheat-locked":
		case "cooldown": return 429;
		case "unauthorized": return 401;
		case "member-conflict":
		case "room-full": return 409;
		default: return 404;
	}
}
/**
* Enforce the auth token. Returns true when the request may proceed; false
* when a 401 (or preflight pass) was already written.
*/
function requireAuth(req, res, ctx) {
	if (req.method === "OPTIONS") {
		preflight(res);
		return false;
	}
	if (ctx.authToken === void 0 || ctx.authToken === "") return true;
	const url = new URL(req.url ?? "/", "http://localhost");
	const authorization = req.headers.authorization;
	const bearer = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
	const petImageToken = req.method === "GET" && url.pathname.startsWith(`/api/games/pets/`) ? url.searchParams.get("token") ?? "" : "";
	const given = bearer !== "" ? bearer : petImageToken;
	if (tokenMatches(ctx.authToken, given)) return true;
	json(res, 401, {
		ok: false,
		error: "unauthorized"
	});
	return false;
}
/** Read a raw request body (bounded; rejects above `max` bytes). */
function readRawBody(req, max) {
	const declared = Number(req.headers["content-length"]);
	if (Number.isFinite(declared) && declared > max) return Promise.reject(/* @__PURE__ */ new Error("body-too-large"));
	return new Promise((resolve, reject) => {
		let size = 0;
		let overflowed = false;
		const chunks = [];
		req.on("data", (chunk) => {
			if (overflowed) return;
			size += chunk.length;
			if (size > max) {
				overflowed = true;
				reject(/* @__PURE__ */ new Error("body-too-large"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (overflowed) return;
			resolve(chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks));
		});
		req.on("error", (error) => {
			if (!overflowed) reject(error);
		});
	});
}
/** Read a JSON request body (bounded). */
function readJsonBody(req) {
	return readRawBody(req, 65536).then((buffer) => {
		if (buffer.length === 0) return {};
		try {
			return JSON.parse(buffer.toString("utf8"));
		} catch {
			throw new Error("invalid-json");
		}
	});
}
/**
* Route one request across the shared surface (rooms + pets + rules).
* Returns a promise that settles when the response is written.
*/
function handleGameServer(req, res, ctx) {
	const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
	if (req.method === "OPTIONS") {
		preflight(res);
		return;
	}
	if (pathname === "/api/games/health" && req.method === "GET") {
		json(res, 200, {
			ok: true,
			protocolVersion: 3
		});
		return;
	}
	if (!requireAuth(req, res, ctx)) return;
	if (pathname === "/api/games/rules" && req.method === "GET") {
		json(res, 200, {
			ok: true,
			rules: ctx.rules
		});
		return;
	}
	if (pathname.startsWith(`/api/games/rooms/`) || pathname === "/api/games/rooms") return routeRoom(req, res, ctx, pathname.slice(16));
	if (pathname.startsWith(`/api/games/pets/`) || pathname === "/api/games/pets") return routePet(req, res, ctx, pathname.slice(15));
	json(res, 404, {
		ok: false,
		error: "route-not-found"
	});
}
/** Rooms subtree: list/create, <code>/join/state/members/messages. */
function routeRoom(req, res, ctx, rest) {
	const [code, action, memberId] = rest.replace(/^\/+/, "").split("/").filter(Boolean);
	if (code === void 0) {
		if (req.method === "GET") {
			json(res, 200, {
				ok: true,
				rooms: ctx.rooms.listPublicRooms()
			});
			return;
		}
		if (req.method === "POST") return readJsonBody(req).then((body) => {
			const record = typeof body === "object" && body !== null ? body : {};
			json(res, 200, {
				ok: true,
				room: ctx.rooms.createRoom({
					name: typeof record.name === "string" ? record.name : void 0,
					public: record.public !== false
				})
			});
		}, (error) => {
			json(res, 400, {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		});
		json(res, 405, {
			ok: false,
			error: "method-not-allowed"
		});
		return;
	}
	if (/^[A-Za-z0-9]{1,8}$/.test(code) === false) {
		json(res, 404, {
			ok: false,
			error: "room-not-found"
		});
		return;
	}
	if (action === "state" && req.method === "GET") {
		const room = ctx.rooms.getRoom(code);
		if (room === void 0) {
			json(res, 404, {
				ok: false,
				error: "room-not-found"
			});
			return;
		}
		json(res, 200, {
			ok: true,
			room
		});
		return;
	}
	if (action === "join" && req.method === "POST") return readJsonBody(req).then((body) => {
		const report = memberReportOf(body);
		const result = ctx.rooms.joinMember(code, report);
		if (!result.ok) {
			json(res, roomErrorStatus(result.error), {
				ok: false,
				error: result.error
			});
			return;
		}
		json(res, 200, {
			ok: true,
			room: result.room,
			memberToken: result.memberToken
		});
	}, (error) => {
		json(res, 400, {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	});
	if (action === "members" && req.method === "POST") return readJsonBody(req).then((body) => {
		const result = ctx.rooms.heartbeatMember(code, memberReportOf(body), memberTokenOf(req));
		if (!result.ok) {
			json(res, roomErrorStatus(result.error), {
				ok: false,
				error: result.error
			});
			return;
		}
		json(res, 200, {
			ok: true,
			room: result.room
		});
	}, (error) => {
		json(res, 400, {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	});
	if (action === "messages" && req.method === "POST") return readJsonBody(req).then((body) => {
		const record = typeof body === "object" && body !== null ? body : {};
		const message = typeof record.message === "object" && record.message !== null ? record.message : {};
		const result = ctx.rooms.addMessage(code, {
			memberId: typeof message.memberId === "string" ? message.memberId : "",
			text: typeof message.text === "string" ? message.text : ""
		}, memberTokenOf(req));
		if (!result.ok) {
			json(res, roomErrorStatus(result.error), {
				ok: false,
				error: result.error
			});
			return;
		}
		json(res, 200, {
			ok: true,
			room: result.room
		});
	}, (error) => {
		json(res, 400, {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	});
	if (action === "members" && memberId !== void 0 && req.method === "DELETE") {
		if (normalizeMemberId(memberId) === void 0) {
			json(res, 400, {
				ok: false,
				error: "invalid-member"
			});
			return;
		}
		const result = ctx.rooms.removeMember(code, memberId, memberTokenOf(req));
		if (!result.ok) {
			json(res, roomErrorStatus(result.error), {
				ok: false,
				error: result.error
			});
			return;
		}
		json(res, 200, {
			ok: true,
			removed: result.removed
		});
		return;
	}
	json(res, 404, {
		ok: false,
		error: "route-not-found"
	});
}
/** Parse the shared member report envelope used by join and heartbeat. */
function memberReportOf(body) {
	const record = typeof body === "object" && body !== null ? body : {};
	const member = typeof record.member === "object" && record.member !== null ? record.member : {};
	return {
		memberId: typeof member.memberId === "string" ? member.memberId : "",
		nickname: typeof member.nickname === "string" ? member.nickname : "",
		tokens: typeof member.tokens === "number" ? member.tokens : 0,
		crowns: Array.isArray(member.crowns) ? member.crowns : void 0,
		hats: typeof member.hats === "number" ? member.hats : void 0,
		phase: typeof member.phase === "string" ? member.phase : "idle",
		active: member.active === true,
		petUrl: typeof member.petUrl === "string" ? member.petUrl : void 0,
		petVersion: typeof member.petVersion === "number" ? member.petVersion : void 0,
		petVariant: typeof member.petVariant === "string" ? member.petVariant : void 0
	};
}
/** Pets subtree: GET serve image, POST upload (raw bytes), DELETE remove. */
function routePet(req, res, ctx, rest) {
	const memberId = rest.replace(/^\/+/, "");
	if (memberId === "" || memberId.includes("/")) {
		json(res, 400, {
			ok: false,
			error: "invalid-member"
		});
		return;
	}
	if (req.method === "GET") {
		const pet = ctx.pets.get(memberId);
		if (pet === void 0) {
			json(res, 404, {
				ok: false,
				error: "pet-not-found"
			});
			return;
		}
		const age = new URL(req.url ?? "/", "http://localhost").searchParams.get("v");
		res.writeHead(200, {
			"content-type": pet.meta.ext === "gif" ? "image/gif" : "image/png",
			"content-length": pet.buffer.length,
			"cache-control": `public, max-age=${age === null ? 60 : 86400}`,
			...CORS_HEADERS
		});
		res.end(pet.buffer);
		return;
	}
	if (req.method === "POST") {
		const maxBytes = ctx.rules.pet.maxBytes;
		return readRawBody(req, maxBytes).then((buffer) => {
			const result = ctx.pets.save(memberId, buffer, ctx.rules.pet);
			if (!result.ok) {
				json(res, result.error === "too-large" ? 413 : 400, {
					ok: false,
					error: result.error
				});
				return;
			}
			json(res, 200, {
				ok: true,
				pet: result.meta
			});
		}, (error) => {
			json(res, error instanceof Error && error.message === "body-too-large" ? 413 : 400, {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		});
	}
	if (req.method === "DELETE") {
		json(res, 200, {
			ok: true,
			removed: ctx.pets.remove(memberId)
		});
		return;
	}
	json(res, 405, {
		ok: false,
		error: "method-not-allowed"
	});
}
//#endregion
//#region src/crowns.ts
/** Default crown step: one bronze crown per 1M usage tokens (server rules). */
const DEFAULT_CROWN_TOKEN_STEP = 1e6;
/** All ten crown levels, lowest first. */
const CROWN_LEVELS = [
	{
		id: "bronze",
		metal: "#cd7f32",
		light: "#e9b57f",
		dark: "#8a5a1e",
		magic: false
	},
	{
		id: "silver",
		metal: "#c4cad4",
		light: "#f0f3f8",
		dark: "#8b93a3",
		magic: false
	},
	{
		id: "gold",
		metal: "#f0c53c",
		light: "#ffe28a",
		dark: "#b8860b",
		magic: false
	},
	{
		id: "platinum",
		metal: "#d5e6f5",
		light: "#f6fbff",
		dark: "#93b3cf",
		magic: false
	},
	{
		id: "amethyst",
		metal: "#a06ee8",
		light: "#cda9f8",
		dark: "#6a3fb8",
		magic: false
	},
	{
		id: "magic-bronze",
		metal: "#cd7f32",
		light: "#e9b57f",
		dark: "#8a5a1e",
		magic: true
	},
	{
		id: "magic-silver",
		metal: "#c4cad4",
		light: "#f0f3f8",
		dark: "#8b93a3",
		magic: true
	},
	{
		id: "magic-gold",
		metal: "#f0c53c",
		light: "#ffe28a",
		dark: "#b8860b",
		magic: true
	},
	{
		id: "magic-platinum",
		metal: "#d5e6f5",
		light: "#f6fbff",
		dark: "#93b3cf",
		magic: true
	},
	{
		id: "magic-amethyst",
		metal: "#a06ee8",
		light: "#cda9f8",
		dark: "#6a3fb8",
		magic: true
	}
];
/** How many crown levels exist (10). */
const CROWN_LEVEL_COUNT = CROWN_LEVELS.length;
/** Total crown units earned from a lifetime token total. */
function crownUnits(tokens, step) {
	const safeStep = Math.max(1, Math.round(step));
	return Math.max(0, Math.floor((Number.isFinite(tokens) ? tokens : 0) / safeStep));
}
/**
* Decompose crown units into per-level counts. Base `base` (default 3): that
* many crowns of one level are exactly 1 of the next, so each level holds
* 0..base-1 crowns. Any overflow beyond the top level stays in the top level.
* BigInt keeps the division exact for very large ledgers.
*/
function crownCounts(units, base = 3) {
	const counts = new Array(CROWN_LEVEL_COUNT).fill(0);
	if (!Number.isFinite(units) || units <= 0) return counts;
	const radix = Math.max(2, Math.round(base));
	let rest = BigInt(Math.floor(units));
	for (let i = 0; i < CROWN_LEVEL_COUNT - 1; i += 1) {
		counts[i] = Number(rest % BigInt(radix));
		rest /= BigInt(radix);
	}
	counts[CROWN_LEVEL_COUNT - 1] += Number(rest);
	return counts;
}
//#endregion
//#region src/rules.ts
/**
* Browser-safe game-rule contracts and defaults.
*
* The standalone server may override these values from its data-volume
* config. Clients fetch that live rule set from `/api/games/rules`; when the
* server is unavailable they fall back to this exact default snapshot.
* @module @kasidia/dsh-games/rules
*/
/** Default custom-pet upload size cap (2 MiB). */
const PET_MAX_BYTES = 2097152;
/** Default custom-pet longest-edge cap. */
const PET_MAX_DIMENSION = 1024;
/** Fresh default rules for the in-process server and offline clients. */
function defaultGameRules() {
	return {
		crown: {
			tokenStep: DEFAULT_CROWN_TOKEN_STEP,
			base: 3,
			levels: CROWN_LEVELS.map((level) => level.id)
		},
		pet: {
			maxBytes: PET_MAX_BYTES,
			maxDimension: PET_MAX_DIMENSION
		}
	};
}
//#endregion
//#region src/anticheat.ts
/**
* Server-side validation for client-computed token and crown reports.
*
* The server cannot independently meter provider usage, so this is a basic
* integrity layer: it verifies the deterministic crown inventory, enforces a
* monotonic token total, and bounds long-term growth with a linear envelope.
* The first valid observation establishes a historical baseline.
*
* Persisted state contains only member ids, counters, and timestamps.
* @module @kasidia/dsh-games/anticheat
*/
const DEFAULT_ANTI_CHEAT_POLICY = {
	burstTokens: 5e5,
	tokensPerMinute: 1e6,
	strikeLimit: 3,
	strikeWindowMs: 6e5,
	lockMs: 6e4,
	retentionMs: 2592e6,
	maxEntries: 1e4
};
function positiveInt$1(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback;
}
function normalizeAntiCheatPolicy(raw) {
	const record = typeof raw === "object" && raw !== null ? raw : {};
	return {
		burstTokens: positiveInt$1(record.burstTokens, DEFAULT_ANTI_CHEAT_POLICY.burstTokens),
		tokensPerMinute: positiveInt$1(record.tokensPerMinute, DEFAULT_ANTI_CHEAT_POLICY.tokensPerMinute),
		strikeLimit: positiveInt$1(record.strikeLimit, DEFAULT_ANTI_CHEAT_POLICY.strikeLimit),
		strikeWindowMs: positiveInt$1(record.strikeWindowMs, DEFAULT_ANTI_CHEAT_POLICY.strikeWindowMs),
		lockMs: positiveInt$1(record.lockMs, DEFAULT_ANTI_CHEAT_POLICY.lockMs),
		retentionMs: positiveInt$1(record.retentionMs, DEFAULT_ANTI_CHEAT_POLICY.retentionMs),
		maxEntries: positiveInt$1(record.maxEntries, DEFAULT_ANTI_CHEAT_POLICY.maxEntries)
	};
}
function tokenTotal(raw) {
	return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : void 0;
}
function reportedCrowns(raw, expectedLength) {
	if (!Array.isArray(raw) || raw.length !== expectedLength) return void 0;
	const crowns = [];
	for (const value of raw) {
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return void 0;
		crowns.push(value);
	}
	return crowns;
}
function crownsEqual(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
function validEntry(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const record = raw;
	const anchorTokens = tokenTotal(record.anchorTokens);
	const lastTokens = tokenTotal(record.lastTokens);
	const anchorAt = tokenTotal(record.anchorAt);
	const lastSeenAt = tokenTotal(record.lastSeenAt);
	const strikeCount = tokenTotal(record.strikeCount);
	const strikeWindowStartedAt = tokenTotal(record.strikeWindowStartedAt);
	const lockedUntil = tokenTotal(record.lockedUntil);
	if (anchorTokens === void 0 || lastTokens === void 0 || anchorAt === void 0 || lastSeenAt === void 0 || strikeCount === void 0 || strikeWindowStartedAt === void 0 || lockedUntil === void 0) return void 0;
	return {
		anchorTokens,
		anchorAt,
		lastTokens,
		lastSeenAt,
		strikeCount,
		strikeWindowStartedAt,
		lockedUntil,
		...typeof record.lastRejectedSignature === "string" ? { lastRejectedSignature: record.lastRejectedSignature.slice(0, 256) } : {}
	};
}
var AntiCheatGuard = class {
	rules;
	policy;
	stateFile;
	entries = /* @__PURE__ */ new Map();
	dirty = false;
	constructor(options) {
		const rules = options.rules;
		this.rules = typeof rules === "function" ? rules : () => rules;
		this.policy = {
			...DEFAULT_ANTI_CHEAT_POLICY,
			...normalizeAntiCheatPolicy(options.policy)
		};
		this.stateFile = options.stateFile;
		this.load();
	}
	validate(report, now = Date.now()) {
		const tokens = tokenTotal(report.tokens);
		if (tokens === void 0) return {
			ok: false,
			error: "invalid"
		};
		const rules = this.rules();
		const expected = crownCounts(crownUnits(tokens, rules.tokenStep), rules.base);
		const crowns = reportedCrowns(report.crowns, expected.length);
		const entry = this.entries.get(report.memberId);
		if (entry !== void 0 && entry.lockedUntil > now) return {
			ok: false,
			error: "anti-cheat-locked"
		};
		if (entry !== void 0 && entry.lockedUntil !== 0 && entry.lockedUntil <= now) {
			entry.lockedUntil = 0;
			entry.strikeCount = 0;
			entry.strikeWindowStartedAt = now;
			entry.lastRejectedSignature = void 0;
			this.dirty = true;
		}
		if (crowns === void 0 || !crownsEqual(crowns, expected)) return entry === void 0 ? {
			ok: false,
			error: "crowns-mismatch"
		} : this.reject(entry, "crowns-mismatch", `${tokens}:${JSON.stringify(report.crowns)}`, now);
		if (entry === void 0) {
			this.entries.set(report.memberId, {
				anchorTokens: tokens,
				anchorAt: now,
				lastTokens: tokens,
				lastSeenAt: now,
				strikeCount: 0,
				strikeWindowStartedAt: now,
				lockedUntil: 0
			});
			this.dirty = true;
			this.enforceEntryCap();
			this.flush();
			return {
				ok: true,
				tokens,
				crowns: expected
			};
		}
		if (tokens < entry.lastTokens) return this.reject(entry, "token-regression", String(tokens), now);
		const elapsedMs = Math.max(0, now - entry.anchorAt);
		const timedAllowance = Math.floor(elapsedMs * this.policy.tokensPerMinute / 6e4);
		if (tokens > Math.min(Number.MAX_SAFE_INTEGER, entry.anchorTokens + this.policy.burstTokens + timedAllowance)) return this.reject(entry, "token-jump", String(tokens), now);
		entry.lastTokens = tokens;
		entry.lastSeenAt = now;
		entry.lastRejectedSignature = void 0;
		this.dirty = true;
		return {
			ok: true,
			tokens,
			crowns: expected
		};
	}
	sweep(now = Date.now()) {
		for (const [memberId, entry] of this.entries) if (now - entry.lastSeenAt > this.policy.retentionMs) {
			this.entries.delete(memberId);
			this.dirty = true;
		}
		this.enforceEntryCap();
		this.flush();
	}
	close() {
		this.flush();
	}
	reject(entry, error, detail, now) {
		entry.lastSeenAt = now;
		const signature = `${error}:${detail}`;
		if (entry.lastRejectedSignature !== signature) {
			if (now - entry.strikeWindowStartedAt > this.policy.strikeWindowMs) {
				entry.strikeCount = 0;
				entry.strikeWindowStartedAt = now;
			}
			entry.strikeCount += 1;
			entry.lastRejectedSignature = signature;
		}
		if (entry.strikeCount >= this.policy.strikeLimit) {
			entry.lockedUntil = now + this.policy.lockMs;
			this.dirty = true;
			this.flush();
			return {
				ok: false,
				error: "anti-cheat-locked"
			};
		}
		this.dirty = true;
		return {
			ok: false,
			error
		};
	}
	enforceEntryCap() {
		const overflow = this.entries.size - this.policy.maxEntries;
		if (overflow <= 0) return;
		const oldest = [...this.entries.entries()].sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt).slice(0, overflow);
		for (const [memberId] of oldest) this.entries.delete(memberId);
		this.dirty = true;
	}
	load() {
		if (this.stateFile === void 0 || !existsSync(this.stateFile)) return;
		try {
			const parsed = JSON.parse(readFileSync(this.stateFile, "utf8"));
			if (parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) return;
			for (const [memberId, raw] of Object.entries(parsed.entries)) {
				if (!/^[A-Za-z0-9-]{8,64}$/.test(memberId)) continue;
				const entry = validEntry(raw);
				if (entry !== void 0) this.entries.set(memberId, entry);
			}
			this.enforceEntryCap();
		} catch {}
	}
	flush() {
		if (!this.dirty || this.stateFile === void 0) return;
		mkdirSync(dirname(this.stateFile), { recursive: true });
		const tempFile = `${this.stateFile}.${process.pid}.tmp`;
		const entries = Object.fromEntries(this.entries);
		try {
			writeFileSync(tempFile, `${JSON.stringify({
				version: 1,
				updatedAt: Date.now(),
				entries
			}, null, 2)}\n`, "utf8");
			renameSync(tempFile, this.stateFile);
			this.dirty = false;
		} catch (error) {
			console.warn("[dsh-games] failed to persist anti-cheat state:", error);
		} finally {
			rmSync(tempFile, { force: true });
		}
	}
};
//#endregion
//#region src/gameconfig.ts
/**
* Game server configuration — the deployable server reads its rules from
* `<dataDir>/config.json` (the Docker volume mount, editable without a
* rebuild). The DSH host's in-process mount uses the same defaults so both
* deployments behave identically; clients fetch the live rules through
* `GET /api/games/rules`.
*
* ```json
* {
*   "authToken": "…",                 // required on the deployed server:
*                                     // JSON/mutation APIs use Bearer auth
*   "crown": {
*     "tokenStep": 1000000,           // tokens per bronze crown (1M)
*     "base": 3,                      // 3 crowns of a level = 1 of the next
*     "levels": ["bronze", "silver", "gold", "platinum", "amethyst",
*                "magic-bronze", "magic-silver", "magic-gold",
*                "magic-platinum", "magic-amethyst"]
*   },
*   "pet": {
*     "maxBytes": 2097152,            // upload size cap (2MB)
*     "maxDimension": 1024            // longest edge cap (px)
*   },
*   "antiCheat": {
*     "burstTokens": 500000,
*     "tokensPerMinute": 1000000,
*     "strikeLimit": 3,
*     "strikeWindowMs": 600000,
*     "lockMs": 60000
*   }
* }
* ```
* @module @kasidia/dsh-games/gameconfig
*/
/** Clamp a finite positive integer (non-finite -> fallback). */
function positiveInt(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback;
}
/** Tolerant reader: missing/corrupt files fall back to defaults. */
function loadGameServerConfig(dataDir) {
	const rules = defaultGameRules();
	try {
		const raw = readFileSync(join(dataDir, "config.json"), "utf8");
		const parsed = JSON.parse(raw);
		const crown = parsed.crown ?? {};
		const pet = parsed.pet ?? {};
		const levels = Array.isArray(crown.levels) ? crown.levels.filter((id) => typeof id === "string") : rules.crown.levels;
		return {
			...typeof parsed.authToken === "string" && parsed.authToken !== "" ? { authToken: parsed.authToken } : {},
			crown: {
				tokenStep: positiveInt(crown.tokenStep, rules.crown.tokenStep),
				base: positiveInt(crown.base, rules.crown.base),
				levels: levels.length > 0 ? levels : rules.crown.levels
			},
			pet: {
				maxBytes: positiveInt(pet.maxBytes, rules.pet.maxBytes),
				maxDimension: positiveInt(pet.maxDimension, rules.pet.maxDimension)
			},
			antiCheat: normalizeAntiCheatPolicy(parsed.antiCheat)
		};
	} catch {
		return {
			...rules,
			antiCheat: normalizeAntiCheatPolicy(void 0)
		};
	}
}
//#endregion
//#region src/pets.ts
/**
* Pet store — file-backed custom pet images keyed by member id. The game
* server (standalone Docker deployment or the DSH host's in-process mount)
* owns these bytes; validation is strict: PNG/GIF magic bytes, decoded pixel
* dimensions, and a hard size cap. Files land in `<dir>/pets/<memberId>.<ext>`
* with atomic rename writes.
* @module @kasidia/dsh-games/pets
*/
/** Member ids the store accepts (uuid-shaped; keeps paths safe). */
function isMemberId(value) {
	return /^[A-Za-z0-9-]{8,64}$/.test(value);
}
/** Detect PNG/GIF from magic bytes and decode their pixel dimensions. */
function sniffImage(buffer) {
	if (buffer.length >= 24 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10) {
		const width = buffer.readUInt32BE(16);
		const height = buffer.readUInt32BE(20);
		if (width > 0 && height > 0) return {
			ext: "png",
			width,
			height
		};
		return;
	}
	if (buffer.length >= 10 && (buffer.toString("latin1", 0, 6) === "GIF87a" || buffer.toString("latin1", 0, 6) === "GIF89a")) {
		const width = buffer.readUInt16LE(6);
		const height = buffer.readUInt16LE(8);
		if (width > 0 && height > 0) return {
			ext: "gif",
			width,
			height
		};
		return;
	}
}
/** Validate an uploaded pet payload against the configured rules. */
function validatePet(buffer, rules) {
	if (buffer.length === 0) return {
		ok: false,
		error: "empty"
	};
	if (buffer.length > rules.maxBytes) return {
		ok: false,
		error: "too-large"
	};
	const sniffed = sniffImage(buffer);
	if (sniffed === void 0) return {
		ok: false,
		error: "invalid-format"
	};
	if (sniffed.width > rules.maxDimension || sniffed.height > rules.maxDimension) return {
		ok: false,
		error: "too-wide"
	};
	return {
		ok: true,
		meta: {
			ext: sniffed.ext,
			version: Date.now(),
			width: sniffed.width,
			height: sniffed.height
		}
	};
}
/**
* File-backed pet storage. All reads/writes go through this class so the
* host mount and the standalone game server share identical behavior.
*/
var PetStore = class {
	dir;
	constructor(dir) {
		this.dir = dir;
	}
	pathFor(memberId, ext) {
		return join(this.dir, `${memberId}.${ext}`);
	}
	/** Save a validated pet image; returns its meta (or the validation error). */
	save(memberId, buffer, rules) {
		if (!isMemberId(memberId)) return {
			ok: false,
			error: "invalid-format"
		};
		const result = validatePet(buffer, rules);
		if (!result.ok) return result;
		mkdirSync(this.dir, { recursive: true });
		const target = this.pathFor(memberId, result.meta.ext);
		const tmp = `${target}.tmp`;
		try {
			writeFileSync(tmp, buffer);
			renameSync(tmp, target);
		} catch {
			try {
				unlinkSync(tmp);
			} catch {}
			return {
				ok: false,
				error: "invalid-format"
			};
		}
		const stale = this.pathFor(memberId, result.meta.ext === "png" ? "gif" : "png");
		try {
			unlinkSync(stale);
		} catch {}
		return {
			ok: true,
			meta: result.meta
		};
	}
	/** The stored pet payload, or undefined when the member has none. */
	get(memberId) {
		if (!isMemberId(memberId)) return void 0;
		for (const ext of ["png", "gif"]) try {
			const buffer = readFileSync(this.pathFor(memberId, ext));
			const sniffed = sniffImage(buffer);
			if (sniffed === void 0 || sniffed.ext !== ext) continue;
			return {
				meta: {
					ext,
					version: 0,
					width: sniffed.width,
					height: sniffed.height
				},
				buffer
			};
		} catch {}
	}
	/** Remove a member's pet; true when a file was removed. */
	remove(memberId) {
		if (!isMemberId(memberId)) return false;
		let removed = false;
		for (const ext of ["png", "gif"]) try {
			unlinkSync(this.pathFor(memberId, ext));
			removed = true;
		} catch {}
		return removed;
	}
};
//#endregion
//#region src/server-entry.ts
/**
* Standalone dsh-games server — the deployable game server the clients talk
* to. Serves exactly the shared game-server surface (rooms + custom pets +
* rules) with zero framework dependencies; the DSH host process is NOT
* involved. Data lives under $GAME_DATA (volume-mount /data):
*
*   $GAME_DATA/config.json  rules + auth token (see gameconfig.ts)
*   $GAME_DATA/pets/        uploaded pet images
*   $GAME_DATA/anticheat.json  token baselines + anomaly counters
*
*   GAME_HOST   bind host (default 0.0.0.0)
*   GAME_PORT   listen port (default 3080)
*   GAME_DATA   data dir (default ~/.dsh-games)
*
* Deploy: `docker compose up -d --build` (see Dockerfile) or
* `node lib/server.js` on any node >= 22 host.
* @module @kasidia/dsh-games/server
*/
const host = process.env.GAME_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.GAME_PORT ?? "3080", 10);
const dataDir = process.env.GAME_DATA ?? join(homedir(), ".dsh-games");
const config = loadGameServerConfig(dataDir);
const rooms = new RoomStore({ antiCheat: new AntiCheatGuard({
	rules: config.crown,
	policy: config.antiCheat,
	stateFile: join(dataDir, "anticheat.json")
}) });
const pets = new PetStore(join(dataDir, "pets"));
const server = createServer((req, res) => {
	const result = handleGameServer(req, res, {
		rooms,
		pets,
		rules: {
			crown: config.crown,
			pet: config.pet
		},
		...config.authToken !== void 0 ? { authToken: config.authToken } : {}
	});
	if (result instanceof Promise) result.catch((error) => {
		if (!res.writableEnded) {
			res.writeHead(500, { "content-type": "application/json" });
			res.end(JSON.stringify({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			}));
		}
	});
});
const sweepTimer = setInterval(() => rooms.sweep(), 1e4);
sweepTimer.unref?.();
let stopping = false;
function shutdown(signal) {
	if (stopping) return;
	stopping = true;
	clearInterval(sweepTimer);
	rooms.close();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 5e3).unref();
	console.log(`[dsh-games-server] stopping on ${signal}`);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
server.listen(port, host, () => {
	console.log(`[dsh-games-server] listening on http://${host}:${port} (data: ${dataDir})`);
	console.log(`[dsh-games-server] crown: ${config.crown.tokenStep} tokens/crown, base ${config.crown.base}, ${config.crown.levels.length} levels`);
	console.log(`[dsh-games-server] pet: max ${config.pet.maxBytes} bytes, ${config.pet.maxDimension}px`);
	console.log(`[dsh-games-server] anti-cheat: ${config.antiCheat.burstTokens} burst, ${config.antiCheat.tokensPerMinute}/min, ${config.antiCheat.strikeLimit} strikes`);
	console.log(config.authToken !== void 0 ? "[dsh-games-server] auth: ENABLED — protected requests require Authorization: Bearer" : "[dsh-games-server] auth: DISABLED — set authToken in config.json to lock the server");
});
//#endregion
export {};
