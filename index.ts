import { QQBotAdapter } from './adapter.ts'

const APP_ID = process.env.QQBOT_APP_ID || '1905178093'
const APP_SECRET = process.env.QQBOT_APP_SECRET || ''
const SANDBOX = process.env.QQBOT_SANDBOX === 'true'
const DEBUG = process.env.QQBOT_DEBUG === 'true'

if (!APP_SECRET) {
  console.error('[hotcat-adapter-qqbot] ❌ 未设置 QQBOT_APP_SECRET')
  console.error('[hotcat-adapter-qqbot] 请从 https://q.qq.com 获取 AppSecret')
  process.exit(1)
}

const adapter = new QQBotAdapter({
  appId: APP_ID,
  appSecret: APP_SECRET,
  env: SANDBOX ? 'sandbox' : 'prod',
  debug: DEBUG,
})

console.log(`[hotcat-adapter-qqbot] AppID: ${APP_ID} 环境: ${SANDBOX ? '沙箱' : '正式'}`)

export const qqBot = {
  api: adapter.api,
  onGroupMessageFns: adapter.onGroupMessageFns,
  selfData: adapter.selfData,
  start: () => adapter.start(),
  onGroupMessage: () => adapter.onGroupMessage(),
  onNoticePoke: () => adapter.onNoticePoke(),
  setScheduledTask: (_fn: () => void, _t: any) => {},
}
