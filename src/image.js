// 사진 입력(주소 붙여넣기 · 파일 업로드 · 드래그앤드랍)을 한 곳에서 다루는 헬퍼

const MAX_SIDE = 900          // 긴 변 축소 한계
const MAX_BYTES = 320 * 1024  // 압축 목표 — Firestore 문서 1MB 한도 안쪽으로

// 화면/CSS에 넣어도 안전한 이미지 주소만 통과 (http(s) 또는 data:image)
export function safeImageUrl(v) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const ok = /^https?:\/\//i.test(s)
    || /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(s)
  return ok ? s.replace(/["'\\]/g, '') : null // CSS url(...) 안에 넣어도 깨지지 않게
}

// 눌러서 여는 링크 — javascript: 같은 스킴 차단
export function safeLink(v) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return /^https?:\/\//i.test(s) ? s : null
}

// 주소창에서 복사하면 스킴이 빠질 때가 있어 보정 (coupang.com/x → https://coupang.com/x)
export function normalizeLink(v) {
  const s = String(v ?? '').trim()
  if (!s || /^https?:\/\//i.test(s)) return s
  return /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(s) ? 'https://' + s : s
}

export function isImageFile(f) {
  return !!f && typeof f.type === 'string' && f.type.startsWith('image/')
}

// 파일 → 축소·압축한 data URL. 원본을 그대로 실으면 문서 한도를 넘겨서 항상 리사이즈한다.
export async function fileToDataUrl(file) {
  if (!isImageFile(file)) throw new Error('이미지 파일이 아니에요')
  const src = await loadBitmap(file)
  const sw = src.width || src.naturalWidth
  const sh = src.height || src.naturalHeight
  if (!sw || !sh) throw new Error('이미지 크기를 읽지 못했어요')

  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // 투명 PNG가 검게 깔리지 않도록
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  src.close?.()

  let quality = 0.82
  let out = canvas.toDataURL('image/jpeg', quality)
  while (out.length * 0.75 > MAX_BYTES && quality > 0.4) {
    quality -= 0.12
    out = canvas.toDataURL('image/jpeg', quality)
  }
  return out
}

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImg(file))
  }
  return loadViaImg(file)
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요')) }
    img.src = url
  })
}
