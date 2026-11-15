import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { rooms, type ChatStyle, type GameRound, type Line, type Member, type RoomPoll } from './rooms'
import { TetrisBoard } from './tetris'
import { translateServerText, type Lang } from './i18n'
import './style.css'

type ChatEvent = {
  type: string
  id?: string
  name?: string
  room?: string
  line?: Line
  countsByRoom?: Record<string, number>
  total?: number
  waitingCount?: number
  members?: Member[]
  poll?: RoomPoll
  game?: GameRound
  text?: string
}

const nameColors = ['#a02050', '#205a9e', '#287744', '#713ca1', '#a35818', '#137d85', '#9b3277', '#514fa5']
// Curated from published Korean wordplay collections; questions are reworded for this room.
// https://simsimlab.pages.dev/nonsense-quiz
// https://toolnjoy.com/nonsense-quiz/words
// https://gemoim.com/ajae-gag
// https://moamoang.co.kr/dad-jokes/
const dailyJokes = [
  { question: '왕이 넘어지면?', answer: '킹콩!' },
  { question: '자동차가 놀라면?', answer: '카놀라유!' },
  { question: '오리가 얼어 버리면?', answer: '언덕!' },
  { question: '쥐 네 마리가 모이면?', answer: '쥐포!' },
  { question: '곰이 목욕탕에 들어가면?', answer: '곰탕!' },
  { question: '소가 노래하면?', answer: '소송!' },
  { question: '젖소가 결정을 못 하면?', answer: '우유부단!' },
  { question: '고등학교에 다니는 물고기는?', answer: '고등어!' },
  { question: '가장 비싼 새는?', answer: '백조!' },
  { question: '개가 사람을 가르치면?', answer: '개인지도!' },
  { question: '하마가 큰일 날 뻔했을 때 하는 말은?', answer: '하마터면!' },
  { question: '물건을 파는 곰은?', answer: '판다!' },
  { question: '딸기가 실직하면?', answer: '딸기시럽!' },
  { question: '아몬드가 죽으면?', answer: '다이아몬드!' },
  { question: '깨가 죽으면?', answer: '주근깨!' },
  { question: '참기름이 경찰서에 간 이유는?', answer: '고소해서!' },
  { question: '빨리 달리는 떡은?', answer: '헐레벌떡!' },
  { question: '온도가 천 도인 과일은?', answer: '천도복숭아!' },
  { question: '사과가 웃음을 참지 못하면?', answer: '풋사과!' },
  { question: '도둑이 싫어하는 아이스크림은?', answer: '누가바!' },
  { question: '가장 가난한 왕은?', answer: '최저임금!' },
  { question: '씨름 선수가 가게를 열면 하는 일은?', answer: '장사!' },
  { question: '왕이 궁에 들어가기 싫어 투덜대면?', answer: '궁시렁궁시렁!' },
  { question: '엄마가 길을 잃으면?', answer: '맘마미아!' },
  { question: '가장 추운 바다는?', answer: '썰렁해!' },
  { question: '미국에 비가 내리면?', answer: 'USB!' },
  { question: '전화로 지은 건물은?', answer: '콜로세움!' },
  { question: '코가 제일 커 보이는 나라는?', answer: '멕시코!' },
  { question: '이름만 들어도 아픈 대륙은?', answer: '아프리카!' },
  { question: '가장 억울한 도형은?', answer: '원통!' },
  { question: '다리미가 좋아하는 음식은?', answer: '피자!' },
  { question: '가위가 잠을 자다가 몸을 못 움직이면?', answer: '가위눌림!' },
  { question: '모두를 일어서게 하는 숫자는?', answer: '다섯!' },
  { question: '가장 쉬운 숫자는?', answer: '십구만!' },
  { question: '발이 두 개 달린 소는?', answer: '이발소!' },
  { question: '마실 수 없는 술은?', answer: '입술!' },
  { question: '사람이 드나들지 못하는 문은?', answer: '소문!' },
  { question: '불을 붙이지 못하는 초는?', answer: '식초!' },
  { question: '아이 아홉을 두면 놀랄 때 뭐라고 할까?', answer: '아이구!' },
  { question: '추장보다 높은 사람은?', answer: '고추장!' },
  { question: '목수가 고치기 어려운 집은?', answer: '고집!' },
  { question: '이름만 들어도 추운 나라는?', answer: '칠레!' },
  { question: '이름만 들어도 배고픈 나라는?', answer: '헝가리!' },
  { question: '가장 슬픈 별은?', answer: '이별!' },
  { question: '물고기의 반대말은?', answer: '불고기!' },
  { question: '뜨거운 개를 영어로 하면?', answer: '핫도그!' },
  { question: '오만하게 구는 돈은?', answer: '오만 원!' },
  { question: '척을 세 번 하면 나오는 도시는?', answer: '삼척!' },
  { question: '사서가 일부러 고생하면?', answer: '사서 고생!' },
  { question: '주머니가 가장 많은 나라는?', answer: '호주!' },
]

