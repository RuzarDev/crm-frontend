<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { SECTION_ORDER, sectionCount, sectionState, type RecordDraft, type SectionKey, type SectionState } from './recordModel'
import { sectionDomId } from './sections/sectionId'

// Меню разделов вкладки «Данные» (доска TransitRecord): точка — состояние раздела (зелёная — заполнен, золотая —
// требует внимания, серая — пусто; словом — для чтения с экрана), справа — число строк.
// ≥ 1024 — липкая колонка 200px; уже — горизонтальная лента-прокрутка, липкая под шапкой оболочки.
// Клик — плавная прокрутка к #sec-… с учётом высоты шапки (--shell-header-h) и ленты. Активный пункт — последний
// раздел, чей верх выше линии ≈ 30% окна; у низа страницы — последний видный; считается на прокрутке (раз в кадр),
// при монтировании и при возврате на вкладку. Пока идёт прокрутка от клика, пункт клика не перебивается; после неё —
// один пересчёт. tracking=false (вкладка «Данные» скрыта) — не считается.
// sections — свой набор пунктов (по умолчанию все разделы записи), label — подпись меню. scroller — разделы лежат
// в своей прокручиваемой области (шторка транзитной декларации партии): прокрутка, линия активации и «низ» — по ней,
// без шапки оболочки (липкой ленте на узком экране область задаёт --shell-header-h: 0px).
const props = withDefaults(defineProps<{
  draft: RecordDraft
  tracking?: boolean
  sections?: SectionKey[]
  scroller?: HTMLElement | null
  label?: string
}>(), { tracking: true, sections: () => SECTION_ORDER, scroller: null, label: '' })
const { t } = useI18n()

const GAP = 16
const DOT: Record<SectionState, string> = {
  done: 'bg-tone-done-fg',
  warn: 'bg-gold',
  empty: 'bg-line-strong',
}

const items = computed(() => props.sections.map((key) => {
  const count = sectionCount(key, props.draft)
  return { key, state: sectionState(key, props.draft), count: count ? count : null }
}))

const active = ref<SectionKey>(props.sections[0] ?? 'main')
const root = ref<HTMLElement | null>(null)

const isDesktop = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true)
const reducedMotion = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false)
const headerHeight = () => {
  if (props.scroller) return 0 // своя область: шапки оболочки над ней нет
  const raw = root.value ? getComputedStyle(root.value).getPropertyValue('--shell-header-h') : ''
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 64
}
/** Сколько сверху занято липкими полосами: шапка оболочки, на узком экране — ещё и лента разделов. */
const topOffset = () => headerHeight() + (isDesktop() ? 0 : root.value?.offsetHeight ?? 0) + GAP

