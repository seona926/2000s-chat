export const rooms = [
  { id: 'free', group: '공용', name: '자유채팅', nameEn: 'Open Chat', about: '지금 하고 싶은 이야기', aboutEn: 'Talk about anything' },
  { id: 'seoul', group: '지역별', name: '서울·경기·인천', nameEn: 'Seoul · Gyeonggi · Incheon', about: '수도권 동네 이야기', aboutEn: 'Life around the capital region' },
  { id: 'central', group: '지역별', name: '충청·강원', nameEn: 'Chungcheong · Gangwon', about: '충청과 강원의 일상', aboutEn: 'Everyday life in central Korea' },
  { id: 'southwest', group: '지역별', name: '전라·제주', nameEn: 'Jeolla · Jeju', about: '전라와 제주의 일상', aboutEn: 'Stories from southwest Korea' },
  { id: 'southeast', group: '지역별', name: '경상', nameEn: 'Gyeongsang', about: '경상 지역의 일상', aboutEn: 'Stories from southeast Korea' },
  { id: 'americas', group: '지역별', name: '미주', nameEn: 'Americas', about: '북미·중남미 이야기', aboutEn: 'North, Central and South America' },
  { id: 'europe', group: '지역별', name: '유럽', nameEn: 'Europe', about: '유럽에서 나누는 이야기', aboutEn: 'Meet people across Europe' },
  { id: 'asia', group: '지역별', name: '아시아', nameEn: 'Asia', about: '한국 밖 아시아 이야기', aboutEn: 'Around Asia, beyond Korea' },
  { id: 'oceania', group: '지역별', name: '오세아니아', nameEn: 'Oceania', about: '호주·뉴질랜드와 섬나라 이야기', aboutEn: 'Australia, New Zealand and the Pacific' },
  { id: 'africa', group: '지역별', name: '아프리카', nameEn: 'Africa', about: '아프리카의 일상과 여행', aboutEn: 'Life and travel across Africa' },
  { id: 'questions', group: '주제별', name: '질문·고민', nameEn: 'Questions & Advice', about: '다른 사람의 생각이 궁금할 때', aboutEn: 'Ask and share perspectives' },
  { id: 'career', group: '주제별', name: '직장·커리어', nameEn: 'Work & Career', about: '일과 이직, 회사 생활', aboutEn: 'Jobs, careers and work life' },
  { id: 'travel', group: '주제별', name: '여행·맛집', nameEn: 'Travel & Food', about: '다녀온 곳과 가보고 싶은 곳', aboutEn: 'Places visited and places to go' },
  { id: 'hobby', group: '주제별', name: '게임·취미', nameEn: 'Games & Hobbies', about: '요즘 즐기는 것들', aboutEn: 'Things you enjoy lately' },
]
export type MemberStatus = 'chatting' | 'away' | 'gaming' | 'busy'
export type Member = { id: string; name: string; status?: MemberStatus }
export type ChatStyle = { font: string; size: number; color: string; bold: boolean; italic: boolean; underline: boolean }
export type Line = { id: string; at: number; text: string; from?: Member; whisperTo?: Member; style?: ChatStyle; image?: string }
export type PollOption = { id: string; text: string; votes: number }
export type RoomPoll = { id: string; question: string; options: PollOption[]; owner: Member; closed: boolean; myVote?: string }
export type GamePlayer = { member: Member; score: number }
export type GameRound = { id: string; owner: Member; endsAt: number; ended: boolean; players: GamePlayer[]; joined?: boolean }
