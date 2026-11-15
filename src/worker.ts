import { DurableObject } from 'cloudflare:workers'
import { rooms, type ChatStyle, type Line, type Member } from './rooms'

type Env = { CHAT: DurableObjectNamespace<Chat>; ASSETS: Fetcher }
type Guest = Member & { room: string; queued: number; last: number; lastReport: number }
type Evidence = { room: string; line: Line }
const nicknameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ')

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname !== '/socket') return env.ASSETS.fetch(request)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (request.headers.get('Origin') !== url.origin) return new Response('Forbidden', { status: 403 })
    return env.CHAT.getByName('lobby').fetch(request)
  },
}

export class Chat extends DurableObject<Env> {
  private evidence: Evidence[] = []

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, created_at INTEGER, reporter TEXT, target TEXT, reason TEXT, message TEXT)')
  }

  fetch() {
    const [client, server] = Object.values(new WebSocketPair())
    const taken = new Set(this.sockets().map(socket => nicknameKey(this.guest(socket).name)))
    let name: string
    do { name = '손님' + (1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 9000) } while (taken.has(nicknameKey(name)))
    const guest = { id: crypto.randomUUID(), name, room: '', queued: 0, last: 0, lastReport: 0 }
    this.ctx.acceptWebSocket(server)
    this.save(server, guest)
    this.send(server, { type: 'hello', id: guest.id, name: guest.name })
    this.presence()
    return new Response(null, { status: 101, webSocket: client })
  }

  private guest(socket: WebSocket): Guest {
    return socket.deserializeAttachment() as Guest
  }

  private save(socket: WebSocket, guest: Guest) {
    socket.serializeAttachment(guest)
  }

  private sockets() {
    return this.ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN)
  }

  private send(socket: WebSocket, payload: object) {
    if (socket.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify(payload)) } catch { /* A closed connection is cleaned up by its close event. */ }
    }
  }

  private presence() {
    const sockets = this.sockets()
    const guests = sockets.map(socket => this.guest(socket))
    const counts = Object.fromEntries(rooms.map(room => [room.id, guests.filter(guest => guest.room === room.id).length]))
    const waitingCount = guests.filter(guest => guest.queued > 0).length
    sockets.forEach((socket, index) => {
      const room = guests[index].room
      const members = room ? guests.filter(guest => guest.room === room).map(({ id, name }) => ({ id, name })) : []
      this.send(socket, { type: 'presence', total: guests.length, waitingCount, counts, members })
    })
  }

  private line(room: string, text: string, from?: Member, style?: ChatStyle, image?: string) {
    const line: Line = { id: crypto.randomUUID(), at: Date.now(), text, from, style, image }
    if (from) {
      this.evidence.push({ room, line: { ...line, image: undefined } })
      if (this.evidence.length > 400) this.evidence.shift()
    }
    for (const socket of this.sockets()) {
      if (this.guest(socket).room === room) this.send(socket, { type: 'line', line })
    }
  }

  private leave(socket: WebSocket, guest: Guest) {
    const room = guest.room
    guest.room = ''
    guest.queued = 0
    this.save(socket, guest)
    if (!room) return
    this.line(room, guest.name + '님이 나갔습니다.')
    if (room.startsWith('pair:')) {
      for (const other of this.sockets()) {
        const peer = this.guest(other)
        if (peer.room !== room) continue
        // Retain the room until the peer leaves so they can report its last message.
        this.send(other, { type: 'ended' })
      }
    }
  }

  private match() {
    const waiting = this.sockets()
      .map(socket => ({ socket, guest: this.guest(socket) }))
      .filter(({ guest }) => guest.queued > 0)
      .sort((a, b) => a.guest.queued - b.guest.queued)
    while (waiting.length >= 2) {
      const pair = waiting.splice(0, 2)
      const room = 'pair:' + crypto.randomUUID()
      for (const { socket, guest } of pair) {
        guest.queued = 0
        guest.room = room
        this.save(socket, guest)
        this.send(socket, { type: 'room', room })
      }
      this.line(room, '상대와 연결되었습니다.')
    }
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 125000) return
    let event: { action?: string; value?: string; target?: string; style?: Partial<ChatStyle> }
    try { event = JSON.parse(raw) } catch { return }
    if (!event || typeof event !== 'object') return
    const guest = this.guest(socket)
    const value = typeof event.value === 'string' ? event.value.trim() : ''
    const now = Date.now()
    if ((event.action === 'say' || event.action === 'image') && now - guest.last < 600) {
      this.send(socket, { type: 'notice', text: '잠시 후 다시 시도해 주세요.' })
      return
    }
    switch (event.action) {
      case 'nick':
        if (guest.queued || !/^[\p{L}\p{N}_· -]{2,16}$/u.test(value)) {
          this.send(socket, { type: 'nickError', text: '닉네임은 2~16자의 글자, 숫자, 공백, 밑줄 또는 하이픈으로 입력해 주세요.' })
          return
        }
        if (this.sockets().some(other => other !== socket && nicknameKey(this.guest(other).name) === nicknameKey(value))) {
          this.send(socket, { type: 'nickError', text: '이미 사용 중인 닉네임입니다.' })
          return
        }
        const oldName = guest.name
        guest.name = value
        this.save(socket, guest)
        this.send(socket, { type: 'name', name: value })
        if (guest.room && oldName !== value) this.line(guest.room, `${oldName}님이 ${value}으로 닉네임을 변경했습니다.`)
        this.presence()
        return
      case 'join':
        if (!rooms.some(room => room.id === value)) return
        this.leave(socket, guest)
        guest.room = value
        this.save(socket, guest)
        this.send(socket, { type: 'room', room: value })
        this.line(value, guest.name + '님이 입장했습니다.')
        break
      case 'queue':
        if (guest.queued) return
        this.leave(socket, guest)
        guest.queued = now
        this.save(socket, guest)
        this.send(socket, { type: 'waiting' })
        this.match()
        break
      case 'leave':
        this.leave(socket, guest)
        this.send(socket, { type: 'room', room: '' })
        break
      case 'say':
        if (!guest.room || !value || value.length > 400) return
        if (guest.room.startsWith('pair:') && !this.sockets().some(other => other !== socket && this.guest(other).room === guest.room)) return
        const proposed = event.style
        const style: ChatStyle = {
          font: ['Nanum Gothic', 'Nanum Myeongjo', 'Nanum Pen Script', 'Verdana', 'Gulim', 'Georgia', 'Courier New'].includes(proposed?.font ?? '') ? proposed!.font! : 'Nanum Gothic',
          size: [12, 14, 16, 18].includes(proposed?.size ?? 0) ? proposed!.size! : 14,
          color: ['#222222', '#c22552', '#205a9e', '#287744', '#713ca1'].includes(proposed?.color ?? '') ? proposed!.color! : '#222222',
          bold: proposed?.bold === true,
          italic: proposed?.italic === true,
          underline: proposed?.underline === true,
        }
        guest.last = now
        this.save(socket, guest)
        this.line(guest.room, value.replace(/[\r\n]+/g, ' '), { id: guest.id, name: guest.name }, style)
        return
      case 'image':
        if (!guest.room || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 120000) return
        if (guest.room.startsWith('pair:') && !this.sockets().some(other => other !== socket && this.guest(other).room === guest.room)) return
        guest.last = now
        this.save(socket, guest)
        this.line(guest.room, '[이미지]', { id: guest.id, name: guest.name }, undefined, value)
        return
      case 'report': {
        const message = this.evidence.find(item => item.room === guest.room && item.line.id === event.target && item.line.from?.id !== guest.id)?.line
        if (!message?.from || !value || value.length > 200) {
          this.send(socket, { type: 'notice', text: '신고할 수 있는 최근 메시지가 아닙니다.' })
          return
        }
        if (now - guest.lastReport < 30000) {
          this.send(socket, { type: 'notice', text: '신고를 연속해서 접수할 수 없습니다. 잠시 후 다시 시도해 주세요.' })
          return
        }
        this.ctx.storage.sql.exec('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?)', crypto.randomUUID(), now, guest.id, message.from.id, value, message.text)
        guest.lastReport = now
        this.save(socket, guest)
        this.send(socket, { type: 'notice', text: '신고가 접수되었습니다.' })
        return
      }
      default: return
    }
    this.presence()
  }

  webSocketClose(socket: WebSocket) {
    this.leave(socket, this.guest(socket))
    this.presence()
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, 'Connection error')
    this.leave(socket, this.guest(socket))
    this.presence()
  }
}
