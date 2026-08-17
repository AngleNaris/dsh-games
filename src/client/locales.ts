/**
 * dsh-games locale dictionaries (zh/en).
 * @module @linxin666/dsh-games/client/locales
 */

/** Dictionary namespace this package registers. */
export const NS = 'games'

/** Chinese copy. */
export const zh = {
  'pet.summon': '召唤宠物',
  'pet.hats': '{n} 顶帽子',
  'pet.crowns': '{n} 顶王冠',
  'pet.tokens': '{n} tokens',
  'pet.tokenGain': '+{n}',
  'pet.phase.idle': '悠闲地游泳中',
  'pet.phase.waiting': '等待任务…',
  'pet.phase.thinking': '正在思考…',
  'pet.phase.tool': '在工具箱里翻找…',
  'pet.phase.done': '完成啦！',
  'pet.crown.gained': '获得{name}！',
  'pet.crown.crafted': '合成{name}！',
  'crown.bronze': '青铜王冠',
  'crown.silver': '白银王冠',
  'crown.gold': '黄金王冠',
  'crown.platinum': '铂金王冠',
  'crown.amethyst': '紫水晶王冠',
  'crown.magic-bronze': '魔法青铜王冠',
  'crown.magic-silver': '魔法白银王冠',
  'crown.magic-gold': '魔法黄金王冠',
  'crown.magic-platinum': '魔法铂金王冠',
  'crown.magic-amethyst': '魔法紫水晶王冠',
  'petVariant.default': '深海蓝',
  'petVariant.crimson': '绯红',
  'petVariant.emerald': '翡翠',
  'petVariant.gold': '鎏金',
  'petVariant.violet': '紫罗兰',
  'petVariant.ocean': '海洋青',
  'menu.title': '深海小屋',
  'menu.nickname': '我的昵称',
  'menu.nicknamePlaceholder': '输入昵称',
  'menu.save': '保存',
  'menu.saved': '已保存',
  'menu.hide': '隐藏宠物',
  'menu.size': '宠物大小',
  'menu.resetPosition': '复位位置',
  'menu.lockPosition': '锁定位置',
  'menu.unlockPosition': '解锁位置',
  'menu.petPattern': '宠物图案',
  'menu.uploadPet': '自定义宠物',
  'menu.chooseFile': '选择图片',
  'menu.uploading': '上传中…',
  'menu.uploaded': '已上传，房间内自动同步',
  'menu.removed': '已移除自定义宠物',
  'menu.removePet': '移除',
  'menu.uploadHint': '支持 PNG / GIF，≤ 2MB，最长边 ≤ 1024px',
  'menu.uploadHintRules': '支持 PNG / GIF，≤ {maxBytes}MB，最长边 ≤ {maxDimension}px（服务器规则）',
  'menu.uploadTypeError': '仅支持 PNG 或 GIF 图片',
  'menu.uploadSizeError': '图片超过 2MB 或尺寸限制',
  'menu.uploadError': '上传失败：{error}',
  'menu.error': '出错了：{error}',
  'room.title': '多人房间',
  'room.create': '创建房间',
  'room.join': '加入房间',
  'room.joinByCode': '用代码加入',
  'room.leave': '离开房间',
  'room.code': '房间代码',
  'room.url': '游戏服务器地址',
  'room.codePlaceholder': '如 K7D2',
  'room.urlPlaceholder': '如 http://127.0.0.1:3080',
  'room.namePlaceholder': '房间名称（可选）',
  'room.public': '公开房间',
  'room.inviteOnly': '邀请制',
  'room.publicHint': '公开房间会出现在房间列表，任何人都能加入',
  'room.inviteHint': '邀请制房间不在列表显示，只有知道代码的人能加入',
  'room.list': '公开房间',
  'room.listEmpty': '暂时没有公开房间，创建一个吧',
  'room.listError': '游戏服务器连不上',
  'room.refresh': '刷新',
  'room.people': '人',
  'room.joined': '已加入房间 {code}',
  'room.created': '房间已创建',
  'room.autoJoined': '已自动回到之前的房间',
  'room.copy': '复制',
  'room.copied': '已复制',
  'room.empty': '房间里还没有其他玩家，把地址和代码发给朋友吧',
  'room.shareHint': '把游戏服务器地址和代码发给朋友，他们加入后就能看到彼此的宠物',
  'room.members': '房间成员 ({n})',
  'room.you': '我',
  'room.joinError': '加入失败：{error}',
  'room.connecting': '连接中…',
  'room.offline': '房间暂时连不上',
  'scene.title': '成员排列',
  'scene.mode.free': '自由',
  'scene.mode.row': '水平对齐',
  'scene.mode.column': '垂直对齐',
  'scene.mode.grid': '网格吸附',
  'scene.mode.orbit': '环绕排列',
  'scene.spacing': '间距',
  'scene.reset': '重置位置',
  'scene.hint': '房间成员会围绕你的宠物排列；自由 / 网格模式下可直接拖动成员宠物',
  'settings.title': '深海小屋（宠物 + 王冠 + 房间）',
  'settings.description': 'DeepSeek 宠物：每累计使用一定 token 就获得一顶王冠（10 顶自动合成更高阶），还能和朋友同房间互看宠物。',
  'settings.enabled': '启用插件',
  'settings.enabledHint': '关闭后宠物隐藏并停止计数与轮询。',
  'settings.nickname': '昵称',
  'settings.nicknameHint': '房间内外展示的名字，1–24 个字符。',
  'settings.crownTokenStep': '每顶王冠的 token 数',
  'settings.crownTokenStepHint': '累计使用这么多 token 获得一顶青铜王冠，默认 100M。',
  'settings.petVariant': '宠物图案',
  'settings.petVariantHint': '内置宠物配色方案；也可在宠物面板上传自定义 PNG/GIF。',
  'settings.hidePet': '隐藏宠物',
  'settings.hidePetHint': '隐藏后右下角出现召唤按钮。',
  'settings.serverUrl': '游戏服务器地址',
  'settings.serverUrlHint': '多人房间与宠物同步的服务器；留空表示使用本机（同源）。',
  'settings.authToken': '服务器密钥',
  'settings.authTokenHint': '游戏服务器配置的 authToken；留空表示服务器不鉴权。',
  'settings.rulesSummary': '当前规则（服务器配置）：每 {step} token 一顶青铜王冠，{base} 合 1 升级，共 {levels} 级；宠物图 ≤ {maxBytes}MB、最长边 ≤ {maxDimension}px。',
  'settings.boost': '演示：加一顶王冠',
  'settings.boosted': '已添加 {tokens} tokens，累计 {crowns} 个王冠',
  'settings.save': '保存',
  'settings.discard': '放弃',
  'settings.saved': '已保存',
  'settings.inherit': '继承默认',
  'settings.invalidNumber': '请输入数字，留空则使用默认值。',
  'settings.readonly': '当前部署的设置只读。',
  'settings.notExposed': '当前 DSH 版本未向设置页暴露本插件的配置命名空间。',
  'settings.unsaved': '有未保存的修改',
} as const

