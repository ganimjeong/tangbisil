import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, doc, onSnapshot, addDoc, updateDoc,
  increment, serverTimestamp, query, orderBy, getDocs, deleteDoc,
} from 'firebase/firestore'
import { firebaseConfig } from './firebase-config.js'

// config가 아직 플레이스홀더면 데모 모드(localStorage)로 동작
export const isMock = !firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith('PASTE')

const store = isMock ? mockStore() : firestoreStore()

export const subscribeSnacks = store.subscribeSnacks
export const addSnack = store.addSnack
export const subscribeComments = store.subscribeComments
export const addComment = store.addComment
export const react = store.react
export const popSnack = store.popSnack
export const subscribeHistory = store.subscribeHistory
export const deleteHistory = store.deleteHistory

/* ---------- Firestore ---------- */

function firestoreStore() {
  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)
  return {
    subscribeSnacks(cb) {
      return onSnapshot(collection(db, 'snacks'), snap =>
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    },
    async addSnack(fields) {
      await addDoc(collection(db, 'snacks'), {
        ...fields,
        reactions: { want: 0, buy: 0, no: 0 },
        commentCount: 0,
        createdAt: serverTimestamp(),
      })
    },
    subscribeComments(snackId, cb) {
      const q = query(collection(db, 'snacks', snackId, 'comments'), orderBy('createdAt', 'asc'))
      return onSnapshot(q, snap =>
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    },
    async addComment(snackId, fields) {
      await addDoc(collection(db, 'snacks', snackId, 'comments'), {
        ...fields,
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'snacks', snackId), { commentCount: increment(1) })
    },
    async react(snackId, { add, remove }) {
      const patch = {}
      if (add) patch['reactions.' + add] = increment(1)
      if (remove) patch['reactions.' + remove] = increment(-1)
      if (Object.keys(patch).length) await updateDoc(doc(db, 'snacks', snackId), patch)
    },
    // 구매 완료 → 히스토리에 남기고 버블(+댓글) 삭제
    async popSnack(snack) {
      await addDoc(collection(db, 'history'), {
        name: snack.name || '',
        emoji: snack.emoji || null,
        image: snack.image || null,
        poppedAt: serverTimestamp(),
      })
      const cs = await getDocs(collection(db, 'snacks', snack.id, 'comments'))
      await Promise.all(cs.docs.map(d => deleteDoc(d.ref)))
      await deleteDoc(doc(db, 'snacks', snack.id))
    },
    subscribeHistory(cb) {
      return onSnapshot(collection(db, 'history'), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // serverTimestamp가 아직 안 찍힌 로컬 문서는 맨 앞으로
        list.sort((a, b) => (b.poppedAt?.toMillis?.() ?? Infinity) - (a.poppedAt?.toMillis?.() ?? Infinity))
        cb(list)
      })
    },
    async deleteHistory(id) {
      await deleteDoc(doc(db, 'history', id))
    },
  }
}

/* ---------- 데모 모드 (localStorage) ---------- */

