# dsh-games — DeepSeek Harness 趣味插件

「桌面宠物 + 王冠成长 + 多人房间」：在 DSH Web GUI 里养一只 **DeepSeek 鲸鱼宠物**（可换
图案、可上传自定义 PNG/GIF），随 token 用量**获得王冠**（默认每 1M token 一顶青铜王冠，
3 顶自动合成更高阶，魔法王冠带附魔流动特效）；还能在**公开/邀请制房间**里实时看到所有
玩家的宠物、王冠、昵称与 token。

**只依赖两样东西**：DSH 官方 NPM SDK（`@deepseek-ai/*`）+ 插件自身 host 半区。多人部分
由一个**独立的游戏服务器**承载（房间 + 宠物同步），可以 Docker 部署，也可以直接用 DSH
host 进程内的挂载点跑（本机原型）。**不依赖** dsh-skin / dsh-pet 等其他插件。

---

## 功能

- **桌面宠物**：右下角漂浮的 DeepSeek 鲸鱼（官方 logo 路径内嵌），随模型活动切换动画
  （思考/工具/完成），可拖拽、可隐藏/召唤、可调整**大小**（24–512px，默认 **60px**）、可
  **锁定位置**、一键复位。
- **宠物图案**：6 种内置配色（深海蓝/绯红/翡翠/鎏金/紫罗兰/海洋青），设置卡或宠物面板
  随时切换。
- **自定义宠物**：上传自己的 PNG / GIF（≤ 2MB，最长边 ≤ 1024px，服务器校验魔数 + 像素
  尺寸），上传后**自动同步到房间**——房间内所有人看到的是你的宠物形象。
- **昵称**：点宠物打开「深海小屋」面板即可改名，也可在设置卡里改。
- **UI 风格**：全部界面（宠物面板/设置卡/房间列表）跟随 DSH 本体皮肤语义 token
  （`--dsw-alias-*`），浅色/深色主题自动匹配，无需插件侧换肤。
- **王冠系统**（替代原型阶段的帽子）：
  - host 实时累计**所有会话**的 usage token（input + output + cacheRead + cacheWrite），
    王冠等级由**游戏服务器的规则**决定（默认每 **1M** token 一顶青铜王冠）；
  - **3 个同阶王冠自动合成下一阶**，等级链：**青铜 → 白银 → 黄金 → 铂金 → 紫水晶 →
    魔法青铜 → 魔法白银 → 魔法黄金 → 魔法铂金 → 魔法紫水晶**（库存是 token 按 3 进制
    分解，合成天然成立、重启不丢）：

    | 等级 | 所需青铜数 | 累计 Token |
    | --- | ---: | ---: |
    | 青铜 | 1 | 1M |
    | 白银 | 3 | 3M |
    | 黄金 | 9 | 9M |
    | 铂金 | 27 | 27M |
    | 紫水晶 | 81 | 81M |
    | 魔法青铜 | 243 | 243M |
    | 魔法白银 | 729 | 729M |
    | 魔法黄金 | 2,187 | 2.187B |
    | 魔法铂金 | 6,561 | 6.561B |
    | 魔法紫水晶 | 19,683 | 19.683B |
  - 王冠在宠物头上按**金字塔**堆叠（从底层往上堆：**一层放满 6 个才往上一层摆放**，
    新获得的低阶王冠永远在最底层、每层最多 6 个，超量折叠成 `+N` 徽章）；
  - **魔法等级**的王冠带 Minecraft 式流动附魔光效（SVG 斜纹 pattern 动画 + 光晕呼吸）；
  - **token 消耗特效**：模型思考/工具期间宠物下方的 token 标签持续流光；token 增长时
    标签爆发脉冲并弹出 `+N`；获得/合成王冠时弹出气泡（「获得青铜王冠！」「合成白银
    王冠！」）。
