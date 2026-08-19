# dsh-games — DeepSeek Harness 趣味插件

DSH Web GUI 里的「桌面宠物 + 王冠成长 + 多人房间」：养一只 DeepSeek 鲸鱼宠物，随 token
用量获得王冠，还能在公开/邀请制房间里实时看到其他玩家的宠物、王冠、昵称与 token。

## 安装（DSH 插件）

```powershell
# 从 npm 安装最新版（推荐）
dsh plugin --profile web add @kasidia/dsh-games

# 或锁定版本
dsh plugin --profile web add @kasidia/dsh-games@0.1.4
```

安装后重启 `dsh web`，浏览器右下角出现鲸鱼宠物即成功。

其他安装源（任选其一）：

```powershell
# GitHub Release 包（固定命令，便于升级）
dsh plugin --profile web add "https://github.com/AngleNaris/dsh-games/releases/latest/download/kasidia-dsh-games.tgz"

# 仓库直装
dsh plugin --profile web add "github:AngleNaris/dsh-games"

# 本地源码（先 pnpm build）
dsh plugin --profile web add link:<仓库绝对路径>
```

卸载：

```powershell
dsh plugin --profile web remove @kasidia/dsh-games
```

> 注意：必须用 `dsh plugin add`，**不要**直接 `npm install`——后者只装进当前仓库的
> `node_modules`，不会进入 DSH 的 profile，harness 识别不到。

## 功能

- **桌面宠物**：右下角漂浮的 DeepSeek 鲸鱼，6 种配色、可上传自定义 PNG/GIF、可拖拽/隐藏/锁定。
- **王冠成长**：host 实时累计 token，每 1M 一顶青铜王冠，3 合 1 升级，共 10 阶
  （青铜→白银→黄金→铂金→紫水晶→魔法青铜→…→魔法紫水晶），魔法级带附魔流动特效。
- **多人房间**：公开/邀请制房间，实时同步宠物、王冠、昵称与 token；关闭页面后自动回房。

设置入口：DSH 设置 → 插件 → **深海小屋（宠物 + 王冠 + 房间）**。

## 游戏服务器（多人 / 王冠同步）

线上已有默认服务器，开箱即用，无需自建。如需自建：

```sh
docker compose up -d --build      # 或本机直接：node lib/server.js
```

配置模板见 `deploy/config.example.json`，运行时配置挂载在 `<GAME_DATA>/config.json`。

## 开发

```sh
pnpm install
pnpm build                          # 产出 lib/index.js + lib/client.js + lib/server.js
pnpm test
node lib/server.js                  # 本地跑独立游戏服务器
```

## 许可

BSD-3-Clause
