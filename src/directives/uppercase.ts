import type { Directive } from 'vue'
const handler = (e: Event) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement
  const up = el.value.toLocaleUpperCase('ru-RU')
  if (up !== el.value) {
    const start = el.selectionStart
    el.value = up
    el.dispatchEvent(new Event('input', { bubbles: true }))
    if (start != null) el.setSelectionRange(start, start)
  }
}
export const vUppercase: Directive<HTMLElement> = {
  mounted(el) {
    const input = el.querySelector('input, textarea') ?? el
    input.addEventListener('input', handler)
  },
  unmounted(el) {
    const input = el.querySelector('input, textarea') ?? el
    input.removeEventListener('input', handler)
  },
}
