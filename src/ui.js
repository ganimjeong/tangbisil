import confetti from 'canvas-confetti'
import {
  addSnack, addComment, react, subscribeComments,
  popSnack, subscribeHistory, deleteHistory,
} from './store.js'
import { getIdentity } from './nickname.js'
import { scoreOf, popBubble, isNew } from './bubbles.js'
import { isAdmin, onAdmin } from './admin.js'

const $ = sel => document.querySelector(sel)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const EMOJIS = ['🍫', '🍪', '🥤', '🍜', '🍬', '🍭', '🍩', '🍙', '🧀', '🥨', '🍿', '🍦', '☕', '🧃', '🍎', '🥜']
const REACTIONS = [
  ['want', '🤤', '먹고싶다'],
  ['buy', '🙏', '사주세요'],
  ['no', '🙅', '이건아니지예'],
]

const me = getIdentity()
let snacks = new Map()
let history = []
let detailId = null
let unsubComments = null
let selectedEmoji = EMOJIS[0]

export function init() {
  $('#identity-chip').textContent = `${me.avatar} ${me.nick}`
  $('#c-ava').textContent = me.avatar

  buildEmojiPicker()
  $('#fab').addEventListener('click', openSubmit)
  $('#backdrop').addEventListener('click', closeAll)
  $('#submit-close').addEventListener('click', closeAll)
  $('#detail-close').addEventListener('click', closeAll)
  $('#history-close').addEventListener('click', closeAll)
  $('#history-btn').addEventListener('click', openHistory)
  $('#submit-form').addEventListener('submit', onSubmitSnack)
  $('#comment-form').addEventListener('submit', onSubmitComment)

  subscribeHistory(list => { history = list; renderHistory() })
  onAdmin(() => {
    $('#identity-chip').textContent = `🛡️ ${me.avatar} ${me.nick}`
    $('#pop-switch').classList.remove('hidden')
    $('#pop-switch').addEventListener('click', togglePopMode)
    renderHistory()
  })
}

/* ---------- 관리자: 터뜨리기 모드 ---------- */

let popModeOn = false

function togglePopMode() {
  popModeOn = !popModeOn
  $('#pop-switch').classList.toggle('on', popModeOn)
  document.body.classList.toggle('pop-mode', popModeOn)
  popSound()
}

// 버블 탭 진입점 — 터뜨리기 모드면 즉시 터뜨리고, 아니면 상세 열기
export function onBubbleTap(id) {
  if (popModeOn && isAdmin()) {
    const s = snacks.get(id)
    if (!s) return
    popBubble(id)
    burstSound()
    confetti({ particleCount: 80, spread: 90, origin: { y: 0.5 }, scalar: 0.9 })
    popSnack(s).catch(err => {
      console.error(err)
      alert('삭제에 실패했어요. Firestore 규칙이 최신인지 확인해주세요 (SETUP.md ③)')
    })
    return
  }
  openDetail(id)
}

export function updateSnacks(list) {
  snacks = new Map(list.map(s => [s.id, s]))
  renderKing(list)
  if (detailId) renderDetailHead()
}

/* ---------- 이번 주 간식왕 ---------- */

function renderKing(list) {
  const banner = $('#king-banner')
  let king = null
  for (const s of list) {
    if (scoreOf(s) > 0 && (!king || scoreOf(s) > scoreOf(king))) king = s
  }
  if (!king) { banner.classList.add('hidden'); return }
  banner.classList.remove('hidden')
  banner.innerHTML = `👑 이번 주 간식왕 : <b>${esc(king.name)}</b> <span class="k-score">🔥 ${scoreOf(king)}</span>`
  banner.onclick = () => openDetail(king.id)
}

/* ---------- 건의하기 ---------- */

function buildEmojiPicker() {
  const box = $('#emoji-picker')
  EMOJIS.forEach(e => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = e
    if (e === selectedEmoji) b.classList.add('sel')
    b.addEventListener('click', () => {
      selectedEmoji = e
      box.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b))
    })
    box.appendChild(b)
  })
}

