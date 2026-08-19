window.__ModuleLoader__.load({
	id: "@kasidia/dsh-games",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/api.ts
		/** Normalize a game-server base URL (strip trailing slashes). */
		function normalizeServerUrl(raw) {
			const trimmed = raw.trim().replace(/\/+$/, "");
			return trimmed === "" ? trimmed : trimmed;
		}
		/** Normalize a room code (trim + uppercase). */
		function normalizeRoomCode(raw) {
			return raw.trim().toUpperCase();
		}
		/** Add the shared game-server Bearer without disturbing caller headers. */
		function serverAuth(authToken, init = {}) {
			if (authToken === "") return init;
			const headers = new Headers(init.headers);
			headers.set("authorization", `Bearer ${authToken}`);
			return {
				...init,
				headers
			};
		}
		/** Structured HTTP failure from the game server. */
		var GameServerError = class extends Error {
			status;
			code;
			constructor(status, code, detail = "") {
				super(`HTTP ${status}${code === void 0 ? detail === "" ? "" : `: ${detail}` : `: ${code}`}`);
				this.name = "GameServerError";
				this.status = status;
				this.code = code;
			}
		};
		async function responseError(response) {
			const text = await response.text().catch(() => "");
			let code;
			if (text !== "") try {
				const parsed = JSON.parse(text);
				if (typeof parsed.error === "string" && parsed.error !== "") code = parsed.error;
			} catch {}
			return new GameServerError(response.status, code, text.slice(0, 120));
		}
		/** Bound every room/server request so one stalled fetch cannot freeze polling forever. */
		const REQUEST_TIMEOUT_MS = 1e4;
		async function request(url, init) {
			const controller = new AbortController();
			const sourceSignal = init?.signal;
			const forwardAbort = () => {
				controller.abort(sourceSignal?.reason);
			};
			if (sourceSignal?.aborted === true) forwardAbort();
			else sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
			const timeout = setTimeout(() => {
				controller.abort(new DOMException("Request timed out", "TimeoutError"));
			}, REQUEST_TIMEOUT_MS);
			try {
				const response = await fetch(url, {
					...init,
					signal: controller.signal
				});
				if (!response.ok) throw await responseError(response);
				return await response.json();
			} finally {
				clearTimeout(timeout);
				sourceSignal?.removeEventListener("abort", forwardAbort);
			}
		}
		function jsonInit(body, headers = {}, signal) {
			return {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...headers
				},
				body: JSON.stringify(body),
				...signal === void 0 ? {} : { signal }
			};
		}
		function memberHeaders(memberToken) {
			return { "x-dsh-member-token": memberToken };
		}
		/** The browser-facing host API (same-origin personal state). */
		const gamesApi = {
			state() {
				return request("/api/games/state");
			},
			setNickname(name) {
				return request("/api/games/nickname", jsonInit({ name }));
			},
			boost(tokens) {
				return request("/api/games/boost", jsonInit({ tokens }));
			},
			setDisplay(patch) {
				return request("/api/games/display", jsonInit(patch));
			},
			config(patch) {
				return request("/api/games/config", jsonInit(patch));
			},
			setPetMeta(pet) {
				return request("/api/games/pet-meta", jsonInit({ pet }));
			},
			clearPetMeta() {
				return request("/api/games/pet-meta", { method: "DELETE" });
			}
		};
		/** The absolute base URL a member's pet image is served from. */
		function petBaseUrl(serverUrl) {
			const normalized = normalizeServerUrl(serverUrl);
			return normalized === "" ? window.location.origin : normalized;
		}
		/** Absolute URL of the user's custom pet image on the game server. */
		function petImageUrl(serverUrl, memberId, pet, authToken) {
			const query = authToken === "" ? `?v=${pet.version}` : `?v=${pet.version}&token=${encodeURIComponent(authToken)}`;
			return `${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}${query}`;
		}
		/** Cross-origin game-server endpoints (rules + rooms + pets on the shared server). */
		const gameServerApi = {
			/** Absolute base for one game server ('' = the host's in-process mount). */
			base(serverUrl) {
				return petBaseUrl(serverUrl);
			},
			rules(serverUrl, authToken) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rules`, serverAuth(authToken));
			},
			listRooms(serverUrl, authToken) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms`, serverAuth(authToken));
			},
			createRoom(serverUrl, authToken, options) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms`, serverAuth(authToken, jsonInit(options)));
			},
			state(serverUrl, authToken, code) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/state`, serverAuth(authToken));
			},
			join(serverUrl, authToken, code, member) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/join`, serverAuth(authToken, jsonInit({ member })));
			},
			heartbeat(serverUrl, authToken, code, memberToken, member, signal) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members`, serverAuth(authToken, jsonInit({ member }, memberHeaders(memberToken), signal)));
			},
			leave(serverUrl, authToken, code, memberId, memberToken) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}`, serverAuth(authToken, {
					method: "DELETE",
					headers: memberHeaders(memberToken)
				}));
			},
			sendMessage(serverUrl, authToken, code, memberToken, message) {
				return request(`${petBaseUrl(serverUrl)}/api/games/rooms/${encodeURIComponent(code)}/messages`, serverAuth(authToken, jsonInit({ message }, memberHeaders(memberToken))));
			},
			async uploadPet(serverUrl, authToken, memberId, file) {
				const response = await fetch(`${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}`, serverAuth(authToken, {
					method: "POST",
					headers: { "content-type": file.type || "application/octet-stream" },
					body: file
				}));
				if (!response.ok) throw await responseError(response);
				return await response.json();
			},
			removePet(serverUrl, authToken, memberId) {
				return request(`${petBaseUrl(serverUrl)}/api/games/pets/${encodeURIComponent(memberId)}`, serverAuth(authToken, { method: "DELETE" }));
			}
		};
		/** localStorage seat for the authenticated room session (survives reloads). */
		const ROOM_STORAGE_KEY = "dsh.games.room.v3";
		const LEGACY_ROOM_STORAGE_KEYS = ["dsh.games.room.v1", "dsh.games.room.v2"];
		function clearLegacyRoomStorage() {
			for (const key of LEGACY_ROOM_STORAGE_KEYS) localStorage.removeItem(key);
		}
		function loadStoredRoom() {
			try {
				const raw = localStorage.getItem(ROOM_STORAGE_KEY);
				clearLegacyRoomStorage();
				if (raw === null) return void 0;
				const parsed = JSON.parse(raw);
				if (typeof parsed.base !== "string" || typeof parsed.code !== "string" || typeof parsed.memberToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.memberToken)) {
					localStorage.removeItem(ROOM_STORAGE_KEY);
					return;
				}
				return {
					base: parsed.base,
					code: normalizeRoomCode(parsed.code),
					memberToken: parsed.memberToken
				};
			} catch {
				try {
					localStorage.removeItem(ROOM_STORAGE_KEY);
					clearLegacyRoomStorage();
				} catch {}
				return;
			}
		}
		function storeRoom(base, code, memberToken) {
			try {
				localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({
					base: normalizeServerUrl(base),
					code: normalizeRoomCode(code),
					memberToken
				}));
				clearLegacyRoomStorage();
			} catch {}
		}
		function clearStoredRoom() {
			try {
				localStorage.removeItem(ROOM_STORAGE_KEY);
				clearLegacyRoomStorage();
			} catch {}
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* dsh-games locale dictionaries (zh/en).
		* @module @kasidia/dsh-games/client/locales
		*/
		/** Dictionary namespace this package registers. */
		const NS = "games";
		/** Chinese copy. */
		const zh = {
			"pet.hats": "{n} 顶帽子",
			"pet.crowns": "{n} 顶王冠",
			"pet.tokens": "{n} tokens",
			"pet.tokenGain": "+{n}",
			"pet.phase.idle": "悠闲地游泳中",
			"pet.phase.waiting": "等待任务…",
			"pet.phase.thinking": "正在思考…",
			"pet.phase.tool": "在工具箱里翻找…",
			"pet.phase.done": "完成啦！",
			"pet.crown.gained": "获得{name}！",
			"pet.crown.crafted": "合成{name}！",
			"crown.bronze": "青铜王冠",
			"crown.silver": "白银王冠",
			"crown.gold": "黄金王冠",
			"crown.platinum": "铂金王冠",
			"crown.amethyst": "紫水晶王冠",
			"crown.magic-bronze": "魔法青铜王冠",
			"crown.magic-silver": "魔法白银王冠",
			"crown.magic-gold": "魔法黄金王冠",
			"crown.magic-platinum": "魔法铂金王冠",
			"crown.magic-amethyst": "魔法紫水晶王冠",
			"petVariant.default": "深海蓝",
			"petVariant.crimson": "绯红",
			"petVariant.emerald": "翡翠",
			"petVariant.gold": "鎏金",
			"petVariant.violet": "紫罗兰",
			"petVariant.ocean": "海洋青",
			"petVariant.custom": "自定义",
			"menu.customFrom": "起始色",
			"menu.customTo": "结束色",
			"chat.hint": "点击聊天",
			"chat.cooldown": "稍等片刻…",
			"chat.placeholder": "输入消息…",
			"chat.send": "发送",
			"chat.close": "关闭聊天输入框",
			"chat.noRoom": "请先加入房间再聊天",
			"menu.title": "深海小屋",
			"menu.close": "关闭面板",
			"menu.profile": "我的宠物",
			"menu.appearance": "外观装扮",
			"menu.nickname": "我的昵称",
			"menu.nicknamePlaceholder": "输入昵称",
			"menu.save": "保存",
			"menu.saved": "已保存",
			"menu.size": "宠物大小",
			"menu.resetPosition": "复位位置",
			"menu.lockPosition": "锁定位置",
			"menu.unlockPosition": "解锁位置",
			"menu.petPattern": "宠物图案",
			"menu.uploadPet": "自定义宠物",
			"menu.chooseFile": "选择图片",
			"menu.uploading": "上传中…",
			"menu.uploaded": "已上传，房间内自动同步",
			"menu.removed": "已移除自定义宠物",
			"menu.removePet": "移除",
			"menu.uploadHint": "支持 PNG / GIF，≤ 2MB，最长边 ≤ 1024px",
			"menu.uploadHintRules": "支持 PNG / GIF，≤ {maxBytes}MB，最长边 ≤ {maxDimension}px（服务器规则）",
			"menu.uploadTypeError": "仅支持 PNG 或 GIF 图片",
			"menu.uploadSizeError": "图片超过 2MB 或尺寸限制",
			"menu.uploadError": "上传失败：{error}",
			"menu.error": "出错了：{error}",
			"room.title": "多人房间",
			"room.create": "创建房间",
			"room.join": "加入房间",
			"room.joinByCode": "用代码加入",
			"room.leave": "离开房间",
			"room.code": "房间代码",
			"room.url": "游戏服务器地址",
			"room.codePlaceholder": "如 K7D2",
			"room.urlPlaceholder": "如 http://127.0.0.1:3080",
			"room.namePlaceholder": "房间名称（可选）",
			"room.public": "公开房间",
			"room.inviteOnly": "邀请制",
			"room.publicHint": "公开房间会出现在房间列表，任何人都能加入",
			"room.inviteHint": "邀请制房间不在列表显示，只有知道代码的人能加入",
			"room.list": "公开房间",
			"room.listEmpty": "暂时没有公开房间，创建一个吧",
			"room.listError": "游戏服务器连不上",
			"room.refresh": "刷新",
			"room.people": "人",
			"room.joined": "已加入房间 {code}",
			"room.created": "房间已创建",
			"room.autoJoined": "已自动回到之前的房间",
			"room.expired": "原房间已失效，请重新加入或创建房间",
			"room.copy": "复制",
			"room.copied": "已复制",
			"room.empty": "房间里还没有其他玩家，把地址和代码发给朋友吧",
			"room.shareHint": "把游戏服务器地址和代码发给朋友，他们加入后就能看到彼此的宠物",
			"room.members": "房间成员 ({n})",
			"room.you": "我",
			"room.joinError": "加入失败：{error}",
			"room.connecting": "连接中…",
			"room.offline": "房间暂时连不上",
			"room.antiCheatCrowns": "王冠数据与 Token 不一致，请刷新规则后重试",
			"room.antiCheatJump": "Token 增长异常，服务器已拒绝本次同步",
			"room.antiCheatRegression": "Token 总量不能减少，请检查本地数据",
			"room.antiCheatLocked": "检测到多次异常上报，账号已被暂时限制",
			"scene.title": "成员排列",
			"scene.mode.free": "自由",
			"scene.mode.row": "水平对齐",
			"scene.mode.column": "垂直对齐",
			"scene.mode.grid": "网格排列",
			"scene.mode.orbit": "环绕排列",
			"scene.sort": "Token 排序",
			"scene.sort.tokens-desc": "高到低",
			"scene.sort.tokens-asc": "低到高",
			"scene.sort.joined": "加入顺序",
			"scene.spacing": "间距",
			"scene.gridColumns": "列数",
			"scene.gridRows": "行数",
			"scene.collisionRejected": "当前空间不足，已保留原设置以避免宠物重叠",
			"scene.showLabels": "始终显示所有玩家信息",
			"scene.reset": "重置位置",
			"scene.hint": "房间成员会围绕你的宠物排列；自由模式下可直接拖动成员宠物",
			"settings.title": "深海小屋",
			"settings.description": "消耗tokens积攒王冠，做token之王",
			"settings.enabled": "启用插件",
			"settings.enabledHint": "关闭后宠物隐藏并停止计数与轮询。",
			"settings.nickname": "昵称",
			"settings.nicknameHint": "房间内外展示的名字，1–24 个字符。",
			"settings.petVariant": "宠物图案",
			"settings.petVariantHint": "内置宠物配色方案；也可在宠物面板上传自定义 PNG/GIF。",
			"settings.hidePet": "隐藏宠物",
			"settings.hidePetHint": "隐藏后宠物不再显示，可在此设置中重新开启。",
			"settings.serverUrl": "游戏服务器地址",
			"settings.serverUrlHint": "多人房间与宠物同步的服务器；留空表示使用本机（同源）。",
			"settings.authToken": "服务器密钥",
			"settings.authTokenHint": "游戏服务器配置的 authToken；留空表示服务器不鉴权。",
			"settings.rulesSummary": "当前规则（服务器配置）：每 {step} token 一顶青铜王冠，{base} 合 1 升级，共 {levels} 级；宠物图 ≤ {maxBytes}MB、最长边 ≤ {maxDimension}px。",
			"settings.save": "保存",
			"settings.discard": "放弃",
			"settings.saved": "已保存",
			"settings.inherit": "继承默认",
			"settings.invalidNumber": "请输入数字，留空则使用默认值。",
			"settings.readonly": "当前部署的设置只读。",
			"settings.notExposed": "当前 DSH 版本未向设置页暴露本插件的配置命名空间。",
			"settings.unsaved": "有未保存的修改"
		};
		/** English copy. */
		const en = {
			"pet.hats": "{n} hat(s)",
			"pet.crowns": "{n} crown(s)",
			"pet.tokens": "{n} tokens",
			"pet.tokenGain": "+{n}",
			"pet.phase.idle": "swimming along",
			"pet.phase.waiting": "waiting for tasks…",
			"pet.phase.thinking": "thinking hard…",
			"pet.phase.tool": "digging through the toolbox…",
			"pet.phase.done": "all done!",
			"pet.crown.gained": "{name} earned!",
			"pet.crown.crafted": "{name} crafted!",
			"crown.bronze": "Bronze Crown",
			"crown.silver": "Silver Crown",
			"crown.gold": "Gold Crown",
			"crown.platinum": "Platinum Crown",
			"crown.amethyst": "Amethyst Crown",
			"crown.magic-bronze": "Magic Bronze Crown",
			"crown.magic-silver": "Magic Silver Crown",
			"crown.magic-gold": "Magic Gold Crown",
			"crown.magic-platinum": "Magic Platinum Crown",
			"crown.magic-amethyst": "Magic Amethyst Crown",
			"petVariant.default": "Deep Sea Blue",
			"petVariant.crimson": "Crimson",
			"petVariant.emerald": "Emerald",
			"petVariant.gold": "Gold",
			"petVariant.violet": "Violet",
			"petVariant.ocean": "Ocean",
			"petVariant.custom": "Custom",
			"menu.customFrom": "From",
			"menu.customTo": "To",
			"chat.hint": "Click to chat",
			"chat.cooldown": "One moment…",
			"chat.placeholder": "Type a message…",
			"chat.send": "Send",
			"chat.close": "Close chat composer",
			"chat.noRoom": "Join a room to chat",
			"menu.title": "Deep Sea Hut",
			"menu.close": "Close panel",
			"menu.profile": "My pet",
			"menu.appearance": "Appearance",
			"menu.nickname": "My nickname",
			"menu.nicknamePlaceholder": "Enter a nickname",
			"menu.save": "Save",
			"menu.saved": "Saved",
			"menu.size": "Pet size",
			"menu.resetPosition": "Reset position",
			"menu.lockPosition": "Lock position",
			"menu.unlockPosition": "Unlock position",
			"menu.petPattern": "Pet pattern",
			"menu.uploadPet": "Custom pet",
			"menu.chooseFile": "Choose image",
			"menu.uploading": "Uploading…",
			"menu.uploaded": "Uploaded — synced into rooms",
			"menu.removed": "Custom pet removed",
			"menu.removePet": "Remove",
			"menu.uploadHint": "PNG / GIF only, ≤ 2MB, longest side ≤ 1024px",
			"menu.uploadHintRules": "PNG / GIF only, ≤ {maxBytes}MB, longest side ≤ {maxDimension}px (server rules)",
			"menu.uploadTypeError": "Only PNG or GIF images are supported",
			"menu.uploadSizeError": "Image exceeds 2MB or the dimension limit",
			"menu.uploadError": "Upload failed: {error}",
			"menu.error": "Something went wrong: {error}",
			"room.title": "Multiplayer room",
			"room.create": "Create room",
			"room.join": "Join room",
			"room.joinByCode": "Join by code",
			"room.leave": "Leave room",
			"room.code": "Room code",
			"room.url": "Game server address",
			"room.codePlaceholder": "e.g. K7D2",
			"room.urlPlaceholder": "e.g. http://127.0.0.1:3080",
			"room.namePlaceholder": "Room name (optional)",
			"room.public": "Public",
			"room.inviteOnly": "Invite-only",
			"room.publicHint": "Public rooms appear in the room list; anyone can join",
			"room.inviteHint": "Invite-only rooms stay hidden; only players with the code can join",
			"room.list": "Public rooms",
			"room.listEmpty": "No public rooms yet — create one",
			"room.listError": "Game server unreachable",
			"room.refresh": "Refresh",
			"room.people": "people",
			"room.joined": "Joined room {code}",
			"room.created": "Room created",
			"room.autoJoined": "Auto-joined your previous room",
			"room.expired": "The previous room expired. Join or create a room again.",
			"room.copy": "Copy",
			"room.copied": "Copied",
			"room.empty": "No other players here yet — share the address and code with friends",
			"room.shareHint": "Send the game server address and code to friends; once they join, you can see each other’s pets",
			"room.members": "Room members ({n})",
			"room.you": "me",
			"room.joinError": "Failed to join: {error}",
			"room.connecting": "Connecting…",
			"room.offline": "Room unreachable right now",
			"room.antiCheatCrowns": "Crown data does not match the token total. Refresh the rules and retry.",
			"room.antiCheatJump": "Abnormal token growth was rejected by the server.",
			"room.antiCheatRegression": "The token total cannot decrease. Check the local data.",
			"room.antiCheatLocked": "Repeated abnormal reports triggered a temporary restriction.",
			"scene.title": "Pet arrangement",
			"scene.mode.free": "Free",
			"scene.mode.row": "Horizontal",
			"scene.mode.column": "Vertical",
			"scene.mode.grid": "Grid",
			"scene.mode.orbit": "Orbit",
			"scene.sort": "Token order",
			"scene.sort.tokens-desc": "High first",
			"scene.sort.tokens-asc": "Low first",
			"scene.sort.joined": "Join order",
			"scene.spacing": "Spacing",
			"scene.gridColumns": "Columns",
			"scene.gridRows": "Rows",
			"scene.collisionRejected": "Not enough room; the previous setting was kept to prevent overlap",
			"scene.showLabels": "Always show every player label",
			"scene.reset": "Reset positions",
			"scene.hint": "Room members arrange around your pet; in Free mode you can drag member pets",
			"settings.title": "Deep Sea Hut",
			"settings.description": "Consume tokens to stack crowns — become the token king.",
			"settings.enabled": "Enable plugin",
			"settings.enabledHint": "When off, the pet hides and counting and polling stop.",
			"settings.nickname": "Nickname",
			"settings.nicknameHint": "The name shown on the pet and in rooms, 1–24 characters.",
			"settings.petVariant": "Pet pattern",
			"settings.petVariantHint": "Built-in pet color patterns; you can also upload a custom PNG/GIF from the pet panel.",
			"settings.hidePet": "Hide pet",
			"settings.hidePetHint": "The pet stays hidden until you re-enable it here.",
			"settings.serverUrl": "Game server address",
			"settings.serverUrlHint": "The server for multiplayer rooms and pet sync; leave empty for local (same-origin).",
			"settings.authToken": "Server secret",
			"settings.authTokenHint": "The authToken configured on the game server; leave empty for an open server.",
			"settings.rulesSummary": "Server rules: {step} tokens per bronze crown, {base} craft into the next tier ({levels} tiers); pets ≤ {maxBytes}MB, longest side ≤ {maxDimension}px.",
			"settings.save": "Save",
			"settings.discard": "Discard",
			"settings.saved": "Saved",
			"settings.inherit": "Inherit",
			"settings.invalidNumber": "Enter a number, or leave blank to use the default.",
			"settings.readonly": "Settings are read-only in this deployment.",
			"settings.notExposed": "This DSH version does not expose this plugin’s settings namespace.",
			"settings.unsaved": "Unsaved changes"
		};
		/**
		* Active dictionary, picked by the document language at call time. The pet
		* mounts as a global floating surface (not a slot), so it resolves its copy
		* this tiny way; the settings card receives the framework-injected `t` seat.
		*/
		function dictionary() {
			return (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? en : zh;
		}
		/**
		* Translate a key with optional `{name}` template params. A missing key
		* degrades to the key itself rather than throwing.
		*/
		function t(key, params) {
			let text = dictionary()[key] ?? key;
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		/** Format a token count compactly (zh: 万/亿, other: K/M/B). */
		function formatTokens(n, lang) {
			const language = lang ?? (typeof document !== "undefined" ? document.documentElement.lang : "zh");
			if (n < 1e4) return String(Math.round(n));
			if (language.toLowerCase().startsWith("zh")) {
				if (n < 1e8) return `${trim1(n / 1e4)}万`;
				return `${trim2(n / 1e8)}亿`;
			}
			if (n < 1e6) return `${trim1(n / 1e3)}K`;
			if (n < 1e9) return `${trim2(n / 1e6)}M`;
			return `${trim2(n / 1e9)}B`;
		}
		function trim1(v) {
			const s = v.toFixed(1);
			return s.endsWith(".0") ? s.slice(0, -2) : s;
		}
		function trim2(v) {
			return v.toFixed(2).replace(/\.?0+$/, "");
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
		/** Safe accessor for one level. */
		function crownLevel(index) {
			return CROWN_LEVELS[Math.max(0, Math.min(CROWN_LEVEL_COUNT - 1, Math.floor(index)))];
		}
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
		//#region src/client/whale.tsx
		/**
		* dsh-games pet artwork — the official DeepSeek whale logo mark (the path is
		* the favicon.svg path shipped in @deepseek-ai/dsh-web-frontend, copied
		* verbatim for the demo pet), plus the token party hats. All inline SVG, no
		* external assets.
		* @module @kasidia/dsh-games/client/whale
		*/
		/** Official DeepSeek whale logo path (50x50 viewBox), from dsh-web-frontend favicon.svg. */
		const WHALE_PATH = "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z";
		/** Gradient id — must be unique per page; the pet can render multiple whales. */
		let gradientCounter = 0;
		function nextGradientId() {
			gradientCounter += 1;
			return `dsg-whale-${gradientCounter}`;
		}
		const PET_VARIANTS = [
			{
				id: "default",
				nameKey: "petVariant.default",
				from: "#6d8bff",
				to: "#4d6bfe"
			},
			{
				id: "crimson",
				nameKey: "petVariant.crimson",
				from: "#ff8a80",
				to: "#e53935"
			},
			{
				id: "emerald",
				nameKey: "petVariant.emerald",
				from: "#5eead4",
				to: "#0d9488"
			},
			{
				id: "gold",
				nameKey: "petVariant.gold",
				from: "#ffe082",
				to: "#f59e0b"
			},
			{
				id: "violet",
				nameKey: "petVariant.violet",
				from: "#c4b5fd",
				to: "#7c3aed"
			},
			{
				id: "ocean",
				nameKey: "petVariant.ocean",
				from: "#67e8f9",
				to: "#0284c7"
			}
		];
		/** Variant id prefix for user-defined gradient colors. */
		const CUSTOM_PREFIX = "custom:";
		/** True when a variant id is a user-defined color pair. */
		function isCustomVariant(id) {
			return typeof id === "string" && id.startsWith("custom:");
		}
		/** Normalize a hex color to lowercase #rrggbb (fallback when malformed). */
		function normalizeHexColor(raw, fallback) {
			const value = raw?.trim().toLowerCase() ?? "";
			return /^#[0-9a-f]{6}$/.test(value) ? value : fallback;
		}
		/** Build the persisted variant id for a custom gradient pair. */
		function customVariantId(from, to) {
			return `${CUSTOM_PREFIX}${normalizeHexColor(from, "#6d8bff")}:${normalizeHexColor(to, "#4d6bfe")}`;
		}
		/** Resolve a variant id (unknown ids fall back to the default pattern). */
		function petVariantOf(id) {
			if (isCustomVariant(id)) {
				const [from, to] = id.slice(7).split(":");
				return {
					id,
					nameKey: "petVariant.custom",
					from: normalizeHexColor(from, "#6d8bff"),
					to: normalizeHexColor(to, "#4d6bfe")
				};
			}
			return PET_VARIANTS.find((variant) => variant.id === id) ?? PET_VARIANTS[0];
		}
		/** The DeepSeek whale mark in the chosen pattern variant. Memoized: the pet
		* re-renders on every app state change (poll, popover edits), but the whale
		* only needs re-rendering when its size/variant actually change. */
		const DeepSeekWhale = (0, react.memo)(function DeepSeekWhale(props) {
			const id = nextGradientId();
			const variant = petVariantOf(props.variant);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				viewBox: "0 0 50 50",
				width: props.size,
				height: props.size,
				style: props.style,
				role: "img",
				"aria-label": props.title,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("linearGradient", {
					id,
					x1: "0",
					y1: "0",
					x2: "1",
					y2: "1",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
						offset: "0%",
						stopColor: variant.from
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
						offset: "100%",
						stopColor: variant.to
					})]
				}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: WHALE_PATH,
					fill: `url(#${id})`
				})]
			});
		});
		/** Party-hat color cycle. */
		const HAT_COLORS = [
			"#ff5a5f",
			"#ffb400",
			"#34c759",
			"#5ac8fa",
			"#af52de",
			"#ff2d55",
			"#ff9500",
			"#00c7be",
			"#ff375f",
			"#a2845e",
			"#64d2ff",
			"#bf5af2"
		];
		/** One party hat (cone + brim + pompom), drawn for a hat cell of `size` px. */
		function PartyHat(props) {
			const { color, size, style } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				viewBox: "0 0 40 40",
				width: size,
				height: size,
				style,
				"aria-hidden": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("linearGradient", {
						id: `hat-${color.slice(1)}`,
						x1: "0",
						y1: "0",
						x2: "0",
						y2: "1",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: color
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: shade(color, -18)
						})]
					}) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "20",
						cy: "5.5",
						r: "5",
						fill: shade(color, 26)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M20 5 C22 12 28 24 32.5 30.5 C26 33 14 33 7.5 30.5 C12 24 18 12 20 5 Z",
						fill: `url(#hat-${color.slice(1)})`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ellipse", {
						cx: "20",
						cy: "31",
						rx: "16.5",
						ry: "3.6",
						fill: shade(color, -28)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M9 29 C13 26.5 27 26.5 31 29 C27 31.5 13 31.5 9 29 Z",
						fill: shade(color, 14),
						opacity: "0.55"
					})
				]
			});
		}
		/** Darken/lighten a hex color by `delta` (-255..255). */
		function shade(hex, delta) {
			const value = hex.replace("#", "");
			const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
			const num = Number.parseInt(full, 16);
			if (Number.isNaN(num)) return hex;
			const r = clamp256((num >> 16 & 255) + delta);
			const g = clamp256((num >> 8 & 255) + delta);
			const b = clamp256((num & 255) + delta);
			return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
		}
		function clamp256(v) {
			return Math.min(255, Math.max(0, v));
		}
		//#endregion
		//#region src/client/crownAssets.ts
		/**
		* @generated by tools/gen-crown-assets.mjs — do not edit by hand.
		* Inline SVG artwork for the ten crown tiers, sourced from assets/crown_*.svg
		* (keys match the CROWN_LEVELS ids in src/crowns.ts).
		*/
		const CROWN_SVGS = {
			"bronze": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"bronze_base_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#3A1B12\"/>\n        <stop offset=\"0.18\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"0.36\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"0.52\" stop-color=\"#6B351D\"/>\n        <stop offset=\"0.70\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </linearGradient>\n      <linearGradient id=\"bronze_base_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"0.28\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"0.70\" stop-color=\"#6B351D\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </linearGradient>\n      <radialGradient id=\"bronze_base_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#E58A52\"/>\n        <stop offset=\"0.62\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </radialGradient>\n      <radialGradient id=\"bronze_base_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#E0A06C\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#B86A3F\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#B86A3F\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"bronze_base_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"bronze_base_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#bronze_base_shadow)\">\n        <path d=\"M132 320 L126 238 L172 246 L200 198 L228 218 L256 180 L284 218 L312 198 L340 246 L386 238 L380 320 Q320 308 256 312 Q192 308 132 320 Z\" fill=\"url(#bronze_base_metal)\" stroke=\"#3A1B12\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M162 294 C186 288 208 290 228 294 C240 298 272 298 284 294 C304 290 326 288 350 294\" fill=\"none\" stroke=\"#E0A06C\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M142 320 C178 324 216 328 256 328 C296 328 334 324 370 320 L366 348 H146 Z\" fill=\"url(#bronze_base_base)\" stroke=\"#3A1B12\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M164 334 C194 338 224 340 256 340 C288 340 318 338 348 334\" fill=\"none\" stroke=\"#E0A06C\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#E0A06C\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M184 252 Q198 234 210 220\" stroke-width=\"4\" />\n<path d=\"M328 252 Q314 234 302 220\" stroke-width=\"4\" />\n</g>\n<circle cx=\"126\" cy=\"238\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"200\" cy=\"198\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"256\" cy=\"180\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"312\" cy=\"198\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"386\" cy=\"238\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"172\" cy=\"246\" r=\"9\" fill=\"url(#bronze_base_gem)\" stroke=\"#3A1B12\" stroke-width=\"4.8\"/>\n<circle cx=\"340\" cy=\"246\" r=\"9\" fill=\"url(#bronze_base_gem)\" stroke=\"#3A1B12\" stroke-width=\"4.8\"/>\n<path d=\"M256 276 L276 296 L256 318 L236 296 Z\" fill=\"url(#bronze_base_gem)\" stroke=\"#3A1B12\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 284 L266 296 L256 308 L246 296 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n</svg>",
			"silver": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"silver_base_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#41464D\"/>\n        <stop offset=\"0.18\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"0.36\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"0.52\" stop-color=\"#70757C\"/>\n        <stop offset=\"0.70\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </linearGradient>\n      <linearGradient id=\"silver_base_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"0.28\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"0.70\" stop-color=\"#70757C\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </linearGradient>\n      <radialGradient id=\"silver_base_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#B7E3FF\"/>\n        <stop offset=\"0.62\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </radialGradient>\n      <radialGradient id=\"silver_base_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#F4F7FA\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#C7CED6\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#C7CED6\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"silver_base_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"silver_base_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#silver_base_shadow)\">\n        <path d=\"M122 320 L116 228 L162 236 L192 180 L220 210 L256 150 L292 210 L320 180 L350 236 L396 228 L390 320 Q324 306 256 310 Q188 306 122 320 Z\" fill=\"url(#silver_base_metal)\" stroke=\"#41464D\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M158 292 C184 282 208 286 228 294 C240 300 272 300 284 294 C304 286 328 282 354 292\" fill=\"none\" stroke=\"#F4F7FA\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M132 320 C170 326 212 332 256 332 C300 332 342 326 380 320 L374 350 H138 Z\" fill=\"url(#silver_base_base)\" stroke=\"#41464D\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M158 336 C190 342 222 344 256 344 C290 344 322 342 354 336\" fill=\"none\" stroke=\"#F4F7FA\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#F4F7FA\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M178 244 Q194 218 206 192\" stroke-width=\"4\" />\n<path d=\"M334 244 Q318 218 306 192\" stroke-width=\"4\" />\n<path d=\"M232 214 Q244 200 256 200 Q268 200 280 214\" stroke-width=\"4\" />\n</g>\n<circle cx=\"116\" cy=\"228\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"192\" cy=\"180\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"220\" cy=\"210\" r=\"6\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"256\" cy=\"150\" r=\"8\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"292\" cy=\"210\" r=\"6\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"320\" cy=\"180\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"396\" cy=\"228\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"162\" cy=\"236\" r=\"9\" fill=\"url(#silver_base_gem)\" stroke=\"#41464D\" stroke-width=\"4.8\"/>\n<circle cx=\"350\" cy=\"236\" r=\"9\" fill=\"url(#silver_base_gem)\" stroke=\"#41464D\" stroke-width=\"4.8\"/>\n<path d=\"M256 268 L280 296 L256 324 L232 296 Z\" fill=\"url(#silver_base_gem)\" stroke=\"#41464D\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 278 L268 296 L256 314 L244 296 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n</svg>",
			"gold": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"gold_base_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#5A3200\"/>\n        <stop offset=\"0.18\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"0.36\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"0.52\" stop-color=\"#9A5A00\"/>\n        <stop offset=\"0.70\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </linearGradient>\n      <linearGradient id=\"gold_base_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"0.28\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"0.70\" stop-color=\"#9A5A00\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </linearGradient>\n      <radialGradient id=\"gold_base_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#FFD45C\"/>\n        <stop offset=\"0.62\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </radialGradient>\n      <radialGradient id=\"gold_base_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#FFF1A6\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#F0B52C\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#F0B52C\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"gold_base_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"gold_base_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#gold_base_shadow)\">\n        <path d=\"M108 318 L100 218 L144 222 L176 166 L204 196 L228 146 L246 114 L256 96 L266 114 L284 146 L308 196 L336 166 L368 222 L412 218 L404 318 Q330 302 256 308 Q182 302 108 318 Z\" fill=\"url(#gold_base_metal)\" stroke=\"#5A3200\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M150 290 C178 278 206 284 230 294 C242 300 270 300 282 294 C306 284 334 278 362 290\" fill=\"none\" stroke=\"#FFF1A6\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M120 318 C162 326 208 332 256 332 C304 332 350 326 392 318 L384 350 H128 Z\" fill=\"url(#gold_base_base)\" stroke=\"#5A3200\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M148 336 C182 342 218 346 256 346 C294 346 330 342 364 336\" fill=\"none\" stroke=\"#FFF1A6\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#FFF1A6\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M160 226 Q182 192 200 158\" stroke-width=\"4\" />\n<path d=\"M352 226 Q330 192 312 158\" stroke-width=\"4\" />\n<path d=\"M228 146 L246 118 L256 132 L266 118 L284 146\" stroke-width=\"4\" />\n<path d=\"M204 196 Q228 182 256 182 Q284 182 308 196\" stroke-width=\"4\" />\n</g>\n<path d=\"M100 211 L107 218 L100 225 L93 218 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M176 159 L183 166 L176 173 L169 166 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M204 190 L210 196 L204 202 L198 196 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 87 L265 96 L256 105 L247 96 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M308 190 L314 196 L308 202 L302 196 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M336 159 L343 166 L336 173 L329 166 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M412 211 L419 218 L412 225 L405 218 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"144\" cy=\"222\" r=\"9\" fill=\"url(#gold_base_gem)\" stroke=\"#5A3200\" stroke-width=\"4.8\"/>\n<circle cx=\"368\" cy=\"222\" r=\"9\" fill=\"url(#gold_base_gem)\" stroke=\"#5A3200\" stroke-width=\"4.8\"/>\n<path d=\"M256 256 L286 290 L256 330 L226 290 Z\" fill=\"url(#gold_base_gem)\" stroke=\"#5A3200\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 270 L272 290 L256 312 L240 290 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n<g>\n    <g transform=\"translate(256 96)\" filter=\"url(#gold_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.0s\" begin=\"4.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.0s\" begin=\"4.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -52 C3.4 -22.9 3.4 -10.4 0 0\n               C-3.4 -10.4 -3.4 -22.9 0 -52\n               M34 0 C15.0 5.2 6.8 5.2 0 0\n               C6.8 -5.2 15.0 -5.2 34 0\n               M0 52 C-3.4 22.9 -3.4 10.4 0 0\n               C3.4 10.4 3.4 22.9 0 52\n               M-34 0 C-15.0 -5.2 -6.8 -5.2 0 0\n               C-6.8 5.2 -15.0 5.2 -34 0\"\n            fill=\"url(#gold_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"5.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 256)\" filter=\"url(#gold_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -66 C4.2 -29.0 4.2 -13.2 0 0\n               C-4.2 -13.2 -4.2 -29.0 0 -66\n               M42 0 C18.5 6.6 8.4 6.6 0 0\n               C8.4 -6.6 18.5 -6.6 42 0\n               M0 66 C-4.2 29.0 -4.2 13.2 0 0\n               C4.2 13.2 4.2 29.0 0 66\n               M-42 0 C-18.5 -6.6 -8.4 -6.6 0 0\n               C-8.4 6.6 -18.5 6.6 -42 0\"\n            fill=\"url(#gold_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.1\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(144 222)\" filter=\"url(#gold_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#gold_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(368 222)\" filter=\"url(#gold_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#gold_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>",
			"platinum": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"platinum_base_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#53606B\"/>\n        <stop offset=\"0.18\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"0.36\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.52\" stop-color=\"#7E8B98\"/>\n        <stop offset=\"0.70\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </linearGradient>\n      <linearGradient id=\"platinum_base_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.28\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"0.70\" stop-color=\"#7E8B98\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </linearGradient>\n      <radialGradient id=\"platinum_base_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#8FE8FF\"/>\n        <stop offset=\"0.62\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </radialGradient>\n      <radialGradient id=\"platinum_base_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#DCE9F3\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#DCE9F3\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"platinum_base_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"platinum_base_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#platinum_base_shadow)\">\n        <path d=\"M98 306 L90 202 L130 204 L164 142 L192 176 L220 124 L240 82 L256 58 L272 82 L292 124 L320 176 L348 142 L382 204 L422 202 L414 306 Q336 288 256 296 Q176 288 98 306 Z\" fill=\"url(#platinum_base_metal)\" stroke=\"#53606B\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M146 280 C176 264 206 272 232 286 C242 294 270 294 280 286 C306 272 336 264 366 280\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M110 306 C154 314 202 320 256 320 C310 320 358 314 402 306 L394 332 H118 Z\" fill=\"url(#platinum_base_base)\" stroke=\"#53606B\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M142 322 C178 328 216 332 256 332 C296 332 334 328 370 322\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M146 204 Q172 166 192 132\" stroke-width=\"4\" />\n<path d=\"M366 204 Q340 166 320 132\" stroke-width=\"4\" />\n<path d=\"M220 124 L240 84 L256 104 L272 84 L292 124\" stroke-width=\"4\" />\n<path d=\"M192 176 Q222 156 256 156 Q290 156 320 176\" stroke-width=\"4\" />\n<path d=\"M240 82 Q248 72 256 72 Q264 72 272 82\" stroke-width=\"4\" />\n</g>\n<path d=\"M90 195 L97 202 L90 209 L83 202 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M164 135 L171 142 L164 149 L157 142 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M192 170 L198 176 L192 182 L186 176 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M240 76 L246 82 L240 88 L234 82 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 48 L266 58 L256 68 L246 58 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M272 76 L278 82 L272 88 L266 82 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M320 170 L326 176 L320 182 L314 176 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M348 135 L355 142 L348 149 L341 142 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M422 195 L429 202 L422 209 L415 202 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"130\" cy=\"204\" r=\"9\" fill=\"url(#platinum_base_gem)\" stroke=\"#53606B\" stroke-width=\"4.8\"/>\n<circle cx=\"382\" cy=\"204\" r=\"9\" fill=\"url(#platinum_base_gem)\" stroke=\"#53606B\" stroke-width=\"4.8\"/>\n<path d=\"M256 236 L294 278 L256 332 L218 278 Z\" fill=\"url(#platinum_base_gem)\" stroke=\"#53606B\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 256 L274 278 L256 312 L238 278 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n<g>\n    <g transform=\"translate(256 58)\" filter=\"url(#platinum_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.2s\" begin=\"4.2s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.2s\" begin=\"4.2s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -58 C3.8 -25.5 3.8 -11.6 0 0\n               C-3.8 -11.6 -3.8 -25.5 0 -58\n               M38 0 C16.7 5.8 7.6 5.8 0 0\n               C7.6 -5.8 16.7 -5.8 38 0\n               M0 58 C-3.8 25.5 -3.8 11.6 0 0\n               C3.8 11.6 3.8 25.5 0 58\n               M-38 0 C-16.7 -5.8 -7.6 -5.8 0 0\n               C-7.6 5.8 -16.7 5.8 -38 0\"\n            fill=\"url(#platinum_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"6.5\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 236)\" filter=\"url(#platinum_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -68 C4.4 -29.9 4.4 -13.6 0 0\n               C-4.4 -13.6 -4.4 -29.9 0 -68\n               M44 0 C19.4 6.8 8.8 6.8 0 0\n               C8.8 -6.8 19.4 -6.8 44 0\n               M0 68 C-4.4 29.9 -4.4 13.6 0 0\n               C4.4 13.6 4.4 29.9 0 68\n               M-44 0 C-19.4 -6.8 -8.8 -6.8 0 0\n               C-8.8 6.8 -19.4 6.8 -44 0\"\n            fill=\"url(#platinum_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.5\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(130 204)\" filter=\"url(#platinum_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#platinum_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(382 204)\" filter=\"url(#platinum_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#platinum_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>",
			"amethyst": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"amethyst_base_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#250B3B\"/>\n        <stop offset=\"0.18\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"0.36\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"0.52\" stop-color=\"#4A176D\"/>\n        <stop offset=\"0.70\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </linearGradient>\n      <linearGradient id=\"amethyst_base_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"0.28\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"0.70\" stop-color=\"#4A176D\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </linearGradient>\n      <radialGradient id=\"amethyst_base_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#C56DFF\"/>\n        <stop offset=\"0.62\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </radialGradient>\n      <radialGradient id=\"amethyst_base_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#E6BCFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#8D43C7\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#8D43C7\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"amethyst_base_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"amethyst_base_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#amethyst_base_shadow)\">\n        <path d=\"M88 300 L80 188 L118 188 L152 136 L182 172 L212 118 L236 74 L256 44 L276 74 L300 118 L330 172 L360 136 L394 188 L432 188 L424 300 Q342 282 256 290 Q170 282 88 300 Z\" fill=\"url(#amethyst_base_metal)\" stroke=\"#250B3B\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M142 274 C174 256 208 266 236 284 C246 292 266 292 276 284 C304 266 338 256 370 274\" fill=\"none\" stroke=\"#E6BCFF\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M102 300 C148 308 200 316 256 316 C312 316 364 308 410 300 L400 328 H112 Z\" fill=\"url(#amethyst_base_base)\" stroke=\"#250B3B\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M136 318 C174 326 214 332 256 332 C298 332 338 326 376 318\" fill=\"none\" stroke=\"#E6BCFF\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#E6BCFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M130 188 Q156 150 180 112\" stroke-width=\"4\" />\n<path d=\"M382 188 Q356 150 332 112\" stroke-width=\"4\" />\n<path d=\"M212 118 L236 76 L256 98 L276 76 L300 118\" stroke-width=\"4\" />\n<path d=\"M182 172 Q216 148 256 148 Q296 148 330 172\" stroke-width=\"4\" />\n<path d=\"M236 74 Q246 60 256 60 Q266 60 276 74\" stroke-width=\"4\" />\n</g>\n<path d=\"M80 181 L87 188 L80 195 L73 188 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M152 129 L159 136 L152 143 L145 136 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M182 166 L188 172 L182 178 L176 172 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M236 68 L242 74 L236 80 L230 74 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 33 L267 44 L256 55 L245 44 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M276 68 L282 74 L276 80 L270 74 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M330 166 L336 172 L330 178 L324 172 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M360 129 L367 136 L360 143 L353 136 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M432 181 L439 188 L432 195 L425 188 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"118\" cy=\"188\" r=\"9\" fill=\"url(#amethyst_base_gem)\" stroke=\"#250B3B\" stroke-width=\"4.8\"/>\n<circle cx=\"394\" cy=\"188\" r=\"9\" fill=\"url(#amethyst_base_gem)\" stroke=\"#250B3B\" stroke-width=\"4.8\"/>\n<path d=\"M256 222 L298 270 L256 334 L214 270 Z\" fill=\"url(#amethyst_base_gem)\" stroke=\"#250B3B\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 246 L276 270 L256 308 L236 270 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n<g>\n    <g transform=\"translate(256 44)\" filter=\"url(#amethyst_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.2s\" begin=\"4.3s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.2s\" begin=\"4.3s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -60 C4.0 -26.4 4.0 -12.0 0 0\n               C-4.0 -12.0 -4.0 -26.4 0 -60\n               M40 0 C17.6 6.0 8.0 6.0 0 0\n               C8.0 -6.0 17.6 -6.0 40 0\n               M0 60 C-4.0 26.4 -4.0 12.0 0 0\n               C4.0 12.0 4.0 26.4 0 60\n               M-40 0 C-17.6 -6.0 -8.0 -6.0 0 0\n               C-8.0 6.0 -17.6 6.0 -40 0\"\n            fill=\"url(#amethyst_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"6.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 222)\" filter=\"url(#amethyst_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -72 C4.6 -31.7 4.6 -14.4 0 0\n               C-4.6 -14.4 -4.6 -31.7 0 -72\n               M46 0 C20.2 7.2 9.2 7.2 0 0\n               C9.2 -7.2 20.2 -7.2 46 0\n               M0 72 C-4.6 31.7 -4.6 14.4 0 0\n               C4.6 14.4 4.6 31.7 0 72\n               M-46 0 C-20.2 -7.2 -9.2 -7.2 0 0\n               C-9.2 7.2 -20.2 7.2 -46 0\"\n            fill=\"url(#amethyst_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(118 188)\" filter=\"url(#amethyst_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#amethyst_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(394 188)\" filter=\"url(#amethyst_base_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#amethyst_base_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>",
			"magic-bronze": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"bronze_magic_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#3A1B12\"/>\n        <stop offset=\"0.18\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"0.36\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"0.52\" stop-color=\"#6B351D\"/>\n        <stop offset=\"0.70\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </linearGradient>\n      <linearGradient id=\"bronze_magic_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#E0A06C\"/>\n        <stop offset=\"0.28\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"0.70\" stop-color=\"#6B351D\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </linearGradient>\n      <radialGradient id=\"bronze_magic_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#E58A52\"/>\n        <stop offset=\"0.62\" stop-color=\"#B86A3F\"/>\n        <stop offset=\"1\" stop-color=\"#3A1B12\"/>\n      </radialGradient>\n      <radialGradient id=\"bronze_magic_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#E0A06C\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#B86A3F\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#B86A3F\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"bronze_magic_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"bronze_magic_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n        <linearGradient id=\"bronze_magic_sweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.18\" stop-color=\"#D8A9FF\" stop-opacity=\"0.18\"/>\n          <stop offset=\"0.42\" stop-color=\"#96F1FF\" stop-opacity=\"0.82\"/>\n          <stop offset=\"0.58\" stop-color=\"#FFFFFF\" stop-opacity=\"0.95\"/>\n          <stop offset=\"0.76\" stop-color=\"#CFA0FF\" stop-opacity=\"0.36\"/>\n          <stop offset=\"1\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"bronze_magic_sweepSoft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.25\" stop-color=\"#D7A5FF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"0.5\" stop-color=\"#8EF2FF\" stop-opacity=\"0.48\"/>\n          <stop offset=\"0.75\" stop-color=\"#D19CFF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"bronze_magic_ribbon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.20\" stop-color=\"#DAA5FF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"0.50\" stop-color=\"#90F0FF\" stop-opacity=\"1\"/>\n          <stop offset=\"0.80\" stop-color=\"#D79EFF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"1\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"bronze_magic_ribbon2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.28\" stop-color=\"#D4A0FF\" stop-opacity=\"0.54\"/>\n          <stop offset=\"0.54\" stop-color=\"#78F4FF\" stop-opacity=\"0.92\"/>\n          <stop offset=\"0.78\" stop-color=\"#D4A0FF\" stop-opacity=\"0.52\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <filter id=\"bronze_magic_magicGlow\" x=\"-70%\" y=\"-70%\" width=\"260%\" height=\"260%\">\n          <feGaussianBlur stdDeviation=\"9\" result=\"blur\"/>\n          <feColorMatrix in=\"blur\" type=\"matrix\"\n            values=\"0.80 0 0 0 0.16\n                    0 0.68 0 0 0.14\n                    0 0 1 0 0.42\n                    0 0 0 0.96 0\" result=\"tint\"/>\n          <feMerge><feMergeNode in=\"tint\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n        </filter>\n        <clipPath id=\"bronze_magic_clip\"><path d=\"M132 320 L126 238 L172 246 L200 198 L228 218 L256 180 L284 218 L312 198 L340 246 L386 238 L380 320 Q320 308 256 312 Q192 308 132 320 Z\"/><path d=\"M142 320 C178 324 216 328 256 328 C296 328 334 324 370 320 L366 348 H146 Z\"/></clipPath>\n        \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#bronze_magic_shadow)\">\n        <path d=\"M132 320 L126 238 L172 246 L200 198 L228 218 L256 180 L284 218 L312 198 L340 246 L386 238 L380 320 Q320 308 256 312 Q192 308 132 320 Z\" fill=\"url(#bronze_magic_metal)\" stroke=\"#3A1B12\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M162 294 C186 288 208 290 228 294 C240 298 272 298 284 294 C304 290 326 288 350 294\" fill=\"none\" stroke=\"#E0A06C\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M142 320 C178 324 216 328 256 328 C296 328 334 324 370 320 L366 348 H146 Z\" fill=\"url(#bronze_magic_base)\" stroke=\"#3A1B12\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M164 334 C194 338 224 340 256 340 C288 340 318 338 348 334\" fill=\"none\" stroke=\"#E0A06C\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#E0A06C\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M184 252 Q198 234 210 220\" stroke-width=\"4\" />\n<path d=\"M328 252 Q314 234 302 220\" stroke-width=\"4\" />\n</g>\n<circle cx=\"126\" cy=\"238\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"200\" cy=\"198\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"256\" cy=\"180\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"312\" cy=\"198\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"386\" cy=\"238\" r=\"7\" fill=\"#E0A06C\" stroke=\"#3A1B12\" stroke-width=\"4.1\"/>\n<circle cx=\"172\" cy=\"246\" r=\"9\" fill=\"url(#bronze_magic_gem)\" stroke=\"#3A1B12\" stroke-width=\"4.8\"/>\n<circle cx=\"340\" cy=\"246\" r=\"9\" fill=\"url(#bronze_magic_gem)\" stroke=\"#3A1B12\" stroke-width=\"4.8\"/>\n<path d=\"M256 276 L276 296 L256 318 L236 296 Z\" fill=\"url(#bronze_magic_gem)\" stroke=\"#3A1B12\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 284 L266 296 L256 308 L246 296 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n\n    <g clip-path=\"url(#bronze_magic_clip)\" pointer-events=\"none\">\n      <g filter=\"url(#bronze_magic_magicGlow)\">\n        <g transform=\"rotate(-16 256 256)\">\n          <rect x=\"-420\" y=\"-80\" width=\"160\" height=\"720\" rx=\"80\" fill=\"url(#bronze_magic_sweep)\" opacity=\"0.95\">\n            <animate attributeName=\"x\" values=\"-420;-420;560\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          </rect>\n          <rect x=\"-640\" y=\"-100\" width=\"100\" height=\"760\" rx=\"50\" fill=\"url(#bronze_magic_sweepSoft)\" opacity=\"0.68\">\n            <animate attributeName=\"x\" values=\"-640;-640;520\" dur=\"7.8s\" begin=\"1.3s\" repeatCount=\"indefinite\"/>\n          </rect>\n        </g>\n      </g>\n      <g stroke-linecap=\"round\" fill=\"none\">\n        <path d=\"M38 188 C106 166 178 172 256 194 C334 216 400 220 472 192\" stroke=\"url(#bronze_magic_ribbon)\" stroke-width=\"7\" opacity=\"0.90\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"-12 0;-12 0;16 0;-12 0\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.30;0.30;1;0.65;0.30\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n        </path>\n        <path d=\"M24 296 C92 270 170 276 256 304 C344 332 412 334 488 300\" stroke=\"url(#bronze_magic_ribbon)\" stroke-width=\"8.8\" opacity=\"0.88\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"16 0;16 0;-12 0;16 0\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.32;0.32;1;0.68;0.32\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n        </path>\n      </g>\n    </g>\n    \n</svg>",
			"magic-silver": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"silver_magic_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#41464D\"/>\n        <stop offset=\"0.18\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"0.36\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"0.52\" stop-color=\"#70757C\"/>\n        <stop offset=\"0.70\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </linearGradient>\n      <linearGradient id=\"silver_magic_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#F4F7FA\"/>\n        <stop offset=\"0.28\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"0.70\" stop-color=\"#70757C\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </linearGradient>\n      <radialGradient id=\"silver_magic_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#B7E3FF\"/>\n        <stop offset=\"0.62\" stop-color=\"#C7CED6\"/>\n        <stop offset=\"1\" stop-color=\"#41464D\"/>\n      </radialGradient>\n      <radialGradient id=\"silver_magic_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#F4F7FA\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#C7CED6\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#C7CED6\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"silver_magic_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"silver_magic_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n        <linearGradient id=\"silver_magic_sweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.18\" stop-color=\"#D8A9FF\" stop-opacity=\"0.18\"/>\n          <stop offset=\"0.42\" stop-color=\"#96F1FF\" stop-opacity=\"0.82\"/>\n          <stop offset=\"0.58\" stop-color=\"#FFFFFF\" stop-opacity=\"0.95\"/>\n          <stop offset=\"0.76\" stop-color=\"#CFA0FF\" stop-opacity=\"0.36\"/>\n          <stop offset=\"1\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"silver_magic_sweepSoft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.25\" stop-color=\"#D7A5FF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"0.5\" stop-color=\"#8EF2FF\" stop-opacity=\"0.48\"/>\n          <stop offset=\"0.75\" stop-color=\"#D19CFF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"silver_magic_ribbon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.20\" stop-color=\"#DAA5FF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"0.50\" stop-color=\"#90F0FF\" stop-opacity=\"1\"/>\n          <stop offset=\"0.80\" stop-color=\"#D79EFF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"1\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"silver_magic_ribbon2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.28\" stop-color=\"#D4A0FF\" stop-opacity=\"0.54\"/>\n          <stop offset=\"0.54\" stop-color=\"#78F4FF\" stop-opacity=\"0.92\"/>\n          <stop offset=\"0.78\" stop-color=\"#D4A0FF\" stop-opacity=\"0.52\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <filter id=\"silver_magic_magicGlow\" x=\"-70%\" y=\"-70%\" width=\"260%\" height=\"260%\">\n          <feGaussianBlur stdDeviation=\"9\" result=\"blur\"/>\n          <feColorMatrix in=\"blur\" type=\"matrix\"\n            values=\"0.80 0 0 0 0.16\n                    0 0.68 0 0 0.14\n                    0 0 1 0 0.42\n                    0 0 0 0.96 0\" result=\"tint\"/>\n          <feMerge><feMergeNode in=\"tint\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n        </filter>\n        <clipPath id=\"silver_magic_clip\"><path d=\"M122 320 L116 228 L162 236 L192 180 L220 210 L256 150 L292 210 L320 180 L350 236 L396 228 L390 320 Q324 306 256 310 Q188 306 122 320 Z\"/><path d=\"M132 320 C170 326 212 332 256 332 C300 332 342 326 380 320 L374 350 H138 Z\"/></clipPath>\n        \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#silver_magic_shadow)\">\n        <path d=\"M122 320 L116 228 L162 236 L192 180 L220 210 L256 150 L292 210 L320 180 L350 236 L396 228 L390 320 Q324 306 256 310 Q188 306 122 320 Z\" fill=\"url(#silver_magic_metal)\" stroke=\"#41464D\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M158 292 C184 282 208 286 228 294 C240 300 272 300 284 294 C304 286 328 282 354 292\" fill=\"none\" stroke=\"#F4F7FA\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M132 320 C170 326 212 332 256 332 C300 332 342 326 380 320 L374 350 H138 Z\" fill=\"url(#silver_magic_base)\" stroke=\"#41464D\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M158 336 C190 342 222 344 256 344 C290 344 322 342 354 336\" fill=\"none\" stroke=\"#F4F7FA\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#F4F7FA\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M178 244 Q194 218 206 192\" stroke-width=\"4\" />\n<path d=\"M334 244 Q318 218 306 192\" stroke-width=\"4\" />\n<path d=\"M232 214 Q244 200 256 200 Q268 200 280 214\" stroke-width=\"4\" />\n</g>\n<circle cx=\"116\" cy=\"228\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"192\" cy=\"180\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"220\" cy=\"210\" r=\"6\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"256\" cy=\"150\" r=\"8\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"292\" cy=\"210\" r=\"6\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"320\" cy=\"180\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"396\" cy=\"228\" r=\"7\" fill=\"#F4F7FA\" stroke=\"#41464D\" stroke-width=\"4.1\"/>\n<circle cx=\"162\" cy=\"236\" r=\"9\" fill=\"url(#silver_magic_gem)\" stroke=\"#41464D\" stroke-width=\"4.8\"/>\n<circle cx=\"350\" cy=\"236\" r=\"9\" fill=\"url(#silver_magic_gem)\" stroke=\"#41464D\" stroke-width=\"4.8\"/>\n<path d=\"M256 268 L280 296 L256 324 L232 296 Z\" fill=\"url(#silver_magic_gem)\" stroke=\"#41464D\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 278 L268 296 L256 314 L244 296 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n\n    <g clip-path=\"url(#silver_magic_clip)\" pointer-events=\"none\">\n      <g filter=\"url(#silver_magic_magicGlow)\">\n        <g transform=\"rotate(-16 256 256)\">\n          <rect x=\"-420\" y=\"-80\" width=\"160\" height=\"720\" rx=\"80\" fill=\"url(#silver_magic_sweep)\" opacity=\"0.95\">\n            <animate attributeName=\"x\" values=\"-420;-420;560\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          </rect>\n          <rect x=\"-640\" y=\"-100\" width=\"100\" height=\"760\" rx=\"50\" fill=\"url(#silver_magic_sweepSoft)\" opacity=\"0.68\">\n            <animate attributeName=\"x\" values=\"-640;-640;520\" dur=\"7.8s\" begin=\"1.3s\" repeatCount=\"indefinite\"/>\n          </rect>\n        </g>\n      </g>\n      <g stroke-linecap=\"round\" fill=\"none\">\n        <path d=\"M38 188 C106 166 178 172 256 194 C334 216 400 220 472 192\" stroke=\"url(#silver_magic_ribbon)\" stroke-width=\"7\" opacity=\"0.90\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"-12 0;-12 0;16 0;-12 0\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.30;0.30;1;0.65;0.30\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n        </path>\n        <path d=\"M24 296 C92 270 170 276 256 304 C344 332 412 334 488 300\" stroke=\"url(#silver_magic_ribbon)\" stroke-width=\"8.8\" opacity=\"0.88\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"16 0;16 0;-12 0;16 0\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.32;0.32;1;0.68;0.32\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n        </path>\n      </g>\n    </g>\n    \n</svg>",
			"magic-gold": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"gold_magic_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#5A3200\"/>\n        <stop offset=\"0.18\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"0.36\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"0.52\" stop-color=\"#9A5A00\"/>\n        <stop offset=\"0.70\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </linearGradient>\n      <linearGradient id=\"gold_magic_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#FFF1A6\"/>\n        <stop offset=\"0.28\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"0.70\" stop-color=\"#9A5A00\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </linearGradient>\n      <radialGradient id=\"gold_magic_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#FFD45C\"/>\n        <stop offset=\"0.62\" stop-color=\"#F0B52C\"/>\n        <stop offset=\"1\" stop-color=\"#5A3200\"/>\n      </radialGradient>\n      <radialGradient id=\"gold_magic_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#FFF1A6\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#F0B52C\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#F0B52C\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"gold_magic_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"gold_magic_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n        <linearGradient id=\"gold_magic_sweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.18\" stop-color=\"#D8A9FF\" stop-opacity=\"0.18\"/>\n          <stop offset=\"0.42\" stop-color=\"#96F1FF\" stop-opacity=\"0.82\"/>\n          <stop offset=\"0.58\" stop-color=\"#FFFFFF\" stop-opacity=\"0.95\"/>\n          <stop offset=\"0.76\" stop-color=\"#CFA0FF\" stop-opacity=\"0.36\"/>\n          <stop offset=\"1\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"gold_magic_sweepSoft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.25\" stop-color=\"#D7A5FF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"0.5\" stop-color=\"#8EF2FF\" stop-opacity=\"0.48\"/>\n          <stop offset=\"0.75\" stop-color=\"#D19CFF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"gold_magic_ribbon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.20\" stop-color=\"#DAA5FF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"0.50\" stop-color=\"#90F0FF\" stop-opacity=\"1\"/>\n          <stop offset=\"0.80\" stop-color=\"#D79EFF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"1\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"gold_magic_ribbon2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.28\" stop-color=\"#D4A0FF\" stop-opacity=\"0.54\"/>\n          <stop offset=\"0.54\" stop-color=\"#78F4FF\" stop-opacity=\"0.92\"/>\n          <stop offset=\"0.78\" stop-color=\"#D4A0FF\" stop-opacity=\"0.52\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <filter id=\"gold_magic_magicGlow\" x=\"-70%\" y=\"-70%\" width=\"260%\" height=\"260%\">\n          <feGaussianBlur stdDeviation=\"9\" result=\"blur\"/>\n          <feColorMatrix in=\"blur\" type=\"matrix\"\n            values=\"0.80 0 0 0 0.16\n                    0 0.68 0 0 0.14\n                    0 0 1 0 0.42\n                    0 0 0 0.96 0\" result=\"tint\"/>\n          <feMerge><feMergeNode in=\"tint\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n        </filter>\n        <clipPath id=\"gold_magic_clip\"><path d=\"M108 318 L100 218 L144 222 L176 166 L204 196 L228 146 L246 114 L256 96 L266 114 L284 146 L308 196 L336 166 L368 222 L412 218 L404 318 Q330 302 256 308 Q182 302 108 318 Z\"/><path d=\"M120 318 C162 326 208 332 256 332 C304 332 350 326 392 318 L384 350 H128 Z\"/></clipPath>\n        \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#gold_magic_shadow)\">\n        <path d=\"M108 318 L100 218 L144 222 L176 166 L204 196 L228 146 L246 114 L256 96 L266 114 L284 146 L308 196 L336 166 L368 222 L412 218 L404 318 Q330 302 256 308 Q182 302 108 318 Z\" fill=\"url(#gold_magic_metal)\" stroke=\"#5A3200\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M150 290 C178 278 206 284 230 294 C242 300 270 300 282 294 C306 284 334 278 362 290\" fill=\"none\" stroke=\"#FFF1A6\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M120 318 C162 326 208 332 256 332 C304 332 350 326 392 318 L384 350 H128 Z\" fill=\"url(#gold_magic_base)\" stroke=\"#5A3200\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M148 336 C182 342 218 346 256 346 C294 346 330 342 364 336\" fill=\"none\" stroke=\"#FFF1A6\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#FFF1A6\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M160 226 Q182 192 200 158\" stroke-width=\"4\" />\n<path d=\"M352 226 Q330 192 312 158\" stroke-width=\"4\" />\n<path d=\"M228 146 L246 118 L256 132 L266 118 L284 146\" stroke-width=\"4\" />\n<path d=\"M204 196 Q228 182 256 182 Q284 182 308 196\" stroke-width=\"4\" />\n</g>\n<path d=\"M100 211 L107 218 L100 225 L93 218 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M176 159 L183 166 L176 173 L169 166 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M204 190 L210 196 L204 202 L198 196 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 87 L265 96 L256 105 L247 96 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M308 190 L314 196 L308 202 L302 196 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M336 159 L343 166 L336 173 L329 166 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M412 211 L419 218 L412 225 L405 218 Z\" fill=\"#FFF1A6\" stroke=\"#5A3200\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"144\" cy=\"222\" r=\"9\" fill=\"url(#gold_magic_gem)\" stroke=\"#5A3200\" stroke-width=\"4.8\"/>\n<circle cx=\"368\" cy=\"222\" r=\"9\" fill=\"url(#gold_magic_gem)\" stroke=\"#5A3200\" stroke-width=\"4.8\"/>\n<path d=\"M256 256 L286 290 L256 330 L226 290 Z\" fill=\"url(#gold_magic_gem)\" stroke=\"#5A3200\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 270 L272 290 L256 312 L240 290 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n\n    <g clip-path=\"url(#gold_magic_clip)\" pointer-events=\"none\">\n      <g filter=\"url(#gold_magic_magicGlow)\">\n        <g transform=\"rotate(-16 256 256)\">\n          <rect x=\"-420\" y=\"-80\" width=\"160\" height=\"720\" rx=\"80\" fill=\"url(#gold_magic_sweep)\" opacity=\"0.95\">\n            <animate attributeName=\"x\" values=\"-420;-420;560\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          </rect>\n          <rect x=\"-640\" y=\"-100\" width=\"100\" height=\"760\" rx=\"50\" fill=\"url(#gold_magic_sweepSoft)\" opacity=\"0.68\">\n            <animate attributeName=\"x\" values=\"-640;-640;520\" dur=\"7.8s\" begin=\"1.3s\" repeatCount=\"indefinite\"/>\n          </rect>\n        </g>\n      </g>\n      <g stroke-linecap=\"round\" fill=\"none\">\n        <path d=\"M38 188 C106 166 178 172 256 194 C334 216 400 220 472 192\" stroke=\"url(#gold_magic_ribbon)\" stroke-width=\"7\" opacity=\"0.90\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"-12 0;-12 0;16 0;-12 0\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.30;0.30;1;0.65;0.30\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n        </path>\n        <path d=\"M24 296 C92 270 170 276 256 304 C344 332 412 334 488 300\" stroke=\"url(#gold_magic_ribbon)\" stroke-width=\"8.8\" opacity=\"0.88\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"16 0;16 0;-12 0;16 0\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.32;0.32;1;0.68;0.32\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n        </path>\n      </g>\n    </g>\n    \n<g>\n    <g transform=\"translate(256 96)\" filter=\"url(#gold_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.0s\" begin=\"4.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.0s\" begin=\"4.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -52 C3.4 -22.9 3.4 -10.4 0 0\n               C-3.4 -10.4 -3.4 -22.9 0 -52\n               M34 0 C15.0 5.2 6.8 5.2 0 0\n               C6.8 -5.2 15.0 -5.2 34 0\n               M0 52 C-3.4 22.9 -3.4 10.4 0 0\n               C3.4 10.4 3.4 22.9 0 52\n               M-34 0 C-15.0 -5.2 -6.8 -5.2 0 0\n               C-6.8 5.2 -15.0 5.2 -34 0\"\n            fill=\"url(#gold_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"5.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 256)\" filter=\"url(#gold_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -66 C4.2 -29.0 4.2 -13.2 0 0\n               C-4.2 -13.2 -4.2 -29.0 0 -66\n               M42 0 C18.5 6.6 8.4 6.6 0 0\n               C8.4 -6.6 18.5 -6.6 42 0\n               M0 66 C-4.2 29.0 -4.2 13.2 0 0\n               C4.2 13.2 4.2 29.0 0 66\n               M-42 0 C-18.5 -6.6 -8.4 -6.6 0 0\n               C-8.4 6.6 -18.5 6.6 -42 0\"\n            fill=\"url(#gold_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.1\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(144 222)\" filter=\"url(#gold_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#gold_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(368 222)\" filter=\"url(#gold_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#gold_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>",
			"magic-platinum": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"platinum_magic_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#53606B\"/>\n        <stop offset=\"0.18\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"0.36\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.52\" stop-color=\"#7E8B98\"/>\n        <stop offset=\"0.70\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </linearGradient>\n      <linearGradient id=\"platinum_magic_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.28\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"0.70\" stop-color=\"#7E8B98\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </linearGradient>\n      <radialGradient id=\"platinum_magic_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#8FE8FF\"/>\n        <stop offset=\"0.62\" stop-color=\"#DCE9F3\"/>\n        <stop offset=\"1\" stop-color=\"#53606B\"/>\n      </radialGradient>\n      <radialGradient id=\"platinum_magic_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#DCE9F3\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#DCE9F3\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"platinum_magic_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"platinum_magic_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n        <linearGradient id=\"platinum_magic_sweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.18\" stop-color=\"#D8A9FF\" stop-opacity=\"0.18\"/>\n          <stop offset=\"0.42\" stop-color=\"#96F1FF\" stop-opacity=\"0.82\"/>\n          <stop offset=\"0.58\" stop-color=\"#FFFFFF\" stop-opacity=\"0.95\"/>\n          <stop offset=\"0.76\" stop-color=\"#CFA0FF\" stop-opacity=\"0.36\"/>\n          <stop offset=\"1\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"platinum_magic_sweepSoft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.25\" stop-color=\"#D7A5FF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"0.5\" stop-color=\"#8EF2FF\" stop-opacity=\"0.48\"/>\n          <stop offset=\"0.75\" stop-color=\"#D19CFF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"platinum_magic_ribbon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.20\" stop-color=\"#DAA5FF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"0.50\" stop-color=\"#90F0FF\" stop-opacity=\"1\"/>\n          <stop offset=\"0.80\" stop-color=\"#D79EFF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"1\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"platinum_magic_ribbon2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.28\" stop-color=\"#D4A0FF\" stop-opacity=\"0.54\"/>\n          <stop offset=\"0.54\" stop-color=\"#78F4FF\" stop-opacity=\"0.92\"/>\n          <stop offset=\"0.78\" stop-color=\"#D4A0FF\" stop-opacity=\"0.52\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <filter id=\"platinum_magic_magicGlow\" x=\"-70%\" y=\"-70%\" width=\"260%\" height=\"260%\">\n          <feGaussianBlur stdDeviation=\"9\" result=\"blur\"/>\n          <feColorMatrix in=\"blur\" type=\"matrix\"\n            values=\"0.80 0 0 0 0.16\n                    0 0.68 0 0 0.14\n                    0 0 1 0 0.42\n                    0 0 0 0.96 0\" result=\"tint\"/>\n          <feMerge><feMergeNode in=\"tint\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n        </filter>\n        <clipPath id=\"platinum_magic_clip\"><path d=\"M98 306 L90 202 L130 204 L164 142 L192 176 L220 124 L240 82 L256 58 L272 82 L292 124 L320 176 L348 142 L382 204 L422 202 L414 306 Q336 288 256 296 Q176 288 98 306 Z\"/><path d=\"M110 306 C154 314 202 320 256 320 C310 320 358 314 402 306 L394 332 H118 Z\"/></clipPath>\n        \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#platinum_magic_shadow)\">\n        <path d=\"M98 306 L90 202 L130 204 L164 142 L192 176 L220 124 L240 82 L256 58 L272 82 L292 124 L320 176 L348 142 L382 204 L422 202 L414 306 Q336 288 256 296 Q176 288 98 306 Z\" fill=\"url(#platinum_magic_metal)\" stroke=\"#53606B\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M146 280 C176 264 206 272 232 286 C242 294 270 294 280 286 C306 272 336 264 366 280\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M110 306 C154 314 202 320 256 320 C310 320 358 314 402 306 L394 332 H118 Z\" fill=\"url(#platinum_magic_base)\" stroke=\"#53606B\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M142 322 C178 328 216 332 256 332 C296 332 334 328 370 322\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M146 204 Q172 166 192 132\" stroke-width=\"4\" />\n<path d=\"M366 204 Q340 166 320 132\" stroke-width=\"4\" />\n<path d=\"M220 124 L240 84 L256 104 L272 84 L292 124\" stroke-width=\"4\" />\n<path d=\"M192 176 Q222 156 256 156 Q290 156 320 176\" stroke-width=\"4\" />\n<path d=\"M240 82 Q248 72 256 72 Q264 72 272 82\" stroke-width=\"4\" />\n</g>\n<path d=\"M90 195 L97 202 L90 209 L83 202 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M164 135 L171 142 L164 149 L157 142 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M192 170 L198 176 L192 182 L186 176 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M240 76 L246 82 L240 88 L234 82 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 48 L266 58 L256 68 L246 58 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M272 76 L278 82 L272 88 L266 82 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M320 170 L326 176 L320 182 L314 176 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M348 135 L355 142 L348 149 L341 142 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M422 195 L429 202 L422 209 L415 202 Z\" fill=\"#FFFFFF\" stroke=\"#53606B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"130\" cy=\"204\" r=\"9\" fill=\"url(#platinum_magic_gem)\" stroke=\"#53606B\" stroke-width=\"4.8\"/>\n<circle cx=\"382\" cy=\"204\" r=\"9\" fill=\"url(#platinum_magic_gem)\" stroke=\"#53606B\" stroke-width=\"4.8\"/>\n<path d=\"M256 236 L294 278 L256 332 L218 278 Z\" fill=\"url(#platinum_magic_gem)\" stroke=\"#53606B\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 256 L274 278 L256 312 L238 278 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n\n    <g clip-path=\"url(#platinum_magic_clip)\" pointer-events=\"none\">\n      <g filter=\"url(#platinum_magic_magicGlow)\">\n        <g transform=\"rotate(-16 256 256)\">\n          <rect x=\"-420\" y=\"-80\" width=\"160\" height=\"720\" rx=\"80\" fill=\"url(#platinum_magic_sweep)\" opacity=\"0.95\">\n            <animate attributeName=\"x\" values=\"-420;-420;560\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          </rect>\n          <rect x=\"-640\" y=\"-100\" width=\"100\" height=\"760\" rx=\"50\" fill=\"url(#platinum_magic_sweepSoft)\" opacity=\"0.68\">\n            <animate attributeName=\"x\" values=\"-640;-640;520\" dur=\"7.8s\" begin=\"1.3s\" repeatCount=\"indefinite\"/>\n          </rect>\n        </g>\n      </g>\n      <g stroke-linecap=\"round\" fill=\"none\">\n        <path d=\"M38 188 C106 166 178 172 256 194 C334 216 400 220 472 192\" stroke=\"url(#platinum_magic_ribbon)\" stroke-width=\"7\" opacity=\"0.90\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"-12 0;-12 0;16 0;-12 0\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.30;0.30;1;0.65;0.30\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n        </path>\n        <path d=\"M24 296 C92 270 170 276 256 304 C344 332 412 334 488 300\" stroke=\"url(#platinum_magic_ribbon)\" stroke-width=\"8.8\" opacity=\"0.88\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"16 0;16 0;-12 0;16 0\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.32;0.32;1;0.68;0.32\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n        </path>\n      </g>\n    </g>\n    \n<g>\n    <g transform=\"translate(256 58)\" filter=\"url(#platinum_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.2s\" begin=\"4.2s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.2s\" begin=\"4.2s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -58 C3.8 -25.5 3.8 -11.6 0 0\n               C-3.8 -11.6 -3.8 -25.5 0 -58\n               M38 0 C16.7 5.8 7.6 5.8 0 0\n               C7.6 -5.8 16.7 -5.8 38 0\n               M0 58 C-3.8 25.5 -3.8 11.6 0 0\n               C3.8 11.6 3.8 25.5 0 58\n               M-38 0 C-16.7 -5.8 -7.6 -5.8 0 0\n               C-7.6 5.8 -16.7 5.8 -38 0\"\n            fill=\"url(#platinum_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"6.5\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 236)\" filter=\"url(#platinum_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -68 C4.4 -29.9 4.4 -13.6 0 0\n               C-4.4 -13.6 -4.4 -29.9 0 -68\n               M44 0 C19.4 6.8 8.8 6.8 0 0\n               C8.8 -6.8 19.4 -6.8 44 0\n               M0 68 C-4.4 29.9 -4.4 13.6 0 0\n               C4.4 13.6 4.4 29.9 0 68\n               M-44 0 C-19.4 -6.8 -8.8 -6.8 0 0\n               C-8.8 6.8 -19.4 6.8 -44 0\"\n            fill=\"url(#platinum_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.5\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(130 204)\" filter=\"url(#platinum_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#platinum_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(382 204)\" filter=\"url(#platinum_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#platinum_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>",
			"magic-amethyst": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">\n\n    <defs>\n      <linearGradient id=\"amethyst_magic_metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#250B3B\"/>\n        <stop offset=\"0.18\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"0.36\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"0.52\" stop-color=\"#4A176D\"/>\n        <stop offset=\"0.70\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </linearGradient>\n      <linearGradient id=\"amethyst_magic_base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#E6BCFF\"/>\n        <stop offset=\"0.28\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"0.70\" stop-color=\"#4A176D\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </linearGradient>\n      <radialGradient id=\"amethyst_magic_gem\" cx=\"36%\" cy=\"28%\" r=\"72%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\"/>\n        <stop offset=\"0.18\" stop-color=\"#C56DFF\"/>\n        <stop offset=\"0.62\" stop-color=\"#8D43C7\"/>\n        <stop offset=\"1\" stop-color=\"#250B3B\"/>\n      </radialGradient>\n      <radialGradient id=\"amethyst_magic_sparkleCore\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.22\" stop-color=\"#FFFFFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.48\" stop-color=\"#E6BCFF\" stop-opacity=\"1\"/>\n        <stop offset=\"0.74\" stop-color=\"#8D43C7\" stop-opacity=\"0.62\"/>\n        <stop offset=\"1\" stop-color=\"#8D43C7\" stop-opacity=\"0\"/>\n      </radialGradient>\n      <filter id=\"amethyst_magic_shadow\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"170%\">\n        <feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"6\" result=\"blur\"/>\n        <feOffset in=\"blur\" dx=\"0\" dy=\"7\" result=\"offsetBlur\"/>\n        <feColorMatrix in=\"offsetBlur\" type=\"matrix\"\n          values=\"0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0 0\n                  0 0 0 0.24 0\" result=\"shadow\"/>\n        <feMerge><feMergeNode in=\"shadow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      <filter id=\"amethyst_magic_softGlow\" x=\"-140%\" y=\"-140%\" width=\"380%\" height=\"380%\">\n        <feGaussianBlur stdDeviation=\"7.4\" result=\"blur\"/>\n        <feMerge><feMergeNode in=\"blur\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n      </filter>\n      \n        <linearGradient id=\"amethyst_magic_sweep\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.18\" stop-color=\"#D8A9FF\" stop-opacity=\"0.18\"/>\n          <stop offset=\"0.42\" stop-color=\"#96F1FF\" stop-opacity=\"0.82\"/>\n          <stop offset=\"0.58\" stop-color=\"#FFFFFF\" stop-opacity=\"0.95\"/>\n          <stop offset=\"0.76\" stop-color=\"#CFA0FF\" stop-opacity=\"0.36\"/>\n          <stop offset=\"1\" stop-color=\"#C58EFF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"amethyst_magic_sweepSoft\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.25\" stop-color=\"#D7A5FF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"0.5\" stop-color=\"#8EF2FF\" stop-opacity=\"0.48\"/>\n          <stop offset=\"0.75\" stop-color=\"#D19CFF\" stop-opacity=\"0.24\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"amethyst_magic_ribbon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.20\" stop-color=\"#DAA5FF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"0.50\" stop-color=\"#90F0FF\" stop-opacity=\"1\"/>\n          <stop offset=\"0.80\" stop-color=\"#D79EFF\" stop-opacity=\"0.62\"/>\n          <stop offset=\"1\" stop-color=\"#C089FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <linearGradient id=\"amethyst_magic_ribbon2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n          <stop offset=\"0\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n          <stop offset=\"0.28\" stop-color=\"#D4A0FF\" stop-opacity=\"0.54\"/>\n          <stop offset=\"0.54\" stop-color=\"#78F4FF\" stop-opacity=\"0.92\"/>\n          <stop offset=\"0.78\" stop-color=\"#D4A0FF\" stop-opacity=\"0.52\"/>\n          <stop offset=\"1\" stop-color=\"#B887FF\" stop-opacity=\"0\"/>\n        </linearGradient>\n        <filter id=\"amethyst_magic_magicGlow\" x=\"-70%\" y=\"-70%\" width=\"260%\" height=\"260%\">\n          <feGaussianBlur stdDeviation=\"9\" result=\"blur\"/>\n          <feColorMatrix in=\"blur\" type=\"matrix\"\n            values=\"0.80 0 0 0 0.16\n                    0 0.68 0 0 0.14\n                    0 0 1 0 0.42\n                    0 0 0 0.96 0\" result=\"tint\"/>\n          <feMerge><feMergeNode in=\"tint\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>\n        </filter>\n        <clipPath id=\"amethyst_magic_clip\"><path d=\"M88 300 L80 188 L118 188 L152 136 L182 172 L212 118 L236 74 L256 44 L276 74 L300 118 L330 172 L360 136 L394 188 L432 188 L424 300 Q342 282 256 290 Q170 282 88 300 Z\"/><path d=\"M102 300 C148 308 200 316 256 316 C312 316 364 308 410 300 L400 328 H112 Z\"/></clipPath>\n        \n    </defs>\n    \n\n      <g id=\"crown\" filter=\"url(#amethyst_magic_shadow)\">\n        <path d=\"M88 300 L80 188 L118 188 L152 136 L182 172 L212 118 L236 74 L256 44 L276 74 L300 118 L330 172 L360 136 L394 188 L432 188 L424 300 Q342 282 256 290 Q170 282 88 300 Z\" fill=\"url(#amethyst_magic_metal)\" stroke=\"#250B3B\" stroke-width=\"7.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M142 274 C174 256 208 266 236 284 C246 292 266 292 276 284 C304 266 338 256 370 274\" fill=\"none\" stroke=\"#E6BCFF\" stroke-opacity=\"0.56\" stroke-width=\"4.6\" stroke-linecap=\"round\"/>\n        <path d=\"M102 300 C148 308 200 316 256 316 C312 316 364 308 410 300 L400 328 H112 Z\" fill=\"url(#amethyst_magic_base)\" stroke=\"#250B3B\" stroke-width=\"6.2\" stroke-linejoin=\"round\"/>\n        <path d=\"M136 318 C174 326 214 332 256 332 C298 332 338 326 376 318\" fill=\"none\" stroke=\"#E6BCFF\" stroke-opacity=\"0.70\" stroke-width=\"4.4\" stroke-linecap=\"round\"/>\n      </g>\n    \n<g fill=\"none\" stroke=\"#E6BCFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M130 188 Q156 150 180 112\" stroke-width=\"4\" />\n<path d=\"M382 188 Q356 150 332 112\" stroke-width=\"4\" />\n<path d=\"M212 118 L236 76 L256 98 L276 76 L300 118\" stroke-width=\"4\" />\n<path d=\"M182 172 Q216 148 256 148 Q296 148 330 172\" stroke-width=\"4\" />\n<path d=\"M236 74 Q246 60 256 60 Q266 60 276 74\" stroke-width=\"4\" />\n</g>\n<path d=\"M80 181 L87 188 L80 195 L73 188 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M152 129 L159 136 L152 143 L145 136 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M182 166 L188 172 L182 178 L176 172 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M236 68 L242 74 L236 80 L230 74 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M256 33 L267 44 L256 55 L245 44 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M276 68 L282 74 L276 80 L270 74 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M330 166 L336 172 L330 178 L324 172 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M360 129 L367 136 L360 143 L353 136 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<path d=\"M432 181 L439 188 L432 195 L425 188 Z\" fill=\"#E6BCFF\" stroke=\"#250B3B\" stroke-width=\"4.1\" stroke-linejoin=\"round\"/>\n<circle cx=\"118\" cy=\"188\" r=\"9\" fill=\"url(#amethyst_magic_gem)\" stroke=\"#250B3B\" stroke-width=\"4.8\"/>\n<circle cx=\"394\" cy=\"188\" r=\"9\" fill=\"url(#amethyst_magic_gem)\" stroke=\"#250B3B\" stroke-width=\"4.8\"/>\n<path d=\"M256 222 L298 270 L256 334 L214 270 Z\" fill=\"url(#amethyst_magic_gem)\" stroke=\"#250B3B\" stroke-width=\"5.8\" stroke-linejoin=\"round\"/>\n<path d=\"M256 246 L276 270 L256 308 L236 270 Z\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.60\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/>\n\n    <g clip-path=\"url(#amethyst_magic_clip)\" pointer-events=\"none\">\n      <g filter=\"url(#amethyst_magic_magicGlow)\">\n        <g transform=\"rotate(-16 256 256)\">\n          <rect x=\"-420\" y=\"-80\" width=\"160\" height=\"720\" rx=\"80\" fill=\"url(#amethyst_magic_sweep)\" opacity=\"0.95\">\n            <animate attributeName=\"x\" values=\"-420;-420;560\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          </rect>\n          <rect x=\"-640\" y=\"-100\" width=\"100\" height=\"760\" rx=\"50\" fill=\"url(#amethyst_magic_sweepSoft)\" opacity=\"0.68\">\n            <animate attributeName=\"x\" values=\"-640;-640;520\" dur=\"7.8s\" begin=\"1.3s\" repeatCount=\"indefinite\"/>\n          </rect>\n        </g>\n      </g>\n      <g stroke-linecap=\"round\" fill=\"none\">\n        <path d=\"M38 188 C106 166 178 172 256 194 C334 216 400 220 472 192\" stroke=\"url(#amethyst_magic_ribbon)\" stroke-width=\"7\" opacity=\"0.90\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"-12 0;-12 0;16 0;-12 0\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.30;0.30;1;0.65;0.30\" dur=\"6.2s\" repeatCount=\"indefinite\"/>\n        </path>\n        <path d=\"M24 296 C92 270 170 276 256 304 C344 332 412 334 488 300\" stroke=\"url(#amethyst_magic_ribbon)\" stroke-width=\"8.8\" opacity=\"0.88\">\n          <animateTransform attributeName=\"transform\" type=\"translate\" values=\"16 0;16 0;-12 0;16 0\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n          <animate attributeName=\"opacity\" values=\"0.32;0.32;1;0.68;0.32\" dur=\"6.8s\" begin=\"0.55s\" repeatCount=\"indefinite\"/>\n        </path>\n      </g>\n    </g>\n    \n<g>\n    <g transform=\"translate(256 44)\" filter=\"url(#amethyst_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"7.2s\" begin=\"4.3s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"7.2s\" begin=\"4.3s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -60 C4.0 -26.4 4.0 -12.0 0 0\n               C-4.0 -12.0 -4.0 -26.4 0 -60\n               M40 0 C17.6 6.0 8.0 6.0 0 0\n               C8.0 -6.0 17.6 -6.0 40 0\n               M0 60 C-4.0 26.4 -4.0 12.0 0 0\n               C4.0 12.0 4.0 26.4 0 60\n               M-40 0 C-17.6 -6.0 -8.0 -6.0 0 0\n               C-8.0 6.0 -17.6 6.0 -40 0\"\n            fill=\"url(#amethyst_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"6.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(256 222)\" filter=\"url(#amethyst_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"5.8s\" begin=\"2.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -72 C4.6 -31.7 4.6 -14.4 0 0\n               C-4.6 -14.4 -4.6 -31.7 0 -72\n               M46 0 C20.2 7.2 9.2 7.2 0 0\n               C9.2 -7.2 20.2 -7.2 46 0\n               M0 72 C-4.6 31.7 -4.6 14.4 0 0\n               C4.6 14.4 4.6 31.7 0 72\n               M-46 0 C-20.2 -7.2 -9.2 -7.2 0 0\n               C-9.2 7.2 -20.2 7.2 -46 0\"\n            fill=\"url(#amethyst_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"7.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(118 188)\" filter=\"url(#amethyst_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.6s\" begin=\"3.0s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#amethyst_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    \n    <g transform=\"translate(394 188)\" filter=\"url(#amethyst_magic_softGlow)\" opacity=\"0.0\">\n      <animate attributeName=\"opacity\" values=\"0;0;0;1;0.72;0;0;0;0.95;0.35;0\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <animateTransform attributeName=\"transform\" additive=\"sum\" type=\"scale\"\n        values=\"0.55;0.55;0.55;1.18;0.94;0.55;0.55;0.55;1.08;0.86;0.55\" dur=\"6.5s\" begin=\"3.7s\" repeatCount=\"indefinite\"/>\n      <path d=\"M0 -32 C2.0 -14.1 2.0 -6.4 0 0\n               C-2.0 -6.4 -2.0 -14.1 0 -32\n               M20 0 C8.8 3.2 4.0 3.2 0 0\n               C4.0 -3.2 8.8 -3.2 20 0\n               M0 32 C-2.0 14.1 -2.0 6.4 0 0\n               C2.0 6.4 2.0 14.1 0 32\n               M-20 0 C-8.8 -3.2 -4.0 -3.2 0 0\n               C-4.0 3.2 -8.8 3.2 -20 0\"\n            fill=\"url(#amethyst_magic_sparkleCore)\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"3.8\" fill=\"#FFFFFF\" opacity=\"1\"/>\n    </g>\n    </g>\n</svg>"
		};
		/** Crown slots per layer, bottom first: a true 7→1 pyramid (28 total). */
		const ROW_CAPACITY = [
			7,
			6,
			5,
			4,
			3,
			2,
			1
		];
		/** Row size factor, tip first: crowns grow ~3% per layer going up. */
		const ROW_SCALE = [
			1.12,
			1.1,
			1.08,
			1.06,
			1.04,
			1.02,
			1
		];
		/** Vertical gap between layers' crown-bottom lines, × crownSize. */
		const ROW_GAP = .34;
		/** Small border-to-border gap between the bottom crowns and the pet box, × size. */
		const BOTTOM_CLEARANCE = .04;
		/** Horizontal gap between crowns in a layer, × that layer's crown size —
		* ~0.55 keeps the crowns near-touching (their artwork is ~0.55..0.61 of the
		* box wide, so they read as one piled-up row). */
		const H_SPACING = .55;
		/** Fallback visual band (fractions of the 512 viewBox) when bounds can't be measured. */
		const FALLBACK_TIER_BOUNDS = {
			top: .3,
			bottom: .68
		};
		const svgElementCache = /* @__PURE__ */ new Map();
		/** The parsed `<svg>` root for a tier, cloned per instance by <Crown>. */
		function cachedSvgElement(tierId) {
			let element = svgElementCache.get(tierId);
			if (element === void 0) {
				const source = CROWN_SVGS[tierId];
				const parsed = source !== void 0 ? parseSvgElement(source) : null;
				if (parsed !== null) {
					element = parsed;
					svgElementCache.set(tierId, parsed);
				} else element = null;
			}
			return element ?? null;
		}
		function parseSvgElement(source) {
			if (typeof DOMParser === "undefined") return null;
			try {
				const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
				if (root === null || root.namespaceURI !== "http://www.w3.org/2000/svg") return null;
				return nodeToElement(root);
			} catch {
				return null;
			}
		}
		/** DOM node → React element (attributes pass through verbatim, e.g. SMIL). */
		function nodeToElement(node) {
			if (node.nodeType === 3) {
				const text = (node.textContent ?? "").trim();
				return text === "" ? null : text;
			}
			if (node.nodeType !== 1) return null;
			const element = node;
			const props = {};
			for (let i = 0; i < element.attributes.length; i += 1) {
				const attr = element.attributes[i];
				if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) continue;
				props[attr.name] = attr.value;
			}
			const children = [];
			for (const child of Array.from(element.childNodes)) {
				const converted = nodeToElement(child);
				if (converted !== null) children.push(converted);
			}
			return (0, react.createElement)(element.tagName, props, ...children);
		}
		const tierBoundsCache = /* @__PURE__ */ new Map();
		/**
		* Where the crown artwork actually sits inside its 512×512 box. Measured
		* once per tier from the real asset (the `g#crown` body group); tiers have
		* different heights, which drives how much the rows press into each other.
		*/
		function tierVisualBounds(tier) {
			const cached = tierBoundsCache.get(tier);
			if (cached !== void 0) return cached;
			let bounds = FALLBACK_TIER_BOUNDS;
			const source = CROWN_SVGS[crownLevel(tier).id];
			if (source !== void 0 && typeof document !== "undefined") try {
				const host = document.createElement("div");
				host.setAttribute("aria-hidden", "true");
				host.style.cssText = "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;";
				host.innerHTML = source;
				document.body.appendChild(host);
				const group = host.querySelector("svg g[id=\"crown\"]") ?? host.querySelector("svg");
				const box = group !== null && typeof group.getBBox === "function" ? group.getBBox() : null;
				const viewBox = source.match(/viewBox="[^"]*\s+(\d+\.?\d*)\s+(\d+\.?\d*)"/);
				const height = viewBox !== null ? Number(viewBox[2]) : 512;
				if (box !== null && box.height > 0) bounds = {
					top: box.y / height,
					bottom: (box.y + box.height) / height
				};
				host.remove();
			} catch {}
			tierBoundsCache.set(tier, bounds);
			return bounds;
		}
		/** Deterministic small hash for a crown key (jitter must be stable). */
		function keyHash(key) {
			let hash = 0;
			for (let i = 0; i < key.length; i += 1) hash = hash * 31 + key.charCodeAt(i) | 0;
			return Math.abs(hash);
		}
		/**
		* Place crown counts into a bottom-up 7→1 pyramid. Higher tiers reserve the
		* lower layers first; each layer is then ordered low→high so its strongest
		* crown sits on the right. Within one tier, older crowns reserve lower rows
		* while newer crowns rise to the current top row and render on its left.
		* A crafted crown is placed after ordinary crowns of the same tier so its
		* inherited node visibly travels toward the row's right edge.
		*/
		function layoutCrownPyramid(counts, crownSize, keyOverride = EMPTY_KEY_MAP) {
			const items = [];
			for (let tier = 0; tier < CROWN_LEVEL_COUNT; tier += 1) {
				const count = Math.max(0, Math.round(counts[tier] ?? 0));
				for (let i = 0; i < count; i += 1) {
					const natural = `${tier}:${i}`;
					items.push({
						key: keyOverride.get(natural) ?? natural,
						tier,
						index: i,
						crafted: keyOverride.has(natural)
					});
				}
			}
			items.sort((a, b) => b.tier - a.tier || a.index - b.index);
			const capacity = ROW_CAPACITY.reduce((sum, n) => sum + n, 0);
			const overflow = Math.max(0, items.length - capacity);
			const shown = items.slice(0, capacity);
			const slots = [];
			let cursor = 0;
			const layers = usedRows(shown.length);
			for (let layer = 0; layer < layers; layer += 1) {
				const layerCount = Math.min(ROW_CAPACITY[layer], shown.length - cursor);
				const layerItems = shown.slice(cursor, cursor + layerCount).sort((a, b) => {
					if (a.tier !== b.tier) return a.tier - b.tier;
					if (a.crafted !== b.crafted) return a.crafted ? 1 : -1;
					return a.crafted ? a.index - b.index : b.index - a.index;
				});
				const size = crownSize * ROW_SCALE[layers - 1 - layer];
				const bottomY = -(BOTTOM_CLEARANCE + layer * ROW_GAP) * crownSize;
				for (let j = 0; j < layerItems.length; j += 1) {
					const item = layerItems[j];
					const hash = keyHash(item.key);
					const bounds = tierVisualBounds(item.tier);
					const rot = (hash % 2 === 0 ? -1 : 1) * (2 + Math.floor(hash / 8) % 3);
					const jitterX = (Math.floor(hash / 16) % 9 - 4) * .015 * size;
					const jitterY = (Math.floor(hash / 32) % 5 - 2) * .008 * size;
					slots.push({
						key: item.key,
						tier: item.tier,
						x: (j - (layerItems.length - 1) / 2) * H_SPACING * size + jitterX,
						y: bottomY - bounds.bottom * size + jitterY,
						size,
						rot
					});
				}
				cursor += layerCount;
			}
			return {
				slots,
				overflow
			};
		}
		function usedRows(count) {
			if (count <= 0) return 0;
			let rows = 0;
			let rest = count;
			for (let row = 0; row < 7 && rest > 0; row += 1) {
				rest -= ROW_CAPACITY[row];
				rows += 1;
			}
			return rows;
		}
		const EMPTY_KEY_MAP = /* @__PURE__ */ new Map();
		const EMPTY_SET = /* @__PURE__ */ new Set();
		/**
		* Diff two count snapshots and decide key inheritance: when crowns of tier L
		* crafted into tier L+1, the new tier-L+1 crowns take over the DOM keys of
		* the vanished tier-L crowns (highest indices first), so the same node
		* visibly travels from the old cluster to its new pyramid slot.
		*/
		function planMerge(prev, now) {
			const claims = /* @__PURE__ */ new Map();
			const consumed = /* @__PURE__ */ new Set();
			for (let level = CROWN_LEVEL_COUNT - 1; level >= 1; level -= 1) {
				const fresh = Math.max(0, now[level] - prev[level]);
				if (fresh === 0) continue;
				const pool = [];
				for (let lower = level; lower >= 0; lower -= 1) {
					const vanished = Math.max(0, prev[lower] - now[lower]);
					for (let i = prev[lower] - 1; i >= prev[lower] - vanished; i -= 1) {
						const key = `${lower}:${i}`;
						if (!consumed.has(key)) pool.push(key);
					}
				}
				for (let i = now[level] - 1; i >= now[level] - fresh; i -= 1) {
					const heir = pool.shift();
					if (heir !== void 0) {
						claims.set(`${level}:${i}`, heir);
						consumed.add(heir);
					}
				}
			}
			const vanished = [];
			const freshKeys = [];
			for (let level = 0; level < CROWN_LEVEL_COUNT; level += 1) {
				const gone = Math.max(0, prev[level] - now[level]);
				for (let i = prev[level] - 1; i >= prev[level] - gone; i -= 1) {
					const key = `${level}:${i}`;
					if (!consumed.has(key)) vanished.push(key);
				}
				const fresh = Math.max(0, now[level] - prev[level]);
				for (let i = now[level] - 1; i >= now[level] - fresh; i -= 1) {
					const key = `${level}:${i}`;
					if (!claims.has(key)) freshKeys.push(key);
				}
			}
			return {
				claims,
				vanished,
				freshKeys
			};
		}
		function sameCounts(a, b) {
			const length = Math.max(a.length, b.length);
			for (let i = 0; i < length; i += 1) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
			return true;
		}
		const EMPTY_FX = {
			stamp: 0,
			ghosts: [],
			merged: EMPTY_SET,
			fresh: EMPTY_SET,
			flash: null
		};
		/**
		* Render the crown pile for a count snapshot and animate it on change:
		* crowns keep their keys across merges (the crafted crown inherits a
		* vanished one's key and slides up), layout changes transition, consumed
		* crowns render as shrinking ghosts, and a flash bursts at the merge point.
		*/
		function useCrownPyramid(counts, crownSize) {
			const now = new Array(CROWN_LEVEL_COUNT).fill(0);
			for (let i = 0; i < Math.min(CROWN_LEVEL_COUNT, counts.length); i += 1) now[i] = Math.max(0, Math.round(counts[i] ?? 0));
			const countsKey = now.join(",");
			const prevCountsRef = (0, react.useRef)(null);
			const keyMapRef = (0, react.useRef)(EMPTY_KEY_MAP);
			const fxPlanRef = (0, react.useRef)(null);
			const lastSlotsRef = (0, react.useRef)([]);
			const fxTimerRef = (0, react.useRef)(void 0);
			const [fx, setFx] = (0, react.useState)(EMPTY_FX);
			const prev = prevCountsRef.current;
			if (prev !== null && !sameCounts(prev, now)) {
				const plan = planMerge(prev, now);
				keyMapRef.current = plan.claims.size > 0 ? new Map(plan.claims) : EMPTY_KEY_MAP;
				fxPlanRef.current = plan;
			}
			prevCountsRef.current = now;
			const { slots, overflow } = layoutCrownPyramid(now, crownSize, keyMapRef.current);
			(0, react.useEffect)(() => {
				const plan = fxPlanRef.current;
				fxPlanRef.current = null;
				if (plan === null) return;
				const ghosts = [];
				for (const key of plan.vanished) {
					const slot = lastSlotsRef.current.find((candidate) => candidate.key === key);
					if (slot !== void 0) ghosts.push(slot);
				}
				let flash = null;
				if (ghosts.length > 0) {
					let sumX = 0;
					let sumY = 0;
					for (const ghost of ghosts) {
						sumX += ghost.x;
						sumY += ghost.y + ghost.size * .44;
					}
					flash = {
						x: sumX / ghosts.length,
						y: sumY / ghosts.length
					};
				}
				const stamp = Date.now();
				setFx({
					stamp,
					ghosts,
					merged: new Set(plan.claims.values()),
					fresh: new Set(plan.freshKeys),
					flash
				});
				if (fxTimerRef.current !== void 0) window.clearTimeout(fxTimerRef.current);
				fxTimerRef.current = window.setTimeout(() => {
					fxTimerRef.current = void 0;
					setFx((current) => current.stamp === stamp ? EMPTY_FX : current);
				}, 780);
			}, [countsKey]);
			(0, react.useEffect)(() => {
				lastSlotsRef.current = slots;
			});
			(0, react.useEffect)(() => () => {
				if (fxTimerRef.current !== void 0) window.clearTimeout(fxTimerRef.current);
			}, []);
			const crowns = [];
			for (const slot of slots) crowns.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PyramidCrown, {
				dataKey: slot.key,
				x: slot.x,
				y: slot.y,
				size: slot.size,
				rot: slot.rot,
				tier: slot.tier,
				merged: fx.merged.has(slot.key),
				fresh: fx.fresh.has(slot.key)
			}, slot.key));
			for (const ghost of fx.ghosts) crowns.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsg-crown dsg-crown-ghost",
				style: {
					left: "50%",
					top: 0,
					transform: `translate(calc(-50% + ${ghost.x.toFixed(1)}px), ${ghost.y.toFixed(1)}px)`,
					"--dsg-rot": `${ghost.rot.toFixed(1)}deg`
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Crown, {
					level: ghost.tier,
					size: ghost.size
				})
			}, `ghost:${ghost.key}`));
			let flash = null;
			if (fx.flash !== null) flash = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dsg-crown-flash",
				style: {
					left: "50%",
					top: 0,
					transform: `translate(calc(-50% + ${fx.flash.x.toFixed(1)}px), ${fx.flash.y.toFixed(1)}px)`
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {})]
			}, `flash-${fx.stamp}`);
			const pileTop = slots.length > 0 ? Math.min(...slots.map((slot) => slot.y)) - crownSize * .12 : 0;
			return {
				crowns,
				flash,
				overflow,
				pileTop
			};
		}
		/**
		* One positioned crown in the pile. Memoized on primitive props so an app
		* re-render (typing in the popover, toggling a flag) that leaves the pile
		* untouched skips reconciling the heavy asset SVGs entirely.
		*/
		const PyramidCrown = (0, react.memo)(function PyramidCrown(props) {
			const { dataKey, x, y, size, rot, tier, merged, fresh } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-tier": tier,
				"data-key": dataKey,
				className: `dsg-crown${tier >= 5 ? " dsg-crown-magic" : ""}${merged ? " dsg-crown-merged" : ""}${fresh ? " dsg-crown-in" : ""}`,
				style: {
					left: "50%",
					top: 0,
					transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)`,
					"--dsg-rot": `${rot.toFixed(1)}deg`
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Crown, {
					level: tier,
					size
				})
			});
		});
		/** One crown of a given tier, `size` px tall, using the asset artwork. */
		const Crown = (0, react.memo)(function Crown(props) {
			const { level, size, style } = props;
			const svg = cachedSvgElement(crownLevel(level).id);
			if (svg === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				viewBox: "0 0 512 512",
				width: size,
				height: size,
				"aria-hidden": true,
				style
			});
			return (0, react.cloneElement)(svg, {
				width: size,
				height: size,
				"aria-hidden": true,
				style
			});
		});
		/** Mini crown cell for room member rows: the member's top tier + count. */
		function MiniCrown(props) {
			const { counts, size, style } = props;
			const cap = props.cap ?? 3;
			let top = -1;
			for (let i = CROWN_LEVEL_COUNT - 1; i >= 0; i -= 1) if (counts[i] > 0) {
				top = i;
				break;
			}
			if (top < 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style });
			CROWN_LEVELS[top];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: top >= 5 ? "dsg-mini-crown dsg-crown-magic" : "dsg-mini-crown",
				"data-tier": top,
				style: {
					...style,
					"--dsg-rot": "-3deg"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Crown, {
					level: top,
					size
				}), counts[top] > cap && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("em", {
					className: "dsg-mini-crown-count",
					children: ["×", counts[top]]
				})]
			});
		}
		//#endregion
		//#region src/client/RoomPanel.tsx
		/**
		* Room panel — browse the game server's public rooms, create a room (public
		* or invite-only), join by code, leave, and list members with their pets
		* (custom pet image or mini whale) + crowns + nickname + token count + phase.
		* @module @kasidia/dsh-games/client/RoomPanel
		*/
		/** Mini pet cell for one room member (custom image, or whale + crowns). */
		function MemberPet(props) {
			const { member, size } = props;
			if (member.petUrl !== void 0 && member.petUrl !== "") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsg-member-whale",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					className: "dsg-member-pet",
					src: member.petUrl,
					alt: "",
					style: {
						width: size,
						height: size
					}
				})
			});
			const hasCrowns = member.crowns.some((count) => count > 0);
			if (!hasCrowns && member.hats > 0) {
				const shown = Math.min(member.hats, 3);
				const hatSize = Math.max(8, Math.round(size * .3));
				const hats = [];
				for (let i = 0; i < shown; i += 1) {
					const x = (i - (shown - 1) / 2) * hatSize * .55;
					const y = -hatSize * .45;
					hats.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							position: "absolute",
							left: "50%",
							top: 0,
							transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)`
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PartyHat, {
							color: HAT_COLORS[i % HAT_COLORS.length],
							size: hatSize
						})
					}, i));
				}
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsg-member-whale",
					children: [hats, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeepSeekWhale, {
						size,
						variant: member.petVariant
					})]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dsg-member-whale",
				children: [hasCrowns && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MiniCrown, {
					counts: member.crowns,
					size: Math.max(10, Math.round(size * .55))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeepSeekWhale, {
					size,
					variant: member.petVariant
				})]
			});
		}
		/** One public-room row in the room list. */
		function RoomListRow(props) {
			const { t, room, busy } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsg-room-row",
				"data-testid": "games-room-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsg-room-row-main",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsg-room-row-name",
						children: room.name !== "" ? room.name : room.code
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsg-room-row-meta",
						children: [
							room.code,
							" · ",
							room.members.length,
							" ",
							t("room.people")
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsg-btn-ghost",
					disabled: busy,
					onClick: () => props.onJoin(room.code),
					children: t("room.join")
				})]
			});
		}
		/** The create/join/member-list UI. */
		function RoomPanel(props) {
			const { t, room, own, error } = props;
			const [mode, setMode] = (0, react.useState)("list");
			const [publicRooms, setPublicRooms] = (0, react.useState)([]);
			const [listBusy, setListBusy] = (0, react.useState)(false);
			const [listNote, setListNote] = (0, react.useState)(null);
			const [codeDraft, setCodeDraft] = (0, react.useState)("");
			const [roomNameDraft, setRoomNameDraft] = (0, react.useState)("");
			const [roomPublic, setRoomPublic] = (0, react.useState)(true);
			const [copied, setCopied] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const busyRef = (0, react.useRef)(false);
			const refreshList = (0, react.useCallback)(async () => {
				setListBusy(true);
				setListNote(null);
				try {
					const result = await gameServerApi.listRooms(own.serverUrl, own.authToken);
					setPublicRooms(result.rooms);
					if (result.rooms.length === 0) setListNote(t("room.listEmpty"));
				} catch {
					setListNote(t("room.listError"));
				} finally {
					setListBusy(false);
				}
			}, [
				own.serverUrl,
				own.authToken,
				t
			]);
			(0, react.useEffect)(() => {
				if (room === null) refreshList();
			}, [
				room === null,
				own.serverUrl,
				refreshList
			]);
			const runBusy = async (operation) => {
				if (busyRef.current) return;
				busyRef.current = true;
				setBusy(true);
				try {
					await operation();
				} finally {
					busyRef.current = false;
					setBusy(false);
				}
			};
			const doCreate = () => {
				runBusy(() => props.onCreate({
					name: roomNameDraft.trim() || void 0,
					public: roomPublic
				}));
			};
			const doJoin = () => {
				const code = normalizeRoomCode(codeDraft);
				if (code === "") return;
				runBusy(() => props.onJoin(code));
			};
			const copyRoom = async () => {
				if (room === null) return;
				try {
					await navigator.clipboard.writeText(`${room.base}  房间代码 ${room.code}`);
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1500);
				} catch {}
			};
			if (room === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-testid": "games-room-empty",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsg-row",
						style: {
							justifyContent: "space-between",
							marginBottom: 10
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("room.title") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-row",
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("room.list") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsg-btn-ghost",
								disabled: listBusy,
								onClick: () => {
									refreshList();
								},
								children: t("room.refresh")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-room-list",
							"data-testid": "games-room-list",
							children: [publicRooms.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoomListRow, {
								t,
								room: entry,
								busy: busy || listBusy,
								onJoin: (code) => {
									runBusy(() => props.onJoin(code));
								}
							}, entry.code)), publicRooms.length === 0 && listNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsg-hint",
								children: listNote
							})]
						})]
					}),
					mode === "list" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("room.create") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsg-input",
								value: roomNameDraft,
								maxLength: 24,
								placeholder: t("room.namePlaceholder"),
								onChange: (e) => setRoomNameDraft(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsg-row",
								style: { marginTop: 4 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsg-radio",
									"data-on": roomPublic,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: "dsg-room-visibility",
										checked: roomPublic,
										onChange: () => setRoomPublic(true)
									}), t("room.public")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsg-radio",
									"data-on": !roomPublic,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: "dsg-room-visibility",
										checked: !roomPublic,
										onChange: () => setRoomPublic(false)
									}), t("room.inviteOnly")]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsg-hint",
								children: roomPublic ? t("room.publicHint") : t("room.inviteHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsg-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsg-btn",
									disabled: busy,
									onClick: doCreate,
									"data-testid": "games-room-create",
									children: t("room.create")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsg-btn-ghost",
									"data-testid": "games-room-mode-join",
									onClick: () => setMode("join"),
									children: t("room.joinByCode")
								})]
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							htmlFor: "dsg-room-code",
							children: t("room.code")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "dsg-room-code",
							className: "dsg-input",
							value: codeDraft,
							maxLength: 8,
							placeholder: t("room.codePlaceholder"),
							onChange: (e) => setCodeDraft(e.target.value.toUpperCase()),
							onKeyDown: (e) => {
								if (e.key === "Enter" && !busy) doJoin();
							}
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsg-btn",
							disabled: busy || codeDraft.trim() === "",
							onClick: doJoin,
							"data-testid": "games-room-join",
							children: t("room.join")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsg-btn-ghost",
							onClick: () => setMode("list"),
							children: t("room.create")
						})]
					})] }),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsg-error",
						"data-testid": "games-room-error",
						children: t("room.joinError", { error })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsg-hint",
						children: t("room.empty")
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-testid": "games-room-joined",
				"data-room-code": room.code,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-row",
						style: {
							justifyContent: "space-between",
							marginBottom: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: room.name !== "" ? room.name : t("room.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsg-btn-danger dsg-btn-ghost",
							onClick: props.onLeave,
							"data-testid": "games-room-leave",
							children: t("room.leave")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-room-info",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-row",
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("room.joined", { code: room.code }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsg-room-visibility-tag",
									"data-public": room.public,
									children: room.public ? t("room.public") : t("room.inviteOnly")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 11,
										opacity: .7,
										display: "block"
									},
									children: room.base
								})
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsg-btn-ghost dsg-room-copy",
								onClick: () => {
									copyRoom();
								},
								children: copied ? t("room.copied") : t("room.copy")
							})]
						}), room.offline && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsg-error",
							"data-testid": "games-room-offline",
							children: t("room.offline")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsg-hint",
						style: { marginTop: 0 },
						children: t("room.shareHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-members",
						"data-testid": "games-room-members",
						children: [room.members.map((member) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: member.memberId === own.memberId ? "dsg-member dsg-member-you" : "dsg-member",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemberPet, {
									member,
									size: 30
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsg-member-meta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsg-member-name",
										children: [member.nickname, member.memberId === own.memberId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												opacity: .6,
												fontWeight: 400
											},
											children: [
												"（",
												t("room.you"),
												"）"
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsg-member-sub",
										children: [
											formatTokens(member.tokens),
											" · ",
											t("pet.crowns", { n: member.crowns.reduce((sum, count) => sum + count, 0) })
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsg-member-dot",
									"data-phase": member.phase,
									title: member.phase
								})
							]
						}, member.memberId)), room.members.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsg-hint",
							children: t("room.empty")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/chat.tsx
		/** How long a chat bubble stays on screen (matches the server cooldown). */
		const CHAT_BUBBLE_MS = 4e3;
		/** The hover hint: "click to chat". Shown above the bottom label bar. */
		function ChatHint(props) {
			const { t, disabled, onClick } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsg-chat-hint",
				"data-disabled": disabled,
				title: disabled ? t("chat.cooldown") : t("chat.hint"),
				"aria-label": t("chat.hint"),
				onPointerDown: (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!disabled) onClick();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": true,
					children: "💬"
				}), disabled ? t("chat.cooldown") : t("chat.hint")]
			});
		}
		/** The one-line composer (input + send), Enter submits. */
		function ChatComposer(props) {
			const { t, value, disabled, onChange, onSend, onClose } = props;
			const send = () => {
				if (!disabled && value.trim() !== "") onSend();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dsg-chat-composer",
				onPointerDown: (event) => event.stopPropagation(),
				onClick: (event) => event.stopPropagation(),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "dsg-chat-input",
						value,
						maxLength: 20,
						placeholder: t("chat.placeholder"),
						"aria-label": t("chat.placeholder"),
						autoFocus: true,
						onChange: (event) => onChange(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								event.stopPropagation();
								onClose();
								return;
							}
							if (event.key === "Enter") send();
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsg-btn",
						disabled: disabled || value.trim() === "",
						onClick: send,
						children: t("chat.send")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsg-chat-close",
						title: t("chat.close"),
						"aria-label": t("chat.close"),
						onClick: onClose,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": true,
							children: "×"
						})
					})
				]
			});
		}
		/** A floating message bubble. Player identity stays in the pet label. */
		function ChatBubble(props) {
			const { text, leaving } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `dsg-chat-bubble${leaving === true ? " dsg-chat-leaving" : ""}`,
				"aria-live": "polite",
				children: text
			});
		}
		//#endregion
		//#region src/client/progress.ts
		function crownRule(rules) {
			const crown = rules?.crown ?? defaultGameRules().crown;
			const tokenStep = crown.tokenStep;
			const base = crown.base;
			return {
				tokenStep,
				base,
				key: `${tokenStep}:${base}`
			};
		}
		function crownsAtTokens(tokens, rules) {
			const rule = crownRule(rules);
			return crownCounts(crownUnits(tokens, rule.tokenStep), rule.base);
		}
		function createTokenProgressBaseline(tokens, rules) {
			const rule = crownRule(rules);
			return {
				tokens,
				crowns: crownCounts(crownUnits(tokens, rule.tokenStep), rule.base),
				ruleKey: rule.key
			};
		}
		function settleTokenProgress(previous, nextTokens, rules) {
			const rule = crownRule(rules);
			const previousCrowns = previous.ruleKey === rule.key ? previous.crowns : crownCounts(crownUnits(previous.tokens, rule.tokenStep), rule.base);
			const nextCrowns = crownCounts(crownUnits(nextTokens, rule.tokenStep), rule.base);
			const baseline = {
				tokens: nextTokens,
				crowns: nextCrowns,
				ruleKey: rule.key
			};
			const delta = nextTokens - previous.tokens;
			if (delta <= 0) return {
				baseline,
				delta: 0,
				crownTier: null
			};
			for (let tier = nextCrowns.length - 1; tier >= 0; tier -= 1) if (nextCrowns[tier] > (previousCrowns[tier] ?? 0)) return {
				baseline,
				delta,
				crownTier: tier
			};
			return {
				baseline,
				delta,
				crownTier: null
			};
		}
		//#endregion
		//#region src/client/activity.ts
		/** One shared definition of the visual "active" state for every pet. */
		function isPetActive(phase, tokenStreamActive) {
			return tokenStreamActive || phase === "waiting" || phase === "thinking" || phase === "tool";
		}
		//#endregion
		//#region src/client/scene.tsx
		/**
		* Room pet scene — the other members' floating pets around your anchor pet.
		* Every client arranges the members it sees on its own screen, so the
		* arrangement preference and the free-drag positions live in localStorage
		* (per browser), not on the game server.
		*
		* Modes:
		* - `free`   — fully manual; each member keeps its dragged position.
		* - `row`    — horizontal line centered on the anchor pet.
		* - `column` — vertical line centered on the anchor pet.
		* - `grid`   — automatic rows × columns layout beside the anchor pet.
		* - `orbit`  — ring around the anchor pet.
		* @module @kasidia/dsh-games/client/scene
		*/
		/** All modes in UI order. */
		const ARRANGE_MODES = [
			"free",
			"row",
			"column",
			"grid",
			"orbit"
		];
		/** Sort choices in UI order. */
		const SCENE_SORTS = [
			"tokens-desc",
			"tokens-asc",
			"joined"
		];
		/** localStorage key for the scene prefs. */
		const SCENE_KEY = "dsh.games.scene.v2";
		/** Stable local-only sort for room snapshots. */
		function sortRoomMembers(members, sort) {
			return [...members].sort((left, right) => {
				return (sort === "tokens-desc" ? right.tokens - left.tokens : sort === "tokens-asc" ? left.tokens - right.tokens : 0) || left.joinedAt - right.joinedAt || left.memberId.localeCompare(right.memberId);
			});
		}
		/** Keep a pet's full square hit area inside the current viewport. */
		function clampPetPos(pos, size, viewport) {
			return {
				right: Math.min(Math.max(0, Math.round(pos.right)), Math.max(0, viewport.width - size)),
				bottom: Math.min(Math.max(0, Math.round(pos.bottom)), Math.max(0, viewport.height - size))
			};
		}
		/**
		* Compute every member's position for the current mode. The anchor keeps its
		* own spot in every mode; `members` must include the anchor. All member
		* positions are clamped inside the viewport (a pet that would leave the
		* screen sticks to the nearest edge instead of jumping to the opposite one).
		*/
		function arrangeScene(mode, members, anchor, spacing, free, viewport, gridColumns = 3, gridRows = 3) {
			const exact = tryArrangeScene(mode, members, anchor, spacing, free, viewport, gridColumns, gridRows);
			if (exact !== void 0) return exact;
			if (mode === "grid") {
				const columns = normalizeGridCount(gridColumns, 3);
				const memberCount = members.filter((member) => member.id !== anchor.id).length;
				const requiredRows = Math.ceil(memberCount / columns);
				const adaptiveRows = Math.max(normalizeGridCount(gridRows, 3), requiredRows);
				if (adaptiveRows <= 8) {
					const adaptive = tryArrangeScene(mode, members, anchor, spacing, free, viewport, columns, adaptiveRows);
					if (adaptive !== void 0) return adaptive;
				}
			}
			return tryArrangeScene(mode, members, anchor, 0, free, viewport, gridColumns, gridRows) ?? overflowLinearPositions(members, anchor);
		}
		/**
		* Attempt a complete layout with the requested edge gap. `undefined` means
		* at least one pet cannot fit inside the viewport without overlap.
		*/
		function tryArrangeScene(mode, members, anchor, spacing, free, viewport, gridColumns = 3, gridRows = 3) {
			if (anchor.size > viewport.width || anchor.size > viewport.height) return void 0;
			const safeAnchor = {
				...anchor,
				...clampPetPos(anchor, anchor.size, viewport)
			};
			const ordered = members.some((member) => member.id === anchor.id) ? members : [anchor, ...members];
			const out = { [anchor.id]: {
				right: safeAnchor.right,
				bottom: safeAnchor.bottom
			} };
			const others = ordered.filter((member) => member.id !== anchor.id);
			const gap = Math.max(0, spacing);
			if (mode === "free") {
				const defaults = linearPositions(ordered, safeAnchor, gap, false);
				others.forEach((member) => {
					const raw = free[member.id] ?? defaults[member.id];
					if (raw === void 0) return;
					out[member.id] = raw;
				});
				return resolveCollisions(out, others, safeAnchor, gap, viewport);
			}
			if (mode === "grid") return gridPositions(others, safeAnchor, gap, normalizeGridCount(gridColumns, 3), normalizeGridCount(gridRows, 3), viewport);
			if (mode === "row") {
				Object.assign(out, linearPositions(ordered, safeAnchor, gap, false));
				return resolveCollisions(out, others, safeAnchor, gap, viewport);
			}
			if (mode === "column") {
				Object.assign(out, linearPositions(ordered, safeAnchor, gap, true));
				return resolveCollisions(out, others, safeAnchor, gap, viewport);
			}
			const n = others.length;
			if (n > 0) {
				const maxMemberSize = Math.max(...others.map((member) => member.size));
				const radius = Math.max(safeAnchor.size / 2 + maxMemberSize / 2 + gap, Math.ceil((maxMemberSize + gap) * n / (2 * Math.PI)));
				const cx = viewport.width - safeAnchor.right - safeAnchor.size / 2;
				const cy = safeAnchor.bottom + safeAnchor.size / 2;
				others.forEach((member, index) => {
					const theta = -Math.PI / 2 + 2 * Math.PI * index / n;
					const mx = cx + radius * Math.cos(theta);
					const my = cy - radius * Math.sin(theta);
					out[member.id] = {
						right: Math.round(viewport.width - mx - member.size / 2),
						bottom: Math.round(my - member.size / 2)
					};
				});
			}
			return resolveCollisions(out, others, safeAnchor, gap, viewport);
		}
		/** Whether a preference change can produce a complete collision-free layout. */
		function canArrangeScene(prefs, members, anchor, viewport) {
			return tryArrangeScene(prefs.mode, members, anchor, prefs.spacing, prefs.free, viewport, prefs.gridColumns, prefs.gridRows) !== void 0;
		}
		/** Linear row/column positions whose visual order matches the member order. */
		function linearPositions(members, anchor, gap, vertical) {
			const out = { [anchor.id]: {
				right: anchor.right,
				bottom: anchor.bottom
			} };
			const others = members.filter((member) => member.id !== anchor.id);
			let cursor = (vertical ? anchor.bottom : anchor.right) + anchor.size + gap;
			for (let index = others.length - 1; index >= 0; index -= 1) {
				const member = others[index];
				out[member.id] = vertical ? {
					right: Math.round(anchor.right + (anchor.size - member.size) / 2),
					bottom: Math.round(cursor)
				} : {
					right: Math.round(cursor),
					bottom: Math.round(anchor.bottom + (anchor.size - member.size) / 2)
				};
				cursor += member.size + gap;
			}
			return out;
		}
		function overflowLinearPositions(members, anchor) {
			return linearPositions(members, anchor, 0, false);
		}
		function gridPositions(members, anchor, gap, columns, rows, viewport) {
			const out = { [anchor.id]: {
				right: anchor.right,
				bottom: anchor.bottom
			} };
			if (members.length === 0) return out;
			if (members.length > columns * rows) return void 0;
			const usedColumns = Math.min(columns, members.length);
			const usedRows = Math.ceil(members.length / columns);
			const cellSize = Math.max(...members.map((member) => member.size));
			const blockWidth = usedColumns * cellSize + Math.max(0, usedColumns - 1) * gap;
			const blockHeight = usedRows * cellSize + Math.max(0, usedRows - 1) * gap;
			if (blockWidth > viewport.width || blockHeight > viewport.height) return void 0;
			const anchorRect = {
				left: viewport.width - anchor.right - anchor.size,
				top: viewport.height - anchor.bottom - anchor.size,
				width: anchor.size,
				height: anchor.size
			};
			const maxLeft = viewport.width - blockWidth;
			const maxTop = viewport.height - blockHeight;
			const nearTop = Math.min(Math.max(0, anchorRect.top), maxTop);
			const nearLeft = Math.min(Math.max(0, anchorRect.left), maxLeft);
			const origin = [
				{
					left: anchorRect.left - gap - blockWidth,
					top: nearTop
				},
				{
					left: nearLeft,
					top: anchorRect.top - gap - blockHeight
				},
				{
					left: anchorRect.left + anchorRect.width + gap,
					top: nearTop
				},
				{
					left: nearLeft,
					top: anchorRect.top + anchorRect.height + gap
				},
				{
					left: 0,
					top: 0
				},
				{
					left: maxLeft,
					top: 0
				},
				{
					left: 0,
					top: maxTop
				},
				{
					left: maxLeft,
					top: maxTop
				}
			].find((candidate) => {
				if (candidate.left < 0 || candidate.top < 0 || candidate.left > maxLeft || candidate.top > maxTop) return false;
				return !screenRectsOverlap({
					...candidate,
					width: blockWidth,
					height: blockHeight
				}, anchorRect, gap);
			});
			if (origin === void 0) return void 0;
			members.forEach((member, index) => {
				const column = index % columns;
				const row = Math.floor(index / columns);
				const left = origin.left + column * (cellSize + gap) + (cellSize - member.size) / 2;
				const top = origin.top + row * (cellSize + gap) + (cellSize - member.size) / 2;
				out[member.id] = {
					right: Math.round(viewport.width - left - member.size),
					bottom: Math.round(viewport.height - top - member.size)
				};
			});
			return out;
		}
		function screenRectsOverlap(left, right, gap) {
			return left.left < right.left + right.width + gap && left.left + left.width + gap > right.left && left.top < right.top + right.height + gap && left.top + left.height + gap > right.top;
		}
		function overlaps(left, right, gap) {
			return left.pos.right < right.pos.right + right.size + gap && left.pos.right + left.size + gap > right.pos.right && left.pos.bottom < right.pos.bottom + right.size + gap && left.pos.bottom + left.size + gap > right.pos.bottom;
		}
		function nearestFreePosition(preferred, member, occupied, gap, viewport) {
			const clamped = clampPetPos(preferred, member.size, viewport);
			const rights = /* @__PURE__ */ new Set([
				clamped.right,
				0,
				Math.max(0, viewport.width - member.size)
			]);
			const bottoms = /* @__PURE__ */ new Set([
				clamped.bottom,
				0,
				Math.max(0, viewport.height - member.size)
			]);
			for (const other of occupied) {
				rights.add(other.pos.right + other.size + gap);
				rights.add(other.pos.right - member.size - gap);
				bottoms.add(other.pos.bottom + other.size + gap);
				bottoms.add(other.pos.bottom - member.size - gap);
			}
			let best;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (const right of rights) for (const bottom of bottoms) {
				const candidate = clampPetPos({
					right,
					bottom
				}, member.size, viewport);
				const placed = {
					...member,
					pos: candidate
				};
				if (occupied.some((other) => overlaps(placed, other, gap))) continue;
				const distance = (candidate.right - clamped.right) ** 2 + (candidate.bottom - clamped.bottom) ** 2;
				if (distance < bestDistance) {
					best = candidate;
					bestDistance = distance;
				}
			}
			return best;
		}
		function placeWithoutOverlap(preferred, member, occupied, gap, viewport) {
			return nearestFreePosition(preferred, member, occupied, gap, viewport);
		}
		/** Clamp and de-overlap members while preserving the ordered members first. */
		function resolveCollisions(out, others, anchor, gap, viewport) {
			const resolved = { [anchor.id]: clampPetPos(anchor, anchor.size, viewport) };
			const occupied = [{
				id: anchor.id,
				size: anchor.size,
				pos: clampPetPos(anchor, anchor.size, viewport)
			}];
			for (const member of others) {
				const pos = out[member.id];
				if (pos === void 0) continue;
				const placed = placeWithoutOverlap(pos, member, occupied, gap, viewport);
				if (placed === void 0) return void 0;
				resolved[member.id] = placed;
				occupied.push({
					...member,
					pos: placed
				});
			}
			return resolved;
		}
		/** Resolve a manual drag against every currently visible pet. */
		function resolveSceneMove(memberId, size, desired, members, positions, viewport, spacing) {
			const occupied = members.filter((member) => member.id !== memberId && positions[member.id] !== void 0).map((member) => ({
				...member,
				pos: clampPetPos(positions[member.id], member.size, viewport)
			}));
			const next = placeWithoutOverlap(desired, {
				id: memberId,
				size
			}, occupied, Math.max(0, spacing), viewport) ?? placeWithoutOverlap(desired, {
				id: memberId,
				size
			}, occupied, 0, viewport);
			if (next !== void 0) return next;
			const current = positions[memberId];
			if (current !== void 0) return clampPetPos(current, size, viewport);
			return clampPetPos(desired, size, viewport);
		}
		function normalizeGridCount(value, fallback) {
			return typeof value === "number" && Number.isFinite(value) ? Math.min(8, Math.max(1, Math.round(value))) : fallback;
		}
		/** Tolerant load of the scene prefs (corrupt storage falls back to defaults). */
		function loadScenePrefs() {
			const base = {
				mode: "row",
				sort: "tokens-desc",
				spacing: 24,
				gridColumns: 3,
				gridRows: 3,
				showLabels: true,
				free: {}
			};
			try {
				const raw = localStorage.getItem(SCENE_KEY);
				if (raw === null) return base;
				const parsed = JSON.parse(raw);
				const mode = ARRANGE_MODES.includes(parsed.mode ?? "") ? parsed.mode : base.mode;
				const sort = SCENE_SORTS.includes(parsed.sort ?? "") ? parsed.sort : base.sort;
				const spacing = typeof parsed.spacing === "number" && Number.isFinite(parsed.spacing) ? Math.min(240, Math.max(24, Math.round(parsed.spacing))) : base.spacing;
				const gridColumns = normalizeGridCount(parsed.gridColumns, base.gridColumns);
				const gridRows = normalizeGridCount(parsed.gridRows, base.gridRows);
				const free = {};
				if (parsed.free !== void 0 && typeof parsed.free === "object") for (const [id, pos] of Object.entries(parsed.free)) {
					const p = pos;
					if (p !== void 0 && typeof p === "object" && typeof p.right === "number" && Number.isFinite(p.right) && typeof p.bottom === "number" && Number.isFinite(p.bottom)) free[id] = {
						right: Math.max(0, Math.round(p.right)),
						bottom: Math.max(0, Math.round(p.bottom))
					};
				}
				return {
					mode,
					sort,
					spacing,
					gridColumns,
					gridRows,
					showLabels: typeof parsed.showLabels === "boolean" ? parsed.showLabels : base.showLabels,
					free
				};
			} catch {
				return base;
			}
		}
		/** Persist the scene prefs (storage failures are ignored). */
		function saveScenePrefs(prefs) {
			try {
				localStorage.setItem(SCENE_KEY, JSON.stringify(prefs));
			} catch {}
		}
		/** Stateful scene prefs: read once, committed to localStorage on change. */
		function useScenePrefs() {
			const [prefs, setPrefs] = (0, react.useState)(() => loadScenePrefs());
			(0, react.useEffect)(() => {
				saveScenePrefs(prefs);
			}, [prefs]);
			const update = (patch) => {
				setPrefs((prev) => {
					const next = {
						...prev,
						...patch
					};
					return {
						...next,
						spacing: typeof next.spacing === "number" && Number.isFinite(next.spacing) ? Math.min(240, Math.max(24, Math.round(next.spacing))) : prev.spacing,
						gridColumns: normalizeGridCount(next.gridColumns, prev.gridColumns),
						gridRows: normalizeGridCount(next.gridRows, prev.gridRows)
					};
				});
			};
			const moveMember = (id, pos) => {
				setPrefs((prev) => ({
					...prev,
					free: {
						...prev.free,
						[id]: pos
					}
				}));
			};
			const resetMembers = () => {
				setPrefs((prev) => ({
					...prev,
					free: {}
				}));
			};
			return {
				prefs,
				update,
				moveMember,
				resetMembers
			};
		}
		/** One floating member pet: image or whale in the owner's variant, crowns, phase. */
		function MemberPetScene(props) {
			const { member, size, pos, labelMaxWidth, draggable, onMove, showLabel, chat } = props;
			const dragRef = (0, react.useRef)(null);
			const [dragging, setDragging] = (0, react.useState)(false);
			const previousTokensRef = (0, react.useRef)(member.tokens);
			const [tokenFx, setTokenFx] = (0, react.useState)(null);
			const crownSize = Math.max(14, Math.round(size * .36));
			const pyramid = useCrownPyramid(member.crowns, crownSize);
			const onPointerDown = (event) => {
				if (!draggable) return;
				event.preventDefault();
				dragRef.current = {
					startX: event.clientX,
					startY: event.clientY,
					right: pos.right,
					bottom: pos.bottom
				};
				setDragging(true);
				event.currentTarget.setPointerCapture(event.pointerId);
			};
			const onPointerMove = (event) => {
				const start = dragRef.current;
				if (start === null) return;
				const right = Math.max(0, start.right - (event.clientX - start.startX));
				const bottom = Math.max(0, start.bottom - (event.clientY - start.startY));
				onMove({
					right,
					bottom
				});
			};
			const stopDrag = () => {
				dragRef.current = null;
				setDragging(false);
			};
			(0, react.useEffect)(() => {
				window.addEventListener("blur", stopDrag);
				return () => window.removeEventListener("blur", stopDrag);
			}, []);
			(0, react.useEffect)(() => {
				const previous = previousTokensRef.current;
				previousTokensRef.current = member.tokens;
				const delta = member.tokens - previous;
				if (delta > 0) setTokenFx({
					delta,
					key: Date.now()
				});
			}, [member.tokens]);
			(0, react.useEffect)(() => {
				if (tokenFx === null) return;
				const timer = window.setTimeout(() => setTokenFx(null), 1800);
				return () => window.clearTimeout(timer);
			}, [tokenFx]);
			const tokenLabel = `${formatTokens(member.tokens)} tokens`;
			const label = `${member.nickname}, ${tokenLabel}`;
			const active = isPetActive(member.phase, member.active === true);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsg-pet-root dsg-scene-root",
				"data-dragging": dragging,
				"data-testid": "games-scene-pet",
				"data-member-id": member.memberId,
				style: {
					right: pos.right,
					bottom: pos.bottom,
					"--dsg-label-max-width": `${labelMaxWidth}px`
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsg-pet",
					"data-active": active,
					"data-phase": member.phase,
					"data-token-active": member.active === true,
					"data-show-label": showLabel,
					title: label,
					"aria-label": label,
					onPointerDown,
					onPointerMove,
					onPointerUp: stopDrag,
					onPointerCancel: stopDrag,
					onLostPointerCapture: stopDrag,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsg-whale-wrap",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsg-whale-breathe",
								children: [
									pyramid.crowns.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: pyramid.crowns }),
									pyramid.flash,
									pyramid.overflow > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsg-crown-badge",
										style: { top: pyramid.pileTop },
										children: ["+", pyramid.overflow]
									}),
									member.petUrl !== void 0 && member.petUrl !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										className: "dsg-pet-img",
										src: member.petUrl,
										alt: member.nickname,
										draggable: false,
										style: {
											width: size,
											height: size
										}
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeepSeekWhale, {
										size,
										title: member.nickname,
										variant: member.petVariant
									})
								]
							})
						}),
						chat !== null && chat !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatBubble, {
							text: chat.text,
							leaving: chat.leaving
						}, chat.key),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `dsg-pet-label dsg-scene-label${active ? " dsg-label-active" : ""}${tokenFx !== null ? " dsg-label-burst" : ""}`,
							"data-testid": "games-scene-label",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsg-label-content",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsg-label-player",
									children: member.nickname
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsg-label-tokens",
									children: [tokenLabel, tokenFx !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("em", {
										className: "dsg-token-chip",
										"data-testid": "games-scene-token-chip",
										children: ["+", formatTokens(tokenFx.delta)]
									}, tokenFx.key)]
								})]
							})
						})
					]
				})
			});
		}
		/** The arrangement controls inside the pet popover (only while in a room). */
		function SceneControls(props) {
			const { t, prefs, onChange, onReset, note } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsg-field",
				"data-testid": "games-scene-controls",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("scene.title") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsg-row",
						style: {
							flexWrap: "wrap",
							gap: 4
						},
						children: ARRANGE_MODES.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsg-radio",
							"data-on": prefs.mode === mode,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "dsg-scene-mode",
								checked: prefs.mode === mode,
								onChange: () => onChange({ mode })
							}), t(`scene.mode.${mode}`)]
						}, mode))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsg-row",
						style: {
							justifyContent: "space-between",
							marginTop: 8
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("scene.sort") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsg-row",
						style: {
							flexWrap: "wrap",
							gap: 4
						},
						children: SCENE_SORTS.map((sort) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsg-radio",
							"data-on": prefs.sort === sort,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "dsg-scene-sort",
								checked: prefs.sort === sort,
								onChange: () => onChange({ sort })
							}), t(`scene.sort.${sort}`)]
						}, sort))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsg-row",
						style: {
							justifyContent: "space-between",
							marginTop: 4
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
							t("scene.spacing"),
							" · ",
							prefs.spacing,
							"px"
						] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "range",
						className: "dsg-slider",
						min: 24,
						max: 240,
						step: 4,
						value: prefs.spacing,
						onChange: (e) => onChange({ spacing: Number(e.target.value) })
					}),
					prefs.mode === "grid" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-grid-size",
						"data-testid": "games-scene-grid-size",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("scene.gridColumns") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								max: 8,
								step: 1,
								value: prefs.gridColumns,
								"aria-label": t("scene.gridColumns"),
								"data-testid": "games-scene-grid-columns",
								onChange: (event) => onChange({ gridColumns: Number(event.target.value) })
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								children: "×"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("scene.gridRows") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								max: 8,
								step: 1,
								value: prefs.gridRows,
								"aria-label": t("scene.gridRows"),
								"data-testid": "games-scene-grid-rows",
								onChange: (event) => onChange({ gridRows: Number(event.target.value) })
							})] })
						]
					}),
					note !== null && note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsg-note dsg-scene-note",
						role: "status",
						"data-testid": "games-scene-note",
						children: note
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-row",
						style: {
							justifyContent: "space-between",
							alignItems: "flex-start",
							marginTop: 2
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsg-hint",
							style: {
								margin: 0,
								flex: 1
							},
							children: t("scene.hint")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsg-btn-ghost",
							onClick: onReset,
							"data-testid": "games-scene-reset",
							children: t("scene.reset")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsg-field-row",
						style: { marginTop: 8 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("scene.showLabels") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsg-toggle",
							"data-on": prefs.showLabels,
							"aria-pressed": prefs.showLabels,
							onClick: () => onChange({ showLabels: !prefs.showLabels }),
							"data-testid": "games-scene-label-toggle"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/GamesApp.tsx
		/**
		* The floating pet app — a single React root mounted on document.body (the
		* pet is host-global, no session dimension, mirroring the dsh-pet pattern).
		* Owns the poll loops (own state ~2s, room heartbeat+snapshot ~3s while
		* joined), the draggable pet with its crown pyramid, the token-usage effects
		* (label shimmer while consuming, burst + crown bubbles on gains), and the
		* nickname / room / pet-customization popover.
		* @module @kasidia/dsh-games/client/GamesApp
		*/
		/** Poll cadence for the own host snapshot. */
		const STATE_POLL_MS = 2e3;
		/** Heartbeat + snapshot cadence while joined to a room. */
		const ROOM_POLL_MS = 3e3;
		/** Reset position for the floating pet (top-right default anchor). */
		const DEFAULT_POSITION = {
			right: 24,
			bottom: 20
		};
		function canRefreshRoomMember(error) {
			return error instanceof GameServerError && (error.code === "member-not-found" || error.code === "unauthorized");
		}
		function isMissingRoom(error) {
			return error instanceof GameServerError && error.code === "room-not-found";
		}
		function isAntiCheatError(error) {
			return error instanceof GameServerError && (error.code === "anti-cheat-locked" || error.code === "crowns-mismatch" || error.code === "token-jump" || error.code === "token-regression");
		}
		function antiCheatMessage(error, t) {
			switch (error.code) {
				case "crowns-mismatch": return t("room.antiCheatCrowns");
				case "token-jump": return t("room.antiCheatJump");
				case "token-regression": return t("room.antiCheatRegression");
				default: return t("room.antiCheatLocked");
			}
		}
		/**
		* Whether two poll snapshots render identically. The 2s poll returns a fresh
		* object each time; returning `prev` from the state updater on equality lets
		* React skip the re-render entirely, so typing/slider interactions are never
		* interleaved with a full refresh. `serverTime` is excluded (it always
		* changes); `crowns` is compared element-wise (fresh arrays arrive each poll).
		*/
		function sameGamesState(a, b) {
			return a.memberId === b.memberId && a.nickname === b.nickname && a.tokens === b.tokens && a.crownUnits === b.crownUnits && a.phase === b.phase && a.tokenActiveUntil === b.tokenActiveUntil && a.enabled === b.enabled && a.petVariant === b.petVariant && a.serverUrl === b.serverUrl && a.authToken === b.authToken && a.pet?.ext === b.pet?.ext && a.pet?.version === b.pet?.version && a.pet?.width === b.pet?.width && a.pet?.height === b.pet?.height && a.crowns.length === b.crowns.length && a.crowns.every((value, index) => value === b.crowns[index]) && a.display.visible === b.display.visible && a.display.size === b.display.size && a.display.right === b.display.right && a.display.bottom === b.display.bottom && a.display.locked === b.display.locked;
		}
		function gamesStateIdentity(state) {
			return {
				base: gameServerApi.base(state.serverUrl),
				authToken: state.authToken,
				memberId: state.memberId
			};
		}
		function matchesGamesStateIdentity(state, identity) {
			return state !== null && gameServerApi.base(state.serverUrl) === identity.base && state.authToken === identity.authToken && state.memberId === identity.memberId;
		}
		/** Crown counts per server rules, or the shared defaults while offline. */
		function effectiveCrowns(state, rules) {
			return crownsAtTokens(state.tokens, rules);
		}
		/** Build a member report from the current own state. */
		function memberOf(state, rules) {
			return {
				memberId: state.memberId,
				nickname: state.nickname,
				tokens: state.tokens,
				crowns: effectiveCrowns(state, rules),
				phase: state.phase,
				petVariant: state.petVariant,
				...state.pet !== void 0 ? {
					petUrl: petImageUrl(state.serverUrl, state.memberId, state.pet, state.authToken),
					petVersion: state.pet.version
				} : {}
			};
		}
		function GamesApp(props) {
			const { t } = props;
			const [state, setState] = (0, react.useState)(null);
			const [rules, setRules] = (0, react.useState)(() => defaultGameRules());
			const [room, setRoom] = (0, react.useState)(null);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [bubble, setBubble] = (0, react.useState)(null);
			const [nicknameDraft, setNicknameDraft] = (0, react.useState)("");
			const [nicknameSaving, setNicknameSaving] = (0, react.useState)(false);
			const [nicknameSaved, setNicknameSaved] = (0, react.useState)(false);
			const [roomError, setRoomError] = (0, react.useState)(null);
			const [tokenFx, setTokenFx] = (0, react.useState)(null);
			const [crownFx, setCrownFx] = (0, react.useState)(null);
			const [tokenStreamActive, setTokenStreamActive] = (0, react.useState)(false);
			const [petNote, setPetNote] = (0, react.useState)(null);
			const [sceneNote, setSceneNote] = (0, react.useState)(null);
			const [petBusy, setPetBusy] = (0, react.useState)(false);
			const [viewport, setViewport] = (0, react.useState)({
				width: 0,
				height: 0
			});
			const drag = (0, react.useRef)(null);
			const movedRef = (0, react.useRef)(false);
			const [dragging, setDragging] = (0, react.useState)(false);
			const popoverRef = (0, react.useRef)(null);
			const petRef = (0, react.useRef)(null);
			const [chatOpen, setChatOpen] = (0, react.useState)(false);
			const [chatDraft, setChatDraft] = (0, react.useState)("");
			const [chatCooldown, setChatCooldown] = (0, react.useState)(false);
			const chatCooldownRef = (0, react.useRef)(false);
			/** The member's own message bubble (shown locally on send). */
			const [ownChat, setOwnChat] = (0, react.useState)(null);
			/** Incoming bubbles keyed by member id (keyed by the message's dedupe key). */
			const [memberChats, setMemberChats] = (0, react.useState)({});
			const seenChatRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const stateRef = (0, react.useRef)(null);
			const rulesRef = (0, react.useRef)(defaultGameRules());
			const rulesIdentityRef = (0, react.useRef)(null);
			const roomRef = (0, react.useRef)(null);
			const tokenStreamActiveRef = (0, react.useRef)(false);
			stateRef.current = state;
			rulesRef.current = rules;
			roomRef.current = room;
			tokenStreamActiveRef.current = tokenStreamActive;
			const viewportWidth = viewport.width > 0 ? viewport.width : typeof window === "undefined" ? 1280 : window.innerWidth;
			const viewportHeight = viewport.height > 0 ? viewport.height : typeof window === "undefined" ? 800 : window.innerHeight;
			const closeMenu = (0, react.useCallback)((restoreFocus) => {
				setMenuOpen(false);
				if (restoreFocus) window.requestAnimationFrame(() => petRef.current?.focus());
			}, []);
			const closeChat = (0, react.useCallback)((restoreFocus) => {
				setChatOpen(false);
				if (restoreFocus) window.requestAnimationFrame(() => petRef.current?.focus());
			}, []);
			const loadAuthoritativeRules = (0, react.useCallback)(async (current) => {
				const identity = `${gameServerApi.base(current.serverUrl)}\n${current.authToken}`;
				if (rulesIdentityRef.current === identity) return rulesRef.current;
				try {
					const result = await gameServerApi.rules(current.serverUrl, current.authToken);
					const latest = stateRef.current;
					if (latest !== null && `${gameServerApi.base(latest.serverUrl)}\n${latest.authToken}` === identity) {
						rulesIdentityRef.current = identity;
						rulesRef.current = result.rules;
						setRules(result.rules);
					}
					return result.rules;
				} catch {
					const fallback = defaultGameRules();
					const latest = stateRef.current;
					if (latest !== null && `${gameServerApi.base(latest.serverUrl)}\n${latest.authToken}` === identity) {
						rulesIdentityRef.current = null;
						rulesRef.current = fallback;
						setRules(fallback);
					}
					return fallback;
				}
			}, []);
			(0, react.useEffect)(() => {
				const updateViewport = () => {
					setViewport({
						width: window.innerWidth,
						height: window.innerHeight
					});
				};
				updateViewport();
				window.addEventListener("resize", updateViewport);
				return () => window.removeEventListener("resize", updateViewport);
			}, []);
			(0, react.useEffect)(() => {
				if (!menuOpen && !chatOpen) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (chatOpen && (!(target instanceof Element) || target.closest(".dsg-chat-composer") === null)) closeChat(false);
					if (!menuOpen) return;
					if (popoverRef.current?.contains(target) === true) return;
					if (petRef.current?.contains(target) === true) return;
					closeMenu(false);
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					if (chatOpen) closeChat(true);
					if (menuOpen) closeMenu(true);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [
				chatOpen,
				closeChat,
				closeMenu,
				menuOpen
			]);
			const pyramid = useCrownPyramid((state === null ? void 0 : room?.members.find((member) => member.memberId === state.memberId))?.crowns ?? (state === null ? [] : effectiveCrowns(state, rules)), state === null ? 14 : Math.max(14, Math.round(state.display.size * .36)));
			const scene = useScenePrefs();
			const sortedRoomMembers = sortRoomMembers(room === null ? [] : room.members, scene.prefs.sort);
			const otherMembers = sortedRoomMembers.filter((member) => member.memberId !== stateRef.current?.memberId);
			const sceneViewport = {
				width: viewportWidth,
				height: viewportHeight
			};
			const displayPos = state === null ? {
				right: 0,
				bottom: 0
			} : clampPetPos(state.display, state.display.size, sceneViewport);
			const sceneMembers = state === null ? [] : sortedRoomMembers.map((member) => ({
				id: member.memberId,
				size: state.display.size
			}));
			const sceneAnchor = state === null ? null : {
				id: state.memberId,
				size: state.display.size,
				right: displayPos.right,
				bottom: displayPos.bottom
			};
			const scenePositions = (() => {
				if (sceneAnchor === null || room === null) return {};
				return arrangeScene(scene.prefs.mode, sceneMembers, sceneAnchor, scene.prefs.spacing, scene.prefs.free, sceneViewport, scene.prefs.gridColumns, scene.prefs.gridRows);
			})();
			(0, react.useEffect)(() => {
				const current = stateRef.current;
				if (current === null || drag.current !== null) return;
				const clamped = clampPetPos(current.display, current.display.size, {
					width: viewportWidth,
					height: viewportHeight
				});
				if (clamped.right === current.display.right && clamped.bottom === current.display.bottom) return;
				setState((prev) => prev === null ? prev : {
					...prev,
					display: {
						...prev.display,
						...clamped
					}
				});
				gamesApi.setDisplay(clamped).catch(() => {});
			}, [
				state?.display.bottom,
				state?.display.right,
				state?.display.size,
				viewportHeight,
				viewportWidth
			]);
			(0, react.useEffect)(() => {
				let timer;
				const stop = () => {
					if (timer !== void 0) {
						window.clearInterval(timer);
						timer = void 0;
					}
				};
				const poll = () => {
					gamesApi.state().then((next) => {
						setState((prev) => {
							if (prev === null) return next;
							if (sameGamesState(prev, next)) return prev;
							return drag.current !== null ? {
								...next,
								display: prev.display
							} : next;
						});
					}, () => {});
				};
				const start = () => {
					if (timer === void 0 && document.visibilityState === "visible") timer = window.setInterval(poll, STATE_POLL_MS);
				};
				const onVisibility = () => {
					if (document.visibilityState === "visible") {
						poll();
						start();
					} else stop();
				};
				poll();
				start();
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					stop();
					document.removeEventListener("visibilitychange", onVisibility);
				};
			}, []);
			const lastPhase = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (state === null) return;
				const phase = state.phase;
				if (phase === lastPhase.current) return;
				lastPhase.current = phase;
				if (phase === "thinking" || phase === "waiting" || phase === "tool") {
					setBubble(t(`pet.phase.${phase}`));
					const timer = window.setTimeout(() => setBubble(null), 4e3);
					return () => window.clearTimeout(timer);
				}
				if (phase === "done") {
					setBubble(t("pet.phase.done"));
					const timer = window.setTimeout(() => setBubble(null), 3e3);
					return () => window.clearTimeout(timer);
				}
				setBubble(null);
			}, [state?.phase, t]);
			(0, react.useEffect)(() => {
				if (state === null) return;
				const identity = `${gameServerApi.base(state.serverUrl)}\n${state.authToken}`;
				if (rulesIdentityRef.current !== identity) {
					rulesIdentityRef.current = null;
					const fallback = defaultGameRules();
					rulesRef.current = fallback;
					setRules(fallback);
				}
				loadAuthoritativeRules(state).then(() => {});
			}, [
				loadAuthoritativeRules,
				state?.serverUrl,
				state?.authToken
			]);
			(0, react.useEffect)(() => {
				if (state === null) {
					setTokenStreamActive(false);
					return;
				}
				const remaining = state.tokenActiveUntil - state.serverTime;
				if (remaining <= 0) {
					setTokenStreamActive(false);
					return;
				}
				setTokenStreamActive(true);
				const timer = window.setTimeout(() => setTokenStreamActive(false), remaining);
				return () => window.clearTimeout(timer);
			}, [state?.tokenActiveUntil, state?.serverTime]);
			const [displayTokens, setDisplayTokens] = (0, react.useState)(null);
			const tokenProgressRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (state === null) return;
				if (tokenProgressRef.current === null) {
					tokenProgressRef.current = createTokenProgressBaseline(state.tokens, rules);
					setDisplayTokens(state.tokens);
					return;
				}
				const settled = settleTokenProgress(tokenProgressRef.current, state.tokens, rules);
				tokenProgressRef.current = settled.baseline;
				if (settled.delta <= 0) {
					if (displayTokens !== state.tokens) setDisplayTokens(state.tokens);
					return;
				}
				setDisplayTokens(state.tokens);
				setTokenFx({
					delta: settled.delta,
					key: Date.now()
				});
				if (settled.crownTier !== null) setCrownFx({
					tier: settled.crownTier,
					key: Date.now()
				});
			}, [state?.tokens, rules]);
			(0, react.useEffect)(() => {
				if (tokenFx === null) return;
				const timer = window.setTimeout(() => setTokenFx(null), 1800);
				return () => window.clearTimeout(timer);
			}, [tokenFx]);
			(0, react.useEffect)(() => {
				if (crownFx === null) return;
				const name = t(`crown.${CROWN_LEVELS[crownFx.tier].id}`);
				setBubble(crownFx.tier > 0 ? t("pet.crown.crafted", { name }) : t("pet.crown.gained", { name }));
				const timer = window.setTimeout(() => setBubble(null), 3200);
				return () => window.clearTimeout(timer);
			}, [crownFx, t]);
			const roomKey = room === null ? null : `${room.base}#${room.code}#${room.memberToken}`;
			(0, react.useEffect)(() => {
				if (room === null || stateRef.current === null) return;
				const { base, code, memberToken } = room;
				let timer;
				let disposed = false;
				let inFlight = false;
				let controller;
				const matchesRoom = (token = memberToken) => {
					const latest = roomRef.current;
					return latest !== null && latest.base === base && latest.code === code && latest.memberToken === token;
				};
				const applySnapshot = (nextRoom, clearError = true) => {
					if (disposed || !matchesRoom()) return;
					if (clearError) setRoomError(null);
					const ownId = stateRef.current?.memberId;
					for (const message of nextRoom.messages ?? []) {
						const key = `${message.memberId}:${message.at}`;
						if (seenChatRef.current.has(key)) continue;
						seenChatRef.current.add(key);
						if (message.memberId === ownId) continue;
						setMemberChats((prev) => ({
							...prev,
							[message.memberId]: {
								text: message.text,
								key
							}
						}));
						window.setTimeout(() => {
							setMemberChats((prev) => {
								const next = { ...prev };
								if (next[message.memberId]?.key === key) next[message.memberId] = {
									...next[message.memberId],
									leaving: true
								};
								return next;
							});
						}, 3750);
						window.setTimeout(() => {
							setMemberChats((prev) => {
								const next = { ...prev };
								if (next[message.memberId]?.key === key) delete next[message.memberId];
								return next;
							});
						}, CHAT_BUBBLE_MS);
					}
					setRoom((prev) => {
						if (prev === null || prev.base !== base || prev.code !== code || prev.memberToken !== memberToken) return prev;
						return {
							...prev,
							members: nextRoom.members,
							name: nextRoom.name,
							public: nextRoom.public,
							offline: false
						};
					});
				};
				const markOffline = () => {
					if (disposed || !matchesRoom()) return;
					setRoom((prev) => {
						if (prev === null || prev.base !== base || prev.code !== code || prev.memberToken !== memberToken) return prev;
						return {
							...prev,
							offline: true
						};
					});
				};
				const discardMissingRoom = () => {
					if (disposed || !matchesRoom()) return;
					clearStoredRoom();
					setRoom(null);
					setRoomError(t("room.expired"));
					setBubble(t("room.expired"));
					window.setTimeout(() => setBubble(null), 3200);
				};
				const tick = async () => {
					if (disposed || inFlight || !matchesRoom()) return;
					const current = stateRef.current;
					if (current === null) return;
					const currentIdentity = gamesStateIdentity(current);
					const matchesState = () => matchesGamesStateIdentity(stateRef.current, currentIdentity);
					inFlight = true;
					controller = new AbortController();
					try {
						const currentRules = await loadAuthoritativeRules(current);
						if (disposed || !matchesRoom() || !matchesState()) return;
						const member = {
							...memberOf(current, currentRules),
							active: tokenStreamActiveRef.current
						};
						const result = await gameServerApi.heartbeat(base, current.authToken, code, memberToken, member, controller.signal);
						if (!matchesState()) return;
						applySnapshot(result.room);
					} catch (error) {
						if (disposed || !matchesState() || error instanceof DOMException && error.name === "AbortError") return;
						if (isAntiCheatError(error)) {
							setRoomError(antiCheatMessage(error, t));
							setRoom((prev) => prev === null ? prev : {
								...prev,
								offline: false
							});
							try {
								rulesIdentityRef.current = null;
								const fallback = defaultGameRules();
								rulesRef.current = fallback;
								setRules(fallback);
								await loadAuthoritativeRules(current);
								if (disposed || !matchesRoom() || !matchesState()) return;
								const authoritative = await gameServerApi.state(base, current.authToken, code);
								if (!matchesState()) return;
								applySnapshot(authoritative.room, false);
							} catch {}
						} else if (isMissingRoom(error)) discardMissingRoom();
						else if (canRefreshRoomMember(error) && matchesRoom()) try {
							const latest = stateRef.current;
							if (latest === null) return;
							const latestIdentity = gamesStateIdentity(latest);
							const matchesLatest = () => matchesGamesStateIdentity(stateRef.current, latestIdentity);
							const latestRules = await loadAuthoritativeRules(latest);
							if (disposed || !matchesRoom() || !matchesLatest()) return;
							const joined = await gameServerApi.join(base, latest.authToken, code, {
								...memberOf(latest, latestRules),
								active: tokenStreamActiveRef.current
							});
							if (disposed || !matchesRoom() || !matchesLatest()) return;
							storeRoom(base, code, joined.memberToken);
							setRoom((prev) => {
								if (prev === null || prev.base !== base || prev.code !== code || prev.memberToken !== memberToken) return prev;
								return {
									...prev,
									memberToken: joined.memberToken,
									members: joined.room.members,
									name: joined.room.name,
									public: joined.room.public,
									offline: false
								};
							});
						} catch (joinError) {
							if (isMissingRoom(joinError)) discardMissingRoom();
							else markOffline();
						}
						else markOffline();
					} finally {
						inFlight = false;
						controller = void 0;
					}
				};
				const onVisibility = () => {
					if (document.visibilityState === "visible") tick();
				};
				const onResume = () => {
					tick();
				};
				timer = window.setInterval(tick, ROOM_POLL_MS);
				document.addEventListener("visibilitychange", onVisibility);
				window.addEventListener("focus", onResume);
				window.addEventListener("online", onResume);
				window.addEventListener("pageshow", onResume);
				tick();
				return () => {
					disposed = true;
					controller?.abort();
					if (timer !== void 0) window.clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisibility);
					window.removeEventListener("focus", onResume);
					window.removeEventListener("online", onResume);
					window.removeEventListener("pageshow", onResume);
				};
			}, [
				loadAuthoritativeRules,
				roomKey,
				t
			]);
			const joinRoom = (0, react.useCallback)(async (code) => {
				setRoomError(null);
				const current = stateRef.current;
				if (current === null) return false;
				const currentIdentity = gamesStateIdentity(current);
				const matchesState = () => matchesGamesStateIdentity(stateRef.current, currentIdentity);
				try {
					const resolvedBase = currentIdentity.base;
					const currentRules = await loadAuthoritativeRules(current);
					if (!matchesState()) return false;
					const result = await gameServerApi.join(resolvedBase, current.authToken, code, {
						...memberOf(current, currentRules),
						active: tokenStreamActiveRef.current
					});
					if (!matchesState()) return false;
					setRoom({
						base: resolvedBase,
						code,
						memberToken: result.memberToken,
						name: result.room.name,
						public: result.room.public,
						members: result.room.members,
						offline: false
					});
					storeRoom(resolvedBase, code, result.memberToken);
					return true;
				} catch (error) {
					if (!matchesState()) return false;
					setRoomError(isAntiCheatError(error) ? antiCheatMessage(error, t) : error instanceof Error ? error.message : String(error));
					return false;
				}
			}, [loadAuthoritativeRules, t]);
			const createRoom = (0, react.useCallback)(async (options) => {
				setRoomError(null);
				const current = stateRef.current;
				if (current === null) return false;
				try {
					const result = await gameServerApi.createRoom(current.serverUrl, current.authToken, options);
					const ok = await joinRoom(result.room.code);
					if (ok) {
						setBubble(t("room.created"));
						window.setTimeout(() => setBubble(null), 3e3);
					}
					return ok;
				} catch (error) {
					setRoomError(isAntiCheatError(error) ? antiCheatMessage(error, t) : error instanceof Error ? error.message : String(error));
					return false;
				}
			}, [joinRoom, t]);
			const leaveRoom = (0, react.useCallback)(async () => {
				const current = roomRef.current;
				const memberId = stateRef.current?.memberId;
				const authToken = stateRef.current?.authToken ?? "";
				if (current !== null && memberId !== void 0) try {
					await gameServerApi.leave(current.base, authToken, current.code, memberId, current.memberToken);
				} catch {}
				clearStoredRoom();
				setRoom(null);
				setRoomError(null);
				setChatOpen(false);
				setChatDraft("");
				setOwnChat(null);
				setMemberChats({});
				seenChatRef.current = /* @__PURE__ */ new Set();
			}, []);
			const sendChat = (0, react.useCallback)((text) => {
				if (chatCooldownRef.current) return;
				const current = stateRef.current;
				if (current === null) return;
				const trimmed = text.trim();
				if (trimmed === "") return;
				const key = Date.now();
				setChatOpen(false);
				setChatDraft("");
				setChatCooldown(true);
				chatCooldownRef.current = true;
				window.setTimeout(() => {
					setChatCooldown(false);
					chatCooldownRef.current = false;
				}, CHAT_BUBBLE_MS);
				const currentRoom = roomRef.current;
				if (currentRoom === null) {
					setOwnChat({
						text: t("chat.noRoom"),
						key
					});
					return;
				}
				setOwnChat({
					text: trimmed,
					key
				});
				gameServerApi.sendMessage(currentRoom.base, current.authToken, currentRoom.code, currentRoom.memberToken, {
					memberId: current.memberId,
					text: trimmed
				}).catch(() => {});
			}, [t]);
			(0, react.useEffect)(() => {
				if (ownChat === null) return;
				const leave = window.setTimeout(() => {
					setOwnChat((prev) => prev === null || prev.leaving === true ? prev : {
						...prev,
						leaving: true
					});
				}, 3750);
				const remove = window.setTimeout(() => {
					setOwnChat((prev) => prev === null || prev.key !== ownChat.key ? prev : null);
				}, CHAT_BUBBLE_MS);
				return () => {
					window.clearTimeout(leave);
					window.clearTimeout(remove);
				};
			}, [ownChat?.key]);
			const restoredRef = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (restoredRef.current) return;
				const current = stateRef.current;
				if (current === null) return;
				restoredRef.current = true;
				const stored = loadStoredRoom();
				if (stored === void 0) return;
				const configuredBase = gameServerApi.base(current.serverUrl);
				if (stored.base !== configuredBase) {
					clearStoredRoom();
					return;
				}
				const currentIdentity = gamesStateIdentity(current);
				const matchesState = () => matchesGamesStateIdentity(stateRef.current, currentIdentity);
				let cancelled = false;
				const restore = async () => {
					let activeToken = stored.memberToken;
					try {
						const currentRules = await loadAuthoritativeRules(current);
						if (cancelled || !matchesState()) return;
						let result;
						try {
							result = await gameServerApi.heartbeat(configuredBase, current.authToken, stored.code, activeToken, {
								...memberOf(current, currentRules),
								active: tokenStreamActiveRef.current
							});
							if (cancelled || !matchesState()) return;
						} catch (error) {
							if (cancelled || !matchesState()) return;
							if (!canRefreshRoomMember(error)) throw error;
							const joined = await gameServerApi.join(configuredBase, current.authToken, stored.code, {
								...memberOf(current, currentRules),
								active: tokenStreamActiveRef.current
							});
							if (cancelled || !matchesState()) return;
							activeToken = joined.memberToken;
							storeRoom(configuredBase, stored.code, activeToken);
							result = {
								ok: true,
								room: joined.room
							};
						}
						if (cancelled || !matchesState()) return;
						setRoom({
							base: configuredBase,
							code: stored.code,
							memberToken: activeToken,
							name: result.room.name,
							public: result.room.public,
							members: result.room.members,
							offline: false
						});
						setBubble(t("room.autoJoined"));
						window.setTimeout(() => setBubble(null), 3e3);
					} catch (error) {
						if (cancelled || !matchesState()) return;
						if (isAntiCheatError(error)) {
							clearStoredRoom();
							setRoom(null);
							setRoomError(antiCheatMessage(error, t));
							return;
						}
						if (isMissingRoom(error)) {
							clearStoredRoom();
							setRoom(null);
							setRoomError(t("room.expired"));
							return;
						}
						setRoom({
							base: configuredBase,
							code: stored.code,
							memberToken: activeToken,
							name: "",
							public: true,
							members: [],
							offline: true
						});
					}
				};
				restore();
				return () => {
					cancelled = true;
				};
			}, [
				loadAuthoritativeRules,
				state?.memberId,
				t
			]);
			const saveNickname = (0, react.useCallback)(async () => {
				const name = nicknameDraft.trim();
				if (name === "") return;
				setNicknameSaving(true);
				try {
					if ((await gamesApi.setNickname(name)).ok) {
						setNicknameSaved(true);
						window.setTimeout(() => setNicknameSaved(false), 1500);
					}
				} catch {} finally {
					setNicknameSaving(false);
				}
			}, [nicknameDraft]);
			const switchVariant = (0, react.useCallback)((variant) => {
				setState((prev) => prev === null || prev.petVariant === variant ? prev : {
					...prev,
					petVariant: variant
				});
				gamesApi.config({ petVariant: variant }).catch(() => {});
			}, []);
			const [customColorOpen, setCustomColorOpen] = (0, react.useState)(false);
			const [customDraft, setCustomDraft] = (0, react.useState)(null);
			const applyCustomColor = (0, react.useCallback)((from, to) => {
				setCustomDraft({
					from,
					to
				});
				const id = customVariantId(from, to);
				const current = stateRef.current;
				if (current === null || id === current.petVariant) return;
				setState((prev) => prev === null ? prev : {
					...prev,
					petVariant: id
				});
				gamesApi.config({ petVariant: id }).catch(() => {});
			}, []);
			const uploadPet = (0, react.useCallback)(async (file) => {
				const current = stateRef.current;
				if (file === void 0 || current === null) return;
				const petRules = rules.pet;
				if (!["image/png", "image/gif"].includes(file.type)) {
					setPetNote(t("menu.uploadTypeError"));
					return;
				}
				if (file.size > petRules.maxBytes) {
					setPetNote(t("menu.uploadSizeError"));
					return;
				}
				setPetBusy(true);
				setPetNote(null);
				try {
					const result = await gameServerApi.uploadPet(current.serverUrl, current.authToken, current.memberId, file);
					await gamesApi.setPetMeta(result.pet);
					setPetNote(t("menu.uploaded"));
					const next = await gamesApi.state();
					setState(next);
				} catch (error) {
					setPetNote(t("menu.uploadError", { error: error instanceof Error ? error.message : String(error) }));
				} finally {
					setPetBusy(false);
				}
			}, [t, rules]);
			const removePet = (0, react.useCallback)(async () => {
				const current = stateRef.current;
				if (current === null) return;
				setPetBusy(true);
				setPetNote(null);
				try {
					await gameServerApi.removePet(current.serverUrl, current.authToken, current.memberId).catch(() => {});
					await gamesApi.clearPetMeta();
					setPetNote(t("menu.removed"));
					const next = await gamesApi.state();
					setState(next);
				} catch {
					setPetNote(t("menu.uploadError", { error: "" }));
				} finally {
					setPetBusy(false);
				}
			}, [t]);
			const onPointerDown = (0, react.useCallback)((event) => {
				const current = stateRef.current;
				if (current === null || current.display.locked) return;
				event.preventDefault();
				drag.current = {
					startX: event.clientX,
					startY: event.clientY,
					right: current.display.right,
					bottom: current.display.bottom
				};
				movedRef.current = false;
				setDragging(true);
				event.currentTarget.setPointerCapture(event.pointerId);
			}, []);
			const onPointerMove = (0, react.useCallback)((event) => {
				const start = drag.current;
				const current = stateRef.current;
				if (start === null || current === null) return;
				const dx = event.clientX - start.startX;
				const dy = event.clientY - start.startY;
				if (Math.abs(dx) + Math.abs(dy) > 5) movedRef.current = true;
				const desired = clampPetPos({
					right: start.right - dx,
					bottom: start.bottom - dy
				}, current.display.size, sceneViewport);
				const next = roomRef.current !== null && scene.prefs.mode === "free" ? resolveSceneMove(current.memberId, current.display.size, desired, sceneMembers, scenePositions, sceneViewport, scene.prefs.spacing) : desired;
				setState({
					...current,
					display: {
						...current.display,
						...next
					}
				});
			}, [
				scene.prefs.mode,
				scene.prefs.spacing,
				sceneMembers,
				scenePositions,
				sceneViewport
			]);
			const finishDrag = (0, react.useCallback)(() => {
				const start = drag.current;
				drag.current = null;
				setDragging(false);
				const current = stateRef.current;
				if (start === null || current === null) return;
				gamesApi.setDisplay({
					right: current.display.right,
					bottom: current.display.bottom
				}).catch(() => {});
			}, []);
			(0, react.useEffect)(() => {
				if (!dragging) return;
				window.addEventListener("blur", finishDrag);
				return () => window.removeEventListener("blur", finishDrag);
			}, [dragging, finishDrag]);
			if (state === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-dsh-games": true,
				"data-testid": "games-pending"
			});
			if (!state.enabled) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-dsh-games": true,
				"data-testid": "games-disabled"
			});
			const display = {
				...state.display,
				...displayPos
			};
			const chatComposerWidth = Math.min(286, Math.max(0, viewportWidth - 16));
			const petCenterX = viewportWidth - display.right - display.size / 2;
			const chatComposerShiftX = Math.min(viewportWidth - 8 - chatComposerWidth / 2, Math.max(8 + chatComposerWidth / 2, petCenterX)) - petCenterX;
			const popoverWidth = Math.min(380, Math.max(0, viewportWidth - 24));
			const petRightEdge = viewportWidth - display.right;
			const popoverStyle = { right: viewportWidth - Math.min(viewportWidth - 12, Math.max(popoverWidth + 12, petRightEdge)) };
			const petTop = viewportHeight - display.bottom - display.size;
			const petBottom = viewportHeight - display.bottom;
			const aboveSpace = petTop - 26;
			const belowSpace = viewportHeight - petBottom - 26;
			if (Math.max(aboveSpace, belowSpace) < 160) {
				popoverStyle.top = 12;
				popoverStyle.bottom = "auto";
				popoverStyle.maxHeight = Math.max(120, viewportHeight - 24);
			} else if (aboveSpace >= 260 || aboveSpace >= belowSpace) {
				popoverStyle.bottom = display.bottom + display.size + 14;
				popoverStyle.maxHeight = aboveSpace;
			} else {
				popoverStyle.top = petBottom + 14;
				popoverStyle.bottom = "auto";
				popoverStyle.maxHeight = belowSpace;
			}
			const tokenLabel = `${formatTokens(displayTokens ?? state.tokens)} tokens`;
			const consuming = isPetActive(state.phase, tokenStreamActive);
			const labelMaxWidth = Math.max(24, Math.floor(display.size + scene.prefs.spacing - 4));
			const customVariant = isCustomVariant(state.petVariant) ? petVariantOf(state.petVariant) : null;
			const petUrl = state.pet !== void 0 ? petImageUrl(state.serverUrl, state.memberId, state.pet, state.authToken) : void 0;
			const petHint = t("menu.uploadHintRules", {
				maxBytes: Math.round(rules.pet.maxBytes / 1024 / 1024 * 10) / 10,
				maxDimension: rules.pet.maxDimension
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"data-dsh-games": true,
				"data-testid": "games-app",
				children: display.visible ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsg-pet-root",
					"data-own": "true",
					"data-chat-open": chatOpen,
					"data-dragging": dragging,
					style: {
						right: display.right,
						bottom: display.bottom,
						"--dsg-label-max-width": `${labelMaxWidth}px`,
						"--dsg-chat-composer-shift-x": `${chatComposerShiftX}px`
					},
					children: [
						menuOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							ref: popoverRef,
							id: "dsg-pet-popover",
							className: "dsg-popover",
							"data-testid": "games-popover",
							role: "dialog",
							"aria-modal": "false",
							"aria-labelledby": "dsg-popover-title",
							style: popoverStyle,
							onClick: (e) => e.stopPropagation(),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: "dsg-popover-header",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsg-popover-avatar",
										"aria-hidden": "true",
										children: petUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
											src: petUrl,
											alt: ""
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeepSeekWhale, {
											size: 38,
											variant: state.petVariant
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsg-popover-heading",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											id: "dsg-popover-title",
											children: t("menu.title")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsg-popover-meta",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
													className: "dsg-phase-indicator",
													"data-phase": state.phase,
													"aria-hidden": "true"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: state.nickname }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"aria-hidden": "true",
													children: "·"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("pet.tokens", { n: formatTokens(displayTokens ?? state.tokens) }) })
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsg-icon-btn",
										"aria-label": t("menu.close"),
										title: t("menu.close"),
										onClick: () => closeMenu(true),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: "×"
										})
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsg-popover-body",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "dsg-popover-section",
										"aria-labelledby": "dsg-profile-title",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												id: "dsg-profile-title",
												children: t("menu.profile")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dsg-field",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
													htmlFor: "dsg-nickname-input",
													children: t("menu.nickname")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dsg-row dsg-input-action",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														id: "dsg-nickname-input",
														className: "dsg-input",
														value: nicknameDraft,
														maxLength: 24,
														placeholder: state.nickname,
														onChange: (e) => {
															setNicknameDraft(e.target.value);
															setNicknameSaved(false);
														},
														onKeyDown: (e) => {
															if (e.key === "Enter" && nicknameDraft.trim() !== "") saveNickname();
														}
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: "dsg-btn",
														disabled: nicknameSaving || nicknameDraft.trim() === "",
														onClick: () => {
															saveNickname();
														},
														children: nicknameSaved ? t("menu.saved") : t("menu.save")
													})]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dsg-field",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: "dsg-field-heading",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															htmlFor: "dsg-size-slider",
															children: t("menu.size")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("output", {
															htmlFor: "dsg-size-slider",
															children: [display.size, "px"]
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														id: "dsg-size-slider",
														type: "range",
														className: "dsg-slider",
														min: 24,
														max: 512,
														step: 4,
														value: display.size,
														onChange: (e) => {
															const size = Number(e.target.value);
															setState((prev) => prev === null ? prev : {
																...prev,
																display: {
																	...prev.display,
																	size
																}
															});
															gamesApi.setDisplay({ size }).catch(() => {});
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: "dsg-row dsg-position-actions",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: "dsg-btn-ghost",
															onClick: () => {
																gamesApi.setDisplay({ ...DEFAULT_POSITION }).catch(() => {});
																setState((prev) => prev === null ? prev : {
																	...prev,
																	display: {
																		...prev.display,
																		...DEFAULT_POSITION
																	}
																});
															},
															children: t("menu.resetPosition")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: "dsg-btn-ghost",
															"data-on": display.locked,
															"aria-pressed": display.locked,
															onClick: () => {
																const locked = !display.locked;
																gamesApi.setDisplay({ locked }).catch(() => {});
																setState((prev) => prev === null ? prev : {
																	...prev,
																	display: {
																		...prev.display,
																		locked
																	}
																});
															},
															children: display.locked ? t("menu.unlockPosition") : t("menu.lockPosition")
														})]
													})
												]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "dsg-popover-section",
										"aria-labelledby": "dsg-appearance-title",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												id: "dsg-appearance-title",
												children: t("menu.appearance")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dsg-field",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("menu.petPattern") }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: "dsg-swatch-grid",
														children: [PET_VARIANTS.map((variant) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: "dsg-swatch",
															"data-on": state.petVariant === variant.id,
															title: t(variant.nameKey),
															"aria-label": t(variant.nameKey),
															"aria-pressed": state.petVariant === variant.id,
															onClick: () => switchVariant(variant.id),
															style: { background: `linear-gradient(135deg, ${variant.from}, ${variant.to})` }
														}, variant.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: "dsg-swatch dsg-swatch-custom",
															"data-on": customVariant !== null,
															title: t("petVariant.custom"),
															"aria-label": t("petVariant.custom"),
															"aria-pressed": customVariant !== null,
															onClick: () => setCustomColorOpen((open) => !open),
															style: customVariant !== null ? { background: `linear-gradient(135deg, ${customVariant.from}, ${customVariant.to})` } : void 0
														})]
													}),
													customColorOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: "dsg-custom-colors",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															className: "dsg-color-field",
															title: t("menu.customFrom"),
															children: [t("menu.customFrom"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "color",
																value: customDraft?.from ?? customVariant?.from ?? "#6d8bff",
																onChange: (e) => applyCustomColor(e.target.value, customDraft?.to ?? customVariant?.to ?? "#4d6bfe")
															})]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															className: "dsg-color-field",
															title: t("menu.customTo"),
															children: [t("menu.customTo"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "color",
																value: customDraft?.to ?? customVariant?.to ?? "#4d6bfe",
																onChange: (e) => applyCustomColor(customDraft?.from ?? customVariant?.from ?? "#6d8bff", e.target.value)
															})]
														})]
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dsg-field",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("menu.uploadPet") }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: "dsg-upload-row",
														"data-has-preview": petUrl !== void 0,
														children: [petUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
															className: "dsg-pet-preview",
															src: petUrl,
															alt: ""
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: "dsg-upload-content",
															children: [petUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: "dsg-upload-meta",
																children: [
																	state.pet?.ext === "gif" ? "GIF" : "PNG",
																	" · ",
																	state.pet?.width,
																	"×",
																	state.pet?.height
																]
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: "dsg-row",
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																	className: "dsg-btn",
																	"data-disabled": petBusy,
																	children: [petBusy ? t("menu.uploading") : t("menu.chooseFile"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																		type: "file",
																		accept: "image/png,image/gif",
																		style: { display: "none" },
																		disabled: petBusy,
																		onChange: (e) => {
																			const file = e.target.files?.[0];
																			uploadPet(file);
																			e.target.value = "";
																		}
																	})]
																}), petUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: "dsg-btn-ghost",
																	disabled: petBusy,
																	onClick: () => {
																		removePet();
																	},
																	children: t("menu.removePet")
																})]
															})]
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: "dsg-hint",
														children: petHint
													}),
													petNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: "dsg-note",
														"data-testid": "games-pet-note",
														children: petNote
													})
												]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "dsg-popover-section dsg-popover-section-last",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoomPanel, {
											t,
											room,
											own: state,
											error: roomError,
											onCreate: createRoom,
											onJoin: joinRoom,
											onLeave: () => {
												leaveRoom();
											}
										}), room !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dsg-divider" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SceneControls, {
											t,
											prefs: scene.prefs,
											note: sceneNote,
											onChange: (patch) => {
												const next = {
													...scene.prefs,
													...patch
												};
												if (sceneAnchor !== null && !canArrangeScene(next, sceneMembers, sceneAnchor, sceneViewport)) {
													setSceneNote(t("scene.collisionRejected"));
													return;
												}
												setSceneNote(null);
												scene.update(patch);
											},
											onReset: scene.resetMembers
										})] })]
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							ref: petRef,
							className: "dsg-pet",
							"data-active": consuming,
							"data-phase": state.phase,
							"data-token-active": tokenStreamActive,
							"data-testid": "games-pet",
							tabIndex: 0,
							"aria-haspopup": "dialog",
							"aria-expanded": menuOpen,
							"aria-controls": menuOpen ? "dsg-pet-popover" : void 0,
							onKeyDown: (event) => {
								if (event.target !== event.currentTarget) return;
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								setMenuOpen((open) => !open);
							},
							onClick: () => {
								if (movedRef.current) {
									movedRef.current = false;
									return;
								}
								setMenuOpen((open) => !open);
							},
							onPointerDown,
							onPointerMove,
							onPointerUp: finishDrag,
							onPointerCancel: finishDrag,
							onLostPointerCapture: finishDrag,
							children: [
								bubble !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsg-pet-bubble",
									"data-testid": "games-bubble",
									children: bubble
								}),
								ownChat !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatBubble, {
									text: ownChat.text,
									leaving: ownChat.leaving
								}, ownChat.key) : chatOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatComposer, {
									t,
									value: chatDraft,
									disabled: chatCooldown,
									onChange: setChatDraft,
									onSend: () => {
										sendChat(chatDraft);
									},
									onClose: () => closeChat(true)
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatHint, {
									t,
									disabled: chatCooldown,
									onClick: () => setChatOpen(true)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsg-whale-wrap",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsg-whale-breathe",
										children: [
											pyramid.crowns.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: pyramid.crowns }),
											pyramid.flash,
											pyramid.overflow > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "dsg-crown-badge",
												style: { top: pyramid.pileTop },
												children: ["+", pyramid.overflow]
											}),
											petUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												className: "dsg-pet-img",
												src: petUrl,
												alt: state.nickname,
												draggable: false,
												style: {
													width: display.size,
													height: display.size
												}
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeepSeekWhale, {
												size: display.size,
												title: state.nickname,
												variant: state.petVariant
											})
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: `dsg-pet-label${consuming ? " dsg-label-active" : ""}${tokenFx !== null ? " dsg-label-burst" : ""}`,
									"data-testid": "games-label",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsg-label-content",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsg-label-player",
											children: state.nickname
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsg-label-tokens",
											children: [tokenLabel, tokenFx !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("em", {
												className: "dsg-token-chip",
												"data-testid": "games-token-chip",
												children: ["+", formatTokens(tokenFx.delta)]
											}, tokenFx.key)]
										})]
									})
								})
							]
						}),
						otherMembers.map((member) => {
							const pos = scenePositions[member.memberId];
							if (pos === void 0) return null;
							const draggable = scene.prefs.mode === "free";
							const memberChat = memberChats[member.memberId];
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemberPetScene, {
								member,
								size: display.size,
								pos,
								labelMaxWidth,
								draggable,
								showLabel: scene.prefs.showLabels,
								chat: memberChat ?? null,
								onMove: (next) => {
									scene.moveMember(member.memberId, resolveSceneMove(member.memberId, display.size, next, sceneMembers, scenePositions, sceneViewport, scene.prefs.spacing));
								}
							}, member.memberId);
						})
					]
				}) : null
			});
		}
		//#endregion
		//#region src/client/SettingsCard.tsx
		/**
		* dsh-games settings card — a collapsible DSH-style plugin item: a card
		* header (name + description + chevron) that reveals the form below, like the
		* official plugin cards in DSH's own 设置 → 插件 list. The form is a
		* self-contained editor over the games HTTP API (enabled / hide-pet /
		* server URL + auth token). Game rules (crown ladder, upload caps) are
		* configured on the game server and shown read-only here.
		*
		* It deliberately does not depend on the settings-surface namespace exposure:
		* the official dsh-host-apiproxy allowlists third-party namespaces out, so
		* the card talks to `/api/games/*` directly (the host mirrors values into the
		* settings document itself).
		* @module @kasidia/dsh-games/client/SettingsCard
		*/
		/** The games settings card body. */
		function GamesSettingsCard(props) {
			const { t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)(null);
			const [rules, setRules] = (0, react.useState)(() => defaultGameRules());
			const [serverUrl, setServerUrl] = (0, react.useState)({
				text: "",
				dirty: false
			});
			const [authToken, setAuthToken] = (0, react.useState)({
				text: "",
				dirty: false
			});
			const [enabledDraft, setEnabledDraft] = (0, react.useState)(null);
			const [visibleDraft, setVisibleDraft] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(false);
			const [note, setNote] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				gamesApi.state().then((next) => {
					if (cancelled) return;
					setState(next);
					setServerUrl({
						text: next.serverUrl,
						dirty: false
					});
					setAuthToken({
						text: next.authToken,
						dirty: false
					});
				}, () => {
					if (!cancelled) setNote(t("room.offline"));
				});
				return () => {
					cancelled = true;
				};
			}, [t]);
			(0, react.useEffect)(() => {
				if (state === null) return;
				let cancelled = false;
				gameServerApi.rules(state.serverUrl, state.authToken).then((result) => {
					if (!cancelled) setRules(result.rules);
				}, () => {
					if (!cancelled) setRules(defaultGameRules());
				});
				return () => {
					cancelled = true;
				};
			}, [state?.serverUrl, state?.authToken]);
			const dirty = serverUrl.dirty || authToken.dirty || enabledDraft !== null || visibleDraft !== null;
			const save = async () => {
				setSaving(true);
				setNote(null);
				try {
					if (serverUrl.dirty) {
						if ((await gamesApi.config({ serverUrl: serverUrl.text.trim() })).ok) setServerUrl({
							text: serverUrl.text.trim(),
							dirty: false
						});
					}
					if (authToken.dirty) {
						if ((await gamesApi.config({ authToken: authToken.text.trim() })).ok) setAuthToken({
							text: authToken.text.trim(),
							dirty: false
						});
					}
					if (enabledDraft !== null) {
						if ((await gamesApi.config({ enabled: enabledDraft })).ok) setEnabledDraft(null);
					}
					if (visibleDraft !== null) {
						if ((await gamesApi.setDisplay({ visible: visibleDraft })).ok) setVisibleDraft(null);
					}
					setSaved(true);
					window.setTimeout(() => setSaved(false), 1500);
					const next = await gamesApi.state();
					setState(next);
					setNote(null);
				} catch {
					setNote(t("room.offline"));
				} finally {
					setSaving(false);
				}
			};
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsg-settings-header",
				"aria-expanded": open,
				onClick: () => setOpen((value) => !value),
				"data-testid": "games-settings-toggle",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsg-settings-head-text",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsg-settings-name",
							children: t("settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsg-settings-desc",
							children: t("settings.description")
						})]
					}),
					dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsg-settings-pending",
						children: t("settings.unsaved")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? "dsg-settings-chevron dsg-settings-chevron-open" : "dsg-settings-chevron" })
				]
			});
			if (state === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsg-settings-card",
				"data-testid": "games-settings-card",
				children: [header, open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsg-settings-body",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsg-hint",
						children: t("room.connecting")
					})
				})]
			});
			const enabledValue = enabledDraft ?? state.enabled;
			const visibleValue = visibleDraft ?? state.display.visible;
			const step = rules.crown.tokenStep;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsg-settings-card",
				"data-open": open,
				"data-testid": "games-settings-card",
				children: [header, open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsg-settings-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-field-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("settings.enabled") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsg-toggle",
								"data-on": enabledValue,
								"aria-pressed": enabledValue,
								onClick: () => setEnabledDraft(!enabledValue)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-field-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								title: t("settings.hidePetHint"),
								children: t("settings.hidePet")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsg-toggle",
								"data-on": !visibleValue,
								"aria-pressed": !visibleValue,
								onClick: () => setVisibleDraft(!visibleValue)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-field-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								title: t("settings.serverUrlHint"),
								children: t("settings.serverUrl")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsg-input",
								value: serverUrl.text,
								placeholder: t("settings.inherit"),
								onChange: (e) => setServerUrl({
									text: e.target.value,
									dirty: e.target.value !== state.serverUrl
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-field-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								title: t("settings.authTokenHint"),
								children: t("settings.authToken")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsg-input",
								value: authToken.text,
								placeholder: t("settings.inherit"),
								onChange: (e) => setAuthToken({
									text: e.target.value,
									dirty: e.target.value !== state.authToken
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsg-hint",
							"data-testid": "games-rules-note",
							children: t("settings.rulesSummary", {
								step: formatTokens(step),
								base: rules.crown.base,
								levels: rules.crown.levels.length,
								maxBytes: Math.round(rules.pet.maxBytes / 1024 / 1024 * 10) / 10,
								maxDimension: rules.pet.maxDimension
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsg-actions",
							children: [saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsg-note",
								children: t("settings.saved")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsg-btn",
								disabled: !dirty || saving,
								onClick: () => {
									save();
								},
								"data-testid": "games-settings-save",
								children: t("settings.save")
							})]
						}),
						note !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsg-note",
							"data-testid": "games-settings-note",
							children: note
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/settings-slot.ts
		/** Stable keyed-slot cell occupied by the games settings card. */
		const GAMES_SETTINGS_SLOT = {
			name: "settings.plugin.item",
			key: "games"
		};
		/**
		* Compatibility fields for pre-keyed DSH builds. New keyed runtimes ignore
		* them, while older list runtimes still require them during registration.
		*/
		const LEGACY_GAMES_SETTINGS_SLOT = {
			id: "games",
			order: 150
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-games plain CSS, injected as one <style data-plugin-css> tag by the
		* client entry. Colors follow the DSH web skin's own semantic tokens
		* (`--dsw-alias-*`, defined on the DSH page for light/dark themes) with
		* neutral fallbacks, so the plugin matches DSH's look in both themes.
		*
		* Floating surfaces use the same semantic layer, label, and border tokens as
		* the surrounding DSH theme so light and dark appearances stay consistent.
		* @module @kasidia/dsh-games/client/styles
		*/
		const STYLE_TAG_ID = "@kasidia/dsh-games/styles";
		const CSS = `
.dsg-pet-root {
  position: fixed;
  /* Above page chrome (aionui float = 100) but below modal overlays (= 1000),
     so the pet never blocks the settings dialog. */
  z-index: 900;
  user-select: none;
  -webkit-user-select: none;
}
.dsg-pet-root:hover,
.dsg-pet-root:focus-within {
  z-index: 970;
}
.dsg-pet-root[data-dragging='true'] {
  cursor: grabbing;
  z-index: 980;
}
.dsg-pet-root[data-own='true'][data-chat-open='true'] {
  z-index: 990;
}
.dsg-pet-root[data-own='true'][data-chat-open='true'] > .dsg-pet {
  z-index: 990;
}
.dsg-pet {
  position: relative;
  cursor: pointer;
  touch-action: none;
}
.dsg-pet:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 5px;
  border-radius: 8px;
}
.dsg-pet .dsg-whale-wrap {
  position: relative;
  display: block;
  transform: translateY(0) rotate(0deg);
  will-change: transform;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.dsg-pet .dsg-whale-breathe {
  position: relative;
  display: block;
  transform-origin: 50% 78%;
  animation: dsg-sleep-breathe 3.8s ease-in-out infinite;
}
.dsg-whale-breathe > svg,
.dsg-whale-breathe > .dsg-pet-img {
  display: block;
  filter:
    drop-shadow(0 5px 7px rgba(15, 23, 42, 0.26))
    drop-shadow(0 1px 2px rgba(15, 23, 42, 0.18));
}
.dsg-pet[data-active='true'] .dsg-whale-wrap {
  animation: dsg-active-float 1.05s ease-in-out infinite;
}
.dsg-pet[data-active='true'][data-phase='tool'] .dsg-whale-wrap {
  animation-duration: 0.72s;
}
.dsg-pet[data-active='true'] .dsg-whale-breathe {
  animation: dsg-wake-up 280ms ease-out both;
}
@keyframes dsg-sleep-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04, 0.96); }
}
@keyframes dsg-wake-up {
  from { transform: scale(1.04, 0.96); }
  to { transform: scale(1); }
}
@keyframes dsg-active-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-14px) rotate(2.5deg); }
}
.dsg-hat {
  pointer-events: none;
  z-index: 1;
}
.dsg-hat-badge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: -6px;
  background: var(--dsw-alias-tooltip-bg, rgba(67, 69, 74, 0.92));
  color: #fff;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
}
/* Floating labels follow DSH's semantic surfaces in both light and dark mode. */
.dsg-pet-label {
  position: absolute;
  isolation: isolate;
  left: 50%;
  transform: translateX(-50%);
  top: 100%;
  box-sizing: border-box;
  width: max-content;
  max-width: min(var(--dsg-label-max-width, 160px), calc(100vw - 16px));
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1.25;
  white-space: normal;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
  transition:
    opacity 120ms ease,
    border-color 260ms ease,
    box-shadow 260ms ease;
}
.dsg-pet-label::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(103, 158, 254, 0.45) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-size: 220px 100%;
  background-repeat: no-repeat;
  opacity: 0;
  pointer-events: none;
  animation: dsg-label-shimmer 1.4s linear infinite;
  transition: opacity 260ms ease;
}
.dsg-label-content {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 1px;
  min-width: 0;
  max-width: 100%;
}
.dsg-label-player {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #e8e8f0);
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-label-tokens {
  display: block;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.68));
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.dsg-pet-root[data-own='true'] > .dsg-pet > .dsg-pet-label .dsg-label-player,
.dsg-pet-root[data-own='true'] > .dsg-pet > .dsg-pet-label .dsg-label-tokens {
  font-weight: 700;
}
/* Bubbles sit right above the bottom label bar (never under the crown pile)
   and on top of every pet layer. */
.dsg-pet-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 6;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
  animation: dsg-bubble 0.25s ease-out;
}
.dsg-pet-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
}
@keyframes dsg-bubble {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
/* The pet panel follows the DSH theme and stays inside the viewport even when
   the draggable pet is parked against an edge. Its header remains visible
   while the content below it scrolls. */
.dsg-popover {
  position: fixed;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 24px));
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3, 0 18px 48px rgba(0, 0, 0, 0.38));
  font-size: 13px;
  animation: dsg-pop 0.18s ease-out;
  isolation: isolate;
}
.dsg-popover-header {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: none;
  min-height: 48px;
  padding: 12px 14px;
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1));
}
.dsg-popover-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
}
.dsg-popover-avatar img {
  display: block;
  width: 38px;
  height: 38px;
  object-fit: contain;
}
.dsg-popover-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.dsg-popover h3 {
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-popover-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.58));
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}
.dsg-popover-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsg-phase-indicator {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #8e8e93);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2, #19212d);
}
.dsg-phase-indicator[data-phase='thinking'] { background: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dsg-phase-indicator[data-phase='tool'] { background: var(--dsw-alias-state-warn-primary, #ff9500); }
.dsg-phase-indicator[data-phase='done'] { background: var(--dsw-alias-state-success-primary, #34c759); }
.dsg-icon-btn {
  appearance: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.62));
  cursor: pointer;
  font: inherit;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-icon-btn span {
  font-size: 20px;
  line-height: 1;
  transform: translateY(-1px);
}
.dsg-icon-btn:hover {
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-icon-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-popover-body {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.dsg-popover-body::-webkit-scrollbar { width: 8px; }
.dsg-popover-body::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 4px;
}
.dsg-popover-section {
  padding: 15px 16px 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
}
.dsg-popover-section-last {
  padding-bottom: 16px;
  border-bottom: 0;
}
.dsg-popover-section > h4 {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}
@keyframes dsg-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0); }
}
.dsg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.dsg-popover-section .dsg-field:last-child {
  margin-bottom: 12px;
}
.dsg-field label {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.75));
}
.dsg-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsg-field-heading output {
  flex: none;
  min-width: 50px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.76));
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}
.dsg-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-specific-input-major, rgba(0, 0, 0, 0.3));
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.dsg-input:focus {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dsg-input-action .dsg-input {
  min-width: 0;
  flex: 1;
}
.dsg-position-actions > * {
  min-width: 0;
  flex: 1;
  padding-right: 10px;
  padding-left: 10px;
}
/* Buttons share one family everywhere (popover, room panel, settings card):
   primary is the official DSH inverted pill (label-primary background with
   layer-3 text), ghost is the bordered outline button. The upload button is a
   <label> inside .dsg-field, whose label rule would otherwise win on color —
   the explicit .dsg-field label.dsg-btn selector keeps the button text dark. */
.dsg-btn,
.dsg-field label.dsg-btn {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  background: var(--dsw-alias-label-primary, #fff);
  color: var(--dsw-alias-bg-layer-3, #1f2836);
  transition: filter 120ms ease;
}
.dsg-btn:hover:not(:disabled) { filter: brightness(1.08); }
.dsg-btn:disabled { opacity: 0.4; cursor: default; }
.dsg-field label.dsg-btn[data-disabled='true'] {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.dsg-btn:focus-visible,
.dsg-btn-ghost:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-btn-ghost {
  appearance: none;
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #e8e8f0);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-btn-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #fff);
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-btn-ghost[data-on='true'] {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.18));
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-btn-ghost:disabled { opacity: 0.4; cursor: default; }
.dsg-btn-danger {
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #ff453a);
  border-color: var(--dsw-alias-state-error-primary, #ff453a);
}
.dsg-btn-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(255, 69, 58, 0.15));
  color: var(--dsw-alias-state-error-primary, #ff453a);
}
.dsg-divider {
  height: 1px;
  background: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1));
  margin: 12px 0;
}
.dsg-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
  margin: 6px 0 0;
  line-height: 1.4;
}
.dsg-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, #ff6b62);
  margin: 6px 0 0;
}
.dsg-note {
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary, #7ee2a8);
  margin: 6px 0 0;
}
.dsg-room-info {
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.4));
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.dsg-room-info .dsg-room-copy {
  background-color: rgb(53, 54, 56) !important;
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-room-info .dsg-room-copy:hover:not(:disabled) {
  background-color: rgb(53, 54, 56) !important;
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-room-info .dsg-room-code {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.dsg-member {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 6px 10px;
}
.dsg-member .dsg-member-whale {
  position: relative;
  flex: none;
}
.dsg-member .dsg-member-meta {
  min-width: 0;
  flex: 1;
}
.dsg-member .dsg-member-name {
  font-weight: 400;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-member .dsg-member-sub {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-member.dsg-member-you {
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.55));
}
.dsg-member.dsg-member-you .dsg-member-name,
.dsg-member.dsg-member-you .dsg-member-sub {
  font-weight: 700;
}
.dsg-member-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.dsg-member-dot[data-phase='idle'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-member-dot[data-phase='waiting'] { background: var(--dsw-alias-label-tertiary, #8e8e93); }
.dsg-member-dot[data-phase='thinking'] { background: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dsg-member-dot[data-phase='tool'] { background: var(--dsw-alias-state-warn-primary, #ff9500); }
.dsg-member-dot[data-phase='done'] { background: var(--dsw-alias-state-success-primary, #34c759); }
/* The settings card mirrors the official DSH plugin-item PluginCard chrome
   (dsh-client-ui-settings-plugins): a layer-3 card with 12px radius, a
   name/description header with a rotating chevron, and a body separated by
   a border-top. */
.dsg-settings-card {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-radius: 12px;
  transition: border-color 0.16s, background 0.16s;
}
.dsg-settings-card:hover,
.dsg-settings-card[data-open='true'] {
  border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.35));
}
.dsg-settings-card[data-open='true'] {
  background: var(--dsw-alias-bg-layer-2, #1a222e);
}
.dsg-settings-header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dsg-settings-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
}
.dsg-settings-head-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
.dsg-settings-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary, #fff);
}
.dsg-settings-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
}
.dsg-settings-chevron {
  display: block;
  flex: none;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.55));
  transition: transform 0.16s;
}
.dsg-settings-card[data-open='true'] .dsg-settings-chevron,
.dsg-settings-chevron.dsg-settings-chevron-open {
  transform: rotate(180deg);
}
/* "Unsaved changes" pill in the header while drafts are staged (official
   PluginCard.pending). */
.dsg-settings-pending {
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.7));
  border-radius: 999px;
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dsg-settings-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  margin: 0 16px;
  padding: 12px 0 8px;
}
.dsg-settings-body .dsg-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dsg-settings-card .dsg-field-row label {
  font-size: 13px;
  color: var(--dsw-alias-label-primary, rgba(232, 232, 240, 0.85));
  flex: none;
}
.dsg-settings-card .dsg-input {
  max-width: 200px;
}
.dsg-settings-card .dsg-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  padding: 12px 0 4px;
}
.dsg-toggle {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border: none;
  cursor: pointer;
  flex: none;
  transition: background 0.15s;
}
.dsg-toggle[data-on='true'] { background: var(--dsw-alias-button-info-fill, #4d6bfe); }
.dsg-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.dsg-toggle[data-on='true']::after { transform: translateX(16px); }

/* ---- crowns ---- */
.dsg-crown {
  position: absolute;
  left: 50%;
  top: 0;
  pointer-events: none;
  z-index: 1;
  will-change: transform;
  /* the pile re-collapses on every merge: crowns glide to their new slot */
  transition: transform 0.55s cubic-bezier(0.3, 1.15, 0.4, 1), opacity 0.3s ease;
}
.dsg-crown svg {
  transform: rotate(var(--dsg-rot, 0deg));
}
.dsg-crown-magic svg {
  animation: dsg-magic-glow 1.6s ease-in-out infinite;
}
@keyframes dsg-magic-glow {
  0%, 100% { filter: brightness(1.04) saturate(1.05); }
  50% { filter: brightness(1.28) saturate(1.2); }
}
/* a crown that just crafted up: it inherits a consumed crown's key and slides
   to its new slot (transition above) while popping bright at the destination */
.dsg-crown-merged svg {
  animation: dsg-crown-merged 0.6s cubic-bezier(0.3, 1.2, 0.4, 1);
}
@keyframes dsg-crown-merged {
  0% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(0.45);
    filter: brightness(2.1);
  }
  45% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(1.1);
    filter: brightness(1.45);
  }
  100% {
    transform: rotate(var(--dsg-rot, 0deg)) scale(1);
    filter: brightness(1);
  }
}
/* a freshly earned crown pops in at its slot */
.dsg-crown-in svg {
  animation: dsg-crown-in 0.5s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes dsg-crown-in {
  0% { opacity: 0; transform: rotate(var(--dsg-rot, 0deg)) scale(0.15); }
  60% { opacity: 1; transform: rotate(var(--dsg-rot, 0deg)) scale(1.12); }
  100% { opacity: 1; transform: rotate(var(--dsg-rot, 0deg)) scale(1); }
}
/* consumed crowns shrink + fade away at their old spot (later rules win
   over the magic glow for the animation property) */
.dsg-crown-ghost {
  transition: none;
  animation: dsg-crown-ghost-fade 0.45s ease-in forwards;
}
.dsg-crown-ghost svg {
  animation: dsg-crown-ghost-shrink 0.45s ease-in forwards;
}
@keyframes dsg-crown-ghost-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes dsg-crown-ghost-shrink {
  from { transform: rotate(var(--dsg-rot, 0deg)) scale(1); }
  to { transform: rotate(var(--dsg-rot, 0deg)) scale(0.5); }
}
/* one-shot burst at the merge point */
.dsg-crown-flash {
  position: absolute;
  left: 50%;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 3;
}
.dsg-crown-flash b,
.dsg-crown-flash i {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
}
.dsg-crown-flash i {
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  border: 2.5px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 14px rgba(160, 220, 255, 0.9);
  animation: dsg-flash-ring 0.65s ease-out forwards;
}
.dsg-crown-flash b {
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  background: radial-gradient(circle, #fff 0%, rgba(255, 255, 255, 0.9) 35%, rgba(255, 255, 255, 0) 70%);
  animation: dsg-flash-core 0.65s ease-out forwards;
}
@keyframes dsg-flash-ring {
  0% { opacity: 0.95; transform: scale(0.25); }
  100% { opacity: 0; transform: scale(1.5); }
}
@keyframes dsg-flash-core {
  0% { opacity: 0; transform: scale(0.3); }
  25% { opacity: 1; transform: scale(1.25); }
  100% { opacity: 0; transform: scale(0.45); }
}
.dsg-crown-badge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-tooltip-bg, rgba(20, 20, 30, 0.78));
  color: #ffd54f;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid rgba(255, 215, 79, 0.4);
}
.dsg-mini-crown {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -22%);
  pointer-events: none;
  z-index: 1;
}
.dsg-mini-crown svg {
  transform: rotate(var(--dsg-rot, -3deg));
}
.dsg-mini-crown-count {
  position: absolute;
  left: 50%;
  bottom: -12px;
  transform: translateX(-50%);
  font-style: normal;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.85));
  background: var(--dsw-alias-tooltip-bg, rgba(20, 20, 30, 0.7));
  border-radius: 7px;
  padding: 1px 4px;
  white-space: nowrap;
}

/* ---- token-usage FX on the pet label ---- */
.dsg-label-active {
  box-shadow: 0 0 0 1px var(--dsw-alias-button-info-fill, #4d6bfe), 0 0 10px var(--dsw-alias-button-info-fill, #4d6bfe);
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-label-active::before {
  opacity: 1;
}
@keyframes dsg-label-shimmer {
  0% { background-position: -120px 0; }
  100% { background-position: 220px 0; }
}
.dsg-label-burst {
  animation: dsg-label-burst 0.6s ease-out;
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
@keyframes dsg-label-burst {
  0% { transform: translateX(-50%) scale(1); }
  40% { transform: translateX(-50%) scale(1.12); }
  100% { transform: translateX(-50%) scale(1); }
}
.dsg-token-chip {
  display: inline-block;
  font-style: normal;
  color: var(--dsw-alias-state-success-primary, #7ee2a8);
  margin-left: 4px;
  font-weight: 700;
  animation: dsg-chip-pop 1.8s ease-out forwards;
}
@keyframes dsg-chip-pop {
  0% { opacity: 0; transform: translateY(4px) scale(0.8); }
  15% { opacity: 1; transform: translateY(0) scale(1.1); }
  30% { transform: translateY(0) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; }
}

/* ---- pet customization ---- */
.dsg-slider {
  appearance: none;
  width: 100%;
  height: 18px;
  margin: 0;
  background: transparent;
  accent-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  cursor: pointer;
}
.dsg-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-slider::-webkit-slider-thumb {
  appearance: none;
  width: 17px;
  height: 17px;
  margin-top: -6.5px;
  border: 3px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
}
.dsg-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsg-slider::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: 3px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
}
.dsg-slider:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
  border-radius: 8px;
}
.dsg-swatch-grid {
  display: grid;
  grid-template-columns: repeat(7, 32px);
  justify-content: space-between;
  gap: 8px;
}
.dsg-swatch {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.25));
  cursor: pointer;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.dsg-swatch:hover { transform: translateY(-2px); }
.dsg-swatch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}
.dsg-swatch[data-on='true'] {
  border-color: var(--dsw-alias-label-primary, #fff);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
  transform: translateY(-2px);
}
.dsg-swatch[data-on='true']::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.72);
}
/* The custom-color swatch shows a rainbow until a custom gradient is picked. */
.dsg-swatch-custom {
  background: conic-gradient(#6d8bff, #ff8a80, #5eead4, #ffe082, #c4b5fd, #67e8f9, #6d8bff);
}
.dsg-custom-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
.dsg-color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 116px;
  flex: 1;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.04));
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.75));
}
.dsg-color-field input[type='color'] {
  width: 34px;
  height: 26px;
  padding: 1px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: var(--dsw-specific-input-major, rgba(0, 0, 0, 0.3));
  cursor: pointer;
}
.dsg-color-field input[type='color']:focus {
  outline: none;
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  box-shadow: 0 0 0 2px var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsg-pet-img {
  display: block;
  object-fit: contain;
}
.dsg-pet-preview {
  width: 52px;
  height: 52px;
  flex: none;
  object-fit: contain;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
}
.dsg-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 50px;
  padding: 9px;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.035));
}
.dsg-upload-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}
.dsg-upload-meta {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.58));
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- room list + create options ---- */
.dsg-room-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.dsg-room-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 6px 10px;
}
.dsg-room-row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dsg-room-row-name {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsg-room-row-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  background: var(--dsw-alias-bg-layer-2, #19212d);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsg-radio input { display: none; }
.dsg-radio:hover {
  background: var(--dsw-alias-bg-layer-3, #1f2836);
}
.dsg-radio[data-on='true'] {
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary, #fff);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.45));
}
.dsg-grid-size {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 8px;
  margin-top: 6px;
}
.dsg-grid-size > label {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  font-size: 12px;
}
.dsg-grid-size > span {
  padding-bottom: 7px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-grid-size input {
  width: 100%;
  min-width: 0;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  padding: 0 8px;
  background: var(--dsw-alias-bg-layer-2, #19212d);
  color: var(--dsw-alias-label-primary, #fff);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.dsg-grid-size input:focus {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
  border-color: transparent;
}
.dsg-scene-note {
  margin: 6px 0 0;
}
.dsg-room-visibility-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  vertical-align: 1px;
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.25));
  border: 1px solid var(--dsw-alias-button-info-fill, rgba(77, 107, 254, 0.5));
}
.dsg-room-visibility-tag[data-public='false'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 149, 0, 0.2));
  border-color: var(--dsw-alias-state-warn-primary, rgba(255, 149, 0, 0.5));
}
.dsg-member-pet {
  display: block;
  object-fit: contain;
  border-radius: 8px;
}
.dsg-select {
  max-width: 200px;
}
.dsg-select option {
  background: var(--dsw-alias-bg-layer-3, #24242f);
  color: var(--dsw-alias-label-primary, #e8e8f0);
}

/* ---- room pet scene (member pets around the anchor) ---- */
.dsg-scene-root {
  z-index: 900;
}
.dsg-scene-root[data-dragging='false'] .dsg-pet {
  cursor: default;
}
.dsg-scene-label {
  opacity: 0;
  z-index: 3;
}
.dsg-pet:hover > .dsg-whale-wrap {
  z-index: 20;
}
.dsg-pet:hover > .dsg-pet-label {
  z-index: 30;
}
.dsg-pet:hover > .dsg-chat-hint,
.dsg-pet:hover > .dsg-chat-bubble,
.dsg-pet:focus-within > .dsg-chat-composer {
  z-index: 40;
}
.dsg-pet:hover > .dsg-pet-label.dsg-scene-label,
.dsg-pet[data-show-label='true'] > .dsg-pet-label.dsg-scene-label,
.dsg-scene-label:hover {
  opacity: 1;
}

/* ---- room chat (hover hint, composer, message bubbles) ---- */
.dsg-chat-hint,
.dsg-chat-bubble {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 6;
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  color: var(--dsw-alias-label-primary, #e8e8f0);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
}
.dsg-chat-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
}
.dsg-pet:hover > .dsg-chat-hint {
  opacity: 1;
  pointer-events: auto;
}
.dsg-chat-hint[data-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}
.dsg-chat-bubble {
  box-sizing: border-box;
  width: max-content;
  min-width: 0;
  max-width: min(280px, calc(100vw - 24px));
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.5;
  padding: 6px 14px;
  animation: dsg-chat-pop 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes dsg-chat-pop {
  0% { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.5); }
  60% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.08); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}
.dsg-chat-bubble.dsg-chat-leaving {
  animation: dsg-chat-out 0.25s ease forwards;
}
@keyframes dsg-chat-out {
  0% { opacity: 1; transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.9); }
}
.dsg-chat-composer {
  position: absolute;
  left: calc(50% + var(--dsg-chat-composer-shift-x, 0px));
  transform: translateX(-50%);
  top: calc(100% - 30px);
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: min(286px, calc(100vw - 16px));
  background: var(--dsw-alias-bg-layer-3, #1f2836);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  border-radius: 999px;
  padding: 4px 6px 4px 12px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.2));
}
.dsg-chat-composer .dsg-chat-input {
  flex: 1;
  width: auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #e8e8f0);
  font-size: 12px;
  outline: none;
  padding: 0;
}
.dsg-chat-composer .dsg-chat-input::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(232, 232, 240, 0.6));
}
.dsg-chat-composer .dsg-btn {
  flex: none;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 999px;
  white-space: nowrap;
}
.dsg-chat-close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, rgba(232, 232, 240, 0.8));
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsg-chat-close:hover {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(77, 107, 254, 0.2));
  color: var(--dsw-alias-label-primary, #e8e8f0);
}
.dsg-chat-close:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}

@media (max-width: 480px) {
  .dsg-popover-header {
    padding: 11px 12px;
  }
  .dsg-popover-section {
    padding-right: 13px;
    padding-left: 13px;
  }
  .dsg-swatch-grid {
    grid-template-columns: repeat(7, 30px);
    gap: 5px;
  }
  .dsg-swatch {
    width: 30px;
    height: 30px;
  }
  .dsg-position-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .dsg-position-actions > * {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsg-popover,
  .dsg-swatch {
    animation: none;
    transition: none;
  }
}
`;
		/** Inject the stylesheet once (idempotent); returns the tag for later removal. */
		function injectStyles() {
			const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
			if (existing !== null) {
				if (existing.textContent !== CSS) existing.textContent = CSS;
				return existing;
			}
			const tag = document.createElement("style");
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return tag;
		}
		//#endregion
		//#region src/client/index.ts
		/** Settings namespace the games card edits (the Host plugin registers it). */
		const GAMES_SETTINGS_NS = GAMES_SETTINGS_SLOT.key;
		/** DOM marker of the pet root container (cleaned up on re-apply). */
		const PET_ROOT_MARKER = "data-dsh-games-root";
		/** Required services. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope",
			"remote"
		];
		/**
		* Client plugin body: register dictionaries, seat the settings card, and
		* mount the global pet surface while the plugin is enabled.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "games: dictionaries");
			for (const stale of document.querySelectorAll(`[${PET_ROOT_MARKER}]`)) stale.remove();
			const settingsScope = ctx.settingsScope.bind({ namespace: GAMES_SETTINGS_NS });
			const enabled = () => {
				const snapshot = settingsScope.getSnapshot();
				return snapshot.status === "ready" ? snapshot.value?.enabled ?? true : snapshot.status === "unavailable";
			};
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				...GAMES_SETTINGS_SLOT,
				...LEGACY_GAMES_SETTINGS_SLOT,
				locale: NS,
				inject: () => ({})
			}, GamesSettingsCard));
			ctx.effect(() => {
				injectStyles();
				const container = document.createElement("div");
				container.dataset.dshGamesRoot = "";
				document.body.appendChild(container);
				const petRoot = (0, react_dom_client.createRoot)(container);
				const render = () => {
					if (enabled()) petRoot.render((0, react.createElement)(GamesApp, { t }));
					else petRoot.render(null);
				};
				const unsubscribe = settingsScope.subscribe(render);
				render();
				return () => {
					unsubscribe();
					petRoot.unmount();
					container.remove();
				};
			}, "games: pet surface");
		}
		//#endregion
		exports.GamesApp = GamesApp;
		exports.GamesSettingsCard = GamesSettingsCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map