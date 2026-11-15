import { useEffect, useRef, useState } from 'react'
import type { GameRound } from './rooms'

const WIDTH = 10
const HEIGHT = 20
const shapes = [
  ['....', 'XXXX', '....', '....'],
  ['.XX.', '.XX.', '....', '....'],
  ['.X..', 'XXX.', '....', '....'],
  ['.XX.', 'XX..', '....', '....'],
  ['XX..', '.XX.', '....', '....'],
  ['X...', 'XXX.', '....', '....'],
  ['..X.', 'XXX.', '....', '....'],
]

type Piece = { kind: number; x: number; y: number; rotation: number }
type Engine = { board: number[][]; piece: Piece | null; score: number; over: boolean }
const emptyBoard = () => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0))

function matrix(kind: number, rotation: number) {
  let result = shapes[kind].map(row => row.split('').map(cell => cell === 'X'))
  for (let step = 0; step < rotation; step++) result = result.map((_, y) => result.map(row => row[3 - y]))
  return result
}

function fits(board: number[][], piece: Piece) {
  const cells = matrix(piece.kind, piece.rotation)
  return cells.every((row, y) => row.every((filled, x) => {
    if (!filled) return true
    const px = piece.x + x
    const py = piece.y + y
    return px >= 0 && px < WIDTH && py < HEIGHT && (py < 0 || board[py][px] === 0)
  }))
}

function rotatedPosition(board: number[][], piece: Piece): Piece | null {
  const rotation = (piece.rotation + 1) % 4
  const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]
  for (const [dx, dy] of kicks) {
    const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy, rotation }
    if (fits(board, candidate)) return candidate
  }
  return null
}

function newPiece(board: number[][]): Piece | null {
  const piece = { kind: Math.floor(Math.random() * shapes.length), x: 3, y: -1, rotation: 0 }
  return fits(board, piece) ? piece : null
}

function land(engine: Engine) {
  if (!engine.piece) return
  const board = engine.board.map(row => [...row])
  const cells = matrix(engine.piece.kind, engine.piece.rotation)
  cells.forEach((row, y) => row.forEach((filled, x) => {
    if (filled && engine.piece && engine.piece.y + y >= 0) board[engine.piece.y + y][engine.piece.x + x] = engine.piece.kind + 1
  }))
  if (engine.piece.y < 0) { engine.over = true; engine.piece = null; return }
  const remaining = board.filter(row => row.some(cell => cell === 0))
  const cleared = HEIGHT - remaining.length
  engine.board = [...Array.from({ length: cleared }, () => Array(WIDTH).fill(0)), ...remaining]
  engine.score += [0, 100, 300, 500, 800][cleared] ?? 800
  engine.piece = newPiece(engine.board)
  if (!engine.piece) engine.over = true
}

function freshEngine(): Engine {
  const board = emptyBoard()
  return { board, piece: newPiece(board), score: 0, over: false }
}

type Props = { round: GameRound | null; active: boolean; onCreate: () => void; onJoin: (id: string) => void; onScore: (id: string, score: number) => void }

