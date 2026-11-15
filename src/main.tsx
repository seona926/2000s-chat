import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { rooms, type ChatStyle, type Line, type Member } from './rooms'
import './style.css'

type ChatEvent = {
  type: string
  id?: string
  name?: string
  room?: string
  line?: Line
  counts?: Record<string, number>
  total?: number
  waitingCount?: number
  members?: Member[]
  text?: string
}

const nameColors = ['#a02050', '#205a9e', '#287744', '#713ca1', '#a35818', '#137d85', '#9b3277', '#514fa5']

function nameColor(memberId: string) {
  let hash = 0
  for (const character of memberId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return nameColors[hash % nameColors.length]
}

function App() {
  const socket = useRef<WebSocket | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const publicRoom = useRef('')
  const wasConnected = useRef(false)
  const lastContentSent = useRef(0)
  const [online, setOnline] = useState(false)
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [waitingCount, setWaitingCount] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [style, setStyle] = useState<ChatStyle>({ font: 'Nanum Gothic', size: 16, color: '#222222', bold: false, italic: false, underline: false })
  const [emojis, setEmojis] = useState(false)
  const [showFormatting, setShowFormatting] = useState(false)
  const [notice, setNotice] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [dialog, setDialog] = useState<'help' | 'nick' | 'report' | null>(null)
  const [target, setTarget] = useState<Line | null>(null)
  const [draft, setDraft] = useState('')
  const [nickError, setNickError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout>
    function connect() {
      const url = new URL('/socket', location.href)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const connection = new WebSocket(url)
      socket.current = connection
      connection.onmessage = ({ data }) => {
        const event = JSON.parse(data) as ChatEvent
        switch (event.type) {
          case 'hello':
            setId(event.id ?? '')
            setName(event.name ?? '')
            setOnline(true)
            if (wasConnected.current) {
              setNotice('다시 연결되었습니다.')
              if (publicRoom.current) connection.send(JSON.stringify({ action: 'join', value: publicRoom.current }))
            }
            wasConnected.current = true
            break
          case 'name':
            setName(event.name ?? '')
            setNickError('')
            setDialog(current => current === 'nick' ? null : current)
            break
          case 'nickError': setNickError(event.text ?? '닉네임을 변경하지 못했습니다.'); break
          case 'presence':
            setCounts(event.counts ?? {})
            setTotal(event.total ?? 0)
            setWaitingCount(event.waitingCount ?? 0)
            setMembers(event.members ?? [])
            break
          case 'room':
            publicRoom.current = event.room?.startsWith('pair:') ? '' : event.room ?? ''
            setRoom(event.room ?? '')
            setWaiting(false)
            setEnded(false)
            setLines([])
            setMessage('')
            setShowMembers(false)
            setNotice('')
            break
          case 'waiting':
            publicRoom.current = ''
            setRoom('')
            setWaiting(true)
            setNotice('')
            break
          case 'ended': setEnded(true); break
          case 'line':
            if (event.line) {
              const line = event.line
              setLines(previous => [...previous.slice(-199), line])
            }
            break
          case 'notice': setNotice(event.text ?? ''); break
        }
      }
      connection.onclose = () => {
        if (stopped) return
        setOnline(false)
        setWaiting(false)
        if (wasConnected.current) setNotice('연결이 끊겼습니다. 다시 연결하는 중입니다.')
        setRoom('')
        retry = setTimeout(connect, 1800)
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      socket.current?.close()
    }
  }, [])

  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal()
    if (!dialog && modal.current?.open) modal.current.close()
  }, [dialog])

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines, room, hidden])

  useEffect(() => {
    if (room && matchMedia('(pointer: fine)').matches) input.current?.focus()
  }, [room])

  function send(action: string, value = '', targetId?: string, format?: ChatStyle) {
    const connection = socket.current
    if (!online || connection?.readyState !== WebSocket.OPEN) {
      setNotice('서버에 연결되는 중입니다.')
      return false
    }
    if ((action === 'say' || action === 'image') && Date.now() - lastContentSent.current < 700) {
      setNotice('잠시 후 다시 보내 주세요.')
      return false
    }
    if (action === 'say' || action === 'image') lastContentSent.current = Date.now()
    setNotice('')
    connection.send(JSON.stringify({ action, value, target: targetId, style: format }))
    return true
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (message.trim() && send('say', message, undefined, style)) setMessage('')
  }

  async function sendImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 10_000_000) {
      setNotice('10MB 이하 이미지 파일을 선택해 주세요.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const image = canvas.toDataURL('image/jpeg', 0.55)
      if (image.length > 120000) {
        setNotice('이미지가 너무 커서 보낼 수 없습니다. 작은 사진을 선택해 주세요.')
        return
      }
      send('image', image)
    } catch {
      setNotice('이 이미지 형식을 열 수 없습니다.')
    } finally {
      if (upload.current) upload.current.value = ''
    }
  }

  function openDialog(kind: 'help' | 'nick' | 'report', line?: Line) {
    setTarget(line ?? null)
    setDraft(kind === 'nick' ? name : '')
    setNickError('')
    setDialog(kind)
  }

  function submitDialog(event: FormEvent) {
    event.preventDefault()
    const done = dialog === 'nick' ? send('nick', draft) : send('report', draft, target?.id)
    if (done && dialog !== 'nick') setDialog(null)
  }

  function roomList(list: typeof rooms, active = false) {
    return (
      <ul className={'room-list' + (active ? ' active-list' : '')}>
        {list.map(item => <li key={item.id}>
          <div><button className="link room-link" disabled={!online} onClick={() => send('join', item.id)}>{item.name}</button>{!active && <small>{item.about}</small>}</div>
          <span className={counts[item.id] ? 'occupied' : 'vacant'}>{online ? (counts[item.id] ?? 0) + '명' : '—'}</span>
        </li>)}
      </ul>
    )
  }

  const pair = room.startsWith('pair:')
  const current = rooms.find(item => item.id === room)
  const activeRooms = rooms.filter(item => (counts[item.id] ?? 0) > 0).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
  const previewStyle = {
    color: style.color,
    fontFamily: `'${style.font}', serif`,
    fontSize: style.font === 'Nanum Pen Script' ? style.size * 1.25 : style.size,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
  }
  const time = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  return (
    <div className={'site' + (room ? ' in-room' : '')}>
      {!room && <header className="masthead">
        <div className="identity"><span className="wordmark">접속<span>중</span><b>.</b></span></div>
        <nav aria-label="서비스 메뉴"><button className="link" onClick={() => openDialog('help')}>이용 안내</button></nav>
      </header>}
      <main>
      {!room ? <>
        <div className="bar lobby-title"><h1>★ 채팅방 골라 들어가기</h1><span><i className={online ? 'online' : ''} />{online ? '접속 ' + total + '명' : '서버 연결 중'}</span></div>
        <div className="guest"><div>{name ? <><b>{name}</b>님, 어서 오세요.</> : '접속하는 중입니다.'}</div><button className="link" disabled={!online || waiting} onClick={() => openDialog('nick')}>닉네임 변경</button></div>
        {notice && <div className="notice" role="status">{notice}</div>}
        <section className="random panel" aria-labelledby="random-title">
          <div><h2 id="random-title">🎲 랜덤 1:1 채팅</h2><p role="status">{waiting ? `대기 중 ${waitingCount}명 · 다른 사람이 시작하면 자동으로 연결됩니다.` : `현재 대기 중 ${waitingCount}명 · 시작하면 자동으로 짝을 찾습니다.`}</p></div>
          <button className="classic primary" disabled={!online} onClick={() => send(waiting ? 'leave' : 'queue')}>{waiting ? '대기 취소' : '랜덤 1:1 시작'}</button>
          {waiting && <button className="link" onClick={() => send('join', 'free')}>자유채팅으로 이동</button>}
        </section>
        <section className="panel active" aria-labelledby="active-title"><div className="section-bar"><h2 id="active-title">★ 지금 대화 중인 방</h2></div>
          {activeRooms.length ? roomList(activeRooms, true) : <div className="empty">{online ? '아직 대화 중인 공개방이 없습니다.' : '서버에 연결되면 채팅방을 볼 수 있습니다.'}<button className="classic" disabled={!online} onClick={() => send('join', 'free')}>자유채팅에 먼저 입장</button></div>}
          {activeRooms.length > 0 && !counts.free && <div className="active-foot"><button className="link" disabled={!online} onClick={() => send('join', 'free')}>빈 자유채팅방에 입장하기 →</button></div>}
        </section>
        <div className="directory">
          {['지역별', '주제별'].map(group => <section className="panel" key={group}>
            <div className="section-bar"><h2>{group === '지역별' ? '🌏' : '💡'} {group} 채팅</h2></div>
            {roomList(rooms.filter(item => item.group === group))}
          </section>)}
        </div>
      </> : <section className="window panel" aria-label="채팅방">
        <div className="bar chat-title"><h1>{pair ? '랜덤 1:1 채팅' : current?.name}</h1><button className="classic" onClick={() => send('leave')}>← 로비로</button></div>
        <div className="chat-menu"><span>{pair ? ended ? '대화 종료' : '상대와 연결됨' : current?.about}</span>
          <div className="chat-actions"><button className="link" onClick={() => openDialog('nick')}>닉네임 변경</button>
          {pair && <button className="link" onClick={() => send('queue')}>다음 상대</button>}
          {!pair && <button className="link member-toggle" aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>접속자 {members.length}명</button>}</div>
        </div>
        <div className="workspace">
          <div className="log" ref={log} role="log" aria-label="대화 로그" tabIndex={0}>
            {lines.filter(line => !line.from || !hidden.includes(line.from.id)).map(line =>
              <div className={line.from ? 'chat-line' : 'chat-line system'} key={line.id}>
                <time dateTime={new Date(line.at).toISOString()}>[{time.format(line.at)}]</time>
                <div>{line.from && <b style={{ color: nameColor(line.from.id) }}>{line.from.name}: </b>}{line.image ? <img className="chat-image" src={line.image} alt="채팅으로 보낸 이미지" /> : <span style={line.style ? { color: line.style.color, fontFamily: line.style.font, fontSize: line.style.font === 'Nanum Pen Script' ? line.style.size * 1.25 : line.style.size, fontWeight: line.style.bold ? 'bold' : 'normal', fontStyle: line.style.italic ? 'italic' : 'normal', textDecoration: line.style.underline ? 'underline' : 'none' } : undefined}>{line.text}</span>}</div>
                {line.from && line.from.id !== id && <button className="link report" aria-label={line.from.name + ' 메시지 신고'} onClick={() => openDialog('report', line)}>신고</button>}
              </div>
            )}
            {ended && <p className="ended" role="status">상대가 대화를 종료했습니다.</p>}
          </div>
          {!pair && <aside className={'members' + (showMembers ? ' expanded' : '')}>
            <h2>☺ 접속자 {members.length}명</h2>
            <ul>{members.map(member => <li key={member.id}><span title={member.name}>{member.name}{member.id === id ? ' (나)' : ''}</span>
              {member.id !== id && <button className="link" onClick={() => setHidden(previous => previous.includes(member.id) ? previous.filter(item => item !== member.id) : [...previous, member.id])}>{hidden.includes(member.id) ? '숨기기 해제' : '숨기기'}</button>}
            </li>)}</ul>
          </aside>}
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="format-row" aria-label="메시지 꾸미기">
          <button type="button" className="tool-button" aria-expanded={emojis} onClick={() => setEmojis(!emojis)}>☺ 이모지</button>
          <button type="button" className="tool-button" onClick={() => upload.current?.click()}>▧ 이미지</button>
          <input ref={upload} className="file-input" type="file" accept="image/*" aria-label="이미지 선택" onChange={event => void sendImage(event.target.files?.[0])} />
          <button type="button" className="tool-button format-panel-toggle" aria-expanded={showFormatting} aria-controls="format-controls" onClick={() => setShowFormatting(!showFormatting)}>Aa 글자 꾸미기 {showFormatting ? '▴' : '▾'}</button>
          <div id="format-controls" className={'format-controls' + (showFormatting ? ' expanded' : '')}>
          <select aria-label="글꼴" value={style.font} onChange={event => setStyle(previous => ({ ...previous, font: event.target.value }))}>
            <option value="Nanum Gothic">나눔고딕</option>
            <option value="Nanum Myeongjo">나눔명조</option>
            <option value="Nanum Pen Script">나눔손글씨</option>
          </select>
          <select aria-label="글자 크기" value={style.size} onChange={event => setStyle(previous => ({ ...previous, size: Number(event.target.value) }))}>{[12, 14, 16, 18].map(size => <option key={size} value={size}>{size}</option>)}</select>
          {['#222222', '#c22552', '#205a9e', '#287744', '#713ca1'].map(color => <button key={color} type="button" title={'글자색 ' + color} aria-pressed={style.color === color} className="color-choice" style={{ backgroundColor: color }} onClick={() => setStyle(previous => ({ ...previous, color }))} />)}
          {(['bold', 'italic', 'underline'] as const).map((key) => <button key={key} type="button" className="format-toggle" aria-label={{ bold: '굵게', italic: '기울임', underline: '밑줄' }[key]} aria-pressed={style[key]} onClick={() => setStyle(previous => ({ ...previous, [key]: !previous[key] }))}>{key === 'bold' ? <b>B</b> : key === 'italic' ? <i>I</i> : <u>U</u>}</button>)}
          </div>
        </div>
        {emojis && <div className="emoji-picker">{['😀','😂','🥹','😍','😎','😭','😡','👍','👏','❤️','💐','🐱','✨','🎉','☕','🍰'].map(emoji => <button type="button" key={emoji} onClick={() => { setMessage(previous => previous + emoji); setEmojis(false); input.current?.focus() }}>{emoji}</button>)}</div>}
        <form className="compose" onSubmit={submit}>
          <input ref={input} aria-label="메시지" style={previewStyle} value={message} maxLength={400} disabled={ended} onChange={event => setMessage(event.target.value)} placeholder={ended ? '다음 상대를 찾거나 로비로 돌아가세요.' : '메시지를 입력하세요'} />
          <button className="classic primary" disabled={ended || !message.trim()}>전송</button>
        </form>
        <div className="status-bar"><span>접속중! Chat</span><span>{online ? '● 연결됨' : '○ 연결 중'}</span><span>온라인 {total}명</span></div>
      </section>}
      </main>
      <dialog ref={modal} onClose={() => setDialog(null)}>
        <div className="bar dialog-title">{dialog === 'nick' ? '닉네임 변경' : dialog === 'report' ? '메시지 신고' : '이용 안내'}</div>
        <form onSubmit={submitDialog}>
          {dialog === 'nick' && <><label>닉네임 <input autoFocus required minLength={2} maxLength={16} value={draft} onChange={event => { setDraft(event.target.value); setNickError('') }} /></label>{nickError && <p className="dialog-error" role="alert">{nickError}</p>}</>}
          {dialog === 'report' && <><blockquote>{target?.text}</blockquote><label>신고 사유 <textarea autoFocus required maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} /></label></>}
          {dialog === 'help' && <p>닉네임으로 입장해 대화할 수 있습니다. 개인정보 공유, 괴롭힘, 도배는 삼가 주세요. 문제가 있는 메시지는 옆의 신고 버튼을 이용할 수 있습니다.</p>}
          <div className="dialog-actions"><button type="button" className="classic" onClick={() => setDialog(null)}>{dialog === 'help' ? '닫기' : '취소'}</button>{dialog !== 'help' && <button className="classic primary">{dialog === 'report' ? '신고 접수' : '변경'}</button>}</div>
        </form>
      </dialog>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
