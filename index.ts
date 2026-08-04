import { QQBotClient, Message, createQQBot } from './adapter.ts'

export { Message, createQQBot }

const APP_ID = process.env.QQBOT_APP_ID || '1905178093'
const APP_SECRET = process.env.QQBOT_APP_SECRET || ''
const SANDBOX = process.env.QQBOT_SANDBOX === 'true'
const DEBUG = process.env.QQBOT_DEBUG === 'true'

if (!APP_SECRET) {
  console.error('[hotcat-adapter-qqbot] ❌ 未设置 QQBOT_APP_SECRET')
  console.error('[hotcat-adapter-qqbot] 请从 https://q.qq.com 获取 AppSecret')
  process.exit(1)
}

console.log(`[hotcat-adapter-qqbot] AppID: ${APP_ID} 环境: ${SANDBOX ? '沙箱' : '正式'}`)

/**
 * qqBot 实例（hotCat-bot 0.1.7 新框架 API 风格）
 *
 * 用法：
 *   await qqBot.start()
 *   qqBot.event.onGroupMessage(async (bot, event) => {
 *     await bot.api.sendGroupMessage(event.group_id,
 *       Message.reply(event.message_id),
 *       Message.text('收到！'))
 *   })
 */
export const qqBot: QQBotClient = createQQBot({
  appId: APP_ID,
  appSecret: APP_SECRET,
  env: SANDBOX ? 'sandbox' : 'prod',
  debug: DEBUG,
})