function openSubmit() {
  closeAll()
  $('#backdrop').classList.add('show')
  $('#submit-sheet').classList.add('open')
  setTimeout(() => $('#f-name').focus(), 300)
}

async function onSubmitSnack(e) {
  e.preventDefault()
  const errEl = $('#f-error')
  errEl.classList.add('hidden')

  const name = $('#f-name').value.trim()
  const url = $('#f-url').value.trim()
  const reason = $('#f-reason').value.trim()
  const image = $('#f-image').value.trim()

  if (!/coupang\.com|coupa\.ng/i.test(url)) {
    errEl.textContent = '쿠팡 링크가 맞는지 확인해주세요 (coupang.com 주소여야 해요)'
    errEl.classList.remove('hidden')
    return
  }
  if (image && !/^https?:\/\//.test(image)) {
    errEl.textContent = '이미지 주소는 http(s)로 시작해야 해요'
    errEl.classList.remove('hidden')
    return
  }

  const btn = e.target.querySelector('button[type=submit]')
  btn.disabled = true
  try {
    await addSnack({
      name, url, reason, emoji: selectedEmoji, image: image || null,
      author: { nick: me.nick, avatar: me.avatar },
    })
    e.target.reset()
    closeAll()
    celebrate()
  } catch (err) {
    errEl.textContent = '앗, 등록에 실패했어요. 잠시 후 다시 시도해주세요'
    errEl.classList.remove('hidden')
    console.error(err)
  } finally {
    btn.disabled = false
  }
}

function celebrate() {
  tadaSound()
  confetti({ particleCount: 120, spread: 75, origin: { y: 0.75 } })
  setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.9 } }), 150)
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.9 } }), 300)
}

/* ---------- 간식 상세 ---------- */

export function openDetail(id) {
  closeAll()
  detailId = id
  renderDetailHead()
  $('#comment-list').innerHTML = '<p class="c-loading">댓글 불러오는 중...</p>'
  unsubComments = subscribeComments(id, renderComments)
  $('#backdrop').classList.add('show')
  $('#detail-sheet').classList.add('open')
}

function renderDetailHead() {
  const s = snacks.get(detailId)
  if (!s) return
  const r = s.reactions || {}
  const mine = localStorage.getItem('tb_react_' + detailId)
  const safeImage = typeof s.image === 'string' && /^https?:\/\//.test(s.image)
    ? s.image.replace(/["\\]/g, '') : null

  $('#detail-head').innerHTML = `
    <div class="d-top">
      ${safeImage
        ? `<div class="d-img" style="background-image:url('${safeImage}')"></div>`
        : `<div class="d-emoji">${esc(s.emoji || '🍿')}</div>`}
      <div class="d-title">
        <h3>${esc(s.name)}${isNew(s.createdAt) ? '<span class="new-chip">NEW</span>' : ''}</h3>
        <div class="d-author">건의 : ${esc(s.author?.avatar || '')} ${esc(s.author?.nick || '익명')} · ${timeAgo(s.createdAt)}</div>
      </div>
    </div>
    ${s.reason ? `<p class="d-reason">“${esc(s.reason)}”</p>` : ''}
    <a class="d-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">🛒 쿠팡에서 보기</a>
    <div class="d-reactions">
      ${REACTIONS.map(([key, emoji, label]) => `
        <button type="button" data-react="${key}" class="${mine === key ? 'active' : ''}">
          ${emoji} ${label} <b>${r[key] || 0}</b>
        </button>`).join('')}
    </div>`

  $('#detail-head').querySelectorAll('[data-react]').forEach(btn => {
    btn.addEventListener('click', () => onReact(btn.dataset.react))
  })
}

/* ---------- 구매완료 히스토리 ---------- */

function openHistory() {
  closeAll()
  renderHistory()
  $('#backdrop').classList.add('show')
  $('#history-sheet').classList.add('open')
}

function renderHistory() {
  const box = $('#history-list')
  if (!box) return
  if (!history.length) {
    box.innerHTML = '<p class="c-empty">아직 구매완료된 간식이 없어요 🫧</p>'
    return
  }
  box.innerHTML = history.map(h => {
    const safeImage = typeof h.image === 'string' && /^https?:\/\//.test(h.image)
      ? h.image.replace(/["\\]/g, '') : null
    return `
    <div class="h-item">
      ${safeImage
        ? `<div class="h-img" style="background-image:url('${safeImage}')"></div>`
        : `<div class="h-emoji">${esc(h.emoji || '🍿')}</div>`}
      <div class="h-body">
        <div class="h-name">${esc(h.name)}</div>
        <div class="h-time">🎉 ${timeAgo(h.poppedAt)} 구매완료</div>
      </div>
      ${isAdmin() ? `<button type="button" class="h-del" data-del="${esc(h.id)}" title="히스토리 말소">✕</button>` : ''}
    </div>`
  }).join('')

  box.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isAdmin()) return
      if (!confirm('이 히스토리를 말소할까요? 되돌릴 수 없어요.')) return
      try { await deleteHistory(btn.dataset.del) } catch (err) { console.error(err) }
    })
  })
}

