import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

// Полоса с прокруткой по горизонтали (вкладки разделов товара, правка №17): стрелки ‹ › там, где есть скрытое, прокрутка
// на ~⅔ видимой ширины и показ активной вкладки прокруткой только самой полосы (scrollIntoView крутил бы ещё и панель).
// Состояние стрелок пересчитывается на прокрутке полосы, смене её размера (ResizeObserver; панель тянут за край) и окна.
// Стрелки лежат ПОВЕРХ полосы (absolute), а не рядом с ней: ширина полосы не зависит от того, видны ли стрелки. Иначе
// показ вкладки сдвигал полосу, появлялась ‹, полоса сужалась — и вкладка снова уходила под край («Доп. свед», ревью №17).
// Поэтому вкладка показывается с отступом inset (ширина стрелки) с обеих сторон: стрелка её не закроет.
const EDGE = 1
const PAD = 4

export interface ScrollArrowsOptions {
  /** Ширина стрелки поверх полосы, px: показанный элемент не уходит под неё. */
  inset?: number
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useScrollArrows(el: Ref<HTMLElement | null | undefined>, o: ScrollArrowsOptions = {}) {
  const inset = Math.max(0, o.inset ?? 0)
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

  /**
   * Показать элемент полосы целиком (активная вкладка) — и не под стрелкой: отступ inset с обеих сторон. У края полосы
   * прокрутка упирается в начало / конец, и стрелки с той стороны нет. Полоса — relative: offsetLeft считается от неё.
   */
  const reveal = (child: HTMLElement | null | undefined) => {
    const e = el.value
    if (!e || !child) return
    const pad = PAD + inset
    const l = child.offsetLeft - pad
    const r = child.offsetLeft + child.offsetWidth + pad
    const max = Math.max(0, e.scrollWidth - e.clientWidth)
    if (l < e.scrollLeft) e.scrollLeft = Math.max(0, l)
    else if (r > e.scrollLeft + e.clientWidth) e.scrollLeft = Math.min(max, r - e.clientWidth)
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