function nextJokeIndex() {
  const previous = storedSetting('jeopsokjung-last-joke', '')
  const previousIndex = previous === '' ? -1 : Number(previous)
  const choices = dailyJokes.map((_, index) => index).filter(index => index !== previousIndex)
  return choices[Math.floor(Math.random() * choices.length)]
}

function nameColor(memberId: string) {
  let hash = 0
  for (const character of memberId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return nameColors[hash % nameColors.length]
}

function storedSetting(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

function initialLang(): Lang {
  const requested = new URLSearchParams(location.search).get('lang')
  if (requested === 'ko' || requested === 'en') return requested
  const saved = storedSetting('jeopsokjung-language', '')
  if (saved === 'ko' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

function App() {
  const socket = useRef<WebSocket | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const soundEnabledRef = useRef(false)
  const publicRoom = useRef('')
  const wasConnected = useRef(false)
  const lastContentSent = useRef(0)
  const [online, setOnline] = useState(false)
  const [lang, setLang] = useState<Lang>(initialLang)
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [waitingCount, setWaitingCount] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [poll, setPoll] = useState<RoomPoll | null>(null)
  const [gameRound, setGameRound] = useState<GameRound | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'game'>('chat')
  const [lines, setLines] = useState<Line[]>([])
  const [blockedIds, setBlockedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [whisperToId, setWhisperToId] = useState('')
  const [chatBackground, setChatBackground] = useState(() => storedSetting('jeopsokjung-chat-background', 'paper'))
  const [soundEnabled, setSoundEnabled] = useState(() => storedSetting('jeopsokjung-chat-sounds', 'off') === 'on')
  const [dailyJokeIndex] = useState(nextJokeIndex)
  const [style, setStyle] = useState<ChatStyle>({ font: 'Nanum Gothic', size: 16, color: '#222222', bold: false, italic: false, underline: false })
  const [emojis, setEmojis] = useState(false)
  const [showFormatting, setShowFormatting] = useState(false)
  const [notice, setNotice] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [dialog, setDialog] = useState<'help' | 'nick' | 'poll' | null>(null)
  const [draft, setDraft] = useState('')
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [nickError, setNickError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const en = lang === 'en'
  const tr = (ko: string, english: string) => en ? english : ko

  function chooseLang(next: Lang) {
    setLang(next)
    try { localStorage.setItem('jeopsokjung-language', next) } catch { /* This visit still uses the selected language. */ }
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = lang === 'en' ? 'Jeopsokjung | Chat Lobby' : '접속중 | 채팅 로비'
  }, [lang])

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('lang')
    if (requested === 'ko' || requested === 'en') return
    if (storedSetting('jeopsokjung-language', '')) return
    const controller = new AbortController()
    fetch('/locale', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((data: unknown) => {
        if (storedSetting('jeopsokjung-language', '')) return
        const detected = data && typeof data === 'object' && 'lang' in data ? data.lang : null
        if (detected === 'ko' || detected === 'en') setLang(detected)
      })
      .catch(() => { /* Browser language remains the fallback. */ })
    return () => controller.abort()
  }, [])

  function playRoomSound() {
    if (!soundEnabledRef.current || !audioContext.current) return
    const context = audioContext.current
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(740, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.09)
    volume.gain.setValueAtTime(0.0001, context.currentTime)
    volume.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.015)
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12)
    oscillator.connect(volume)
    volume.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.13)
  }

  function toggleSounds() {
    setSoundEnabled(enabled => {
      const next = !enabled
      soundEnabledRef.current = next
      try { localStorage.setItem('jeopsokjung-chat-sounds', next ? 'on' : 'off') } catch { /* The setting remains active for this visit. */ }
      if (next && typeof window !== 'undefined' && window.AudioContext) {
        audioContext.current ??= new AudioContext()
        void audioContext.current.resume()
      }
      return next
    })
  }

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
            setCounts(event.countsByRoom ?? {})
            setTotal(event.total ?? 0)
            setWaitingCount(event.waitingCount ?? 0)
            setMembers(event.members ?? [])
            break
          case 'poll': setPoll(event.poll ?? null); break
          case 'game': setGameRound(event.game ?? null); break
          case 'room':
            publicRoom.current = event.room?.startsWith('pair:') ? '' : event.room ?? ''
            setRoom(event.room ?? '')
            setWaiting(false)
            setEnded(false)
            setLines([])
            setMessage('')
            setWhisperToId('')
            setPoll(null)
            setGameRound(null)
            setActiveTab('chat')
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
              if (!line.from && /님이 (입장했습니다|나갔습니다)/.test(line.text)) playRoomSound()
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

  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  useEffect(() => {
    try { localStorage.setItem('jeopsokjung-last-joke', String(dailyJokeIndex)) } catch { /* Rotation remains active for this visit. */ }
  }, [dailyJokeIndex])

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines, room, blockedIds])

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
    if (!message.trim()) return
    if (whisperToId) {
      if (!members.some(member => member.id === whisperToId) || blockedIds.includes(whisperToId)) {
        setNotice('수신자를 선택할 수 없습니다. 접속자 목록에서 다시 선택해 주세요.')
        setWhisperToId('')
        return
      }
      if (send('whisper', message, whisperToId, style)) setMessage('')
      return
    }
    if (send('say', message, undefined, style)) setMessage('')
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

  function openDialog(kind: 'help' | 'nick' | 'poll') {
    setDraft(kind === 'nick' ? name : '')
    if (kind === 'poll') { setPollQuestion(''); setPollOptions(['', '']) }
    setNickError('')
    setDialog(kind)
  }

  function submitDialog(event: FormEvent) {
    event.preventDefault()
    if (dialog === 'poll') {
      const options = pollOptions.map(option => option.trim()).filter(Boolean)
      if (send('pollCreate', JSON.stringify({ question: pollQuestion.trim(), options }))) setDialog(null)
      return
    }
    if (dialog === 'nick') send('nick', draft)
  }

  function toggleBlock(memberId: string) {
    setBlockedIds(previous => previous.includes(memberId) ? previous.filter(item => item !== memberId) : [...previous, memberId])
    if (whisperToId === memberId) setWhisperToId('')
  }

  function roomList(list: typeof rooms, active = false) {
    return (
      <ul className={'room-list' + (active ? ' active-list' : '')}>
        {list.map(item => <li key={item.id}>
          <div><button className="link room-link" disabled={!online} onClick={() => send('join', item.id)}>{en ? item.nameEn : item.name}</button>{!active && <small>{en ? item.aboutEn : item.about}</small>}</div>
          <span className={counts[item.id] ? 'occupied' : 'vacant'}>{online ? en ? `${counts[item.id] ?? 0} here` : (counts[item.id] ?? 0) + '명' : '—'}</span>
        </li>)}
      </ul>
    )
  }

  const pair = room.startsWith('pair:')
  const pairPeer = pair ? members.find(member => member.id !== id) ?? lines.find(line => line.from && line.from.id !== id)?.from : undefined
  const current = rooms.find(item => item.id === room)
  const whisperRecipient = members.find(member => member.id === whisperToId && !blockedIds.includes(member.id))
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
  const dailyJoke = dailyJokes[dailyJokeIndex]

  return (
    <div className={'site' + (room ? ' in-room' : '') + (en ? ' english' : '')}>
      {!room && <header className="masthead">
        <div className="identity"><span className="wordmark">접속<span>중</span><b>!</b></span><span className="masthead-slogan">{en ? <>A little chat<br />goes a long way ♡</> : <>오늘도 친구들과<br />반가운 수다 한마당 ♡</>}</span></div>
        <nav aria-label={tr('서비스 메뉴', 'Site menu')}><span className="masthead-count">● {en ? `${total} online now` : `지금 ${total}명 접속 중`}</span><div className="language-switch" role="group" aria-label={tr('언어 선택', 'Language')}><button type="button" aria-pressed={!en} onClick={() => chooseLang('ko')}>한국어</button><button type="button" aria-pressed={en} onClick={() => chooseLang('en')}>EN</button></div><button className="link" onClick={() => openDialog('help')}>{tr('이용 안내', 'Help')}</button></nav>
      </header>}
      <main>
      {!room ? <>
        <div className="portal-ticker"><b>{tr('접속중 알림', 'Notice')}</b><span>{tr('어서 오세요! 마음에 드는 방을 골라 자유롭게 이야기해 보세요.', 'Welcome! Pick a room and join the conversation.')}</span><span className="ticker-sparkle" aria-hidden="true">✦ ✦ ✦</span></div>
        <div className="lobby-grid">
        <aside className="lobby-side" aria-label={tr('이용 정보', 'Quick links')}>
          <section className="portal-box"><h2>📌 {tr('바로가기', 'Quick links')}</h2><button className="link" disabled={!online} onClick={() => send('join', 'free')}>{tr('자유채팅 입장하기', 'Enter Open Chat')}</button><button className="link" disabled={!online} onClick={() => send('queue')}>{tr('랜덤 1:1 시작하기', 'Start random 1:1')}</button></section>
          <section className="portal-box"><h2>💬 {tr('채팅 예절', 'Chat etiquette')}</h2><p>{tr('처음 만난 사람에게는 반갑게 인사해요!', 'Say hello to someone new!')}</p><button className="link" onClick={() => openDialog('help')}>{tr('이용 안내 보기 →', 'Read the guide →')}</button></section>
        </aside>
        <div className="lobby-center">
        <div className="bar lobby-title"><h1>★ {tr('채팅방 골라 들어가기', 'Choose a chat room')}</h1><span><i className={online ? 'online' : ''} />{online ? en ? `${total} online` : '접속 ' + total + '명' : tr('서버 연결 중', 'Connecting')}</span></div>
        <div className="guest"><div>{name ? <><b>{name}</b>{tr('님, 어서 오세요.', ', welcome!')}</> : tr('접속하는 중입니다.', 'Connecting…')}</div><button className="link" disabled={!online || waiting} onClick={() => openDialog('nick')}>{tr('닉네임 변경', 'Change nickname')}</button></div>
        {notice && <div className="notice" role="status">{translateServerText(notice, lang)}</div>}
        <section className="random panel" aria-labelledby="random-title">
          <div><h2 id="random-title">🎲 {tr('랜덤 1:1 채팅', 'Random 1:1 Chat')}</h2><p role="status">{waiting ? en ? `${waitingCount} waiting · You'll connect when someone else joins.` : `대기 중 ${waitingCount}명 · 다른 사람이 시작하면 자동으로 연결됩니다.` : en ? `${waitingCount} waiting · Start to find a chat partner.` : `현재 대기 중 ${waitingCount}명 · 시작하면 자동으로 짝을 찾습니다.`}</p></div>
          <button className="classic primary" disabled={!online} onClick={() => send(waiting ? 'leave' : 'queue')}>{waiting ? tr('대기 취소', 'Cancel') : tr('랜덤 1:1 시작', 'Start random chat')}</button>
          {waiting && <button className="link" onClick={() => send('join', 'free')}>{tr('자유채팅으로 이동', 'Go to Open Chat')}</button>}
        </section>
        <section className="panel active" aria-labelledby="active-title"><div className="section-bar"><h2 id="active-title">★ {tr('지금 대화 중인 방', 'Active rooms')}</h2></div>
          {activeRooms.length ? roomList(activeRooms, true) : <div className="empty">{online ? tr('아직 대화 중인 공개방이 없습니다.', 'No public rooms are active yet.') : tr('서버에 연결되면 채팅방을 볼 수 있습니다.', 'Rooms will appear after you connect.')}<button className="classic" disabled={!online} onClick={() => send('join', 'free')}>{tr('자유채팅에 먼저 입장', 'Enter Open Chat')}</button></div>}
          {activeRooms.length > 0 && !counts.free && <div className="active-foot"><button className="link" disabled={!online} onClick={() => send('join', 'free')}>{tr('빈 자유채팅방에 입장하기 →', 'Be first in Open Chat →')}</button></div>}
        </section>
        <div className="directory">
          {['지역별', '주제별'].map(group => <section className="panel" key={group}>
            <div className="section-bar"><h2>{group === '지역별' ? '🌏' : '💡'} {group === '지역별' ? tr('지역별 채팅', 'Chat by region') : tr('주제별 채팅', 'Chat by topic')}</h2></div>
            {roomList(rooms.filter(item => item.group === group))}
          </section>)}
        </div>
        </div>
        <aside className="lobby-side lobby-side-right" aria-label={tr('오늘의 소식', 'Today')}>
          <section className="portal-box online-box"><h2>👥 {tr('지금 접속 중', 'Online now')}</h2><strong>{total}<small>{tr('명', ' people')}</small></strong><p>{tr('같은 시간, 같은 채팅방에서 만나요.', 'Meet someone in a chat room.')}</p></section>
          <section className="portal-box joke-box"><h2>😄 {tr('오늘의 아재개그', 'Conversation starter')}</h2>{en ? <p>What made you smile today?</p> : <><p><b>Q.</b> {dailyJoke.question}</p><p><b>A.</b> {dailyJoke.answer}</p></>}</section>
          <section className="portal-box tip-box"><h2>✨ {tr('오늘의 한마디', 'A little tip')}</h2><p>{tr('먼저 “안녕하세요!” 하고 말을 걸어 보세요.', 'Say “hello” and start the conversation.')}</p></section>
        </aside>
        </div>
      </> : <section className={'window panel chat-bg-' + chatBackground} aria-label={tr('채팅방', 'Chat room')}>
        <div className="bar chat-title"><h1>{pair ? tr('랜덤 1:1 채팅', 'Random 1:1 Chat') : en ? current?.nameEn : current?.name}</h1><div className="chat-title-actions"><div className="language-switch" role="group" aria-label={tr('언어 선택', 'Language')}><button type="button" aria-pressed={!en} onClick={() => chooseLang('ko')}>한국어</button><button type="button" aria-pressed={en} onClick={() => chooseLang('en')}>EN</button></div><button className="classic" onClick={() => send('leave')}>{tr('← 로비로', '← Lobby')}</button></div></div>
        <div className="chat-menu"><span>{pair ? ended ? tr('대화 종료', 'Chat ended') : pairPeer && blockedIds.includes(pairPeer.id) ? tr('상대 차단됨', 'Partner blocked') : tr('상대와 연결됨', 'Connected to a partner') : en ? current?.aboutEn : current?.about}</span>
          <div className="chat-actions"><label className="status-control">{tr('내 상태', 'Status')} <select aria-label={tr('내 접속 상태', 'My status')} value={members.find(member => member.id === id)?.status ?? 'chatting'} onChange={event => send('status', event.target.value)}><option value="chatting">{tr('수다 중', 'Chatting')}</option><option value="away">{tr('자리 비움', 'Away')}</option></select></label><button className="link" onClick={() => openDialog('nick')}>{tr('닉네임 변경', 'Change name')}</button>
          {pairPeer && <button className="link" aria-pressed={blockedIds.includes(pairPeer.id)} aria-label={`${pairPeer.name} ${blockedIds.includes(pairPeer.id) ? tr('차단 해제', 'Unblock') : tr('차단', 'Block')}`} title={tr('이 접속에서 내 화면에만 적용됩니다', 'Only affects what you see during this visit')} onClick={() => toggleBlock(pairPeer.id)}>{blockedIds.includes(pairPeer.id) ? tr('차단 해제', 'Unblock') : tr('상대 차단', 'Block partner')}</button>}
          {pair && <button className="link" onClick={() => send('queue')}>{tr('다음 상대', 'Next partner')}</button>}
          {!pair && <button className="link member-toggle" aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>{en ? `${members.length} people` : `접속자 ${members.length}명`}</button>}</div>
        </div>
        {!pair && <div className="room-tools"><button className="tool-button" disabled={Boolean(poll && !poll.closed)} onClick={() => openDialog('poll')}>🗳️ {tr('투표 만들기', 'Create poll')}</button><button className={'tool-button' + (activeTab === 'game' ? ' selected' : '')} aria-current={activeTab === 'game' ? 'page' : undefined} onClick={() => setActiveTab(activeTab === 'game' ? 'chat' : 'game')}>🎮 {tr('테트리스', 'Tetris')}{gameRound && !gameRound.ended ? tr(' · 진행 중', ' · Live') : ''}</button></div>}
        {!pair && <div className="daily-phrase"><strong>{tr('오늘의 아재개그', 'Conversation starter')}</strong><span>{en ? 'What made you smile today?' : <><b>Q.</b> {dailyJoke.question} <b>A.</b> {dailyJoke.answer}</>}</span></div>}
        <div className="workspace">
          <div className="log" ref={log} role="log" aria-label={tr('대화 로그', 'Chat log')} tabIndex={0} hidden={activeTab === 'game'}>
            {poll && <section className={'poll-panel' + (poll.closed ? ' is-closed' : '')} aria-label={tr('방 투표', 'Room poll')}>
              <div className="poll-heading"><h2>{poll.question}</h2><span>{poll.closed ? tr('종료된 투표', 'Poll closed') : tr('진행 중 투표', 'Poll open')}</span></div>
              <div className="poll-options">{poll.options.map(option => {
                const totalVotes = poll.options.reduce((sum, item) => sum + item.votes, 0)
                const percent = totalVotes ? Math.round(option.votes * 100 / totalVotes) : 0
                return <button key={option.id} className={'poll-option' + (poll.myVote === option.id ? ' is-selected' : '')} disabled={poll.closed} onClick={() => send('pollVote', option.id, poll.id)}>
                  <span className="poll-option-label">{option.text}<b>{en ? `${option.votes} votes` : `${option.votes}표`} · {percent}%</b></span><i style={{ width: percent + '%' }} />
                </button>
              })}</div>
              <div className="poll-footer"><span>{poll.myVote ? tr('선택을 눌러 표를 변경할 수 있어요.', 'Choose another option to change your vote.') : poll.closed ? tr('투표가 종료되었습니다.', 'This poll has closed.') : tr('원하는 항목에 투표해 주세요.', 'Choose an option to vote.')}</span>{id === poll.owner.id && !poll.closed && <button className="link" onClick={() => send('pollClose', '', poll.id)}>{tr('투표 마감', 'Close poll')}</button>}</div>
            </section>}
            {!lines.length && !ended && <div className="empty-chat"><span aria-hidden="true">｡･:*:･ﾟ★</span><strong>{tr('아직 대화가 없어요', 'No messages yet')}</strong><p>{tr('오늘의 아재개그로 가볍게 웃으며 시작해 보세요.', 'Say hello to get the conversation going.')}</p></div>}
            {lines.filter(line => !line.from || !blockedIds.includes(line.from.id)).map(line =>
              <div className={line.from ? 'chat-line' + (line.whisperTo ? ' whisper-line' : '') : 'chat-line system'} key={line.id}>
                <time dateTime={new Date(line.at).toISOString()}>[{time.format(line.at)}]</time>
                <div>{line.from && <b style={{ color: nameColor(line.from.id) }}>{line.whisperTo ? line.from.id === id ? `${tr('귓속말', 'Whisper')} → ${line.whisperTo.name}: ` : `${tr('귓속말', 'Whisper')} ← ${line.from.name}: ` : `${line.from.name}: `}</b>}{line.image ? <img className="chat-image" src={line.image} alt={tr('채팅으로 보낸 이미지', 'Image sent in chat')} /> : <span style={line.style ? { color: line.style.color, fontFamily: line.style.font, fontSize: line.style.font === 'Nanum Pen Script' ? line.style.size * 1.25 : line.style.size, fontWeight: line.style.bold ? 'bold' : 'normal', fontStyle: line.style.italic ? 'italic' : 'normal', textDecoration: line.style.underline ? 'underline' : 'none' } : undefined}>{line.from ? line.text : translateServerText(line.text, lang)}</span>}
                </div>
              </div>
            )}
            {ended && <p className="ended" role="status">{tr('상대가 대화를 종료했습니다.', 'Your partner ended the chat.')}</p>}
          </div>
          <TetrisBoard lang={lang} round={gameRound} active={activeTab === 'game'} onCreate={() => { setActiveTab('game'); send('gameCreate') }} onJoin={roundId => send('gameJoin', '', roundId)} onScore={(roundId, score) => send('gameScore', String(score), roundId)} />
          {!pair && <aside className={'members' + (showMembers ? ' expanded' : '')}>
            <h2>☺ {en ? `${members.length} people here` : `접속자 ${members.length}명`}</h2>
            <ul>{members.map(member => <li key={member.id} className={blockedIds.includes(member.id) ? 'is-blocked' : undefined}>
              {member.id === id
                ? <button className="link member-self" title={tr('닉네임 변경', 'Change nickname')} onClick={() => openDialog('nick')}>{member.name} {tr('(나)', '(me)')}</button>
                : <button className="link member-name" disabled={blockedIds.includes(member.id)} title={blockedIds.includes(member.id) ? tr('차단 해제 후 귓속말을 보낼 수 있습니다', 'Unblock to send a whisper') : en ? `Whisper to ${member.name}` : member.name + '에게 귓속말 수신자로 지정'} aria-pressed={whisperToId === member.id} onClick={() => { setWhisperToId(current => current === member.id ? '' : member.id); input.current?.focus() }}>{member.name}</button>}
              <div className="member-row-actions">
                {!blockedIds.includes(member.id) && <span className={'member-status' + (member.status === 'away' ? ' away' : '')} title={member.status === 'away' ? tr('자리 비움', 'Away') : tr('수다 중', 'Chatting')}><i aria-hidden="true" />{member.status === 'away' ? tr('자리 비움', 'Away') : tr('수다 중', 'Chat')}</span>}
                {member.id !== id && <button className="link member-action" aria-pressed={blockedIds.includes(member.id)} aria-label={`${member.name} ${blockedIds.includes(member.id) ? tr('차단 해제', 'Unblock') : tr('차단', 'Block')}`} title={tr('이 접속에서 내 화면에만 적용됩니다', 'Only affects what you see during this visit')} onClick={() => toggleBlock(member.id)}>{blockedIds.includes(member.id) ? tr('차단 해제', 'Unblock') : tr('차단', 'Block')}</button>}
              </div>
            </li>)}</ul>
          </aside>}
        </div>
        {notice && <div className="notice" role="status">{translateServerText(notice, lang)}</div>}
        <div className="format-row" aria-label={tr('메시지 꾸미기', 'Message formatting')}>
          <button type="button" className="tool-button" aria-expanded={emojis} onClick={() => setEmojis(!emojis)}>☺ {tr('이모지', 'Emoji')}</button>
          <button type="button" className="tool-button" onClick={() => upload.current?.click()}>▧ {tr('이미지', 'Image')}</button>
          <label className="background-picker">{tr('배경', 'Theme')} <select aria-label={tr('채팅방 배경', 'Chat background')} value={chatBackground} onChange={event => { setChatBackground(event.target.value); try { localStorage.setItem('jeopsokjung-chat-background', event.target.value) } catch { /* The setting remains active for this visit. */ } }}><option value="paper">{tr('종이', 'Paper')}</option><option value="sky">{tr('하늘', 'Sky')}</option><option value="rose">{tr('분홍', 'Rose')}</option><option value="mint">{tr('민트', 'Mint')}</option></select></label>
          <button type="button" className="tool-button sound-toggle" aria-pressed={soundEnabled} onClick={toggleSounds}>♫ {tr('효과음', 'Sound')} {soundEnabled ? tr('켬', 'On') : tr('끔', 'Off')}</button>
          <input ref={upload} className="file-input" type="file" accept="image/*" aria-label={tr('이미지 선택', 'Choose image')} onChange={event => void sendImage(event.target.files?.[0])} />
          <button type="button" className="tool-button format-panel-toggle" aria-expanded={showFormatting} aria-controls="format-controls" onClick={() => setShowFormatting(!showFormatting)}>Aa {tr('글자 꾸미기', 'Text style')} {showFormatting ? '▴' : '▾'}</button>
          <div id="format-controls" className={'format-controls' + (showFormatting ? ' expanded' : '')}>
          <select aria-label={tr('글꼴', 'Font')} value={style.font} onChange={event => setStyle(previous => ({ ...previous, font: event.target.value }))}>
            <option value="Nanum Gothic">{tr('나눔고딕', 'Sans')}</option>
            <option value="Nanum Myeongjo">{tr('나눔명조', 'Serif')}</option>
            <option value="Nanum Pen Script">{tr('나눔손글씨', 'Handwriting')}</option>
          </select>
          <select aria-label={tr('글자 크기', 'Font size')} value={style.size} onChange={event => setStyle(previous => ({ ...previous, size: Number(event.target.value) }))}>{[12, 14, 16, 18].map(size => <option key={size} value={size}>{size}</option>)}</select>
          {['#222222', '#c22552', '#205a9e', '#287744', '#713ca1'].map(color => <button key={color} type="button" title={tr('글자색 ', 'Text color ') + color} aria-pressed={style.color === color} className="color-choice" style={{ backgroundColor: color }} onClick={() => setStyle(previous => ({ ...previous, color }))} />)}
          {(['bold', 'italic', 'underline'] as const).map((key) => <button key={key} type="button" className="format-toggle" aria-label={key === 'bold' ? tr('굵게', 'Bold') : key === 'italic' ? tr('기울임', 'Italic') : tr('밑줄', 'Underline')} aria-pressed={style[key]} onClick={() => setStyle(previous => ({ ...previous, [key]: !previous[key] }))}>{key === 'bold' ? <b>B</b> : key === 'italic' ? <i>I</i> : <u>U</u>}</button>)}
          </div>
        </div>
        {emojis && <div className="emoji-picker">{['😀','😂','🥹','😍','😎','😭','😡','👍','👏','❤️','💐','🐱','✨','🎉','☕','🍰'].map(emoji => <button type="button" key={emoji} onClick={() => { setMessage(previous => previous + emoji); setEmojis(false); input.current?.focus() }}>{emoji}</button>)}</div>}
        {!pair && <div className={'whisper-target' + (whisperRecipient ? ' is-active' : '')}>
          <label htmlFor="whisper-recipient">{tr('귓속말', 'Whisper')}</label>
          <select id="whisper-recipient" value={whisperToId} disabled={ended} onChange={event => setWhisperToId(event.target.value)}>
            <option value="">{tr('전체 대화방', 'Everyone')}</option>
            {members.filter(member => member.id !== id && !blockedIds.includes(member.id)).map(member => <option key={member.id} value={member.id}>{en ? `To ${member.name}` : `${member.name}에게`}</option>)}
          </select>
          {whisperRecipient && <><span className="whisper-confirm">{en ? `Only ${whisperRecipient.name} will see this` : `${whisperRecipient.name}님만 받습니다`}</span><button type="button" className="link" onClick={() => setWhisperToId('')}>{tr('해제', 'Clear')}</button></>}
        </div>}
        <form className="compose" onSubmit={submit}>
          <input ref={input} aria-label={whisperRecipient ? en ? `Whisper to ${whisperRecipient.name}` : whisperRecipient.name + '에게 보낼 귓속말' : tr('메시지', 'Message')} style={previewStyle} value={message} maxLength={400} disabled={ended} onChange={event => setMessage(event.target.value)} placeholder={ended ? tr('다음 상대를 찾거나 로비로 돌아가세요.', 'Find another partner or return to the lobby.') : whisperRecipient ? en ? `Whisper to ${whisperRecipient.name}` : whisperRecipient.name + '님에게 귓속말을 입력하세요' : tr('메시지를 입력하세요', 'Type a message')} />
          <button className="classic primary" disabled={ended || !message.trim()}>{whisperRecipient ? tr('귓속말 보내기', 'Send whisper') : tr('전송', 'Send')}</button>
        </form>
        <div className="status-bar"><span>Jeopsokjung! Chat</span><span>{online ? tr('● 연결됨', '● Connected') : tr('○ 연결 중', '○ Connecting')}</span><span>{en ? `${total} online` : `온라인 ${total}명`}</span></div>
      </section>}
      </main>
      <dialog ref={modal} onClose={() => setDialog(null)}>
        <div className="bar dialog-title">{dialog === 'nick' ? tr('닉네임 변경', 'Change nickname') : dialog === 'poll' ? tr('새 투표 만들기', 'Create a poll') : tr('이용 안내', 'Help')}</div>
        <form onSubmit={submitDialog}>
          {dialog === 'nick' && <><label>{tr('닉네임', 'Nickname')} <input autoFocus required minLength={2} maxLength={16} value={draft} onChange={event => { setDraft(event.target.value); setNickError('') }} /></label>{nickError && <p className="dialog-error" role="alert">{translateServerText(nickError, lang)}</p>}</>}
          {dialog === 'poll' && <div className="poll-form"><label>{tr('질문', 'Question')} <input autoFocus required maxLength={80} value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} placeholder={tr('예: 오늘 점심 뭐 먹을까요?', 'For example: What should we have for lunch?')} /></label><fieldset><legend>{tr('선택지 (2~4개)', 'Choices (2–4)')}</legend>{pollOptions.map((option, index) => <div className="poll-option-input" key={index}><input required={index < 2} maxLength={32} aria-label={en ? `Choice ${index + 1}` : `선택지 ${index + 1}`} value={option} onChange={event => setPollOptions(previous => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={en ? `Choice ${index + 1}` : `선택지 ${index + 1}`} />{index > 1 && <button type="button" className="link" onClick={() => setPollOptions(previous => previous.filter((_, itemIndex) => itemIndex !== index))}>{tr('삭제', 'Remove')}</button>}</div>)}</fieldset>{pollOptions.length < 4 && <button type="button" className="link" onClick={() => setPollOptions(previous => [...previous, ''])}>{tr('+ 선택지 추가', '+ Add choice')}</button>}</div>}
          {dialog === 'help' && <p>{tr('닉네임으로 입장해 대화할 수 있습니다. 개인정보 공유, 괴롭힘, 도배는 삼가 주세요. 불편한 사용자는 공개방 접속자 목록이나 랜덤 1:1 상단에서 차단할 수 있습니다. 차단은 내 화면에서만 적용되며 상대가 재접속하면 새 사용자로 표시됩니다.', 'Join with a nickname and chat freely. Please avoid sharing personal information, harassment and spam. You can block someone from a public room’s people list or the random chat menu. Blocking only hides them on your screen during this visit; a reconnect gives them a new ID.')}</p>}
          <div className="dialog-actions"><button type="button" className="classic" onClick={() => setDialog(null)}>{dialog === 'help' ? tr('닫기', 'Close') : tr('취소', 'Cancel')}</button>{dialog !== 'help' && <button className="classic primary">{dialog === 'poll' ? tr('투표 시작', 'Start poll') : tr('변경', 'Save')}</button>}</div>
        </form>
      </dialog>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
