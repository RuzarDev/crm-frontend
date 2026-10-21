<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { formatNumberIn } from '@/ui/number'
import type { Import40GoodsItemInput } from '@/types/api'
import GoodsCharacteristicsGridRow from './GoodsCharacteristicsGridRow.vue'
import GoodsTroisHint from './GoodsTroisHint.vue'
import {
  blankCharacteristic, CHARACTERISTIC_FIELDS, cloneCharacteristic, singleRowOf,
  type CharacteristicField, type GoodsRowValue,
} from './characteristics'
import { CHARS_GRID_NO_W, charsGridLayout } from './charsGridLayout'
import { ensureOkeiUnits, okeiCode, okeiShort, okeiUnits } from './okei'

// Режим «Таблица» строк гр. 31 (как сетка «Характеристика товаров в группе» КЕДЕН / D-Sector): строка — характеристика,
// колонки № · Наименование · Кол-во · Ед. · Стоимость · Производитель · Тов. знак · Марка · Модель · Артикул · Стандарт ·
// Сорт · Серийные №, правка прямо в ячейке (GoodsCharacteristicsGridRow). № и Наименование закреплены слева, остальное —
// прокрутка внутри таблицы. Ширины колонок (№17) — charsGridLayout: подпись и значения не режутся, свободное место панели
// делят текстовые колонки, прокрутка вправо — только когда колонки не помещаются.
// Клавиши: Tab / Shift+Tab — по ячейкам (с переходом на соседнюю строку); Enter / Shift+Enter — вниз / вверх (Enter на
// последней строке — новая строка); ↑/↓ — соседняя строка (не в ячейке единицы: там список единиц); Ctrl/⌘+↑/↓ — переставить
// строку. Ctrl/⌘+Enter не перехватывается (следующий товар редактора).
// До 500 строк (предел сервера): строки рисуются окном по прокрутке (фиксированная высота строки), у каждой строки своя
// отрисовка — правка ячейки не перерисовывает соседние. Единица — поле с подсказкой списка ОКЕИ (<datalist>): «ШТ», «кг»,
// «796». Ячейки правят строки товара на месте (как карточки).
const props = defineProps<{
  item: Import40GoodsItemInput
  readonly: boolean
  /** Предел строк у товара (CHARACTERISTICS_MAX_ROWS). */
  max: number
}>()
/** Строка, где фокус (кнопки ↑/↓ над таблицей двигают её). */
const current = defineModel<number | null>('current', { default: null })