- **多人房间**：
  - **房间列表**：面板里列出游戏服务器上所有**公开房间**（名称/代码/人数），点一下即加入；
  - **公开 / 邀请制**：创建房间时可选择——公开房间上列表，任何人都能加入；邀请制房间
    不在列表出现，只有拿到代码的人能加入；
  - 加入后每 3s 上报宠物状态（昵称/token/王冠/活动相位/自定义宠物 URL/配色/尺寸），所有人
    实时看到成员列表（宠物图 + 王冠 + 数据 + 相位点）；
  - **成员会话协议 v3**：共享服务接口使用 Bearer 鉴权；加入房间时另行签发成员令牌，心跳、
    聊天与退出必须证明当前成员身份，房间快照不会回传令牌；
  - **基础反作弊**：Token 仍由客户端计算，但服务端会独立重算王冠、维护历史 Token 基线，
    拒绝 Token 回退、异常突增和王冠伪造；重复异常会触发短时锁定；
  - **宠物场景**：房间成员会以**浮动宠物**出现在你的页面上、围绕你的宠物排列——以自己为
    锚点，支持**自由拖动 / 水平对齐 / 垂直对齐 / 网格吸附 / 环绕排列**五种模式（宠物面板里
    一键切换，间距可调；自由与网格位置本地记忆，刷新不丢）。每只成员宠物按**主人自己的
    配色与尺寸**渲染，悬停显示昵称与 token；
  - **自动回房**：只要没有主动「离开房间」，下次打开页面自动回到之前的房间。

## 部署：游戏服务器（Docker）

多人房间、王冠规则和宠物同步依赖一个**独立的游戏服务器**（不含 DSH 本体，镜像里只有
零依赖的 `lib/server.js`）。线上地址：**https://temp.3efs.com**（已部署在 vps.3efs.com，
OpenResty 反代 + TLS）。

```sh
node tools/deploy-server.mjs --host root@vps.3efs.com --key <私钥路径>
# 等价手工程序：pnpm build && docker compose up -d --build
# （本地 docker 直接跑：docker build -t dsh-games-server . && docker run -d
#    -p 127.0.0.1:3080:3080 -v ./data:/data dsh-games-server）
```

部署脚本会：构建 `lib/server.js` → 仅组装 server bundle、Dockerfile、
compose 与 package 元数据 → 不使用 `--delete` 地同步到服务器 →
`docker compose up -d --build`。远端 `data/config.json`、宠物文件和备份目录
不会进入部署载荷；首次部署前需自行从 `deploy/config.example.json` 创建配置。

- 监听 `127.0.0.1:3080`（只走反代，不直接暴露公网；环境变量 `GAME_HOST` / `GAME_PORT` /
  `GAME_DATA` 可改）；
- **配置**：`<GAME_DATA>/config.json`（挂载卷内，改完重启容器生效）：

  ```json
  {
    "authToken": "…",                  // 服务器密钥：业务请求使用 Authorization: Bearer
    "crown": { "tokenStep": 1000000,   // 每顶青铜王冠的 token 数
               "base": 3,              // 合成基数（3 个合成 1 个高一级）
               "levels": ["bronze", "silver", "gold", "platinum", "amethyst",
                          "magic-bronze", "magic-silver", "magic-gold",
                          "magic-platinum", "magic-amethyst"] },
    "pet": { "maxBytes": 2097152,      // 上传大小上限（字节）
             "maxDimension": 1024 },   // 最长边像素上限
    "antiCheat": {
      "burstTokens": 500000,           // 即时增长余量
      "tokensPerMinute": 1000000,      // 持续增长上限
      "strikeLimit": 3,                // 异常次数达到后锁定
      "strikeWindowMs": 600000,
      "lockMs": 60000
    }
  }
  ```

- 宠物图落在挂载卷 `./data/pets/`，反作弊基线落在 `./data/anticheat.json`；二者在容器重建后保留；
- 上传强制校验：PNG/GIF 魔数 + 解码像素尺寸 + 大小上限（Content-Length 预检直接 413），
  上传与删除使用 Bearer 鉴权；图片读取因原生 `<img>` 限制保留查询 token 兼容；