export function TetrisBoard({ round, active, onCreate, onJoin, onScore }: Props) {
  const engine = useRef<Engine>(freshEngine())
  const lastReported = useRef(0)
  const expiryReported = useRef(false)
  const onScoreRef = useRef(onScore)
  const [, redraw] = useState(0)
  const [now, setNow] = useState(Date.now())
  onScoreRef.current = onScore
  const joined = Boolean(round?.joined)
  const finished = Boolean(round?.ended || (round && round.endsAt <= now))

  useEffect(() => {
    engine.current = freshEngine()
    lastReported.current = 0
    expiryReported.current = false
    redraw(value => value + 1)
  }, [round?.id])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!active || !joined || finished) return
    const timer = window.setInterval(() => {
      if (engine.current.over) return
      const candidate = { ...engine.current.piece!, y: engine.current.piece!.y + 1 }
      if (engine.current.piece && fits(engine.current.board, candidate)) engine.current.piece = candidate
      else land(engine.current)
      redraw(value => value + 1)
    }, 600)
    return () => window.clearInterval(timer)
  }, [active, joined, finished, round?.id])

  useEffect(() => {
    if (!round || !joined || !active) return
    const reporter = window.setInterval(() => {
      const score = engine.current.score
      if (score > lastReported.current) {
        lastReported.current = score
        onScoreRef.current(round.id, score)
      }
    }, 1200)
    return () => window.clearInterval(reporter)
  }, [active, joined, round?.id])

  useEffect(() => {
    if (!round || !joined || !active || !finished || expiryReported.current) return
    expiryReported.current = true
    lastReported.current = engine.current.score
    onScoreRef.current(round.id, engine.current.score)
  }, [active, finished, joined, round])

  function act(command: 'left' | 'right' | 'rotate' | 'down' | 'drop') {
    if (!active || !joined || finished || engine.current.over || !engine.current.piece) return
    const state = engine.current
    const piece = state.piece
    if (!piece) return
    if (command === 'left' || command === 'right' || command === 'down') {
      const dx = command === 'left' ? -1 : command === 'right' ? 1 : 0
      const dy = command === 'down' ? 1 : 0
      const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy }
      if (fits(state.board, candidate)) {
        state.piece = candidate
        if (command === 'down') state.score += 1
      } else if (command === 'down') land(state)
    } else if (command === 'rotate') {
      const candidate = rotatedPosition(state.board, piece)
      if (candidate) state.piece = candidate
    } else {
      let distance = 0
      while (fits(state.board, { ...piece, y: piece.y + 1 })) { piece.y += 1; distance += 1 }
      state.score += distance * 2
      land(state)
    }
    redraw(value => value + 1)
  }

  useEffect(() => {
    if (!active || !joined || finished) return
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const command = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' } as Record<string, 'left' | 'right' | 'down' | 'rotate' | 'drop'>)[event.key]
      if (!command) return
      event.preventDefault()
      act(command)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [active, joined, finished])

  const seconds = round ? Math.max(0, Math.ceil((round.endsAt - now) / 1000)) : 0
  const cells = emptyBoard()
  if (joined && engine.current.piece) {
    const piece = engine.current.piece
    matrix(piece.kind, piece.rotation).forEach((row, y) => row.forEach((filled, x) => {
      const py = piece.y + y
      const px = piece.x + x
      if (filled && py >= 0 && py < HEIGHT && px >= 0 && px < WIDTH) cells[py][px] = piece.kind + 1
    }))
  }
  const displayBoard = cells.map((row, y) => row.map((cell, x) => cell || engine.current.board[y][x]))
  const rankings = [...(round?.players ?? [])].sort((a, b) => b.score - a.score)

  return <section className="game-view" hidden={!active} aria-label="테트리스 친선 라운드">
    <div className="game-heading"><div><h2>테트리스 친선 라운드</h2><p>2분 동안 점수를 겨뤄 보세요. 기록은 이 라운드에서만 보여요.</p></div>{round && <strong className={finished ? 'round-finished' : 'round-clock'}>{finished ? '라운드 종료' : `남은 시간 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong>}</div>
    {!round ? <div className="game-empty"><p>같은 방 사람들과 2분 한 판을 시작해 보세요.</p><button className="classic primary" onClick={onCreate}>라운드 시작</button></div>
      : <div className="game-layout">
        <div className="board-column"><div className="tetris-board" role="grid" tabIndex={0} aria-label={`테트리스 보드, ${engine.current.score}점`}>
          {displayBoard.flatMap((row, y) => row.map((cell, x) => <i role="gridcell" aria-label={cell ? '블록' : '빈 칸'} className={cell ? `cell color-${cell}` : 'cell'} key={`${y}-${x}`} />))}
        </div><p className="game-score">내 점수 <b>{engine.current.score}</b>{engine.current.over && !finished && <span> 게임 오버</span>}</p>
          {joined && !finished && <div className="game-controls" aria-label="테트리스 조작"><button onClick={() => act('left')} aria-label="왼쪽">←</button><button onClick={() => act('rotate')} aria-label="회전">↻</button><button onClick={() => act('right')} aria-label="오른쪽">→</button><button onClick={() => act('down')} aria-label="한 칸 내리기">↓</button><button onClick={() => act('drop')} aria-label="바로 내리기">바로 내리기</button></div>}
          {!joined && !finished && <button className="classic primary" onClick={() => onJoin(round.id)}>이번 판 참가</button>}
        </div>
        <aside className="game-rank"><h3>{finished ? '라운드 결과' : '현재 점수'}</h3>{rankings.length ? <ol>{rankings.map((player, index) => <li key={player.member.id}><span>{index + 1}. {player.member.name}</span><b>{player.score}</b></li>)}</ol> : <p>아직 참가자가 없어요.</p>}{!finished && <small>방에 있는 사람은 언제든 참가할 수 있어요.</small>}</aside>
      </div>}
  </section>
}
