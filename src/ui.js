import confetti from 'canvas-confetti'
import {
  addSnack, addComment, react, subscribeComments,
  popSnack, subscribeHistory, deleteHistory, setHistoryReason,
} from './store.js'
import { getIdentity } from './nickname.js'
import { scoreOf, popBubble, isNew } from './bubbles.js'
import { isAdmin, onAdmin } from './admin.js'
import {
  safeImageUrl, safeLink, normalizeLink, fileToDataUrl, isImageFile,
} from './image.js'

const $ = sel => document.querySelector(sel)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const EMOJIS = ['🍫', '🍪', '🥤', '🍜', '🍬', '🍭', '🍩', '🍙', '🧀', '🥨', '🍿', '🍦', '☕', '🧃', '🍎', '🥜']
// 관리자가 히스토리에서 고를 수 있는 반려 사유
const REJECT_REASONS = [
  '인당 비용이 700원을 넘어요',
  '나누어 먹기 어려운 품목이에요',
  '이전에 반려된 적 있는 품목이에요',
]

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
let pickedImage = null // 업로드/드랍/붙여넣기로 받은 사진 (data URL)

export function init() {
  $('#identity-chip').textContent = `${me.avatar} ${me.nick}`
  $('#c-ava').textContent = me.avatar

  buildEmojiPicker()
  setupImagePicker()
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

/* ---------- 사진 넣기 : 링크 · 업로드 · 드래그앤드랍 · 붙여넣기 ---------- */

function setupImagePicker() {
  const drop = $('#image-drop')
  const file = $('#f-file')
  const urlInput = $('#f-image')

  file.addEventListener('click', ev => ev.stopPropagation())
  drop.addEventListener('click', ev => { if (ev.target !== file) file.click() })
  drop.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); file.click() }
  })
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    file.value = '' // 같은 파일을 다시 골라도 change가 뜨도록
    if (f) useImageFile(f)
  })

  for (const t of ['dragenter', 'dragover']) {
    drop.addEventListener(t, ev => { ev.preventDefault(); drop.classList.add('over') })
  }
  for (const t of ['dragleave', 'dragend', 'drop']) {
    drop.addEventListener(t, () => drop.classList.remove('over'))
  }

  // 건의 시트가 열려 있으면 화면 아무 데나 떨어뜨리거나 붙여넣어도 받는다.
  // (겸사겸사 브라우저가 사진 파일로 이동해버리는 기본 동작도 막는다)
  document.addEventListener('dragover', ev => {
    if (hasFiles(ev.dataTransfer)) ev.preventDefault()
  })
  document.addEventListener('drop', ev => {
    const tag = ev.target?.tagName
    // 링크를 입력칸에 끌어다 놓는 건 원래대로 (쿠팡 링크 칸에 드롭하는 경우)
    if (!hasFiles(ev.dataTransfer) && (tag === 'INPUT' || tag === 'TEXTAREA')) return
    ev.preventDefault()
    if (submitOpen()) onDropData(ev.dataTransfer)
  })
  document.addEventListener('paste', ev => { if (submitOpen()) onPasteData(ev) })

  $('#image-clear').addEventListener('click', ev => { ev.stopPropagation(); clearImage() })
  urlInput.addEventListener('input', () => {
    if (urlInput.value.trim()) pickedImage = null // 주소를 직접 쓰면 그쪽을 쓴다
    renderImagePreview()
  })
}

function hasFiles(dt) {
  return !!dt && [...(dt.types || [])].includes('Files')
}

function submitOpen() {
  return $('#submit-sheet').classList.contains('open')
}

function onDropData(dt) {
  if (!dt) return
  const f = [...(dt.files || [])].find(isImageFile)
  if (f) { useImageFile(f); return }
  const text = dt.getData('text/uri-list') || dt.getData('text/plain')
  if (text.trim()) useImageUrl(text)
}

function onPasteData(ev) {
  const dt = ev.clipboardData
  if (!dt) return
  const item = [...(dt.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))
  if (item) {
    const f = item.getAsFile()
    if (f) { ev.preventDefault(); useImageFile(f) }
    return
  }
  // 입력칸 안에서의 텍스트 붙여넣기는 기본 동작 그대로
  const tag = ev.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const text = dt.getData('text/plain') || ''
  if (safeImageUrl(normalizeLink(text))) { ev.preventDefault(); useImageUrl(text) }
}

async function useImageFile(f) {
  if (!isImageFile(f)) { showError('이미지 파일만 넣을 수 있어요'); return }
  const drop = $('#image-drop')
  drop.classList.add('busy')
  try {
    pickedImage = await fileToDataUrl(f)
    $('#f-image').value = ''
    hideError()
  } catch (err) {
    console.error(err)
    showError('사진을 읽지 못했어요. 다른 파일로 해볼까요?')
  } finally {
    drop.classList.remove('busy')
    renderImagePreview()
  }
}

function useImageUrl(text) {
  const url = safeImageUrl(normalizeLink(text))
  if (!url) { showError('이미지 주소는 http(s)로 시작해야 해요'); return }
  pickedImage = null
  $('#f-image').value = url
  hideError()
  renderImagePreview()
}

function clearImage() {
  pickedImage = null
  $('#f-image').value = ''
  $('#f-file').value = ''
  renderImagePreview()
}

