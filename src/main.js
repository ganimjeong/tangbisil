import './style.css'
import { subscribeSnacks, isMock } from './store.js'
import { initBubbles, updateBubbles } from './bubbles.js'
import * as ui from './ui.js'

const field = document.getElementById('bubble-field')

ui.init()
initBubbles(field, id => ui.openDetail(id))

subscribeSnacks(list => {
  updateBubbles(list)
  ui.updateSnacks(list)
  document.getElementById('empty-state').classList.toggle('hidden', list.length > 0)
})

if (isMock) document.getElementById('demo-banner').classList.remove('hidden')