function mockStore() {
  const KEY = 'tb_mock_v1'
  let data = null
  try { data = JSON.parse(localStorage.getItem(KEY)) } catch { /* 새로 시드 */ }
  if (!data?.snacks) data = seed()
  if (!Array.isArray(data.history)) data.history = []
  const save = () => localStorage.setItem(KEY, JSON.stringify(data))
  save()

  const snackSubs = new Set()
  const historySubs = new Set()
  const commentSubs = new Map() // snackId -> Set<cb>
  const uid = () => 'm' + Math.random().toString(36).slice(2, 10)

  const snackList = () => data.snacks.map(s => ({
    id: s.id, name: s.name, url: s.url, reason: s.reason, emoji: s.emoji,
    image: s.image, author: s.author, reactions: { ...s.reactions },
    commentCount: s.comments.length, createdAt: s.createdAt,
  }))
  const emitSnacks = () => { const l = snackList(); snackSubs.forEach(cb => cb(l)) }
  const emitHistory = () => {
    const l = [...data.history].sort((a, b) => (b.poppedAt || 0) - (a.poppedAt || 0))
    historySubs.forEach(cb => cb(l))
  }
  const emitComments = id => {
    const s = data.snacks.find(x => x.id === id)
    ;(commentSubs.get(id) || []).forEach(cb => cb(s ? [...s.comments] : []))
  }

  return {
    subscribeSnacks(cb) {
      snackSubs.add(cb)
      cb(snackList())
      return () => snackSubs.delete(cb)
    },
    async addSnack(fields) {
      data.snacks.push({
        id: uid(), ...fields,
        reactions: { want: 0, buy: 0, no: 0 }, comments: [], createdAt: Date.now(),
      })
      save(); emitSnacks()
    },
    subscribeComments(id, cb) {
      if (!commentSubs.has(id)) commentSubs.set(id, new Set())
      commentSubs.get(id).add(cb)
      emitComments(id)
      return () => commentSubs.get(id)?.delete(cb)
    },
    async addComment(id, fields) {
      const s = data.snacks.find(x => x.id === id)
      if (!s) return
      s.comments.push({ id: uid(), ...fields, createdAt: Date.now() })
      save(); emitComments(id); emitSnacks()
    },
    async react(id, { add, remove }) {
      const s = data.snacks.find(x => x.id === id)
      if (!s) return
      if (add) s.reactions[add] = (s.reactions[add] || 0) + 1
      if (remove) s.reactions[remove] = Math.max(0, (s.reactions[remove] || 0) - 1)
      save(); emitSnacks()
    },
    async popSnack(snack) {
      const i = data.snacks.findIndex(x => x.id === snack.id)
      if (i < 0) return
      data.history.push({
        id: uid(), name: snack.name || '', emoji: snack.emoji || null,
        image: snack.image || null, poppedAt: Date.now(),
      })
      data.snacks.splice(i, 1)
      save(); emitSnacks(); emitHistory()
    },
    subscribeHistory(cb) {
      historySubs.add(cb)
      emitHistory()
      return () => historySubs.delete(cb)
    },
    async deleteHistory(id) {
      data.history = data.history.filter(h => h.id !== id)
      save(); emitHistory()
    },
  }
}

function seed() {
  const now = Date.now()
  const D = 86400000, H = 3600000
  return {
    snacks: [
      {
        id: 'seed1', name: '초코파이 情', emoji: '🍫',
        url: 'https://www.coupang.com/np/search?q=초코파이',
        reason: '야근엔 역시 초코파이죠. 우리 정(情) 나눠요',
        author: { nick: '당 떨어진 수달', avatar: '🦦' },
        reactions: { want: 9, buy: 5, no: 1 }, createdAt: now - D * 3,
        comments: [
          { id: 'c1', text: '인정합니다. 바나나맛도 같이 사주세요', nick: '배고픈 너구리', avatar: '🦝', createdAt: now - D * 2 },
          { id: 'c2', text: '냉동실에 넣어 먹으면 꿀맛인 거 아는 사람 🙋', nick: '야근하는 펭귄', avatar: '🐧', createdAt: now - H * 5 },
          { id: 'c3', text: '이건 못 참지', nick: '단짠단짠 햄스터', avatar: '🐹', createdAt: now - H * 2 },
        ],
      },
      {
        id: 'seed2', name: '제로콜라', emoji: '🥤',
        url: 'https://www.coupang.com/np/search?q=제로콜라',
        reason: '점심 먹고 탄산 안 마시면 오후를 버틸 수 없음',
        author: { nick: '커피에 절여진 곰', avatar: '🐻' },
        reactions: { want: 6, buy: 3, no: 0 }, createdAt: now - D * 2,
        comments: [
          { id: 'c4', text: '펩시제로 라임으로 부탁드립니다 간곡히', nick: '새콤한 여우', avatar: '🦊', createdAt: now - D },
        ],
      },
      {
        id: 'seed3', name: '불닭볶음면', emoji: '🍜',
        url: 'https://www.coupang.com/np/search?q=불닭볶음면',
        reason: '스트레스 받는 날 매운맛으로 리셋해야 합니다',
        author: { nick: '매콤한 상어', avatar: '🦈' },
        reactions: { want: 4, buy: 1, no: 3 }, createdAt: now - D,
        comments: [
          { id: 'c5', text: '탕비실에 우유도 같이 사달란 소리군요', nick: '소심한 고슴도치', avatar: '🦔', createdAt: now - H * 8 },
          { id: 'c6', text: '맵찔이는 웁니다', nick: '수줍은 병아리', avatar: '🐤', createdAt: now - H * 3 },
        ],
      },
      {
        id: 'seed4', name: '하리보 골드베렌', emoji: '🍬',
        url: 'https://www.coupang.com/np/search?q=하리보',
        reason: '회의 중에 몰래 씹기 좋은 사이즈',
        author: { nick: '회의에서 도망친 문어', avatar: '🐙' },
        reactions: { want: 2, buy: 1, no: 0 }, createdAt: now - H * 10,
        comments: [],
      },
    ],
  }
}
