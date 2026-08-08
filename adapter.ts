import { readFile } from 'node:fs/promises'

export interface QQBotConfig {
  appId: string
  appSecret: string
  env?: 'sandbox' | 'prod'
  debug?: boolean
}

interface WSPayload { op: number; d?: any; s?: number; t?: string }

const WS_URLS: Record<string, string> = {
  sandbox: 'wss://sandbox.api.sgroup.qq.com/websocket/',
  prod: 'wss://api.sgroup.qq.com/websocket/',
}
const API_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.api.sgroup.qq.com',
  prod: 'https://api.sgroup.qq.com',
}
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const INTENT_GROUP_AT = 1 << 25
const INTENT_AT = 1 << 30

export const Message = {
  text: (t: string) => ({ type: 'text', data: { text: t } }),
  at: (id: string | number) => ({ type: 'at', data: { qq: String(id) } }),
  reply: (id: string | number) => ({ type: 'reply', data: { id: String(id) } }),
  image: (file: string) => ({ type: 'image', data: { file } }),
}

export class QQBotClient {
  public api: {
    sendGroupMessage: (groupId: string, ...messages: any[]) => Promise<void>
    sendPrivateMessage: (userOpenId: string, ...messages: any[]) => Promise<void>
    getLoginInfo: () => Promise<{ user_id: string; nickname: string }>
  }
  public event: {
    message: {
      onGroupMessage: (fn: (bot: QQBotClient, event: any) => any) => void
      offGroupMessage: (fn: Function) => void
      onPrivateMessage: (fn: (bot: QQBotClient, event: any) => any) => void
      offPrivateMessage: (fn: Function) => void
    }
  }

  private config: Required<QQBotConfig>
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private seq: number | null = null
  private sessionId: string | null = null
  private reconnectCount = 0
  private maxReconnect = 20
  private accessToken = ''
  private tokenExpiresAt = 0
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null
  private groupHandlers = new Map<Function, (event: any) => Promise<void>>()
  private privateHandlers = new Map<Function, (event: any) => Promise<void>>()
  private started = false

  constructor(config: QQBotConfig) {
    this.config = { env: 'prod', debug: false, ...config }

    const real = {
      sendGroupMessage: async (groupId: string, ...messages: any[]) => {
        await this._sendMsgs('group', groupId, messages)
      },
      sendPrivateMessage: async (userOpenId: string, ...messages: any[]) => {
        await this._sendMsgs('user', userOpenId, messages)
      },
      getLoginInfo: async () => ({ user_id: this.config.appId, nickname: 'QQBot' }),
    }
    this.api = new Proxy(real, {
      get(target, prop) {
        if (prop in target) return Reflect.get(target, prop)
        return async () => { console.log(`[QQBot] API 不支持: ${String(prop)}`) }
      },
    }) as any

    this.event = {
      message: {
        onGroupMessage: (fn) => {
          const w = async (event: any) => { await fn(this, event) }
          this.groupHandlers.set(fn, w)
        },
        offGroupMessage: (fn) => { this.groupHandlers.delete(fn) },
        onPrivateMessage: (fn) => {
          const w = async (event: any) => { await fn(this, event) }
          this.privateHandlers.set(fn, w)
        },
        offPrivateMessage: (fn) => { this.privateHandlers.delete(fn) },
      },
    }
  }

  async start() {
    if (this.started) return
    this.started = true
    await this._ensureToken()
    this._startTokenRefresh()
    await this._connect()
  }

