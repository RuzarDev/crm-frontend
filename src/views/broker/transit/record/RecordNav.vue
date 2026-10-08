<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { SECTION_ORDER, sectionCount, sectionState, type RecordDraft, type SectionKey, type SectionState } from './recordModel'
import { sectionDomId } from './sections/sectionId'

// Меню разделов вкладки «Данные» (доска TransitRecord): точка — состояние раздела (зелёная — заполнен, золотая —
// требует внимания, серая — пусто; словом — для чтения с экрана), справа — число строк.
// ≥ 1024 — липкая колонка 200px; уже — горизонтальная лента-прокрутка, липкая под шапкой оболочки.
// Клик — плавная прокрутка к #sec-… с учётом высоты шапки (--shell-header-h) и ленты; активный пункт —
// по IntersectionObserver (пока идёт прокрутка от клика, наблюдатель пункт не перебивает).
const props = defineProps<{ draft: RecordDraft }>()
const { t } = useI18n()

const GAP = 16
const DOT: Record<SectionState, string> = {
  done: 'bg-tone-done-fg',
  warn: 'bg-gold',
  empty: 'bg-line-strong',
}

const items = computed(() => SECTION_ORDER.map((key) => {
  const count = sectionCount(key, props.draft)
  return { key, state: sectionState(key, props.draft), count: count ? count : null }
}))

const active = ref<SectionKey>('main')
const root = ref<HTMLElement | null>(null)

const isDesktop = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true)
const reducedMotion = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false)
const headerHeight = () => {
  const raw = root.value ? getComputedStyle(root.value).getPropertyValue('--shell-header-h') : ''
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 64
}
/** Сколько сверху занято липкими полосами: шапка оболочки, на узком экране — ещё и лента разделов. */
const topOffset = () => headerHeight() + (isDesktop() ? 0 : root.value?.offsetHeight ?? 0) + GAP

let lockUntil = 0
const go = (key: SectionKey) => {
  const el = document.getElementById(sectionDomId(key))
  active.value = key
  if (!el) return
  lockUntil = Date.now() + 900
  const top = el.getBoundingClientRect().top + window.scrollY - topOffset()
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' })
}

let observer: IntersectionObserver | null = null
const visible = new Set<SectionKey>()
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const key = (e.target as HTMLElement).dataset.recordSection as SectionKey | undefined
      if (!key) continue
      if (e.isIntersecting) visible.add(key)
      else visible.delete(key)
    }
    if (Date.now() < lockUntil) return
    const first = SECTION_ORDER.find((k) => visible.has(k))
    if (first) active.value = first
  }, { rootMargin: `-${Math.round(topOffset())}px 0px -55% 0px` })
  for (const key of SECTION_ORDER) {
    const el = document.getElementById(sectionDomId(key))
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav
    ref="root"
    :aria-label="t('broker.transitRecord.nav.label')"
    class="sticky top-(--shell-header-h,64px) z-[5] -mx-4 border-b border-line bg-surface px-4 py-2 lg:top-[calc(var(--shell-header-h,64px)+16px)] lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0"
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
