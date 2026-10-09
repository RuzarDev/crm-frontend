<script setup lang="ts">
import { computed, defineComponent, nextTick, onMounted, ref, useId, watch } from 'vue'
import { injectDialogRootContext } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretUp, PhCopy, PhDotsThree, PhX } from '@phosphor-icons/vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { useTroisCheckProvider } from '@/composables/useTroisCheck'
import { cn } from '@/ui/cn'
import { calendarLocale } from '@/ui/date'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { formatTnved } from '@/utils/tnvedFormat'
import { provideTnvedCheck } from '@/views/broker/transit/record/sections/goods'
import type { GoodsStatus } from '../goodsStatus'
import { keyOf, type DtGoodsModel } from '../useDtGoods'
import { GOODS_EDITOR_SECTIONS } from './sections'
import type { GoodsEditorContext, GoodsSaveState } from './types'

// Редактор одного товара ДТ (волна 6б, доска DtGoodsEditor) — панель справа (~780px; < 1024 — во всю ширину) под
// шапкой ДТ. Шапка: «Товар N из M», ↑/↓, статус, «Дублировать», «Ещё» (выше/ниже/удалить), закрыть; код (моно) и
// описание; вкладки-якоря (прокрутка к секции, активная — по прокрутке). Подвал — сохранение и подсказка клавиш.
// Клавиши: Esc — закрыть; Alt+↑/↓ — соседний товар (не в полях ввода: там это правка); Ctrl/⌘+Enter — следующий товар
// (и из поля: «закончил — дальше»), фокус на его код.
// Смонтирован только открытый товар: содержимое — по ключу товара (keyOf), переключение пересоздаёт секции.
// Секции — реестр GOODS_EDITOR_SECTIONS (sections.ts, контракт — types.ts). Общие для всех товаров кэши — здесь:
// проверка кодов ТН ВЭД (provideTnvedCheck) и пакетная проверка марок ТРОИС (после первого открытия редактора).
// Просмотр (readonly): поля только для чтения, без «Дублировать» и «Ещё».
const props = defineProps<{
  model: DtGoodsModel
  /** Позиция открытого товара (с 0); null — закрыт. */
  index: number | null
  ctx: GoodsEditorContext
  readonly: boolean
  saveState?: GoodsSaveState | null
  /** Куда вернуть фокус после закрытия (кнопка кода строки этого товара); null — как обычно (к открывшему). */
  returnFocus?: (key: number) => HTMLElement | null
}>()
const emit = defineEmits<{ close: []; step: [delta: number]; open: [index: number] }>()
const { t, locale } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})
const te = (key: string, p?: Record<string, unknown>) => tg(`editor.${key}`, p)
const { confirm } = useConfirm()
const uid = `goods-editor-${useId()}`

provideTnvedCheck()
// ТРОИС: все марки ДТ одной пачкой (как раньше) — но только когда редактор открывали: список без редактора их не показывает.
const everOpened = ref(false)
useTroisCheckProvider(() => (everOpened.value ? props.model.items.value.map((g) => g.tradeMarkName) : []))

const items = computed(() => props.model.items.value)
const item = computed(() => (props.index == null ? null : items.value[props.index] ?? null))
const itemKey = computed(() => (item.value ? keyOf(item.value) : null))
const open = computed(() => item.value != null)
const total = computed(() => items.value.length)
const title = computed(() => (props.index == null ? '' : tg('editor.title', { n: props.index + 1, m: total.value })))
const sections = GOODS_EDITOR_SECTIONS

// ---- Шапка ----
const code = computed(() => (item.value?.tnvedCode ?? '').trim())
const caption = computed(() => item.value?.description || item.value?.tnvedDescription || '')
const statusView = (s: GoodsStatus): { tone: ZTone; label: string; kind: string } => {
  if (s.kind === 'missing') return { tone: 'danger', label: tg('status.missing', { n: s.count }), kind: s.kind }
  if (s.kind === 'stale') return { tone: 'accent', label: tg('status.stale'), kind: s.kind }
  return { tone: 'done', label: tg('status.ready'), kind: s.kind }
}
const status = computed(() => (item.value ? statusView(props.model.statusOf(item.value)) : null))
const canPrev = computed(() => props.index != null && props.index > 0)
const canNext = computed(() => props.index != null && props.index < total.value - 1)

