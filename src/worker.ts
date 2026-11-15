import { DurableObject } from 'cloudflare:workers'
import { rooms, type ChatStyle, type GameRound, type Line, type Member, type RoomPoll } from './rooms'

type Env = { CHAT: DurableObjectNamespace<Chat>; ASSETS: Fetcher }
type Guest = Member & { room: string; queued: number; last: number; status: 'chatting' | 'away' }
type PollData = Omit<RoomPoll, 'myVote'> & { room: string; voters: Record<string, string> }
type GameData = Omit<GameRound, 'players' | 'joined'> & { room: string; players: Record<string, { member: Member; score: number }> }
const nicknameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ')

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname === '/locale') {
      const country = request.cf?.country
      const lang = country === 'KR' ? 'ko' : country && country !== 'XX' && country !== 'T1' ? 'en' : null
      return Response.json({ lang }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (url.pathname !== '/socket') return env.ASSETS.fetch(request)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (request.headers.get('Origin') !== url.origin) return new Response('Forbidden', { status: 403 })
    return env.CHAT.getByName('lobby').fetch(request)
  },
}

export class Chat extends DurableObject<Env> {
  private polls = new Map<string, PollData>()
  private games = new Map<string, GameData>()

  fetch(request: Request) {
    const [client, server] = Object.values(new WebSocketPair())
    const taken = new Set(this.sockets().map(socket => nicknameKey(this.guest(socket).name)))
    const country = request.cf?.country
    const prefix = country && country !== 'KR' && country !== 'XX' && country !== 'T1' ? 'Guest' : '손님'
    let name: string
    do { name = prefix + (1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 9000) } while (taken.has(nicknameKey(name)))
    const guest = { id: crypto.randomUUID(), name, room: '', queued: 0, last: 0, status: 'chatting' as const }
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
      const members = room ? guests.filter(guest => guest.room === room).map(({ id, name, status }) => ({ id, name, status })) : []
      this.send(socket, { type: 'presence', total: guests.length, waitingCount, countsByRoom: counts, members })
    })
  }

  private sendPoll(room: string) {
    const poll = this.polls.get(room)
    if (!poll) return
    for (const socket of this.sockets()) {
      const guest = this.guest(socket)
      if (guest.room !== room) continue
      const { room: _room, voters, ...publicPoll } = poll
      this.send(socket, { type: 'poll', poll: { ...publicPoll, myVote: voters[guest.id] } })
    }
  }

  private sendGame(room: string) {
    const game = this.games.get(room)
    if (!game) return
    for (const socket of this.sockets()) {
      const guest = this.guest(socket)
      if (guest.room !== room) continue
      const { room: _room, players, ...publicGame } = game
      this.send(socket, { type: 'game', game: { ...publicGame, players: Object.values(players), joined: Boolean(players[guest.id]) } })
    }
  }

  private line(room: string, text: string, from?: Member, style?: ChatStyle, image?: string) {
    const line: Line = { id: crypto.randomUUID(), at: Date.now(), text, from, style, image }
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
        // Let the remaining peer see that the conversation has ended.
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
    if ((event.action === 'say' || event.action === 'whisper' || event.action === 'image') && now - guest.last < 600) {
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
      case 'status':
        if (value !== 'chatting' && value !== 'away') return
        guest.status = value
        this.save(socket, guest)
        break
      case 'join':
        if (!rooms.some(room => room.id === value)) return
        this.leave(socket, guest)
        guest.room = value
        this.save(socket, guest)
        this.send(socket, { type: 'room', room: value })
        this.line(value, `${guest.name}님이 입장했습니다. 반가워요! 오늘의 아재개그도 함께 봐요.`)
        this.sendPoll(value)
        this.sendGame(value)
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
      case 'pollCreate': {
        if (!guest.room || guest.room.startsWith('pair:')) return
        const current = this.polls.get(guest.room)
        if (current && !current.closed) {
          this.send(socket, { type: 'notice', text: '이 방에서 진행 중인 투표가 이미 있습니다.' })
          return
        }
        let parsed: { question?: unknown; options?: unknown }
        try { parsed = JSON.parse(value) } catch { return }
        const question = typeof parsed.question === 'string' ? parsed.question.trim() : ''
        const options = Array.isArray(parsed.options) ? parsed.options.filter((option): option is string => typeof option === 'string').map(option => option.trim()).filter(Boolean) : []
        if (question.length < 2 || question.length > 80 || options.length < 2 || options.length > 4 || options.some(option => option.length > 32)) {
          this.send(socket, { type: 'notice', text: '투표 질문과 선택지를 확인해 주세요. (선택지 2~4개)' })
          return
        }
        const poll: PollData = { id: crypto.randomUUID(), room: guest.room, question, options: options.map(text => ({ id: crypto.randomUUID(), text, votes: 0 })), owner: { id: guest.id, name: guest.name }, voters: {}, closed: false }
        this.polls.set(guest.room, poll)
        this.sendPoll(guest.room)
        this.line(guest.room, `${guest.name}님이 투표를 열었습니다.`)
        return
      }
      case 'pollVote': {
        const poll = this.polls.get(guest.room)
        if (!poll || poll.closed || poll.id !== event.target) return
        const option = poll.options.find(item => item.id === value)
        if (!option) return
        const previous = poll.voters[guest.id]
        if (previous === value) return
        if (previous) {
          const previousOption = poll.options.find(item => item.id === previous)
          if (previousOption) previousOption.votes = Math.max(0, previousOption.votes - 1)
        }
        option.votes += 1
        poll.voters[guest.id] = value
        this.sendPoll(guest.room)
        return
      }
      case 'pollClose': {
        const poll = this.polls.get(guest.room)
        if (!poll || poll.closed || poll.id !== event.target || poll.owner.id !== guest.id) return
        poll.closed = true
        this.sendPoll(guest.room)
        return
      }
      case 'gameCreate': {
        if (!guest.room || guest.room.startsWith('pair:')) return
        const current = this.games.get(guest.room)
        if (current && !current.ended && current.endsAt > now) {
          this.send(socket, { type: 'notice', text: '이 방에서 진행 중인 테트리스 라운드가 있습니다.' })
          return
        }
        const game: GameData = { id: crypto.randomUUID(), room: guest.room, owner: { id: guest.id, name: guest.name }, endsAt: now + 120000, ended: false, players: { [guest.id]: { member: { id: guest.id, name: guest.name }, score: 0 } } }
        this.games.set(guest.room, game)
        this.sendGame(guest.room)
        this.line(guest.room, `${guest.name}님이 테트리스 한 판을 시작했어요! (2분 친선 라운드)`)
        return
      }
      case 'gameJoin': {
        const game = this.games.get(guest.room)
        if (!game || game.ended || game.endsAt <= now || game.id !== event.target) return
        game.players[guest.id] ??= { member: { id: guest.id, name: guest.name }, score: 0 }
        this.sendGame(guest.room)
        return
      }
      case 'gameScore': {
        const game = this.games.get(guest.room)
        if (!game || game.id !== event.target || !game.players[guest.id]) return
        if (game.endsAt <= now) {
          game.ended = true
          this.sendGame(guest.room)
          return
        }
        const score = Number(value)
        if (!Number.isFinite(score) || score < 0 || score > 999999) return
        game.players[guest.id].score = Math.max(game.players[guest.id].score, Math.floor(score))
        this.sendGame(guest.room)
        return
      }
      case 'whisper': {
        if (!guest.room || guest.room.startsWith('pair:') || !event.target || event.target === guest.id || !value || value.length > 400) return
        const recipient = this.sockets().find(other => {
          const peer = this.guest(other)
          return peer.id === event.target && peer.room === guest.room
        })
        if (!recipient) {
          this.send(socket, { type: 'notice', text: '상대가 채팅방을 나갔습니다. 접속자 목록에서 다시 선택해 주세요.' })
          return
        }
        const proposed = event.style
        const style: ChatStyle = {
          font: ['Nanum Gothic', 'Nanum Myeongjo', 'Nanum Pen Script', 'Verdana', 'Gulim', 'Georgia', 'Courier New'].includes(proposed?.font ?? '') ? proposed!.font! : 'Nanum Gothic',
          size: [12, 14, 16, 18].includes(proposed?.size ?? 0) ? proposed!.size! : 14,
          color: ['#222222', '#c22552', '#205a9e', '#287744', '#713ca1'].includes(proposed?.color ?? '') ? proposed!.color! : '#222222',
          bold: proposed?.bold === true,
          italic: proposed?.italic === true,
          underline: proposed?.underline === true,
        }
        const peer = this.guest(recipient)
        guest.last = now
        this.save(socket, guest)
        const line: Line = { id: crypto.randomUUID(), at: now, text: value.replace(/[\r\n]+/g, ' '), from: { id: guest.id, name: guest.name }, whisperTo: { id: peer.id, name: peer.name }, style }
        this.send(socket, { type: 'line', line })
        this.send(recipient, { type: 'line', line })
        return
      }
      case 'image':
        if (!guest.room || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 120000) return
        if (guest.room.startsWith('pair:') && !this.sockets().some(other => other !== socket && this.guest(other).room === guest.room)) return
        guest.last = now
        this.save(socket, guest)
        this.line(guest.room, '[이미지]', { id: guest.id, name: guest.name }, undefined, value)
        return
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