// 업로드한 사진이 있으면 그게 우선, 없으면 주소칸
function currentImage() {
  return pickedImage || safeImageUrl($('#f-image').value)
}

function renderImagePreview() {
  const img = currentImage()
  const box = $('#image-preview')
  box.style.backgroundImage = img ? `url("${img}")` : ''
  box.classList.toggle('hidden', !img)
  $('#image-hint').classList.toggle('hidden', !!img)
  $('#image-clear').classList.toggle('hidden', !img)
}

function showError(msg) {
  const el = $('#f-error')
  el.textContent = msg
  el.classList.remove('hidden')
}

function hideError() {
  $('#f-error').classList.add('hidden')
}

async function onSubmitSnack(e) {
  e.preventDefault()
  hideError()

  const name = $('#f-name').value.trim()
  const url = normalizeLink($('#f-url').value)
  const reason = $('#f-reason').value.trim()
  const image = currentImage()

  // 링크는 이제 선택 — 적었을 때만 형식을 본다
  if (url && !safeLink(url)) {
    showError('링크는 http(s)로 시작하는 주소를 넣어주세요')
    return
  }

  const btn = e.target.querySelector('button[type=submit]')
  btn.disabled = true
  try {
    await addSnack({
      // 링크가 없을 땐 null이 아니라 빈 문자열 — 규칙이 url을 문자열로 요구한다
      name, url: url || '', reason, emoji: selectedEmoji, image: image || null,
      author: { nick: me.nick, avatar: me.avatar },
    })
    e.target.reset()
    clearImage()
    closeAll()
    celebrate()
  } catch (err) {
    showError('앗, 등록에 실패했어요. 잠시 후 다시 시도해주세요')
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
  const safeImage = safeImageUrl(s.image)
  const link = safeLink(s.url)

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
    ${link ? `<a class="d-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${
      /coupang\.com|coupa\.ng/i.test(link) ? '🛒 쿠팡에서 보기' : '🔗 링크 열어보기'}</a>` : ''}
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

let reasonMenuFor = null // 반려 사유 메뉴가 열려 있는 히스토리 id

function openHistory() {
  closeAll()
  reasonMenuFor = null
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
    const safeImage = safeImageUrl(h.image)
    const rejected = typeof h.rejectReason === 'string' && h.rejectReason.trim()
    return `
    <div class="h-item${rejected ? ' rejected' : ''}">
      ${safeImage
        ? `<div class="h-img" style="background-image:url('${safeImage}')"></div>`
        : `<div class="h-emoji">${esc(h.emoji || '🍿')}</div>`}
      <div class="h-body">
        <div class="h-name">${esc(h.name)}</div>
        <div class="h-time">${rejected
          ? `${timeAgo(h.poppedAt)} · ${esc(h.rejectReason)}`
          : `🎉 ${timeAgo(h.poppedAt)} 구매완료`}</div>
      </div>
      ${isAdmin() ? `
        <button type="button" class="h-why" data-why="${esc(h.id)}" title="반려 사유 설정">⋯</button>
        <button type="button" class="h-del" data-del="${esc(h.id)}" title="히스토리 말소">✕</button>` : ''}
    </div>
    ${isAdmin() && reasonMenuFor === h.id ? reasonMenu(h) : ''}`
  }).join('')

  box.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isAdmin()) return
      if (!confirm('이 히스토리를 말소할까요? 되돌릴 수 없어요.')) return
      try { await deleteHistory(btn.dataset.del) } catch (err) { console.error(err) }
    })
  })

  box.querySelectorAll('[data-why]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isAdmin()) return
      reasonMenuFor = reasonMenuFor === btn.dataset.why ? null : btn.dataset.why
      renderHistory()
    })
  })

  box.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => onPickReason(btn.dataset.pick, btn.dataset.idx))
  })
}

// 반려 사유 고르기 메뉴 (관리자 전용)
function reasonMenu(h) {
  const id = esc(h.id)
  return `
    <div class="h-menu">
      ${REJECT_REASONS.map((r, i) => `
        <button type="button" data-pick="${id}" data-idx="${i}">${esc(r)}</button>`).join('')}
      <button type="button" data-pick="${id}" data-idx="custom">✏️ 직접 작성</button>
      ${h.rejectReason ? `
        <button type="button" class="clear" data-pick="${id}" data-idx="clear">사유 지우고 구매완료로</button>` : ''}
    </div>`
}

async function onPickReason(id, idx) {
  if (!isAdmin()) return
  let reason
  if (idx === 'clear') {
    reason = null
  } else if (idx === 'custom') {
    const cur = history.find(h => h.id === id)?.rejectReason || ''
    const input = prompt('반려 사유를 적어주세요 (60자 이내)', cur)
    if (input === null) return
    reason = input.trim().slice(0, 60)
    if (!reason) return
  } else {
    reason = REJECT_REASONS[Number(idx)]
    if (!reason) return
  }
  reasonMenuFor = null
  renderHistory()
  try { await setHistoryReason(id, reason) } catch (err) {
    console.error(err)
    alert('반려 사유 저장에 실패했어요. Firestore 규칙이 최신인지 확인해주세요 (SETUP.md ③)')
  }
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
  reasonMenuFor = null
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
