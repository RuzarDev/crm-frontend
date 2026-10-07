<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { PhArrowElbowDownLeft, PhArrowRight, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import ZButton from '@/components/z/ZButton.vue'
import { systemApi, type SearchHit } from '@/api/system'
import { useCommandPalette, type PaletteDestination } from '@/shell/useCommandPalette'
import { Z_LAYER_MODAL, modalBackdrop } from '@/ui/surfaces'
import { cn } from '@/ui/cn'

// Палитра ⌘K: переходы по разделам и сквозной поиск (заявки, ДТ, клиенты, документы, счета) в одном поле.
// Пустой запрос — все переходы; 1 символ — только переходы; от 2 — до 5 переходов и через 250 мс поиск
// на сервере (до 15 совпадений). Ответ на устаревший запрос отбрасывается (счётчик запросов).
// Поле — combobox со списком (aria-activedescendant): фокус всегда в поле, ↑/↓ двигают активный пункт
// по кругу через обе группы, Enter открывает, Escape закрывает (Reka). Мышь делает пункт активным при движении,
// а не при появлении под неподвижным курсором — список не «прыгает» под пальцами на клавиатуре.
const DEBOUNCE_MS = 250
const MIN_SEARCH = 2
const MAX_DESTINATIONS_WITH_SEARCH = 5
const MAX_HITS = 15

const props = withDefaults(defineProps<{
  destinations: PaletteDestination[]
  /** Кабинет клиента — своя подсказка в поле. */
  client?: boolean
}>(), { client: false })

const { t, te } = useI18n()
const router = useRouter()
const { open, hide } = useCommandPalette()

const uid = useId()
const listboxId = `${uid}-list`
const goToId = `${uid}-goto`
const foundId = `${uid}-found`
const optionId = (i: number) => `${uid}-opt-${i}`

const TYPE_TONE: Record<SearchHit['type'], ZTone> = {
  case: 'info', declaration: 'submitted', client: 'neutral', document: 'neutral', invoice: 'pay',
}

const inputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const term = computed(() => query.value.trim())

// ---- Переходы ----
const norm = (s: string) => s.toLocaleLowerCase()
const filteredDestinations = computed(() => {
  const q = norm(term.value)
  if (!q) return props.destinations
  const list = props.destinations.filter((d) => norm(d.label).includes(q) || (!!d.hint && norm(d.hint).includes(q)))
  return q.length >= MIN_SEARCH ? list.slice(0, MAX_DESTINATIONS_WITH_SEARCH) : list
})

// Совпадение в названии перехода — жирным. Если нижний регистр меняет длину строки (редкие буквы), не выделяем.
const splitMatch = (label: string): [string, string, string] | null => {
  const q = term.value
  if (!q) return null
  const lower = norm(label)
  if (lower.length !== label.length) return null
  const at = lower.indexOf(norm(q))
  if (at < 0) return null
  return [label.slice(0, at), label.slice(at, at + q.length), label.slice(at + q.length)]
}

// ---- Поиск ----
type Status = 'idle' | 'loading' | 'error' | 'done'
const status = ref<Status>('idle')
const hits = ref<SearchHit[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const cancelSearch = () => {
  if (timer) clearTimeout(timer)
  timer = undefined
  seq++
}

const run = async (q: string) => {
  const id = ++seq
  status.value = 'loading'
  hits.value = []
  try {
    const res = await systemApi.search(q, { silent: true })
    if (id !== seq) return
    hits.value = (res ?? []).slice(0, MAX_HITS)
    status.value = 'done'
  } catch {
    if (id !== seq) return
    status.value = 'error'
  }
}

// sync: запрос ставится в очередь в момент ввода, а не после рендера.
watch(term, (q) => {
  cancelSearch()
  hits.value = []
  if (q.length < MIN_SEARCH) {
    status.value = 'idle'
    return
  }
  // Скелетон — сразу: человек видит, что поиск идёт, ещё до запроса.
  status.value = 'loading'
  timer = setTimeout(() => { timer = undefined; void run(q) }, DEBOUNCE_MS)
}, { flush: 'sync' })

const retry = () => {
  if (term.value.length >= MIN_SEARCH) void run(term.value)
  inputEl.value?.focus({ preventScroll: true })
}

// ---- Пункты и активный ----
type Item = { kind: 'dest'; key: string; to: string; dest: PaletteDestination } | { kind: 'hit'; key: string; to: string; hit: SearchHit }
const items = computed<Item[]>(() => [
  ...filteredDestinations.value.map((d): Item => ({ kind: 'dest', key: `d:${d.key}`, to: d.to, dest: d })),
  ...hits.value.map((h, i): Item => ({ kind: 'hit', key: `h:${i}:${h.url}`, to: h.url, hit: h })),
])
const destCount = computed(() => filteredDestinations.value.length)

const active = ref(0)
// Новая выдача — активный первый.
watch(items, () => { active.value = 0 })

const scrollActiveIntoView = () => nextTick(() => {
  document.getElementById(optionId(active.value))?.scrollIntoView?.({ block: 'nearest' })
})

const move = (delta: number) => {
  const n = items.value.length
  if (!n) return
  active.value = (active.value + delta + n) % n
  void scrollActiveIntoView()
}

// Запрос очищается при следующем открытии (см. watch(open)) — не сейчас, чтобы окно уходило без перестройки.
const select = (item: Item | undefined) => {
  if (!item) return
  hide()
  void router.push(item.to)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    move(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (items.value.length) select(items.value[active.value])
    else if (status.value === 'error') retry()
  }
}

// ---- Открытие и закрытие ----
// Каждое открытие — с чистого листа: пустой запрос, без результатов. При закрытии только отменяем отложенный
// и летящий запрос, а содержимое не трогаем — иначе за 120 мс анимации ухода список успел бы перестроиться.
watch(open, (v) => {
  cancelSearch()
  if (!v) return
  query.value = ''
  hits.value = []
  status.value = 'idle'
  active.value = 0
}, { flush: 'sync' })

// Размонтирование (уход из оболочки): отложенный запрос не должен уйти после разборки, а общее open —
// остаться true, иначе следующая оболочка смонтировалась бы с уже открытой палитрой.
onBeforeUnmount(() => {
  cancelSearch()
  hide()
})

// Неизвестный тип от сервера — без метки (пустая колонка держит выравнивание), а не сырой ключ словаря.
const typeLabel = (type: string) => (te(`shell.palette.type.${type}`) ? t(`shell.palette.type.${type}`) : '')

const onOpenChange = (v: boolean) => { if (!v) hide() }
const onOpenAutoFocus = (e: Event) => {
  e.preventDefault()
  inputEl.value?.focus({ preventScroll: true })
}

const showNothing = computed(() => !!term.value && !items.value.length && (status.value === 'idle' || status.value === 'done'))
const activeDescendant = computed(() => (items.value.length ? optionId(active.value) : undefined))

const contentClass = cn(
  Z_LAYER_MODAL,
  'fixed left-1/2 top-[12vh] -translate-x-1/2 flex max-h-[76vh] w-[min(640px,calc(100vw-24px))] flex-col overflow-hidden',
  'rounded-panel border border-line bg-surface font-sans text-sm text-ink shadow-float outline-hidden',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out motion-reduce:animate-none',
)
const groupLabel = 'px-2.5 pb-1 pt-2 text-xs font-medium text-muted select-none'
const optionClass = (i: number) => cn(
  'flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-row px-2.5 py-2 text-ink',
  'transition-colors duration-100 ease-out motion-reduce:transition-none',
  i === active.value ? 'bg-sunken' : 'bg-transparent',
)
const skeletonWidths = ['58%', '44%', '66%']
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay data-z-overlay :class="modalBackdrop" />
      <DialogContent
        aria-modal="true"
        :aria-describedby="undefined"
        :class="contentClass"
        @open-auto-focus="onOpenAutoFocus"
      >
        <DialogTitle class="sr-only">{{ t('shell.palette.title') }}</DialogTitle>

        <div class="flex shrink-0 items-center gap-3 border-b border-line px-4">
          <PhMagnifyingGlass :size="18" class="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            :aria-controls="listboxId"
            :aria-activedescendant="activeDescendant"
            :aria-label="t('shell.palette.title')"
            :placeholder="client ? t('shell.palette.placeholderClient') : t('shell.palette.placeholder')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="go"
            class="m-0 h-12 min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-md text-ink outline-hidden placeholder:text-muted"
            @keydown="onKeydown"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [max-height:min(440px,60vh)]">
          <div :id="listboxId" role="listbox" :aria-label="t('shell.palette.title')" class="flex flex-col gap-1">
            <div v-if="destCount" role="group" :aria-labelledby="goToId" class="flex flex-col">
              <div :id="goToId" role="presentation" :class="groupLabel">{{ t('shell.palette.goTo') }}</div>
              <div
                v-for="(d, i) in filteredDestinations"
                :id="optionId(i)"
                :key="d.key"
                role="option"
                :aria-selected="i === active"
                :class="optionClass(i)"
                @pointermove="active = i"
                @mousedown.prevent
                @click="select(items[i])"
              >
                <PhArrowRight :size="15" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-sm">
                  <template v-if="splitMatch(d.label)">{{ splitMatch(d.label)![0] }}<span class="font-semibold">{{ splitMatch(d.label)![1] }}</span>{{ splitMatch(d.label)![2] }}</template>
                  <template v-else>{{ d.label }}</template>
                </span>
                <span v-if="d.hint" class="max-w-[40%] shrink-0 truncate text-[13px] text-ink-3">{{ d.hint }}</span>
                <PhArrowElbowDownLeft
                  :size="14"
                  :class="cn('hidden shrink-0 text-muted sm:block', i === active ? 'sm:visible' : 'sm:invisible')"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div v-if="hits.length" role="group" :aria-labelledby="foundId" class="flex flex-col">
              <div :id="foundId" role="presentation" :class="groupLabel">{{ t('shell.palette.found') }}</div>
              <div
                v-for="(h, j) in hits"
                :id="optionId(destCount + j)"
                :key="`${j}:${h.url}`"
                role="option"
                :aria-selected="destCount + j === active"
                :class="optionClass(destCount + j)"
                @pointermove="active = destCount + j"
                @mousedown.prevent
                @click="select(items[destCount + j])"
              >
                <span class="flex shrink-0 sm:w-24">
                  <ZTag v-if="typeLabel(h.type)" size="sm" :tone="TYPE_TONE[h.type] ?? 'neutral'">{{ typeLabel(h.type) }}</ZTag>
                </span>
                <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                  <span class="truncate text-sm font-medium">{{ h.title }}</span>
                  <span v-if="h.subtitle" class="truncate text-[13px] text-ink-3 sm:ml-auto sm:max-w-[50%] sm:shrink-0">{{ h.subtitle }}</span>
                </span>
                <PhArrowElbowDownLeft
                  :size="14"
                  :class="cn('hidden shrink-0 text-muted sm:block', destCount + j === active ? 'sm:visible' : 'sm:invisible')"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          <div v-if="status === 'loading'" aria-hidden="true" :class="cn('flex flex-col', destCount > 0 && 'mt-1')">
            <div :class="groupLabel">{{ t('shell.palette.found') }}</div>
            <div v-for="(w, k) in skeletonWidths" :key="k" class="flex min-h-10 items-center gap-3 px-2.5 py-2">
              <span class="block h-5 w-14 shrink-0 animate-pulse rounded-pill bg-sunken motion-reduce:animate-none sm:mr-10" />
              <span class="block h-3.5 animate-pulse rounded-[6px] bg-sunken motion-reduce:animate-none" :style="{ width: w }" />
            </div>
          </div>

          <div role="status" aria-live="polite">
            <div v-if="status === 'error'" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-3 text-sm text-ink-2">
              <span>{{ t('shell.palette.error') }}</span>
              <ZButton variant="link" size="sm" data-retry @mousedown.prevent @click="retry">{{ t('shell.palette.retry') }}</ZButton>
            </div>
            <p v-else-if="showNothing" class="m-0 px-2.5 py-6 text-center text-sm text-ink-3 [overflow-wrap:anywhere]">
              {{ t('shell.palette.nothing', { q: term }) }}
            </p>
          </div>
        </div>

        <div class="hidden shrink-0 items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted sm:flex">
          <span class="inline-flex items-center gap-1.5"><ZKbd>↑↓</ZKbd>{{ t('shell.palette.hintMove') }}</span>
          <span class="inline-flex items-center gap-1.5"><ZKbd>Enter</ZKbd>{{ t('shell.palette.hintOpen') }}</span>
          <span class="inline-flex items-center gap-1.5"><ZKbd>Esc</ZKbd>{{ t('shell.palette.hintClose') }}</span>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
