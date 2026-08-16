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
  'pet.tokens': '{n} tokens',
  'pet.phase.idle': '悠闲地游泳中',
  'pet.phase.waiting': '等待任务…',
  'pet.phase.thinking': '正在思考…',
  'pet.phase.tool': '在工具箱里翻找…',
  'pet.phase.done': '完成啦！',
  'menu.title': '深海小屋',
  'menu.nickname': '我的昵称',
  'menu.nicknamePlaceholder': '输入昵称',
  'menu.save': '保存',
  'menu.saved': '已保存',
  'menu.hide': '隐藏宠物',
  'menu.error': '出错了：{error}',
  'room.title': '多人房间',
  'room.create': '创建房间',
  'room.join': '加入房间',
  'room.leave': '离开房间',
  'room.code': '房间代码',
  'room.url': '房间地址',
  'room.codePlaceholder': '如 K7D2',
  'room.urlPlaceholder': '如 http://127.0.0.1:3080',
  'room.joined': '已加入房间 {code}',
  'room.created': '房间已创建',
  'room.copy': '复制',
  'room.copied': '已复制',
  'room.empty': '房间里还没有其他玩家，把地址和代码发给朋友吧',
  'room.shareHint': '把房间地址和代码发给朋友，他们加入后就能看到彼此的宠物',
  'room.members': '房间成员 ({n})',
  'room.you': '我',
  'room.joinError': '加入失败：{error}',
  'room.connecting': '连接中…',
  'room.offline': '房间暂时连不上',
  'settings.title': '深海小屋（宠物 + 房间）',
  'settings.description': 'DeepSeek 宠物：每累计使用一定 token 就多一顶帽子，还能和朋友同房间互看宠物。',
  'settings.enabled': '启用插件',
  'settings.enabledHint': '关闭后宠物隐藏并停止计数与轮询。',
  'settings.nickname': '昵称',
  'settings.nicknameHint': '房间内外展示的名字，1–24 个字符。',
  'settings.hatTokenStep': '每顶帽子的 token 数',
  'settings.hatTokenStepHint': '累计使用这么多 token 加一顶帽子，默认 100M。',
  'settings.boost': '演示：加一顶帽子',
  'settings.boosted': '已添加 {tokens} tokens，现在 {hats} 顶帽子',
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
  'pet.tokens': '{n} tokens',
  'pet.phase.idle': 'swimming along',
  'pet.phase.waiting': 'waiting for tasks…',
  'pet.phase.thinking': 'thinking hard…',
  'pet.phase.tool': 'digging through the toolbox…',
  'pet.phase.done': 'all done!',
  'menu.title': 'Deep Sea Hut',
  'menu.nickname': 'My nickname',
  'menu.nicknamePlaceholder': 'Enter a nickname',
  'menu.save': 'Save',
  'menu.saved': 'Saved',
  'menu.hide': 'Hide pet',
  'menu.error': 'Something went wrong: {error}',
  'room.title': 'Multiplayer room',
  'room.create': 'Create room',
  'room.join': 'Join room',
  'room.leave': 'Leave room',
  'room.code': 'Room code',
  'room.url': 'Room address',
  'room.codePlaceholder': 'e.g. K7D2',
  'room.urlPlaceholder': 'e.g. http://127.0.0.1:3080',
  'room.joined': 'Joined room {code}',
  'room.created': 'Room created',
  'room.copy': 'Copy',
  'room.copied': 'Copied',
  'room.empty': 'No other players here yet — share the address and code with friends',
  'room.shareHint': 'Send the room address and code to friends; once they join, you can see each other\u2019s pets',
  'room.members': 'Room members ({n})',
  'room.you': 'me',
  'room.joinError': 'Failed to join: {error}',
  'room.connecting': 'Connecting…',
  'room.offline': 'Room unreachable right now',
  'settings.title': 'Deep Sea Hut (pet + rooms)',
  'settings.description': 'A DeepSeek pet that grows a hat for every batch of tokens you use, and multiplayer rooms to show off pets.',
  'settings.enabled': 'Enable plugin',
  'settings.enabledHint': 'When off, the pet hides and counting and polling stop.',
  'settings.nickname': 'Nickname',
  'settings.nicknameHint': 'The name shown on the pet and in rooms, 1\u201324 characters.',
  'settings.hatTokenStep': 'Tokens per hat',
  'settings.hatTokenStepHint': 'One hat per this many usage tokens; 100M by default.',
  'settings.boost': 'Demo: add one hat',
  'settings.boosted': 'Added {tokens} tokens, now {hats} hat(s)',
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
