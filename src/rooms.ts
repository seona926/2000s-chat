export const rooms = [
  { id: 'free', group: '공용', name: '자유채팅', about: '지금 하고 싶은 이야기' },
  { id: 'seoul', group: '지역별', name: '서울·경기·인천', about: '수도권 동네 이야기' },
  { id: 'central', group: '지역별', name: '충청·강원', about: '충청과 강원의 일상' },
  { id: 'southwest', group: '지역별', name: '전라·제주', about: '전라와 제주의 일상' },
  { id: 'southeast', group: '지역별', name: '경상', about: '경상 지역의 일상' },
  { id: 'questions', group: '주제별', name: '질문·고민', about: '다른 사람의 생각이 궁금할 때' },
  { id: 'career', group: '주제별', name: '직장·커리어', about: '일과 이직, 회사 생활' },
  { id: 'travel', group: '주제별', name: '여행·맛집', about: '다녀온 곳과 가보고 싶은 곳' },
  { id: 'hobby', group: '주제별', name: '게임·취미', about: '요즘 즐기는 것들' },
]
export type Member = { id: string; name: string }
export type ChatStyle = { font: string; size: number; color: string; bold: boolean; italic: boolean; underline: boolean }
export type Line = { id: string; at: number; text: string; from?: Member; style?: ChatStyle; image?: string }