const duplicate = () => {
  if (props.readonly || props.index == null) return
  const copies = props.model.duplicate([props.index])
  if (!copies.length) return
  message.success(te('duplicated'))
  emit('open', props.index + 1)
}

const moreItems = computed<ZDropdownItem[]>(() => [
  { key: 'up', label: te('moveUp'), disabled: !canPrev.value },
  { key: 'down', label: te('moveDown'), disabled: !canNext.value },
  { key: 'remove', label: te('remove'), danger: true, divider: true },
])
const removeItem = async () => {
  const g = item.value
  if (!g || props.index == null) return
  const at = [props.index]
  const impact = props.model.removalImpact(at)
  const parts = [tg('remove.text')]
  if (impact.doc44 || impact.prevDocs) parts.push(tg('remove.docs', { doc44: impact.doc44, prev: impact.prevDocs }))
  const ok = await confirm({
    title: tg('remove.titleOne', { list: String(props.index + 1) }),
    content: parts.join(' '),
    okText: tg('remove.ok'),
    cancelText: t('common.cancel'),
    danger: true,
  })
  if (!ok) return
  // За время вопроса список мог поменяться — позиция заново по товару. Удалённый товар закрывает редактор сам (адрес).
  const pos = items.value.indexOf(g)
  if (pos >= 0 && props.model.remove([pos]).removed) message.success(tg('remove.done', { n: 1 }))
}
const onMore = (key: string) => {
  if (props.readonly || props.index == null) return
  if (key === 'up' || key === 'down') props.model.move(props.index, props.index + (key === 'up' ? -1 : 1))
  else if (key === 'remove') void removeItem()
}

