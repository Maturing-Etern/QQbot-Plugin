import { PluginBase } from 'hotcat-bot-qq/plugin'
import type { BotApi } from 'hotcat-bot-qq/botApi'
import type { BotClient } from 'hotcat-bot-qq/botClient'
import { qqBot } from '../index.ts'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

const SKIP_DIRS = new Set(['qqbot-bridge', 'hotcat-adapter-qqbot', 'QQbot-Plugin'])

async function importWithTimeout(path: string, ms = 5000): Promise<any> {
  return Promise.race([
    import(path),
    new Promise((_, rej) => setTimeout(() => rej(new Error('import timeout')), ms)),
  ])
}

export class QQBotBridgePlugin extends PluginBase {
    static meta = {
        name: 'qqbot-bridge',
        version: '1.1.0',
        description: 'NapCat 框架挂载 QQ 官方 Bot 适配器：双通道自动加载全部 PluginBase 插件',
        author: 'Maturing-Etern',
    }

    static create(api: BotApi, bot: BotClient) {
        return new QQBotBridgePlugin(api, bot)
    }

    async load() {
        await qqBot.start()
        console.log('[qqbot-bridge] QQ Bot 已连接')
        await this.loadPlugins(join(process.cwd(), 'plugins'))
    }

    async unload() {
        await qqBot.close()
        console.log('[qqbot-bridge] QQ Bot 已断开')
    }

    private async loadPlugins(dir: string) {
        if (!existsSync(dir)) return
        let count = 0
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
            const indexPath = join(dir, entry.name, 'index.ts')
            if (!existsSync(indexPath)) continue
            try {
                const mod = await importWithTimeout(pathToFileURL(indexPath).href)
                const ctor = mod[entry.name.charAt(0).toUpperCase() + entry.name.slice(1) + 'Plugin']
                    || mod.default
                    || Object.values(mod).find((v: any) => typeof v === 'function' && (v as any).create)
                if (!ctor || typeof ctor.create !== 'function') continue
                const meta = ctor.meta || { name: entry.name, version: '0.0.0' }
                const instance = ctor.create(qqBot.api, qqBot, meta)
                await instance.load()
                count++
                console.log(`[qqbot-bridge] QQ Bot 插件加载成功: ${meta.name}`)
            } catch (e: any) {
                console.log(`[qqbot-bridge] 跳过插件 ${entry.name}: ${e?.message || e}`)
            }
        }
        console.log(`[qqbot-bridge] QQ Bot 自动加载完成，共 ${count} 个插件`)
    }
}