function onReact(type) {
  if (!detailId) return
  const key = 'tb_react_' + detailId
  const prev = localStorage.getItem(key)
  if (prev === type) {
    localStorage.removeItem(key)
    react(detailId, { remove: type })
  } else {
    localStorage.setItem(key, type)
    react(detailId, { add: type, remove: prev || undefined })
  }
  popSound()
}

function renderComments(list) {
  const box = $('#comment-list')
  if (!list.length) {
    box.innerHTML = '<p class="c-empty">아직 댓글이 없어요. 첫 마디를 남겨보세요 👀</p>'
    return
  }
  box.innerHTML = list.map(c => `
    <div class="c-item">
      <span class="c-ava">${esc(c.avatar || '🐾')}</span>
      <div class="c-body">
        <div class="c-head">${esc(c.nick || '익명')} <span class="c-time">${timeAgo(c.createdAt)}</span></div>
        <div class="c-text">${esc(c.text)}</div>
      </div>
    </div>`).join('')
  box.scrollTop = box.scrollHeight
}

async function onSubmitComment(e) {
  e.preventDefault()
  const input = $('#c-input')
  const text = input.value.trim()
  if (!text || !detailId) return
  input.value = ''
  popSound()
  try {
    await addComment(detailId, { text, nick: me.nick, avatar: me.avatar })
  } catch (err) {
    console.error(err)
  }
}

/* ---------- 공통 ---------- */

function closeAll() {
  $('#backdrop').classList.remove('show')
  $('#submit-sheet').classList.remove('open')
  $('#detail-sheet').classList.remove('open')
  $('#history-sheet').classList.remove('open')
  detailId = null
  if (unsubComments) { unsubComments(); unsubComments = null }
}

function timeAgo(ts) {
  if (!ts) return '방금'
  const ms = typeof ts?.toMillis === 'function' ? ts.toMillis() : ts
  const diff = Date.now() - ms
  if (diff < 60000) return '방금'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  return `${Math.floor(diff / 86400000)}일 전`
}

/* ---------- 효과음 (WebAudio 합성, 에셋 불필요) ---------- */

let actx = null
function audio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)()
  if (actx.state === 'suspended') actx.resume()
  return actx
}

function note(freq, start, dur, type = 'triangle', vol = 0.12) {
  try {
    const a = audio()
    const t = a.currentTime + start
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + dur + 0.05)
  } catch { /* 사운드 실패는 무시 */ }
}

function popSound() {
  note(520, 0, 0.12, 'sine', 0.1)
  note(780, 0.05, 0.1, 'sine', 0.08)
}

function tadaSound() {
  ;[523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.09, 0.35, 'triangle', 0.12))
}

function burstSound() {
  note(880, 0, 0.08, 'square', 0.08)
  note(440, 0.04, 0.15, 'sawtooth', 0.06)
  note(220, 0.08, 0.25, 'sine', 0.1)
}