/** English copy. */
export const en = {
  'pet.summon': 'Summon pet',
  'pet.hats': '{n} hat(s)',
  'pet.crowns': '{n} crown(s)',
  'pet.tokens': '{n} tokens',
  'pet.tokenGain': '+{n}',
  'pet.phase.idle': 'swimming along',
  'pet.phase.waiting': 'waiting for tasks…',
  'pet.phase.thinking': 'thinking hard…',
  'pet.phase.tool': 'digging through the toolbox…',
  'pet.phase.done': 'all done!',
  'pet.crown.gained': '{name} earned!',
  'pet.crown.crafted': '{name} crafted!',
  'crown.bronze': 'Bronze Crown',
  'crown.silver': 'Silver Crown',
  'crown.gold': 'Gold Crown',
  'crown.platinum': 'Platinum Crown',
  'crown.amethyst': 'Amethyst Crown',
  'crown.magic-bronze': 'Magic Bronze Crown',
  'crown.magic-silver': 'Magic Silver Crown',
  'crown.magic-gold': 'Magic Gold Crown',
  'crown.magic-platinum': 'Magic Platinum Crown',
  'crown.magic-amethyst': 'Magic Amethyst Crown',
  'petVariant.default': 'Deep Sea Blue',
  'petVariant.crimson': 'Crimson',
  'petVariant.emerald': 'Emerald',
  'petVariant.gold': 'Gold',
  'petVariant.violet': 'Violet',
  'petVariant.ocean': 'Ocean',
  'menu.title': 'Deep Sea Hut',
  'menu.nickname': 'My nickname',
  'menu.nicknamePlaceholder': 'Enter a nickname',
  'menu.save': 'Save',
  'menu.saved': 'Saved',
  'menu.hide': 'Hide pet',
  'menu.size': 'Pet size',
  'menu.resetPosition': 'Reset position',
  'menu.lockPosition': 'Lock position',
  'menu.unlockPosition': 'Unlock position',
  'menu.petPattern': 'Pet pattern',
  'menu.uploadPet': 'Custom pet',
  'menu.chooseFile': 'Choose image',
  'menu.uploading': 'Uploading…',
  'menu.uploaded': 'Uploaded — synced into rooms',
  'menu.removed': 'Custom pet removed',
  'menu.removePet': 'Remove',
  'menu.uploadHint': 'PNG / GIF only, ≤ 2MB, longest side ≤ 1024px',
  'menu.uploadHintRules': 'PNG / GIF only, ≤ {maxBytes}MB, longest side ≤ {maxDimension}px (server rules)',
  'menu.uploadTypeError': 'Only PNG or GIF images are supported',
  'menu.uploadSizeError': 'Image exceeds 2MB or the dimension limit',
  'menu.uploadError': 'Upload failed: {error}',
  'menu.error': 'Something went wrong: {error}',
  'room.title': 'Multiplayer room',
  'room.create': 'Create room',
  'room.join': 'Join room',
  'room.joinByCode': 'Join by code',
  'room.leave': 'Leave room',
  'room.code': 'Room code',
  'room.url': 'Game server address',
  'room.codePlaceholder': 'e.g. K7D2',
  'room.urlPlaceholder': 'e.g. http://127.0.0.1:3080',
  'room.namePlaceholder': 'Room name (optional)',
  'room.public': 'Public',
  'room.inviteOnly': 'Invite-only',
  'room.publicHint': 'Public rooms appear in the room list; anyone can join',
  'room.inviteHint': 'Invite-only rooms stay hidden; only players with the code can join',
  'room.list': 'Public rooms',
  'room.listEmpty': 'No public rooms yet — create one',
  'room.listError': 'Game server unreachable',
  'room.refresh': 'Refresh',
  'room.people': 'people',
  'room.joined': 'Joined room {code}',
  'room.created': 'Room created',
  'room.autoJoined': 'Auto-joined your previous room',
  'room.copy': 'Copy',
  'room.copied': 'Copied',
  'room.empty': 'No other players here yet — share the address and code with friends',
  'room.shareHint': 'Send the game server address and code to friends; once they join, you can see each other\u2019s pets',
  'room.members': 'Room members ({n})',
  'room.you': 'me',
  'room.joinError': 'Failed to join: {error}',
  'room.connecting': 'Connecting…',
  'room.offline': 'Room unreachable right now',
  'scene.title': 'Pet arrangement',
  'scene.mode.free': 'Free',
  'scene.mode.row': 'Horizontal',
  'scene.mode.column': 'Vertical',
  'scene.mode.grid': 'Grid snap',
  'scene.mode.orbit': 'Orbit',
  'scene.spacing': 'Spacing',
  'scene.reset': 'Reset positions',
  'scene.hint': 'Room members arrange around your pet; in Free / Grid mode you can drag member pets',
  'settings.title': 'Deep Sea Hut (pet + crowns + rooms)',
  'settings.description': 'A DeepSeek pet that earns a crown per token batch (10 auto-craft into the next tier), with multiplayer rooms to show off pets.',
  'settings.enabled': 'Enable plugin',
  'settings.enabledHint': 'When off, the pet hides and counting and polling stop.',
  'settings.nickname': 'Nickname',
  'settings.nicknameHint': 'The name shown on the pet and in rooms, 1\u201324 characters.',
  'settings.crownTokenStep': 'Tokens per crown',
  'settings.crownTokenStepHint': 'One bronze crown per this many usage tokens; 100M by default.',
  'settings.petVariant': 'Pet pattern',
  'settings.petVariantHint': 'Built-in pet color patterns; you can also upload a custom PNG/GIF from the pet panel.',
  'settings.hidePet': 'Hide pet',
  'settings.hidePetHint': 'A summon button appears in the corner while hidden.',
  'settings.serverUrl': 'Game server address',
  'settings.serverUrlHint': 'The server for multiplayer rooms and pet sync; leave empty for local (same-origin).',
  'settings.authToken': 'Server secret',
  'settings.authTokenHint': 'The authToken configured on the game server; leave empty for an open server.',
  'settings.rulesSummary': 'Server rules: {step} tokens per bronze crown, {base} craft into the next tier ({levels} tiers); pets ≤ {maxBytes}MB, longest side ≤ {maxDimension}px.',
  'settings.boost': 'Demo: add one crown',
  'settings.boosted': 'Added {tokens} tokens, now {crowns} crown unit(s)',
  'settings.save': 'Save',
  'settings.discard': 'Discard',
  'settings.saved': 'Saved',
  'settings.inherit': 'Inherit',
  'settings.invalidNumber': 'Enter a number, or leave blank to use the default.',
  'settings.readonly': 'Settings are read-only in this deployment.',
  'settings.notExposed': 'This DSH version does not expose this plugin\u2019s settings namespace.',
  'settings.unsaved': 'Unsaved changes',
} as const

