// 관리자 비밀 코드 — 이 값을 바꾸면 기존에 등록된 관리자 브라우저는 전부 무효화됨
const ADMIN_CODE = 'penguin-bb0e79461901'
const KEY = 'tb_admin'

let admin = false
const listeners = new Set()

export const isAdmin = () => admin

// 관리자 여부가 확정되면 콜백 호출
export function onAdmin(cb) {
  listeners.add(cb)
  if (admin) cb()
}

function grant() {
  if (admin) return
  admin = true
  listeners.forEach(cb => cb())
}

// 사이트주소/#admin-비밀코드 로 한 번 접속하면 이 브라우저가 관리자로 등록됨
// (IP 방식은 같은 와이파이 사용자 전원이 관리자가 되는 문제로 폐기)
const m = location.hash.match(/^#admin-(.+)$/)
if (m) {
  if (m[1] === ADMIN_CODE) {
    localStorage.setItem(KEY, ADMIN_CODE)
  } else if (m[1] === 'off') {
    localStorage.removeItem(KEY) // #admin-off 로 관리자 해제
  }
  history.replaceState(null, '', location.pathname + location.search)
}

if (localStorage.getItem(KEY) === ADMIN_CODE) grant()
