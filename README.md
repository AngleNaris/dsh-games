# dsh-games — DeepSeek Harness 趣味插件（技术原型）

「桌面宠物 + 多人房间」：在 DSH Web GUI 里养一只 **DeepSeek 鲸鱼 logo 宠物**，
随你的 token 用量**长出帽子**（默认每 100M token 一顶，可配置）；还能**创建/加入
房间**，实时看到房间内所有玩家的宠物、昵称、token 与帽子。

**只依赖两样东西**：DSH 官方 NPM SDK（`@deepseek-ai/*`）+ 插件自身
host 半区（房间服务器就运行在你的 DSH host 进程里）。**不依赖** dsh-skin /
dsh-pet 等任何其他插件，单独安装即可使用。

---

## 功能

- **桌面宠物**：右下角漂浮的 DeepSeek 鲸鱼（官方 logo 路径内嵌），随模型活动
  切换动画（思考/工具/完成），可拖拽、可隐藏/召唤。
- **昵称**：点宠物打开「深海小屋」面板即可改名，也可在设置卡里改。
- **帽子系统**：host 实时累计**所有会话**的 usage token（input + output +
  cacheRead + cacheWrite），`帽子数 = 累计token / 每帽token`（默认
  **100,000,000 = 100M**）。设置卡里可改每帽阈值，或一键「演示：加一顶帽子」。
- **多人房间**：
  - 任意实例点「创建房间」→ 得到一个 4 位房间代码 + 房间地址；
  - 朋友在另一台机器/另一个实例点「加入房间」输入地址 + 代码；
  - 加入后每个玩家每 3s 上报自己的宠物状态（昵称/token/帽子/活动相位），
    所有人实时看到房间成员列表（迷你宠物 + 帽子 + 数据 + 在线相位点）。

## 安装

```sh
# 1. 构建（需要 node >= 22.19）
cd <本仓库>
pnpm install
pnpm build

# 2. 安装进 DSH profile
dsh plugin --profile web add link:<本仓库绝对路径>

# 3. 重启 web（配置热重载后刷新页面即可）
dsh web
```

浏览器打开 `http://127.0.0.1:3080`，右下角出现鲸鱼宠物即成功。
插件设置位于：设置 → 插件 → 插件配置 → Web UI 插件 → **深海小屋（宠物 + 房间）**。

> 说明：官方 dsh-host-apiproxy 对第三方设置命名空间有硬编码白名单，因此
> 设置卡走插件自己的 `/api/games/*` HTTP 接口（host 侧会同时把值镜像进
> `~/.dsh/settings.yaml` 的 `games:` 段），任何部署下都可用。

## 多人演示（本机两实例）

```sh
# 实例 A（默认）
dsh web

# 实例 B：独立的 DSH_HOME => 独立的身份与 token 账本
mkdir %USERPROFILE%\.dsh-b
mklink /J %USERPROFILE%\.dsh-b\profiles %USERPROFILE%\.dsh\profiles   # 共享同一 profile（含本插件）
set DSH_HOME=%USERPROFILE%\.dsh-b
dsh web --port 3081
```

- A：点宠物 → 创建房间 → 记下代码（如 `VWS8`）。
- B：点宠物 → 加入房间 → 地址填 `http://127.0.0.1:3080` + 代码。
- 两边同时看到双方宠物；任意一边 token 增长（或点「演示：加一顶帽子」），
  另一边 3~6 秒内看到帽子变化。

真实多人：把房间地址 + 代码发给局域网内的朋友（对方也安装本插件即可；
若对方机器无法访问你的端口，可把 `dsh web` 绑到 `0.0.0.0`）。

## 架构

```
浏览器 (client 半区, lib/client.js)
 ├─ 漂浮宠物 / 深海小屋面板 / 房间列表 / 设置卡   (React, 挂 document.body)
 └─ 轮询：自己的 /api/games/state（2s）；房间心跳+快照（3s）

DSH host 进程 (host 半区, lib/index.js)
 ├─ GamesService
 │   ├─ token 账本：监听 session/event（assistant/message 与 usage chunk），
 │   │   按 (sessionId, turn, step) 去重（跨进程用持久化 frontier，进程内
 │   │   用增量合并），累计写入 $DSH_HOME/games.json
 │   ├─ 活动相位：activity/status → idle/thinking/tool/done
 │   └─ 房间存储：内存 RoomStore（成员心跳 20s 超时清理）
 ├─ HTTP 路由 /api/games/*
 │   ├─ state / nickname / boost / display / config
 │   └─ rooms/<code>/state | members (POST/DELETE) — 跨域 CORS 开放
 └─ settings 命名空间 `games`（enabled / nickname / hatTokenStep）
```

关键文件：

- `src/index.ts` — host 入口（服务 + 路由 + 设置区注册）
- `src/service.ts` — GamesService（账本 / 相位 / 显示 / 配置）
- `src/ledger.ts` — token 累计纯逻辑（frontier + 增量合并去重）
- `src/rooms.ts` — 房间存储（代码生成 / 心跳 / 过期清理）
- `src/routes.ts` — `/api/games/*` HTTP 路由（含 CORS）
- `src/persist.ts` — `$DSH_HOME/games.json` 读写
- `src/client/` — 浏览器半区（宠物 / 面板 / 房间 / 设置卡 / 双语文案）
- `tools/verify*.mjs` — 浏览器端验证脚本（playwright）

## 数据

- `$DSH_HOME/games.json`：memberId、累计 token、按会话的计数 frontier、显示布局。
- `$DSH_HOME/settings.yaml` 的 `games:` 段：enabled / nickname / hatTokenStep。

## 开发

```sh
pnpm build        # tsc 类型 + tsdown 双产物（lib/index.js + lib/client.js）
pnpm typecheck
node tools/verify.mjs        # 单实例功能验证（宠物/改名/建房/帽子/截图）
node tools/verify-multi.mjs  # 双实例多人验证（需 3081 实例在跑）
```

## 限制（原型范围）

- 房间是内存态、信任模型：成员自行上报 token/帽子，不做校验；host 重启后
  房间清空（成员重新加入即可）。
- 只统计**提供方返回的 usage**；不返回 usage 的 provider 不计入。
- 默认每帽 100M token 是为长期使用设计；演示时可在设置卡调小阈值。