- 健康检查使用公开的 `/api/games/health`；规则、房间和宠物业务接口仍需鉴权。

新安装的客户端已默认携带当前游戏服务器地址与密钥；已有用户的设置继续优先，不会被默认值
覆盖。房间列表、建房、宠物上传与同步都走这台服务器。**客户端会从服务器拉取规则**
（王冠表/上传限制）并本地应用，设置卡里只读展示当前规则。

> 不想部署独立服务器？`node lib/server.js` 直接跑，或让每台 DSH 自己当服务器（serverUrl
> 留空，host 进程内挂载同一套接口，本机原型不需要 Docker 也能玩）。

## 安装

### 使用 GitHub Release 安装包（推荐）

从 GitHub Release 下载 `linxin666-dsh-games-<版本>.tgz`，复制到目标电脑后执行：

```powershell
dsh plugin --profile web add "D:\Downloads\linxin666-dsh-games-0.1.0.tgz"
dsh web
```

发布包已经包含构建好的 host/client 代码，目标电脑无需复制 `node_modules`，也无需重新构建。
升级时安装新版本的 `.tgz` 并重启 `dsh web`；卸载命令：

```powershell
dsh plugin --profile web remove @linxin666/dsh-games
```

### 从源码安装

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
插件设置位于：设置 → 插件 → **深海小屋（宠物 + 王冠 + 房间）**——卡片直接注册在
插件配置列表的顶层（与 Shell / Web search 等官方卡并列），**不依赖任何其他插件的
设置分组**（启用插件 / 隐藏宠物 / 昵称 / 宠物图案 / 游戏服务器地址 / 服务器密钥 /
演示加一顶王冠）。王冠规则与上传限制来自服务器配置，设置卡只读展示。

> 说明：官方 dsh-host-apiproxy 对第三方设置命名空间有硬编码白名单，因此设置卡走插件
> 自己的 `/api/games/*` HTTP 接口（host 侧会同时把值镜像进 `~/.dsh/settings.yaml` 的
> `games:` 段），任何部署下都可用。

## 多人演示（本机两实例 + 独立服务器）

```sh
# 0.（可选）独立游戏服务器，所有玩家共用
docker compose up -d --build        # 或 node lib/server.js

# 1. 实例 A（默认，serverUrl 留空 = 本机即服务器）
dsh web

# 2. 实例 B：独立的 DSH_HOME => 独立的身份与 token 账本
mkdir %USERPROFILE%\.dsh-b
mklink /J %USERPROFILE%\.dsh-b\profiles %USERPROFILE%\.dsh\profiles   # 共享同一 profile（含本插件）
set DSH_HOME=%USERPROFILE%\.dsh-b
dsh web --port 3081
```

- A：点宠物 → 面板里能看到**公开房间列表**；创建房间（选「公开」或「邀请制」），记下代码；
- B：点宠物 → 房间列表里点 A 的公开房，或「用代码加入」输入地址 + 代码；
- 两边同时看到双方宠物（含自定义形象）；任意一边 token 增长（或点「演示：加一顶王冠」），
  另一边 3~6 秒内看到王冠变化；
- 关掉浏览器再打开：**自动回到之前的房间**（除非点过「离开房间」）。

真实多人默认使用随客户端提供的远端游戏服务器；也可以在设置里切换到另一台。手动清空
服务器地址时，房间会落在各自的 DSH host 上，跨机需要互相可达端口。

## 架构