// ---- Вкладки-якоря: прокрутка к секции; активная — по прокрутке ----
const scroller = ref<HTMLElement | null>(null)
const active = ref(sections[0]?.key ?? '')
const sectionEls = () => [...(scroller.value?.querySelectorAll<HTMLElement>('[data-goods-section]') ?? [])]
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
let scrollingTo: string | null = null
let scrollTimer: ReturnType<typeof setTimeout> | undefined
const goSection = (key: string) => {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-goods-section="${key}"]`)
  active.value = key
  // Пока идёт плавная прокрутка к секции, подсветку по прокрутке не пересчитываем (иначе мигает по пути).
  scrollingTo = key
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => { scrollingTo = null }, 600)
  el?.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
const onScroll = () => {
  const box = scroller.value
  if (!box || scrollingTo) return
  const els = sectionEls()
  if (!els.length) return
  // Дошли до конца — последняя секция; иначе — последняя, чья верхняя граница выше линии чуть ниже края.
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
    active.value = els[els.length - 1].dataset.goodsSection ?? active.value
    return
  }
  const top = box.getBoundingClientRect().top + 24
  let current = els[0]
  for (const el of els) if (el.getBoundingClientRect().top <= top) current = el
  active.value = current.dataset.goodsSection ?? active.value
}

// ---- Открытие, переключение, закрытие ----
// Под шапкой ДТ (закреплённой): панель и фон начинаются под ней; на телефоне — во весь экран.
const top = ref(0)
const measureTop = () => {
  const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 640px)').matches
  const header = document.querySelector<HTMLElement>('[data-dt-header]')
  top.value = wide && header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0
}
let lastKey: number | null = null
let focusCodeNext = false
watch(open, (v) => {
  if (!v) return
  everOpened.value = true
  measureTop()
  active.value = sections[0]?.key ?? ''
}, { immediate: true })
// Открыт по адресу при загрузке — шапка страницы появляется в DOM позже настройки редактора.
onMounted(() => { if (open.value) measureTop() })
watch(itemKey, async (k) => {
  if (k == null) return
  lastKey = k
  if (!focusCodeNext) return
  focusCodeNext = false
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = 0
  active.value = sections[0]?.key ?? ''
  scroller.value?.querySelector<HTMLElement>('[data-f="tnvedCode"] input, input[data-f="tnvedCode"], input:not([disabled]):not([readonly])')?.focus()
}, { immediate: true })
// Закрыли — Reka возвращает фокус «открывшему» (строке, по которой открыли; при открытии по адресу — никуда).
// Подменяем его на кнопку кода строки ЭТОГО товара (могли перейти ↑/↓ к другому): ставится в момент закрытия.
const FocusReturn = defineComponent({
  name: 'GoodsEditorFocusReturn',
  setup() {
    const root = injectDialogRootContext()
    watch(root.open, (o) => {
      if (o || lastKey == null) return
      const el = props.returnFocus?.(lastKey)
      if (el) root.triggerElement.value = el
    }, { flush: 'sync' })
    return () => null
  },
})

// ---- Клавиши (на панели: окно редактора держит фокус внутри себя; вложенные окна — свои) ----
const editing = (el: EventTarget | null) =>
  !!(el as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"]')
const onKey = (e: KeyboardEvent) => {
  if (e.defaultPrevented || e.isComposing) return
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (editing(e.target)) return
    e.preventDefault()
    emit('step', e.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'Enter') {
    // Открытый список выбора — Enter его.
    if ((e.target as HTMLElement | null)?.closest?.('[aria-expanded="true"]')) return
    e.preventDefault()
    if (!canNext.value) return
    focusCodeNext = true
    emit('step', 1)
  }
}

// ---- Подвал: сохранение ----
type SaveKind = 'saving' | 'failed' | 'dirty' | 'saved' | 'view' | null
const saveKind = computed<SaveKind>(() => {
  if (props.readonly) return 'view'
  const s = props.saveState
  if (!s) return null
  if (s.saving) return 'saving'
  if (s.failed) return 'failed'
  if (s.dirty) return 'dirty'
  return s.savedAt ? 'saved' : null
})
const SAVE_DOT: Record<Exclude<SaveKind, null | 'view'>, string> = {
  saving: 'bg-gold', failed: 'bg-danger', dirty: 'bg-gold', saved: 'bg-tone-done-fg',
}
const savedTime = computed(() => (props.saveState?.savedAt
  ? new Intl.DateTimeFormat(calendarLocale(locale.value), { hour: '2-digit', minute: '2-digit' }).format(props.saveState.savedAt)
  : ''))
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const altKey = isMac ? '⌥' : 'Alt'
const ctrlKey = isMac ? '⌘' : 'Ctrl'

const iconBtn = cn(
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40',
  'max-sm:size-11',
)
const tabBtn = (on: boolean) => cn(
  'relative shrink-0 cursor-pointer border-0 bg-transparent px-0 pt-1 pb-2.5 font-sans text-[13.5px] whitespace-nowrap outline-hidden',
  'rounded-field focus-visible:shadow-focus max-sm:min-h-11',
  on ? 'font-medium text-zircon-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-zircon-ink' : 'text-ink-3 hover:text-ink',
)
</script>

<template>
  <ZDrawer
    :open="open"
    bare
    :closable="false"
    :width="780"
    :top="top"
    :aria-label="title"
    class="max-lg:w-screen"
    data-dt-goods-editor
    @update:open="(v: boolean) => { if (!v) emit('close') }"
    @keydown="onKey"
  >
    <FocusReturn />
    <div v-if="item && index != null" class="flex h-full min-h-0 flex-col">
      <header class="shrink-0 border-b border-line px-4 pt-3 sm:px-6 sm:pt-4" data-goods-editor-head>
        <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span class="text-[13px] whitespace-nowrap text-ink-2 tabular-nums" data-goods-editor-title>{{ title }}</span>
          <button type="button" :class="iconBtn" :disabled="!canPrev" :aria-label="te('prev')" data-goods-prev @click="emit('step', -1)"><PhCaretUp :size="16" aria-hidden="true" /></button>
          <button type="button" :class="iconBtn" :disabled="!canNext" :aria-label="te('next')" data-goods-next @click="emit('step', 1)"><PhCaretDown :size="16" aria-hidden="true" /></button>
          <StatusDot v-if="status" class="ml-1.5 max-sm:order-last max-sm:ml-0 max-sm:basis-full" :tone="status.tone" :label="status.label" :data-goods-editor-status="status.kind" />
          <span class="flex-1" />
          <template v-if="!readonly">
            <button type="button" :class="iconBtn" :aria-label="te('duplicate')" :title="te('duplicate')" data-goods-duplicate @click="duplicate"><PhCopy :size="16" aria-hidden="true" /></button>
            <ZDropdown :items="moreItems" @select="onMore">
              <button type="button" :class="iconBtn" :aria-label="te('more')" :title="te('more')" data-goods-more><PhDotsThree :size="18" weight="bold" aria-hidden="true" /></button>
            </ZDropdown>
          </template>
          <button type="button" :class="iconBtn" :aria-label="te('close')" data-goods-close @click="emit('close')"><PhX :size="16" aria-hidden="true" /></button>
        </div>
        <p class="m-0 mt-2 flex min-w-0 items-baseline gap-3 text-md">
          <span class="shrink-0 font-mono font-semibold" :class="code ? 'text-ink' : 'text-danger'" data-goods-editor-code>{{ code ? formatTnved(code) : tg('noCode') }}</span>
          <span class="min-w-0 truncate text-ink-2" data-goods-editor-caption>{{ caption }}</span>
        </p>
        <nav class="-mb-px mt-3 flex gap-5 overflow-x-auto" :aria-label="te('tabs')" data-goods-tabs>
          <button
            v-for="s in sections"
            :key="s.key"
            type="button"
            :class="tabBtn(active === s.key)"
            :aria-controls="`${uid}-${s.key}`"
            :aria-current="active === s.key ? 'true' : undefined"
            :data-goods-tab="s.key"
            @click="goSection(s.key)"
          >{{ te(`sections.${s.key}`) }}</button>
        </nav>
      </header>

      <div ref="scroller" class="@container min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 [&_[data-dt-flash]]:rounded-field [&_[data-dt-flash]]:shadow-focus" data-goods-editor-body @scroll.passive="onScroll">
        <div :key="itemKey ?? undefined" class="flex flex-col gap-6" :data-goods-index="index" :data-goods-key="itemKey">
          <section
            v-for="(s, i) in sections"
            :id="`${uid}-${s.key}`"
            :key="s.key"
            :class="cn('scroll-mt-1', i > 0 && 'border-t border-line pt-6')"
            :data-goods-section="s.key"
            :aria-labelledby="`${uid}-${s.key}-h`"
          >
            <h3 :id="`${uid}-${s.key}-h`" class="m-0 mb-4 text-[15px] font-semibold text-ink">{{ te(`sections.${s.key}`) }}</h3>
            <component :is="s.component" :item="item" :index="index" :model="model" :readonly="readonly" :ctx="ctx" />
          </section>
        </div>
      </div>

      <footer class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[12.5px] text-muted sm:px-6" data-goods-editor-foot>
        <span v-if="saveKind" class="inline-flex items-center gap-1.5" role="status" :data-goods-save-state="saveKind">
          <span v-if="saveKind !== 'view'" :class="cn('size-[7px] rounded-pill', SAVE_DOT[saveKind])" aria-hidden="true" />
          <template v-if="saveKind === 'saved'">{{ t('broker.dt.header.state.savedAt', { time: savedTime }) }}</template>
          <template v-else>{{ t(`broker.dt.header.state.${saveKind}`) }}</template>
        </span>
        <span class="ml-auto flex flex-wrap items-center gap-1 max-sm:hidden" data-goods-editor-keys>
          <ZKbd>{{ altKey }}</ZKbd><ZKbd>↑</ZKbd><ZKbd>↓</ZKbd> {{ te('keys.items') }} ·
          <ZKbd>{{ ctrlKey }}</ZKbd>+<ZKbd>Enter</ZKbd> {{ te('keys.next') }} ·
          <ZKbd>Esc</ZKbd> {{ te('keys.close') }}
        </span>
      </footer>
    </div>
  </ZDrawer>
</template>
