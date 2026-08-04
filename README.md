# QQbot-Plugin（更更更新嗯对）

hotCat-bot 的 QQ 官方 Bot 适配器（0.1.7 新框架 API 版）

---

## 功能

- ✅ 直连 QQ 官方 Bot WebSocket（正式/沙箱双环境）
- ✅ 接收群聊 @ 消息
- ✅ 发送文本 / @ / 回复 / 图片占位消息
- ✅ 自动心跳保活 + 断线自动重连 + Session 恢复
- ✅ **对齐 hotCat-bot 0.1.7 新框架 API**（`event.message.onGroupMessage` / `api.sendGroupMessage` / `Message.*`）
- ✅ 零外部依赖（Node/Bun 内置 fetch + WebSocket）

---

## 安装

```bash
cd hotCat-bot/plugins/
git clone https://github.com/Maturing-Etern/QQbot-Plugin.git
# 或手动复制 QQbot-Plugin/ 目录到 plugins/ 下
```

> 适配器导出 `qqBot` 实例，签名对齐 hotCat-bot 0.1.7 的 `BotClient`（`event` / `api` / `start()`）。

---

## 快速开始

```ts
import { qqBot, Message } from './plugins/QQbot-Plugin/index.ts'

await qqBot.start()

qqBot.event.message.onGroupMessage(async (bot, event) => {
  await bot.api.sendGroupMessage(event.group_id,
    Message.reply(event.message_id),
    Message.at(event.user_id),
    Message.text(' 收到消息: '),
    ...event.message.map(seg => Message.from ? seg : seg)  // 原样透传即可
  )
})
```

> `event` 为 OneBot 形状群消息：`group_id`（群 openid）、`user_id`、`message_id`、`raw_message`、`message`。

### 配合 hotCat-bot 0.1.7 新框架插件

新框架插件函数签名 `(bot, event)`，可直接挂到 QQ Bot 上：

```ts
qqBot.event.message.onGroupMessage(async (bot, event) => {
  const msg = event.raw_message.trim()
  if (msg === '#ping') {
    await bot.api.sendGroupMessage(event.group_id, Message.text('pong!'))
  }
})
```

### 双模式运行（NapCat + QQ Bot 共存）

```ts
import { bot } from 'hotcat-bot-qq/botClient'   // NapCat 客户端
import { qqBot, Message } from './plugins/QQbot-Plugin/index.ts'  // QQ Bot

const onGroup = async (bot: any, event: any) => {
  const msg = event.raw_message.trim()
  if (msg.startsWith('#help')) {
    await bot.api.sendGroupMessage(event.group_id, Message.text('帮助菜单...'))
  }
}

bot.event.onGroupMessage(onGroup)     // NapCat
qqBot.event.message.onGroupMessage(onGroup)   // QQ Bot

await bot.start()
await qqBot.start()
```

### 框架插件式接入（PluginBase 桥接）

适配器本身是连接层（与 `BotClient` 同级），**不是 PluginBase 消息插件**。如果你希望它被框架插件系统自动管理（`bot.plugin.scan` 自动加载 + 热插拔），使用本仓库自带的桥接插件：

```bash
# 1. 整个仓库放好（适配器）
plugins/QQbot-Plugin/          # ← 本仓库

# 2. 复制桥接插件到独立插件目录（改一行 import）
cp plugins/QQbot-Plugin/bridge/index.ts plugins/qqbot-bridge/index.ts
#    把 bridge/index.ts 里 `from '../index.ts'` 改为 `from '../QQbot-Plugin/index.ts'`
```

启动 bot 后框架自动扫描加载 `qqbot-bridge` 插件：`load()` 自动连接 QQ Bot，`unload()` 自动断开，支持热插拔。桥接插件内同时持有 `this.bot`（NapCat）和 `qqBot`（QQ Bot），双通道消息处理。

> 若在 hotCat-bot 本地源码下运行，把 bridge 里 `import ... from 'hotcat-bot-qq/plugin'` 改为相对路径 `from '../plugin.ts'` 即可。

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `QQBOT_APP_ID` | ✅ | 你的 QQ 机器人 AppID |
| `QQBOT_APP_SECRET` | ✅ | 从 QQ 开放平台 -> 开发设置 -> AppSecret |
| `QQBOT_SANDBOX` | ❌ | `true` = 沙箱环境，默认 `false` |
| `QQBOT_DEBUG` | ❌ | `true` = 开启调试日志 |

**启动（Node 24+ 直接跑，无需 bun）：**

```bash
QQBOT_APP_ID=1905178093 QQBOT_APP_SECRET=你的AppSecret node plugins/QQbot-Plugin/index.ts
```

> Node 22.6+ 可用 `node --experimental-strip-types`，Node 23.6+ / 24 默认支持 type stripping 直接跑 .ts，无需编译、零依赖。

---

## 获取 AppSecret

1. 打开 [QQ 开放平台](https://q.qq.com)
2. 登录后进入你的机器人应用
3. 左侧菜单 → **开发设置** → 查看 **AppSecret**

> **注意**：AppSecret 是敏感信息，不要泄露或上传到公开仓库。
> 适配器会自动通过 `appId + appSecret` 获取 access_token，无需手动获取 BotToken。

---

## API 参考

| 成员 | 说明 |
|------|------|
| `qqBot.start()` | 连接并启动（自动获取 token） |
| `qqBot.event.message.onGroupMessage(fn)` | 注册群消息处理器，`fn(bot, event)` |
| `qqBot.event.offGroupMessage(fn)` | 移除处理器 |
| `qqBot.api.sendGroupMessage(groupOpenId, ...messages)` | 发送消息（`Message.*` 构造） |
| `qqBot.api.getLoginInfo()` | 返回 `{ user_id: appId, nickname: 'QQBot' }` |
| `Message.text / at / reply / image` | 消息段构造工具 |

---

## 注意事项

| 项目 | NapCat 模式 | QQ Bot 模式 |
|------|------------|------------|
| 协议 | OneBot v11 (WebSocket) | 官方 Bot API (WebSocket) |
| 消息接收 | 全部群消息 | 仅 @机器人的消息 |
| 戳一戳 | ✅ 支持 | ❌ 不支持 |
| 图片发送 | ✅ 支持 | ⚠️ 需使用 QQ 官方素材接口（当前为占位） |
| 风控风险 | 可能被踢 | **官方通道，稳定** |

---

## 文件结构

```
plugins/QQbot-Plugin/
├── README.md        ← 本文件
├── package.json     ← 插件元信息
├── index.ts         ← 入口（导出 qqBot 实例 + Message）
└── adapter.ts       ← QQ Bot 适配器核心实现（QQBotClient）
```

---

## License

MIT

