# QQbot-Plugin

**hotCat-bot 的 QQ 官方 Bot 适配器**

让 hotCat-bot 直接连接 QQ 官方 Bot API，**无需 NapCat**，无需任何第三方协议端。

---

## 功能

- ✅ 直连 QQ 官方 Bot WebSocket
- ✅ 接收群聊 @ 消息
- ✅ 发送文本消息到群
- ✅ 自动心跳保活
- ✅ 断线自动重连
- ✅ 支持 Session 恢复
- ✅ 零外部依赖（使用 Node/Bun 内置 fetch + WebSocket）

---

## 安装

### 1. 复制插件

```bash
cd hotCat-bot/plugins/
git clone https://github.com/Maturing-Etern/QQbot-Plugin.git
# 或者手动复制 QQbot-Plugin/ 目录到 plugins/ 下
```

### 2. 修改 index.ts

打开 hotCat-bot 根目录的 `index.ts`，在文件顶部添加：

```ts
// ─── QQ 官方 Bot 适配器 ─────────────────────────────────

import { qqBot } from './plugins/hotcat-adapter-qqbot/index.ts'
```

然后把原来使用 `bot` 的地方换成 `qqBot`：

```ts
// 原来
await bot.start()
await bot.onGroupMessage()
await bot.onNoticePoke()

// 改成
await qqBot.start()
await qqBot.onGroupMessage()
await qqBot.onNoticePoke()
```

> 注意：如果只想用 QQ Bot 模式，可以直接把 `bot` 替换为 `qqBot`。
> 如果想同时保留 NapCat + QQ Bot，可以参考下文"双模式运行"。

### 3. 设置环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `QQBOT_APP_ID` | ✅ | 你的 QQ 机器人 AppID |
| `QQBOT_APP_SECRET` | ✅ | 从 QQ 开放平台 -> 开发设置 -> AppSecret |
| `QQBOT_SANDBOX` | ❌ | `true` = 沙箱环境，默认 `false` |
| `QQBOT_DEBUG` | ❌ | `true` = 开启调试日志 |

**Windows CMD 启动：**

```cmd
set QQBOT_APP_ID=1905178093
set QQBOT_APP_SECRET=你的AppSecret
set QQBOT_SANDBOX=false
bun index.ts
```

**PowerShell 启动：**

```powershell
$env:QQBOT_APP_ID="1905178093"
$env:QQBOT_APP_SECRET="你的AppSecret"
bun index.ts
```

---

## 获取 AppSecret

1. 打开 [QQ 开放平台](https://q.qq.com)
2. 登录后进入你的机器人应用
3. 左侧菜单 → **开发设置**
4. 查看 **AppSecret**（首次获取需验证身份）

> **注意**：AppSecret 是敏感信息，不要泄露给他人或上传到公开仓库。
> 适配器会自动通过 `appId + appSecret` 获取 access_token，无需手动获取 BotToken。

---

## 双模式运行（NapCat + QQ Bot 共存）

如果想同时连 NapCat 和 QQ Bot，需要做一点改造：

在 `index.ts` 中创建一个**消息分发函数**，把消息同时传给两个 bot：

```ts
import { bot } from './lib/bot.ts'
import { qqBot } from './plugins/hotcat-adapter-qqbot/index.ts'

// 合并消息处理器
const combinedFns: ((ctx: any) => Promise<void>)[] = [
  // ... 所有插件函数
  getPigHubImg,
  getChunithmSong,
  marryGroupMember,
  meme2img,
  sendHelp,
  handleWeather,
  networkGenius,
  // ...
]

bot.onGroupMessageFns.push(...combinedFns)
qqBot.onGroupMessageFns.push(...combinedFns)

await bot.start()
await qqBot.start()
await bot.onGroupMessage()
await qqBot.onGroupMessage()
// onNoticePoke 仅在 NapCat 下有效
await bot.onNoticePoke()
```

---

## 注意事项

| 项目 | NapCat 模式 | QQ Bot 模式 |
|------|------------|------------|
| 协议 | OneBot v11 (WebSocket) | 官方 Bot API (WebSocket) |
| 消息接收 | 全部群消息 | 仅 @机器人的消息 |
| 戳一戳 | ✅ 支持 | ❌ 不支持 |
| 图片发送 | ✅ 支持 | ⚠️ 需使用 QQ 官方素材接口 |
| 音频发送 | ✅ 支持 | ❌ 不支持 |
| 环境依赖 | 需运行 NapCat | 零依赖 |
| 风控风险 | NapCat 可能被踢 | 官方通道，稳定 |

---

## 文件结构

```
plugins/hotcat-adapter-qqbot/
├── README.md        ← 本文件
├── package.json     ← 插件元信息
├── index.ts         ← 插件入口（导出的 qqBot 实例）
└── adapter.ts       ← QQ Bot 适配器核心实现
```

---

## License

MIT

*内容为AI生成，根本不会写README文档（悲）*