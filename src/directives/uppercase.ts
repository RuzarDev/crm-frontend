import type { Directive } from 'vue'

/** v-uppercase="{ skip }": значение, для которого skip(value) — true, не переводится в заглавные (полный код маркировки). */
export interface UppercaseOptions {
  skip?: (value: string) => boolean
}

const handlers = new WeakMap<Element, (e: Event) => void>()

const makeHandler = (opts?: UppercaseOptions | null) => (e: Event) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement
  if (opts?.skip?.(el.value)) return
  const up = el.value.toLocaleUpperCase('ru-RU')
  if (up !== el.value) {
    const start = el.selectionStart
    el.value = up
    el.dispatchEvent(new Event('input', { bubbles: true }))
    if (start != null) el.setSelectionRange(start, start)
  }
}

export const vUppercase: Directive<HTMLElement, UppercaseOptions | null | undefined> = {
  mounted(el, binding) {
    const input = el.querySelector('input, textarea') ?? el
    const handler = makeHandler(binding.value)
    handlers.set(input, handler)
    input.addEventListener('input', handler)
  },
  unmounted(el) {
    const input = el.querySelector('input, textarea') ?? el
    const handler = handlers.get(input)
    if (handler) input.removeEventListener('input', handler)
    handlers.delete(input)
  },
}
