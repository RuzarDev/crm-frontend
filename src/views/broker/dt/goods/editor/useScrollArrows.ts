import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

// Полоса с прокруткой по горизонтали (вкладки разделов товара, правка №17): стрелки ‹ › там, где есть скрытое, прокрутка
// на ~⅔ видимой ширины и показ активной вкладки прокруткой только самой полосы (scrollIntoView крутил бы ещё и панель).
// Состояние стрелок пересчитывается на прокрутке полосы, смене её размера (ResizeObserver; панель тянут за край) и окна.
const EDGE = 1
const PAD = 4

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useScrollArrows(el: Ref<HTMLElement | null | undefined>) {
  const left = ref(false)
  const right = ref(false)

  const update = () => {
    const e = el.value
    if (!e) {
      left.value = false
      right.value = false
      return
    }
    left.value = e.scrollLeft > EDGE
    right.value = e.scrollLeft + e.clientWidth < e.scrollWidth - EDGE
  }

  const scrollTo = (x: number) => {
    const e = el.value
    if (!e) return
    const max = Math.max(0, e.scrollWidth - e.clientWidth)
    const target = Math.min(Math.max(0, x), max)
    if (typeof e.scrollTo === 'function' && !reducedMotion()) e.scrollTo({ left: target, behavior: 'smooth' })
    else e.scrollLeft = target
    update()
  }

  /** ‹ / ›: на ~⅔ видимой ширины. */
  const by = (dir: -1 | 1) => {
    const e = el.value
    if (!e) return
    scrollTo(e.scrollLeft + dir * Math.max(80, Math.round(e.clientWidth * 0.66)))
  }

  /** Показать элемент полосы целиком (активная вкладка). Полоса — relative: offsetLeft считается от неё. */
  const reveal = (child: HTMLElement | null | undefined) => {
    const e = el.value
    if (!e || !child) return
    const l = child.offsetLeft - PAD
    const r = child.offsetLeft + child.offsetWidth + PAD
    if (l < e.scrollLeft) e.scrollLeft = Math.max(0, l)
    else if (r > e.scrollLeft + e.clientWidth) e.scrollLeft = r - e.clientWidth
    update()
  }

  let ro: ResizeObserver | null = null
  watch(el, (e) => {
    ro?.disconnect()
    ro = null
    if (e && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update())
      ro.observe(e)
    }
    void nextTick(update)
  }, { immediate: true, flush: 'post' })
  onMounted(() => window.addEventListener('resize', update))
  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
    ro?.disconnect()
    ro = null
  })

  return { left, right, update, by, reveal }
}