/** Key union for this namespace. */
export type GamesKey = keyof typeof zh

/**
 * Active dictionary, picked by the document language at call time. The pet
 * mounts as a global floating surface (not a slot), so it resolves its copy
 * this tiny way; the settings card receives the framework-injected `t` seat.
 */
export function dictionary(): Record<GamesKey, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? en : zh
}

/**
 * Translate a key with optional `{name}` template params. A missing key
 * degrades to the key itself rather than throwing.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  let text: string = (dictionary() as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

/** Format a token count compactly (zh: 万/亿, other: K/M/B). */
export function formatTokens(n: number, lang?: string): string {
  const language = lang ?? (typeof document !== 'undefined' ? document.documentElement.lang : 'zh')
  if (n < 10_000) return String(Math.round(n))
  if (language.toLowerCase().startsWith('zh')) {
    if (n < 100_000_000) return `${trim1(n / 10_000)}万`
    return `${trim2(n / 100_000_000)}亿`
  }
  if (n < 1_000_000) return `${trim1(n / 1000)}K`
  if (n < 1_000_000_000) return `${trim2(n / 1_000_000)}M`
  return `${trim2(n / 1_000_000_000)}B`
}

function trim1(v: number): string {
  const s = v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function trim2(v: number): string {
  const s = v.toFixed(2)
  return s.replace(/\.?0+$/, '')
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-games UI copy. */
    games: GamesKey
  }
}