// Область прокрутки: окно или своя (scroller). Верх области — от верха окна; высота, прокрутка, полная высота.
const viewTop = () => (props.scroller ? props.scroller.getBoundingClientRect().top : 0)
const viewHeight = () => (props.scroller ? props.scroller.clientHeight : window.innerHeight)
const scrollPos = () => (props.scroller ? props.scroller.scrollTop : window.scrollY)
const fullHeight = () => (props.scroller ? props.scroller.scrollHeight : document.documentElement.scrollHeight)
const scrollToTop = (top: number) => {
  const opts: ScrollToOptions = { top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' }
  if (props.scroller) props.scroller.scrollTo(opts)
  else window.scrollTo(opts)
}

const LOCK_MS = 900
const TRAIL_MS = 200
const ACTIVATION = 0.3
const BOTTOM_SLACK = 8

let lockUntil = 0
/** Пункт последнего клика: держится, пока его раздел стоит там, куда его привела прокрутка от клика. */
let clicked: SectionKey | null = null
const go = (key: SectionKey) => {
  const el = document.getElementById(sectionDomId(key))
  active.value = key
  if (!el) return
  clicked = key
  lockUntil = Date.now() + LOCK_MS
  scheduleTrail(LOCK_MS)
  scrollToTop(el.getBoundingClientRect().top - viewTop() + scrollPos() - topOffset())
}

/**
 * Активный раздел — последний, чей верх выше линии активации (≈ 30% высоты окна, но не выше липкой полосы).
 * У самого низа страницы (последние короткие разделы до линии не доходят) — последний раздел, видный на экране.
 * Пункт клика остаётся, пока его раздел стоит у липкой полосы (или виден у низа страницы).
 */
const spy = () => {
  if (!props.tracking) return
  // Область ещё не выложена (шторка открывается): все верхи нулевые — считать не по чему, догонит наблюдатель размера.
  if (props.scroller && props.scroller.clientHeight === 0) return
  // Идёт прокрутка от клика — подсветка его.
  if (clicked && Date.now() < lockUntil) {
    active.value = clicked
    return
  }
  // Верх раздела — от верха области прокрутки (у окна — от верха окна).
  const offset = topOffset()
  const vTop = viewTop()
  const vH = viewHeight()
  const line = Math.max(offset + 1, vH * ACTIVATION)
  let current: SectionKey | null = null
  let lastOnScreen: SectionKey | null = null
  const tops = new Map<SectionKey, number>()
  for (const key of props.sections) {
    const el = document.getElementById(sectionDomId(key))
    if (!el) continue
    const top = el.getBoundingClientRect().top - vTop
    tops.set(key, top)
    if (top <= line) current = key
    if (top < vH) lastOnScreen = key
  }
  const docH = fullHeight()
  const atBottom = docH > vH && Math.ceil(scrollPos() + vH) >= docH - BOTTOM_SLACK
  if (clicked) {
    const top = tops.get(clicked)
    const inPlace = top !== undefined && (Math.abs(top - offset) <= BOTTOM_SLACK || (atBottom && top < vH))
    if (inPlace) {
      active.value = clicked
      return
    }
    clicked = null
  }
  const next = atBottom && lastOnScreen ? lastOnScreen : current ?? props.sections[0]
  if (next !== active.value) active.value = next
}

let frame: number | null = null
let trail: ReturnType<typeof setTimeout> | null = null
const raf = (cb: () => void): number =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(cb) : window.setTimeout(cb, 16)
/** Один пересчёт после конца прокрутки от клика (если за это время прокрутили руками — подсветка догонит). */
const scheduleTrail = (ms: number) => {
  if (trail !== null) clearTimeout(trail)
  trail = setTimeout(() => {
    trail = null
    if (Date.now() < lockUntil) {
      scheduleTrail(lockUntil - Date.now())
      return
    }
    spy()
  }, ms)
}
const onScroll = () => {
  // Прокрутка от клика по пункту: пункт клика держится, пока она идёт (и чуть после её конца).
  if (Date.now() < lockUntil) {
    lockUntil = Math.max(lockUntil, Date.now() + TRAIL_MS)
    return
  }
  if (frame !== null) return
  frame = raf(() => {
    frame = null
    spy()
  })
}
// Вернулись на «Данные» (и при монтировании) — подсветка по текущему положению, не дожидаясь прокрутки.
watch(() => props.tracking, (on) => { if (on) void nextTick(spy) })
// Прокрутку слушаем у области (scroller) или у окна; область может появиться позже (шторка смонтировалась).
// У области ещё и наблюдатель размера: шторка выкладывается позже монтирования меню — подсветка по готовой раскладке.
let bound: HTMLElement | Window | null = null
let sizer: ResizeObserver | null = null
const bindScroll = () => {
  const target = props.scroller ?? window
  if (bound === target) return
  bound?.removeEventListener('scroll', onScroll)
  sizer?.disconnect()
  sizer = null
  target.addEventListener('scroll', onScroll, { passive: true })
  bound = target
  if (props.scroller && typeof ResizeObserver === 'function') {
    sizer = new ResizeObserver(() => onScroll())
    sizer.observe(props.scroller)
  }
}
watch(() => props.scroller, () => {
  bindScroll()
  // Область появилась (ref ставится после монтирования меню) — подсветка по ней, а не по окну.
  if (props.tracking) void nextTick(spy)
})
onMounted(() => {
  bindScroll()
  window.addEventListener('resize', onScroll, { passive: true })
  if (props.tracking) void nextTick(spy)
})
onBeforeUnmount(() => {
  bound?.removeEventListener('scroll', onScroll)
  bound = null
  sizer?.disconnect()
  sizer = null
  window.removeEventListener('resize', onScroll)
  if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
  if (trail !== null) clearTimeout(trail)
})
</script>

<template>
  <nav
    ref="root"
    :aria-label="label || t('broker.transitRecord.nav.label')"
    class="sticky top-(--shell-header-h,64px) z-[5] -mx-4 min-w-0 max-lg:overflow-x-clip border-b border-line bg-surface px-4 py-2 lg:top-[calc(var(--shell-header-h,64px)+16px)] lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0"
    data-record-nav
  >
    <ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
      <li v-for="it in items" :key="it.key" class="shrink-0">
        <a
          :href="`#${sectionDomId(it.key)}`"
          :aria-current="active === it.key ? 'true' : undefined"
          :class="cn(
            'flex min-h-8 items-center gap-2.5 rounded-row px-2.5 text-[13px] leading-[1.25] text-ink-2 no-underline outline-hidden whitespace-nowrap',
            'transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none',
            'max-lg:min-h-11 lg:whitespace-normal lg:py-1.5',
            active === it.key && 'bg-sunken font-semibold text-ink',
          )"
          :data-nav-item="it.key"
          :data-state="it.state"
          @click.prevent="go(it.key)"
        >
          <span aria-hidden="true" :class="['size-[7px] shrink-0 rounded-pill', DOT[it.state]]" />
          <span class="min-w-0">{{ t(`broker.transitRecord.sections.${it.key}`) }}</span>
          <span class="sr-only">, {{ t(`broker.transitRecord.nav.state.${it.state}`) }}</span>
          <span v-if="it.count !== null" class="ml-auto pl-1 text-xs font-normal text-muted tabular-nums" data-nav-count>{{ it.count }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
