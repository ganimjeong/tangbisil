import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from 'd3-force'

let sim = null
let container = null
let onTap = null
let lastSnacks = []
const nodes = new Map() // id -> { id, x, y, r, score, el }

export function scoreOf(s) {
  const r = s.reactions || {}
  return (s.commentCount || 0) + (r.want || 0) + (r.buy || 0) + (r.no || 0)
}

// 건의된 지 24시간 안 지났으면 NEW
// (serverTimestamp가 아직 안 찍힌 방금 올린 건의는 createdAt이 비어 있어서 NEW로 취급)
export function isNew(createdAt) {
  if (!createdAt) return true
  const ms = typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : createdAt
  return Date.now() - ms < 86400000
}

export function initBubbles(el, tapHandler) {
  container = el
  onTap = tapHandler
  sim = forceSimulation([])
    .force('x', forceX(() => container.clientWidth / 2).strength(0.045))
    .force('y', forceY(() => container.clientHeight / 2).strength(0.055))
    .force('charge', forceManyBody().strength(1.5))
    .force('collide', forceCollide(d => d.r + 4).strength(0.85))
    .velocityDecay(0.25)
    .alphaDecay(0.015)
    .on('tick', tick)
  window.addEventListener('resize', () => {
    for (const n of nodes.values()) n.r = radiusFor(n.score)
    sim.nodes([...nodes.values()]) // 중심 좌표 타깃 재계산
    kick()
  })
  // 새 스냅샷이 안 와도 24시간이 지나면 NEW가 저절로 떨어지도록
  setInterval(() => {
    for (const s of lastSnacks) {
      const n = nodes.get(s.id)
      if (n) n.el.classList.toggle('is-new', isNew(s.createdAt))
    }
  }, 60000)
}

export function updateBubbles(snacks) {
  lastSnacks = snacks
  const seen = new Set()
  let kingId = null, kingScore = 0
  for (const s of snacks) {
    const sc = scoreOf(s)
    if (sc > kingScore) { kingScore = sc; kingId = s.id }
  }

  for (const s of snacks) {
    seen.add(s.id)
    let n = nodes.get(s.id)
    if (!n) {
      n = {
        id: s.id,
        x: container.clientWidth / 2 + (Math.random() - 0.5) * 100,
        y: container.clientHeight / 2 + (Math.random() - 0.5) * 100,
        r: 0,
        el: makeEl(s.id),
      }
      nodes.set(s.id, n)
      container.appendChild(n.el)
    }
    const sc = scoreOf(s)
    if (n.score !== undefined && sc > n.score) {
      // 새 댓글/반응이 달리면 꿀렁 애니메이션
      n.el.classList.remove('pulse')
      void n.el.offsetWidth
      n.el.classList.add('pulse')
    }
    n.score = sc
    n.r = radiusFor(sc)
    updateEl(n.el, s, s.id === kingId && kingScore > 0)
  }

  for (const [id, n] of nodes) {
    if (!seen.has(id)) { n.el.remove(); nodes.delete(id) }
  }

  sim.nodes([...nodes.values()])
  kick()
}

// 관리자 버블 터뜨리기 — 스토어 삭제 전에 터지는 연출을 먼저 보여줌
export function popBubble(id) {
  const n = nodes.get(id)
  if (!n) return
  nodes.delete(id)
  n.el.style.pointerEvents = 'none'
  n.el.classList.add('popping')
  setTimeout(() => n.el.remove(), 500)
  sim.nodes([...nodes.values()])
  kick()
}

function radiusFor(score) {
  const base = Math.min(container.clientWidth, container.clientHeight, 640)
  const min = base * 0.105
  const max = base * 0.23
  return Math.min(max, min + Math.sqrt(score) * base * 0.021)
}

function makeEl(id) {
  const el = document.createElement('div')
  el.className = 'bubble enter'
  el.innerHTML = `
    <div class="b-crown">👑</div>
    <div class="b-new">NEW</div>
    <div class="b-img"></div>
    <div class="b-emoji"></div>
    <div class="b-name"></div>
    <div class="b-meta"></div>`
  el.addEventListener('click', () => onTap(id))
  setTimeout(() => el.classList.remove('enter'), 700)
  return el
}

function updateEl(el, s, isKing) {
  el.classList.toggle('king', isKing)
  el.classList.toggle('is-new', isNew(s.createdAt))
  const img = el.querySelector('.b-img')
  const emoji = el.querySelector('.b-emoji')
  const safeImage = typeof s.image === 'string' && /^https?:\/\//.test(s.image)
    ? s.image.replace(/["\\]/g, '') : null
  if (safeImage) {
    img.style.backgroundImage = `url("${safeImage}")`
    img.style.display = ''
    emoji.style.display = 'none'
  } else {
    img.style.display = 'none'
    emoji.style.display = ''
    emoji.textContent = s.emoji || '🍿'
  }
  el.querySelector('.b-name').textContent = s.name || ''
  const r = s.reactions || {}
  const rsum = (r.want || 0) + (r.buy || 0) + (r.no || 0)
  el.querySelector('.b-meta').textContent = `💬 ${s.commentCount || 0} · 🔥 ${rsum}`
}

function tick() {
  const w = container.clientWidth, h = container.clientHeight
  for (const n of nodes.values()) {
    n.x = Math.max(n.r, Math.min(w - n.r, n.x))
    n.y = Math.max(n.r, Math.min(h - n.r, n.y))
    n.el.style.setProperty('--r', n.r + 'px')
    n.el.style.transform = `translate(${n.x - n.r}px, ${n.y - n.r}px)`
  }
}

function kick() {
  sim.alpha(0.6).restart()
}
