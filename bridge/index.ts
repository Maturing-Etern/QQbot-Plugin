import { PluginBase } from 'hotcat-bot-qq/plugin'
import type { BotApi } from 'hotcat-bot-qq/botApi'
import type { BotClient } from 'hotcat-bot-qq/botClient'
import { qqBot } from '../index.ts'

export class QQBotBridgePlugin extends PluginBase {
    static meta = {
        name: 'qqbot-bridge',
        version: '1.0.0',
        description: 'QQ 官方 Bot 适配器桥接：纳入框架插件体系，自动管理连接生命周期',
        author: 'Maturing-Etern',
    }

    static create(api: BotApi, bot: BotClient) {
        return new QQBotBridgePlugin(api, bot)
    }

    async load() {
        await qqBot.start()
        console.log('[qqbot-bridge] QQ Bot 已连接，等待 @ 消息')

        qqBot.event.message.onGroupMessage(async (bot, event) => {
            const msg = event.raw_message.trim()
            if (msg === '#ping') {
                await bot.api.sendGroupMessage(event.group_id,
                    { type: 'text', data: { text: 'pong! (from QQBot)' } })
            }
        })
    }

    async unload() {
        await qqBot.close()
        console.log('[qqbot-bridge] QQ Bot 已断开')
    }
}