const { t, locale } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.${key}`, p ?? {})
const listId = `chars-grid-${useId()}-okei`
const trois = useTroisCheck()
onMounted(() => { void ensureOkeiUnits() })

const rows = computed<GoodsRowValue[]>(() => props.item.characteristics ?? [])
const list = (): GoodsRowValue[] => {
  props.item.characteristics ??= []
  return props.item.characteristics
}

// ---- Колонки ----
// Ширины — по подписям на текущем языке и самым длинным значениям (charsGridLayout); итог — ширина таблицы при нехватке
// места (прокрутка вправо). Подсказки единственной строки («гр. 41: …») тоже помещаются.
const NO_W = CHARS_GRID_NO_W
const FIELDS = CHARACTERISTIC_FIELDS
const fieldCols = FIELDS.map((c) => c.f)
const controlCols = computed(() => (props.readonly ? fieldCols : [...fieldCols, 'copy', 'remove']))
const labels = computed(() => Object.fromEntries(FIELDS.map((c) => [c.key, tc(`col.${c.f}`)])) as Record<CharacteristicField, string>)
const unitShort = (code: string) => okeiShort(code) ?? okeiCode(code)
const layout = computed(() => charsGridLayout(rows.value, {
  readonly: props.readonly, labels: labels.value, unitText: unitShort, placeholders: singlePlaceholders.value,
}))
const template = computed(() => layout.value.template)
const totalWidth = computed(() => layout.value.widthRem)
const colCount = computed(() => 1 + FIELDS.length + (props.readonly ? 0 : 1))
const stickyLeft = `${NO_W}rem`

// ---- Окно строк по прокрутке ----
const ROW_H = 34
const HEAD_H = 34
const OVERSCAN = 6
/** Высота окна, пока она неизвестна (первый кадр, jsdom). */
const FALLBACK_VIEW = 480
const box = ref<HTMLElement>()
const scrollTop = ref(0)
const viewH = ref(0)
// Высота окна таблицы — min(60vh, 36rem): меняется только с окном браузера (и числом строк, пока их мало).
const measure = () => { viewH.value = box.value?.clientHeight ?? 0 }
const onScroll = () => {
  scrollTop.value = box.value?.scrollTop ?? 0
  if (!viewH.value) measure()
}
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))
const first = computed(() => Math.max(0, Math.floor(Math.max(0, scrollTop.value - HEAD_H) / ROW_H) - OVERSCAN))
const last = computed(() => Math.min(rows.value.length, Math.ceil((scrollTop.value + (viewH.value || FALLBACK_VIEW)) / ROW_H) + OVERSCAN))
const visible = computed(() => {
  const out: { r: GoodsRowValue; i: number }[] = []
  for (let i = first.value; i < last.value; i++) out.push({ r: rows.value[i], i })
  return out
})
/** Прокрутить так, чтобы строка i была видна под закреплённым заголовком. */
const ensureVisible = (i: number) => {
  const el = box.value
  const view = (viewH.value || FALLBACK_VIEW) - HEAD_H
  const top = i * ROW_H
  let st = scrollTop.value
  if (top < st) st = top
  else if (top + ROW_H > st + view) st = top + ROW_H - view
  if (st === scrollTop.value) return
  if (el) el.scrollTop = st
  scrollTop.value = st
}

// Стабильный ключ строки (перестановка, копия в середину — поле и фокус не «переезжают» на соседнюю строку).
const rowKeys = new WeakMap<GoodsRowValue, number>()
let lastRowKey = 0
const rowKey = (r: GoodsRowValue) => {
  const raw = toRaw(r)
  let k = rowKeys.get(raw)
  if (k === undefined) {
    k = ++lastRowKey
    rowKeys.set(raw, k)
  }
  return k
}

// Единственная строка следует за товаром (гр. 41 / гр. 42) — подсказка в пустой ячейке, копия в строку не пишется.
const single = computed(() => singleRowOf(rows.value))
const num = (v: number) => formatNumberIn(locale.value, v, 6)
const singlePlaceholders = computed<Partial<Record<CharacteristicField, string>> | null>(() => {
  const r = single.value
  if (!r) return null
  const g = props.item
  const out: Partial<Record<CharacteristicField, string>> = {}
  if (r.quantity == null && g.quantity != null) {
    out.quantity = tc('gr41Short', { value: num(g.quantity) })
    if (g.unitCode) out.unitCode = okeiShort(g.unitCode) ?? g.unit ?? okeiCode(g.unitCode)
  }
  if (r.invoiceValue == null && g.customsValue != null) out.invoiceValue = tc('gr42Short', { value: num(g.customsValue) })
  return out
})
const placeholdersOf = (r: GoodsRowValue) => (toRaw(r) === toRaw(single.value) ? singlePlaceholders.value : null)

/** Знаки строк из ТРОИС (действующее совпадение) — подсказка под таблицей. Ключ-строка: правка не того поля не перерисует. */
const troisKey = computed(() => {
  if (!trois) return ''
  const hit = (n: string) => !!trois.resultFor(n)?.matches?.some((m) => m.match === 'exact' && m.isActive)
  return [...new Set(rows.value.map((r) => (r.tradeMarkName ?? '').trim()).filter((n) => n && hit(n)))].join('\u0001')
})
const troisMarks = computed(() => (troisKey.value ? troisKey.value.split('\u0001') : []))

// ---- Переход по ячейкам, строки ----
const cellSel = (i: number, col: string) => `[data-row="${i}"][data-col="${col}"]`
async function focusCell(i: number, col: string, select = true) {
  if (i < 0 || i >= rows.value.length) return
  ensureVisible(i)
  if (col === fieldCols[0] && box.value) box.value.scrollLeft = 0
  await nextTick()
  const el = box.value?.querySelector<HTMLElement>(cellSel(i, col))
  el?.focus()
  if (select && el instanceof HTMLInputElement) el.select()
}
const canAdd = computed(() => !props.readonly && rows.value.length < props.max)
function add(col: string = fieldCols[0]) {
  if (!canAdd.value) return
  list().push(blankCharacteristic())
  void focusCell(rows.value.length - 1, col)
}
function copyRow(i: number) {
  if (!canAdd.value) return
  list().splice(i + 1, 0, cloneCharacteristic(rows.value[i]))
  void focusCell(i + 1, fieldCols[0])
}
function removeRow(i: number) {
  if (props.readonly) return
  list().splice(i, 1)
  const n = rows.value.length
  if (!n) {
    current.value = null
    return
  }
  void focusCell(Math.min(i, n - 1), 'remove', false)
}
function moveRow(i: number, to: number, col: string = fieldCols[0]) {
  if (props.readonly || to < 0 || to >= rows.value.length || i === to) return
  const arr = list()
  const [r] = arr.splice(i, 1)
  arr.splice(to, 0, r)
  current.value = to
  void focusCell(to, col, false)
}
let lastCol = fieldCols[0]
/** ↑/↓ над таблицей: переставить строку, где фокус (или последнюю, где он был). */
const moveCurrent = (delta: number) => {
  if (current.value == null) return
  moveRow(current.value, current.value + delta, lastCol)
}

const onKey = (e: KeyboardEvent) => {
  if (e.defaultPrevented || e.isComposing) return
  const target = e.target as HTMLElement
  const col = target.dataset?.col
  const at = target.dataset?.row
  if (!col || at == null) return
  const i = Number(at)
  const n = rows.value.length
  const mod = e.ctrlKey || e.metaKey
  const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
  const delta = e.key === 'ArrowUp' ? -1 : 1
  if (mod && !e.altKey && !e.shiftKey && vertical) {
    e.preventDefault()
    moveRow(i, i + delta, col)
    return
  }
  const isInput = target instanceof HTMLInputElement
  if (e.key === 'Enter' && isInput && !mod && !e.altKey) {
    e.preventDefault()
    if (e.shiftKey) void focusCell(i - 1, col)
    else if (i < n - 1) void focusCell(i + 1, col)
    else add(col)
    return
  }
  // ↑/↓ без клавиш — соседняя строка; в ячейке единицы стрелки листают список единиц.
  if (vertical && isInput && col !== 'unit' && !mod && !e.altKey && !e.shiftKey) {
    if (i + delta < 0 || i + delta >= n) return
    e.preventDefault()
    void focusCell(i + delta, col)
    return
  }
  if (e.key === 'Tab' && !mod && !e.altKey) {
    const cols = controlCols.value
    const c = cols.indexOf(col)
    const next = c + (e.shiftKey ? -1 : 1)
    if (next >= 0 && next < cols.length) {
      e.preventDefault()
      void focusCell(i, cols[next])
    } else if (!e.shiftKey && i < n - 1) {
      e.preventDefault()
      void focusCell(i + 1, cols[0])
    } else if (e.shiftKey && i > 0) {
      e.preventDefault()
      void focusCell(i - 1, cols[cols.length - 1])
    }
  }
}
const onFocusIn = (e: FocusEvent) => {
  const el = e.target as HTMLElement
  if (el.dataset?.row == null) return
  current.value = Number(el.dataset.row)
  if (el.dataset.col && fieldCols.includes(el.dataset.col)) lastCol = el.dataset.col
}

defineExpose({ add, focusCell, moveCurrent, focusFirst: () => focusCell(0, fieldCols[0]) })

const headCell = 'flex min-w-0 items-center border-r border-line px-2 last:border-r-0'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div
      ref="box"
      class="relative max-h-[min(60vh,36rem)] overflow-auto overscroll-contain rounded-row border border-line bg-surface"
      :style="{ scrollPaddingLeft: `${NO_W + layout.nameRem}rem`, scrollPaddingTop: `${HEAD_H}px` }"
      role="grid"
      :aria-label="tc('gridLabel')"
      :aria-rowcount="rows.length + 1"
      :aria-colcount="colCount"
      :aria-readonly="readonly || undefined"
      data-chars-grid
      @scroll.passive="onScroll"
      @keydown="onKey"
      @focusin="onFocusIn"
    >
      <div :style="{ width: `${totalWidth}rem`, minWidth: '100%' }">
        <div
          role="row"
          aria-rowindex="1"
          class="sticky top-0 z-20 grid border-b border-line bg-sunken text-xs font-medium text-ink-3"
          :style="{ gridTemplateColumns: template, height: `${HEAD_H}px` }"
          data-chars-grid-head
        >
          <div role="columnheader" aria-colindex="1" :class="[headCell, 'sticky left-0 z-10 justify-end bg-sunken']">№</div>
          <div
            v-for="(c, k) in FIELDS"
            :key="c.key"
            role="columnheader"
            :aria-colindex="k + 2"
            :class="[headCell, c.kind === 'number' && 'justify-end', c.key === 'name' && 'sticky z-10 bg-sunken shadow-[1px_0_0_var(--color-line-strong)]']"
            :style="c.key === 'name' ? { left: stickyLeft } : undefined"
            :title="c.key === 'invoiceValue' && item.currency ? tc('valueIn', { currency: item.currency }) : labels[c.key]"
            :data-chars-col="c.f"
          ><span class="line-clamp-2 leading-tight" data-chars-col-label>{{ labels[c.key] }}</span></div>
          <div v-if="!readonly" role="columnheader" :aria-colindex="colCount" :class="headCell"><span class="sr-only">{{ tc('actions') }}</span></div>
        </div>

        <div :style="{ height: `${first * ROW_H}px` }" aria-hidden="true" />
        <GoodsCharacteristicsGridRow
          v-for="{ r, i } in visible"
          :key="rowKey(r)"
          :r="r"
          :i="i"
          :readonly="readonly"
          :active="current === i"
          :can-add="canAdd"
          :placeholders="placeholdersOf(r)"
          :template="template"
          :sticky-left="stickyLeft"
          :height="ROW_H"
          :col-count="colCount"
          :list-id="listId"
          @copy="copyRow"
          @remove="removeRow"
        />
        <div :style="{ height: `${(rows.length - last) * ROW_H}px` }" aria-hidden="true" />
      </div>
    </div>

    <datalist v-if="!readonly" :id="listId">
      <option v-for="u in okeiUnits" :key="u.code" :value="u.code">{{ u.shortName ? `${u.shortName} — ${u.name}` : u.name }}</option>
    </datalist>

    <p class="m-0 text-xs text-muted max-sm:hidden" data-chars-grid-keys>{{ tc('gridKeys') }}</p>
    <GoodsTroisHint v-for="m in troisMarks" :key="m" :name="m" />
  </div>
</template>
