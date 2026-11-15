export type Lang = 'ko' | 'en'

export function translateServerText(text: string, lang: Lang) {
  if (lang === 'ko') return text
  const exact: Record<string, string> = {
    '상대와 연결되었습니다.': 'You are connected with someone.',
    '잠시 후 다시 시도해 주세요.': 'Please try again in a moment.',
    '닉네임은 2~16자의 글자, 숫자, 공백, 밑줄 또는 하이픈으로 입력해 주세요.': 'Use 2–16 letters, numbers, spaces, underscores or hyphens for your nickname.',
    '이미 사용 중인 닉네임입니다.': 'This nickname is already in use.',
    '이 방에서 진행 중인 투표가 이미 있습니다.': 'A poll is already open in this room.',
    '투표 질문과 선택지를 확인해 주세요. (선택지 2~4개)': 'Check the poll question and add 2–4 choices.',
    '이 방에서 진행 중인 테트리스 라운드가 있습니다.': 'A Tetris round is already in progress in this room.',
    '상대가 채팅방을 나갔습니다. 접속자 목록에서 다시 선택해 주세요.': 'That person left the room. Please choose someone else.',
    '[이미지]': '[Image]',
    '다시 연결되었습니다.': 'Reconnected.',
    '연결이 끊겼습니다. 다시 연결하는 중입니다.': 'Connection lost. Reconnecting…',
    '서버에 연결되는 중입니다.': 'Connecting to the server…',
    '잠시 후 다시 보내 주세요.': 'Please wait a moment before sending again.',
    '수신자를 선택할 수 없습니다. 접속자 목록에서 다시 선택해 주세요.': 'That recipient is unavailable. Please choose someone else.',
    '10MB 이하 이미지 파일을 선택해 주세요.': 'Choose an image under 10 MB.',
    '이미지가 너무 커서 보낼 수 없습니다. 작은 사진을 선택해 주세요.': 'That image is too large to send. Choose a smaller one.',
    '이 이미지 형식을 열 수 없습니다.': 'This image format cannot be opened.',
    '닉네임을 변경하지 못했습니다.': 'Could not change your nickname.',
  }
  if (exact[text]) return exact[text]
  const patterns: [RegExp, (...parts: string[]) => string][] = [
    [/^(.+)님이 나갔습니다\.$/, name => `${name} left the room.`],
    [/^(.+)님이 입장했습니다\. 반가워요! 오늘의 아재개그도 함께 봐요\.$/, name => `${name} joined the room. Say hello!`],
    [/^(.+)님이 (.+)으로 닉네임을 변경했습니다\.$/, (oldName, newName) => `${oldName} changed their nickname to ${newName}.`],
    [/^(.+)님이 투표를 열었습니다\.$/, name => `${name} started a poll.`],
    [/^(.+)님이 테트리스 한 판을 시작했어요! \(2분 친선 라운드\)$/, name => `${name} started a 2-minute Tetris round!`],
  ]
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern)
    if (match) return format(...match.slice(1))
  }
  return text
}