  async close() {
    this.started = false
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this._cleanup()
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.tokenRefreshTimer) { clearInterval(this.tokenRefreshTimer); this.tokenRefreshTimer = null }
    this.groupHandlers.clear()
    this.privateHandlers.clear()
    this.sessionId = null
    this.seq = null
  }

  private async _ensureToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) return
    if (this.config.debug) console.log('[QQBot] 获取 access_token...')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.config.appId, clientSecret: this.config.appSecret }),
    })
    if (!res.ok) throw new Error(`获取 token 失败: ${res.status}`)
    const data = await res.json() as { access_token: string; expires_in: number }
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000
    if (this.config.debug) console.log(`[QQBot] access_token 有效 ${data.expires_in}s`)
  }

  private _startTokenRefresh() {
    clearInterval(this.tokenRefreshTimer!)
    this.tokenRefreshTimer = setInterval(() => {
      this._ensureToken().catch(e => console.log(`[QQBot] 刷新 token 失败: ${e.message}`))
    }, 2 * 60 * 60 * 1000)
  }

  private async _connect() {
    const url = WS_URLS[this.config.env]
    if (this.config.debug) console.log(`[QQBot] 连接 ${url}...`)
    try {
      this.ws = new WebSocket(url)
      this.ws.onopen = () => { this.reconnectCount = 0; this._identify() }
      this.ws.onmessage = (e) => this._onMsg(e.data as string)
      this.ws.onclose = (e) => { this._cleanup(); this._reconnect(e.code) }
      this.ws.onerror = () => {}
    } catch (e: any) {
      console.log(`[QQBot] 连接失败: ${e.message}`)
      this._reconnect()
    }
  }

  private _identify() {
    if (!this.ws) return
    const token = `QQBot ${this.accessToken}`
    if (this.sessionId && this.seq != null) {
      this.ws.send(JSON.stringify({ op: 6, d: { token, session_id: this.sessionId, seq: this.seq } }))
      return
    }
    this.ws.send(JSON.stringify({ op: 2, d: { token, intents: INTENT_GROUP_AT | INTENT_AT, shard: [0, 1] } }))
  }

  private _onMsg(raw: string) {
    try {
      const p: WSPayload = JSON.parse(raw)
      const { op, d, s, t } = p
      if (op === 10) { this._heartbeat(d!.heartbeat_interval); return }
      if (op === 0) {
        if (t === 'READY') { this.sessionId = d!.session_id; console.log('[QQBot] 连接成功') }
        if (s != null) this.seq = s
        this._dispatch(t!, d!)
        return
      }
      if (op === 7) console.log('[QQBot] 会话恢复成功')
      if (op === 9) { this.sessionId = null; this.seq = null; this._cleanup(); this._connect() }
    } catch {}
  }

  private _heartbeat(interval: number) {
    clearInterval(this.heartbeatTimer!)
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 1, d: this.seq }))
    }, interval)
  }

  private _dispatch(t: string, d: any) {
    const content = (d.content || '').replace(/<@!\d+>/g, '').replace(/<@\d+>/g, '').trim()
    if (t === 'C2C_MESSAGE_CREATE') {
      const event = {
        user_id: d.author?.user_openid || d.author?.id || '',
        sender: { user_id: d.author?.user_openid || '', nickname: '', role: 'member' },
        message_id: d.id,
        raw_message: content,
        message: [{ type: 'text', data: { text: content } }],
        message_type: 'private',
        self_id: this.config.appId,
        time: Math.floor(Date.now() / 1000),
      }
      for (const w of this.privateHandlers.values()) {
        w(event).catch(e => console.log(`[QQBot] 插件错误: ${e}`))
      }
      return
    }
    if (t !== 'GROUP_AT_MESSAGE_CREATE' && t !== 'AT_MESSAGE_CREATE') return
    const event = {
      group_id: d.group_openid,
      user_id: d.author?.member_openid || '',
      sender: { user_id: d.author?.member_openid || '', nickname: '', role: 'member' },
      message_id: d.id,
      raw_message: content,
      message: [{ type: 'text', data: { text: content } }],
      message_type: 'group',
      self_id: this.config.appId,
      time: Math.floor(Date.now() / 1000),
    }
    for (const w of this.groupHandlers.values()) {
      w(event).catch(e => console.log(`[QQBot] 插件错误: ${e}`))
    }
  }

  private async _sendMsgs(scene: 'group' | 'user', openId: string, messages: any[]) {
    await this._ensureToken()
    const base = `${API_URLS[this.config.env]}/v2/${scene === 'group' ? 'groups' : 'users'}/${openId}`
    let content = ''
    let image = ''
    for (const m of messages) {
      if (!m || typeof m !== 'object') continue
      if (m.type === 'text') content += m.data?.text || ''
      else if (m.type === 'at') content += `<@${m.data?.qq || ''}>`
      else if (m.type === 'image' && !image) image = m.data?.file || ''
    }
    try {
      if (image) {
        const fileInfo = await this._uploadFile(base, image)
        if (!fileInfo) return
        const res = await fetch(`${base}/messages`, {
          method: 'POST',
          headers: { Authorization: `QQBot ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, msg_type: 7, media: { file_info: fileInfo } }),
        })
        if (!res.ok && this.config.debug) console.log(`[QQBot] 发送失败: ${res.status}`)
      } else {
        const res = await fetch(`${base}/messages`, {
          method: 'POST',
          headers: { Authorization: `QQBot ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, msg_type: 0 }),
        })
        if (!res.ok && this.config.debug) console.log(`[QQBot] 发送失败: ${res.status}`)
      }
    } catch (e: any) {
      console.log(`[QQBot] 发送异常: ${e.message}`)
    }
  }

  private async _uploadFile(base: string, file: string): Promise<string> {
    try {
      if (/^https?:\/\//.test(file)) {
        const res = await fetch(`${base}/files`, {
          method: 'POST',
          headers: { Authorization: `QQBot ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_type: 1, url: file }),
        })
        if (!res.ok) {
          console.log(`[QQBot] 上传失败 HTTP ${res.status}: ${await res.text()}`)
          return ''
        }
        const d = await res.json()
        const fileInfo = d?.data?.file_info || d?.file_info || ''
        if (!fileInfo) {
          console.log(`[QQBot] 上传响应无 file_info: ${JSON.stringify(d).slice(0, 200)}`)
          return ''
        }
        return fileInfo
      }
      const buf = await readFile(file).catch(() => null)
      if (!buf) { console.log(`[QQBot] 本地文件读取失败: ${file}`); return '' }
      const form = new FormData()
      form.append('file_type', '1')
      form.append('file', new Blob([buf]), file.split(/[\\/]/).pop() || 'image.png')
      const res = await fetch(`${base}/files`, {
        method: 'POST',
        headers: { Authorization: `QQBot ${this.accessToken}` },
        body: form,
      })
      if (!res.ok) {
        console.log(`[QQBot] 上传失败 HTTP ${res.status}: ${await res.text()}`)
        return ''
      }
      const d = await res.json()
      const fileInfo = d?.data?.file_info || d?.file_info || ''
      if (!fileInfo) {
        console.log(`[QQBot] 上传响应无 file_info: ${JSON.stringify(d).slice(0, 200)}`)
        return ''
      }
      return fileInfo
    } catch (e: any) {
      console.log(`[QQBot] 上传异常: ${e.message}`)
      return ''
    }
  }

  private _cleanup() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
  }

  private _reconnect(code?: number) {
    if (this.reconnectCount >= this.maxReconnect) return console.log('[QQBot] 重连已达上限')
    if (code && [4010, 4011, 4012, 4013, 4014].includes(code)) return
    const delay = Math.min(1000 * Math.pow(2, this.reconnectCount), 30000)
    this.reconnectCount++
    console.log(`[QQBot] ${delay}ms 后重连 (第${this.reconnectCount}次)`)
    this.reconnectTimer = setTimeout(() => this._connect(), delay)
  }
}

export function createQQBot(config: QQBotConfig): QQBotClient {
  return new QQBotClient(config)
}