```
浏览器 (client 半区, lib/client.js)
 ├─ 漂浮宠物 / 深海小屋面板 / 房间列表 / 设置卡   (React, 挂 document.body)
 └─ 轮询：自己的 /api/games/state（2s，同源）；
    游戏服务器：房间列表/建房/心跳+快照（3s）/宠物上传（跨域 CORS 开放）

DSH host 进程 (host 半区, lib/index.js)
 ├─ GamesService
 │   ├─ token 账本：监听 session/event（assistant/message 与 usage chunk），
 │   │   按 (sessionId, turn, step) 去重（跨进程持久化 frontier，进程内增量合并），
 │   │   累计写入 $DSH_HOME/games.json；王冠 = token 的 10 进制分解
 │   ├─ 活动相位：activity/status → idle/thinking/tool/done
 │   ├─ 显示/设置：大小/位置/锁定/图案/服务器地址/自定义宠物 meta（$DSH_HOME/pets）
 │   └─ 房间 + 宠物 HTTP 面：gameserver.ts 共享处理器挂载在
 │       /api/games/rooms* 与 /api/games/pets*（CORS 开放）
 ├─ HTTP 路由 /api/games/*：state / nickname / boost / display / config / pet-meta
 └─ settings 命名空间 `games`（enabled / nickname / crownTokenStep / petVariant / serverUrl）

独立游戏服务器 (lib/server.js, Docker)
 └─ 与 host 完全相同的共享处理器：房间（公开列表/创建/心跳/离开/清扫）+ 宠物存储
    （PNG/GIF 魔数校验、尺寸解析、大小上限、原子落盘 /data/pets），零运行时依赖
```

关键文件：

- `src/index.ts` — host 入口（服务 + 路由 + 设置区注册）
- `src/service.ts` — GamesService（账本 / 相位 / 显示 / 配置 / 宠物 meta）
- `src/crowns.ts` — 王冠等级链、颜色、10 进制分解（host 与浏览器共享）
- `src/ledger.ts` — token 累计纯逻辑（frontier + 增量合并去重）
- `src/rooms.ts` — 房间存储（代码生成 / 公开-邀请制 / 列表 / 心跳 / 过期清理）
- `src/pets.ts` — 宠物文件存储（魔数 + 像素校验，原子写）
- `src/gameserver.ts` — 共享游戏服务器 HTTP 面（房间 + 宠物，CORS）
- `src/server-entry.ts` — 独立服务器入口（env 配置，Docker CMD）
- `src/routes.ts` — `/api/games/*` 个人路由 + 共享面挂载
- `src/persist.ts` — `$DSH_HOME/games.json` 读写
- `src/client/` — 浏览器半区（宠物 / 王冠 / 面板 / 房间 / 设置卡 / 双语文案）
- `Dockerfile` + `docker-compose.yml` — 游戏服务器部署
- `tools/verify*.mjs` — 浏览器端验证脚本（playwright）

## 数据

- `$DSH_HOME/games.json`：memberId、累计 token、按会话的计数 frontier、显示布局、
  自定义宠物 meta。
- `$DSH_HOME/pets/`：上传的自定义宠物图片（本机挂载模式）。
- 游戏服务器（Docker）：`/data/pets/` 存宠物图片、`/data/config.json` 存规则与
  鉴权密钥；房间是内存态。
- `$DSH_HOME/settings.yaml` 的 `games:` 段：enabled / nickname / crownTokenStep /
  petVariant / serverUrl / authToken。

## 开发

```sh
pnpm build        # tsc 类型 + tsdown 三产物（lib/index.js + lib/client.js + lib/server.js）
pnpm typecheck
node lib/server.js          # 本地跑独立游戏服务器
node tools/verify.mjs       # 单实例功能验证（召唤/王冠/改名/房间/特效/上传/截图）
node tools/verify-multi.mjs # 双实例多人验证（需 3081 实例在跑）
node tools/verify-visual.mjs# 像素级 + 设置卡验证
```

## 限制（原型范围）

- 房间与成员会话是内存态，服务器重启后需要重新加入；反作弊 Token 基线和异常计数持久化。
- Token 由客户端计算，服务端只能通过王冠重算、单调性和增长速率做基础检测，不能替代服务端
  直接计量，也无法阻止长期低于阈值的缓慢伪造。
- 只统计**提供方返回的 usage**；不返回 usage 的 provider 不计入。
- 王冠库存由 token 推导（3 进制分解，规则来自服务器 config.json），跨版本/重启天然一致。
- 服务器配置 `authToken` 后，除健康检查外的业务接口强制鉴权；宠物图读取也需要有效 token。
