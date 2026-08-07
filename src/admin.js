// 관리자 공인 IP 목록 — 여기에 IP를 추가/변경하면 됨
const ADMIN_IPS = [
  '182.227.252.231', // 츤데레 펭귄 🐧
]

let admin = false
const listeners = new Set()

export const isAdmin = () => admin

// 관리자 여부가 확정되면(비동기 IP 조회 후) 콜백 호출
export function onAdmin(cb) {
  listeners.add(cb)
  if (admin) cb()
}

async function detect() {
  const sources = ['https://api.ipify.org', 'https://ifconfig.me/ip']
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      const ip = (await res.text()).trim()
      if (ADMIN_IPS.includes(ip)) {
        admin = true
        listeners.forEach(cb => cb())
      }
      return
    } catch { /* 다음 소스로 폴백 */ }
  }
}

detect()
