const ADJ = [
  '배고픈', '당 떨어진', '야근하는', '츤데레', '소심한', '과감한', '졸린', '신난',
  '수줍은', '간식에 진심인', '다이어트는 내일부터인', '월급날만 기다리는', '회의에서 도망친',
  '커피에 절여진', '새콤한', '바삭한', '촉촉한', '쫀득한', '매콤한', '단짠단짠',
]

const ANIMALS = [
  ['너구리', '🦝'], ['수달', '🦦'], ['고슴도치', '🦔'], ['햄스터', '🐹'],
  ['펭귄', '🐧'], ['곰', '🐻'], ['토끼', '🐰'], ['고양이', '🐱'],
  ['강아지', '🐶'], ['여우', '🦊'], ['판다', '🐼'], ['코알라', '🐨'],
  ['병아리', '🐤'], ['개구리', '🐸'], ['문어', '🐙'], ['상어', '🦈'],
  ['다람쥐', '🐿️'], ['부엉이', '🦉'],
]

// 브라우저마다 익명 닉네임 하나를 만들어 유지 (대화 흐름이 이어지도록)
export function getIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem('tb_identity'))
    if (saved?.nick && saved?.avatar) return saved
  } catch { /* 손상된 값이면 새로 생성 */ }
  const [animal, avatar] = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  const adj = ADJ[Math.floor(Math.random() * ADJ.length)]
  const identity = { nick: `${adj} ${animal}`, avatar }
  localStorage.setItem('tb_identity', JSON.stringify(identity))
  return identity
}
