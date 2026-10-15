<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowDown, PhArrowUp, PhCaretDown, PhClipboardText, PhCopy, PhPlus, PhTrash, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import { vUppercase } from '@/directives/uppercase'
import { cn } from '@/ui/cn'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { formatNumberIn } from '@/ui/number'
import type { ZOptionValue } from '@/ui/options'
import GoodsCharacteristicsGrid from './GoodsCharacteristicsGrid.vue'
import GoodsCharacteristicsPasteModal from './GoodsCharacteristicsPasteModal.vue'
import GoodsTroisHint from './GoodsTroisHint.vue'
import OkeiUnitSelect from './OkeiUnitSelect.vue'
import {
  blankCharacteristic, CHARACTERISTICS_MAX_ROWS, characteristicField, characteristicTotals, cloneCharacteristic,
  isBlankCharacteristic, quantityByUnit, rowsWithoutMeasure, singleRowOf, type GoodsRowValue,
} from './characteristics'
import { readCharsMode, writeCharsMode, type CharsMode } from './charsMode'
import { gr31Text } from './gr31Text'
import { okeiCode, okeiLabel, okeiShort } from './okei'
import type { GoodsSectionProps } from './types'

// Гр. 31 «Характеристики товара в группе» (как окно КЕДЕН): строки товара — наименование, количество в своей единице ОКЕИ
// (не гр. 41), стоимость (валюта гр. 22), производитель, товарный знак (подсказка ТРОИС), марка, модель, артикул, стандарт,
// сорт, серийные номера. Два вида (выбор помнится у пользователя, charsMode.ts):
//   «Таблица» (по умолчанию на компьютере) — сетка с правкой в ячейках, как в КЕДЕН / D-Sector (GoodsCharacteristicsGrid);
//   «Карточки» (всегда на телефоне < 640px) — строка-сводка (№, наименование, количество, стоимость, модель/артикул),
//   раскрывается в форму.
// Над строками: добавить, копировать предыдущую (карточки), «Заполнить через текст / из Excel» (окно вставки), ↑/↓
// (таблица: строка, где фокус), «Удалить все». Предел — 500 строк, как у сервера. Итоги строк (количество по единицам,
// стоимость) против гр. 41 и гр. 42 — предупреждение при расхождении (не блок). Ниже — текст гр. 31, как его напечатает
// КЕДЕН (gr31Text). Строки — не поля платежей: правятся на месте (без «Пересчитать»).
const props = defineProps<GoodsSectionProps>()
const { t, locale } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.${key}`, p ?? {})

// Пределы структуры ДТ (characteristics.ts: CHARACTERISTIC_FIELDS).
const NAME_MAX = characteristicField('tradeMarkName').max
const ARTICLE_MAX = characteristicField('productArticle').max
const STANDARD_MAX = characteristicField('standardName').max
const MANUFACTURER_MAX = characteristicField('manufacturerName').max
const ROW_NAME_MAX = characteristicField('name').max
const MAX = CHARACTERISTICS_MAX_ROWS
const { confirm } = useConfirm()

const rows = computed<GoodsRowValue[]>(() => props.item.characteristics ?? [])
const list = (): GoodsRowValue[] => {
  props.item.characteristics ??= []
  return props.item.characteristics
}

// Раскрытые строки: одна строка у товара — раскрыта сразу; новая/скопированная — раскрывается и получает фокус.
const open = shallowReactive(new Set<GoodsRowValue>())
watch(() => props.item, () => {
  open.clear()
  if (rows.value.length === 1) open.add(rows.value[0])
}, { immediate: true })
const toggle = (r: GoodsRowValue) => { if (open.has(r)) open.delete(r); else open.add(r) }

const root = ref<HTMLElement>()
const focusRow = async (i: number) => {
  await nextTick()
  root.value?.querySelector<HTMLInputElement>(`input[data-f="char-${i}-name"]`)?.focus()
}
const canAdd = computed(() => !props.readonly && rows.value.length < MAX)
const insert = (r: GoodsRowValue, at: number) => {
  if (!canAdd.value) return
  const arr = list()
  arr.splice(at, 0, r)
  open.add(r)
  void focusRow(at)
}
const gridRef = ref<InstanceType<typeof GoodsCharacteristicsGrid>>()
const add = async () => {
  if (!canAdd.value) return
  if (mode.value !== 'table') return insert(blankCharacteristic(), rows.value.length)
  const gridNow = () => gridRef.value
  if (gridNow()) return gridNow()!.add()
  // Строк не было — таблицы ещё нет: строка, затем фокус в её первую ячейку.
  list().push(blankCharacteristic())
  await nextTick()
  await gridNow()?.focusFirst()
}
/** «Копировать предыдущую» — новая строка в конце, копия последней (модели одного производителя — меняется модель). */
const copyLast = () => {
  const last = rows.value[rows.value.length - 1]
  insert(last ? cloneCharacteristic(last) : blankCharacteristic(), rows.value.length)
}
const copyRow = (i: number) => insert(cloneCharacteristic(rows.value[i]), i + 1)
const remove = (r: GoodsRowValue) => {
  const arr = list()
  const i = arr.indexOf(r)
  if (i >= 0) arr.splice(i, 1)
  open.delete(r)
}

// ---- Вид: «Таблица» / «Карточки» ----
// Телефон (< 640px) — всегда карточки (сетка там непригодна); на компьютере — выбор пользователя, по умолчанию таблица.
const isWide = ref(true)
let media: MediaQueryList | null = null
const onMedia = () => { isWide.value = media?.matches ?? true }
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  media = window.matchMedia('(min-width: 640px)')
  onMedia()
  media.addEventListener?.('change', onMedia)
})
onBeforeUnmount(() => media?.removeEventListener?.('change', onMedia))
const chosen = ref<CharsMode>(readCharsMode())
const mode = computed<CharsMode>(() => (isWide.value ? chosen.value : 'cards'))
const modeOptions = computed(() => [{ value: 'table', label: tc('mode.table') }, { value: 'cards', label: tc('mode.cards') }])
const setMode = (v: ZOptionValue) => {
  const m: CharsMode = v === 'cards' ? 'cards' : 'table'
  chosen.value = m
  writeCharsMode(m)
}

// ---- Над строками: ↑/↓ (таблица), «Удалить все», вставка ----
const current = ref<number | null>(null)
watch(() => props.item, () => { current.value = null })
const removeAll = async () => {
  if (props.readonly || !rows.value.length) return
  const ok = await confirm({
    title: tc('removeAll.title'),
    content: tc('removeAll.text', { n: rows.value.length }),
    okText: tc('removeAll.ok'),
    cancelText: t('common.cancel'),
    danger: true,
  })
  if (!ok) return
  list().splice(0)
  open.clear()
  current.value = null
}
const pasteOpen = ref(false)
const filledCount = computed(() => rows.value.filter((r) => !isBlankCharacteristic(r)).length)
const onPaste = ({ mode: how, rows: pasted }: { mode: 'append' | 'replace'; rows: GoodsRowValue[] }) => {
  const arr = list()
  // Пустые строки (новый товар) не остаются перед вставленными — сервер их всё равно отбросит.
  const keep = how === 'append' ? arr.filter((r) => !isBlankCharacteristic(r)) : []
  arr.splice(0, arr.length, ...keep, ...pasted)
  open.clear()
  if (arr.length === 1) open.add(arr[0])
  message.success(tc(how === 'append' ? 'paste.appended' : 'paste.replaced', { n: pasted.length }))
}

type StrKey = 'name' | 'manufacturerName' | 'tradeMarkName' | 'productMarkName' | 'productModelName' | 'productArticle'
  | 'standardName' | 'productSortName' | 'serialNumbers'
const setStr = (r: GoodsRowValue, key: StrKey, v: string) => { r[key] = v.trim() ? v : null }

// Сводка строки (свёрнутая строка таблицы / карточки).
const num = (v: number | null | undefined) => (v == null ? '' : formatNumberIn(locale.value, v, 6))
const measureText = (q: number, unitCode: string | null | undefined, unitName?: string | null) =>
  [num(q), okeiShort(unitCode) ?? (unitName || okeiCode(unitCode)) ?? ''].join(' ').trim()

// Единственная строка следует за товаром (как сервер и текст гр. 31): без своего количества — гр. 41, без своей стоимости —
// гр. 42. Такие значения показываются подсказкой «из гр. 41: …» (поле пустое, копия в строку не пишется).
const single = computed(() => singleRowOf(rows.value))
const fromGr41 = (r: GoodsRowValue): string | null =>
  r === single.value && r.quantity == null && props.item.quantity != null
    ? tc('fromGr41', { value: measureText(props.item.quantity, props.item.unitCode, props.item.unit) })
    : null
const fromGr42 = (r: GoodsRowValue): string | null =>
  r === single.value && r.invoiceValue == null && props.item.customsValue != null
    ? tc('fromGr42', { value: num(props.item.customsValue) })
    : null
const qtyText = (r: GoodsRowValue) => (r.quantity == null ? fromGr41(r) ?? '—' : measureText(r.quantity, r.unitCode, r.unitCode))
const valueText = (r: GoodsRowValue) => (r.invoiceValue == null ? fromGr42(r) ?? '—' : num(r.invoiceValue))
const nameText = (r: GoodsRowValue) => r.name || props.item.description || props.item.tnvedDescription || tc('noName')
const modelText = (r: GoodsRowValue) => [r.productModelName, r.productArticle].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ') || '—'

const currency = computed(() => props.ctx.currency || props.item.currency || '')
const totals = computed(() => characteristicTotals(props.item))
const qtyWarning = computed(() => (totals.value.quantityMismatch
  ? tc('qtyMismatch', { rows: num(totals.value.quantity), unit: okeiLabel(props.item.unitCode, props.item.unit), goods: num(props.item.quantity) })
  : null))
const valueWarning = computed(() => (totals.value.valueMismatch
  ? tc('valueMismatch', { rows: num(totals.value.value), goods: num(props.item.customsValue), currency: currency.value })
  : null))

// Строки, которые уйдут в XML без количества (не блок; сервер — предупреждение готовности).
const measureWarnings = computed(() => {
  const w = rowsWithoutMeasure(props.item)
  return [
    ...(w.noUnit.length ? [tc('noUnit', { rows: w.noUnit.join(', ') })] : []),
    ...(w.noQuantity.length ? [tc('noQuantity', { rows: w.noQuantity.join(', ') })] : []),
  ]
})

// Итоги под строками: количество по единицам («1 800 ШТ · 25 КГ»), стоимость — против гр. 41 / гр. 42.
const unitText = (code: string) => (code ? okeiShort(code) ?? code : tc('noUnitShort'))
const qtySum = computed(() => quantityByUnit(rows.value).map((x) => `${num(x.quantity)} ${unitText(x.unitCode)}`).join(' · '))
const goodsQty = computed(() => (props.item.quantity == null ? '—' : measureText(props.item.quantity, props.item.unitCode, props.item.unit)))
const goodsValue = computed(() => (props.item.customsValue == null ? '—' : num(props.item.customsValue)))
const showTotals = computed(() => filledCount.value > 0)

// Текст гр. 31 — при сотнях строк длинный: сначала первые PREVIEW_LINES строк, «Показать весь текст».
const preview = computed(() => gr31Text(props.item))
const PREVIEW_LINES = 30
const previewAll = ref(false)
watch(() => props.item, () => { previewAll.value = false })
const previewLines = computed(() => (preview.value ? preview.value.split('\n').length : 0))
const previewShown = computed(() => (previewAll.value || previewLines.value <= PREVIEW_LINES
  ? preview.value
  : preview.value.split('\n').slice(0, PREVIEW_LINES).join('\n')))

// Стабильный ключ строки (копия в середину, удаление — поля и состояние выбора единицы не «переезжают» на соседнюю строку).
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

// Широко — одна сетка у заголовка и у свёрнутой строки: № · наименование · количество · стоимость · модель/артикул ·
// кнопки (3 × 36 px). У каждой ячейки явные строка и колонка: ячейка с одной лишь строкой (row-start) раскладчик сетки
// ставит раньше ячеек без позиции — количество и кнопки «уезжали» перед № и наименованием (баг 14.10, ящик ~800 px).
// Узко — карточка: № · наименование · кнопки, ниже — количество, стоимость, модель/артикул на всю ширину (подпись не режется).
const cols = '@2xl:grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_minmax(0,10rem)_7.25rem]'
const head = cn('hidden gap-x-3 border border-transparent px-2 text-xs text-muted @2xl:grid', cols)
const summary = cn('grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1', cols)
const cell = {
  no: 'col-start-1 row-start-1',
  name: 'col-start-2 row-start-1',
  qty: '@2xl:col-start-3',
  value: '@2xl:col-start-4',
  model: '@2xl:col-start-5',
  actions: 'col-start-3 row-start-1 @2xl:col-start-6',
}
const meta = 'col-span-2 col-start-2 flex min-w-0 gap-1 text-[13px] text-ink-2 tabular-nums @2xl:col-span-1 @2xl:row-start-1'
const metaLabel = 'shrink-0 text-muted @2xl:hidden'
const iconBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11',
)
const grid = 'grid grid-cols-1 gap-x-4 gap-y-3 @md:grid-cols-2 @4xl:grid-cols-4'
const wide = '@md:col-span-2'
const full = '@md:col-span-2 @4xl:col-span-4'
const tall = 'max-sm:h-11'
const toolBtn = 'max-sm:h-11'
</script>

<template>
  <div ref="root" class="flex min-w-0 flex-col gap-3 outline-hidden" tabindex="-1" data-goods-characteristics data-graph="31" data-goods-field="characteristics" :data-goods-index="index">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <span class="text-sm font-medium text-ink-2" data-chars-title>{{ tc('title') }}</span>
        <span class="text-xs text-muted">{{ tc('hint') }}</span>
      </div>
      <ZSegmented v-if="isWide" :value="mode" :options="modeOptions" :aria-label="tc('mode.label')" data-chars-mode @update:value="setMode" />
    </div>

    <div v-if="!readonly" class="flex flex-wrap items-center gap-1" role="toolbar" :aria-label="tc('toolbar')" data-chars-toolbar>
      <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="!canAdd" data-chars-add @click="add">
        <PhPlus :size="14" aria-hidden="true" />{{ tc('add') }}
      </ZButton>
      <ZButton v-if="mode === 'cards' && rows.length" variant="ghost" size="sm" :class="toolBtn" :disabled="!canAdd" data-chars-copy-last @click="copyLast">
        <PhCopy :size="14" aria-hidden="true" />{{ tc('copyLast') }}
      </ZButton>
      <ZButton variant="ghost" size="sm" :class="toolBtn" data-chars-paste @click="pasteOpen = true">
        <PhClipboardText :size="14" aria-hidden="true" />{{ tc('paste.open') }}
      </ZButton>
      <template v-if="mode === 'table' && rows.length > 1">
        <ZButton
          variant="ghost"
          size="sm"
          :class="toolBtn"
          :disabled="current == null || current <= 0"
          :aria-label="tc('moveUp')"
          :title="tc('moveUpHint')"
          data-chars-move-up
          @mousedown.prevent
          @click="gridRef?.moveCurrent(-1)"
        ><PhArrowUp :size="14" aria-hidden="true" /></ZButton>
        <ZButton
          variant="ghost"
          size="sm"
          :class="toolBtn"
          :disabled="current == null || current >= rows.length - 1"
          :aria-label="tc('moveDown')"
          :title="tc('moveDownHint')"
          data-chars-move-down
          @mousedown.prevent
          @click="gridRef?.moveCurrent(1)"
        ><PhArrowDown :size="14" aria-hidden="true" /></ZButton>
      </template>
      <ZButton v-if="rows.length" variant="danger-ghost" size="sm" :class="[toolBtn, 'ml-auto']" data-chars-remove-all @click="removeAll">
        <PhTrash :size="14" aria-hidden="true" />{{ tc('removeAll.button') }}
      </ZButton>
    </div>
    <p v-if="!readonly && !canAdd" class="m-0 text-[13px] text-gold-ink" role="status" data-chars-cap>{{ tc('capReached', { max: MAX }) }}</p>

    <p v-if="!rows.length" class="m-0 text-[13px] text-muted" data-chars-empty>{{ tc('empty') }}</p>
    <GoodsCharacteristicsGrid v-else-if="mode === 'table'" ref="gridRef" v-model:current="current" :item="item" :readonly="readonly" :max="MAX" />
    <template v-else>
      <div :class="head" aria-hidden="true" data-chars-head>
        <span :class="cell.no">№</span>
        <span :class="cell.name">{{ tc('name') }}</span>
        <span :class="[cell.qty, '@2xl:row-start-1']">{{ tc('quantity') }}</span>
        <span :class="[cell.value, '@2xl:row-start-1']">{{ tc('value') }}</span>
        <span :class="[cell.model, '@2xl:row-start-1']">{{ tc('modelArticle') }}</span>
        <span :class="cell.actions" />
      </div>
      <div
        v-for="(r, i) in rows"
        :key="rowKey(r)"
        class="flex flex-col gap-3 rounded-row border border-line p-2"
        :data-char-row="i"
        :data-open="open.has(r) ? 'true' : undefined"
      >
        <div :class="summary" data-char-summary>
          <span :class="[cell.no, 'text-[13px] text-muted tabular-nums']" data-cell="no">{{ i + 1 }}</span>
          <button
            type="button"
            :class="[cell.name, 'min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] text-ink outline-hidden focus-visible:shadow-focus']"
            data-cell="name"
            :aria-expanded="open.has(r)"
            :title="nameText(r)"
            :data-char-toggle="i"
            @click="toggle(r)"
          >{{ nameText(r) }}</button>
          <span :class="[meta, cell.qty]" data-cell="qty" :data-char-qty="i">
            <span :class="metaLabel">{{ tc('quantity') }}:</span>
            <span class="truncate" :class="r.quantity == null && fromGr41(r) ? 'text-muted' : ''" :title="qtyText(r)" :data-char-qty-from-goods="r.quantity == null && fromGr41(r) ? i : undefined">{{ qtyText(r) }}</span>
          </span>
          <span :class="[meta, cell.value]" data-cell="value" :data-char-value="i">
            <span :class="metaLabel">{{ tc('value') }}:</span>
            <span class="truncate" :class="r.invoiceValue == null && fromGr42(r) ? 'text-muted' : ''" :title="valueText(r)">{{ valueText(r) }}</span>
          </span>
          <span :class="[meta, cell.model]" data-cell="model" :data-char-model="i">
            <span :class="metaLabel">{{ tc('modelArticle') }}:</span>
            <span class="truncate" :title="modelText(r)">{{ modelText(r) }}</span>
          </span>
          <div :class="[cell.actions, 'flex items-center justify-end gap-0.5']" data-cell="actions">
            <button type="button" :class="iconBtn" :aria-label="tc('toggle', { n: i + 1 })" :title="tc('toggle', { n: i + 1 })" @click="toggle(r)">
              <PhCaretDown :size="16" aria-hidden="true" :class="open.has(r) ? 'rotate-180' : ''" />
            </button>
            <template v-if="!readonly">
              <button type="button" :class="iconBtn" :aria-label="tc('copyRow', { n: i + 1 })" :title="tc('copyRow', { n: i + 1 })" :data-char-copy="i" @click="copyRow(i)">
                <PhCopy :size="16" aria-hidden="true" />
              </button>
              <button type="button" :class="[iconBtn, 'hover:text-danger']" :aria-label="tc('remove', { n: i + 1 })" :title="tc('remove', { n: i + 1 })" :data-char-remove="i" @click="remove(r)">
                <PhX :size="16" aria-hidden="true" />
              </button>
            </template>
          </div>
        </div>

        <div v-if="open.has(r)" :class="grid" :data-char-editor="i">
          <ZField graph="31" :label="tc('name')" :class="full" :extra="r.name ? undefined : tc('nameDefault')">
            <ZInput v-uppercase :value="r.name ?? ''" :maxlength="ROW_NAME_MAX" :disabled="readonly" :class="tall" :data-f="`char-${i}-name`" @update:value="setStr(r, 'name', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('quantity')">
            <ZNumber :value="r.quantity ?? null" :min="0" :disabled="readonly" :placeholder="fromGr41(r) ?? undefined" :class="tall" :data-f="`char-${i}-quantity`" @update:value="r.quantity = $event" />
          </ZField>
          <ZField graph="31" :label="tc('unit')">
            <OkeiUnitSelect v-model:value="r.unitCode" :disabled="readonly" :placeholder="tc('unitPlaceholder')" :class="tall" :data-f="`char-${i}-unit`" />
          </ZField>
          <ZField graph="31" :label="currency ? tc('valueIn', { currency }) : tc('value')" :class="wide">
            <ZNumber :value="r.invoiceValue ?? null" :min="0" :disabled="readonly" :placeholder="fromGr42(r) ?? undefined" :class="tall" :data-f="`char-${i}-value`" @update:value="r.invoiceValue = $event" />
          </ZField>
          <ZField graph="31" :label="tc('manufacturer')" :class="full">
            <ZInput v-uppercase :value="r.manufacturerName ?? ''" :maxlength="MANUFACTURER_MAX" :disabled="readonly" :class="tall" :data-f="`char-${i}-manufacturer`" @update:value="setStr(r, 'manufacturerName', $event)" />
          </ZField>
          <div :class="['flex min-w-0 flex-col gap-1', full]">
            <ZField graph="31" :label="tc('tradeMark')">
              <ZInput v-uppercase :value="r.tradeMarkName ?? ''" :maxlength="NAME_MAX" :disabled="readonly" :class="tall" :data-f="`char-${i}-tradeMark`" @update:value="setStr(r, 'tradeMarkName', $event)" />
            </ZField>
            <GoodsTroisHint :name="r.tradeMarkName" />
          </div>
          <ZField graph="31" :label="tc('mark')">
            <ZInput v-uppercase :value="r.productMarkName ?? ''" :maxlength="NAME_MAX" :disabled="readonly" :placeholder="tc('missing')" :class="tall" :data-f="`char-${i}-mark`" @update:value="setStr(r, 'productMarkName', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('model')">
            <ZInput v-uppercase :value="r.productModelName ?? ''" :maxlength="NAME_MAX" :disabled="readonly" :placeholder="tc('missing')" :class="tall" :data-f="`char-${i}-model`" @update:value="setStr(r, 'productModelName', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('article')">
            <ZInput v-uppercase :value="r.productArticle ?? ''" :maxlength="ARTICLE_MAX" :disabled="readonly" :placeholder="tc('missing')" :class="tall" :data-f="`char-${i}-article`" @update:value="setStr(r, 'productArticle', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('standard')" :title="tc('standardHint')">
            <ZInput v-uppercase :value="r.standardName ?? ''" :maxlength="STANDARD_MAX" :disabled="readonly" :placeholder="tc('missing')" :class="tall" :data-f="`char-${i}-standard`" @update:value="setStr(r, 'standardName', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('sort')">
            <ZInput v-uppercase :value="r.productSortName ?? ''" :maxlength="NAME_MAX" :disabled="readonly" :placeholder="tc('missing')" :class="tall" :data-f="`char-${i}-sort`" @update:value="setStr(r, 'productSortName', $event)" />
          </ZField>
          <ZField graph="31" :label="tc('serials')" :class="[wide, '@4xl:col-span-3']" :extra="tc('serialsHint')">
            <ZInput v-uppercase :value="r.serialNumbers ?? ''" :maxlength="2000" :disabled="readonly" :class="tall" :data-f="`char-${i}-serials`" @update:value="setStr(r, 'serialNumbers', $event)" />
          </ZField>
        </div>
      </div>
    </template>

    <div v-if="showTotals || qtyWarning || valueWarning || measureWarnings.length" class="flex flex-col gap-1 text-[13px]" data-chars-totals>
      <span v-if="showTotals" class="flex flex-wrap gap-x-4 gap-y-0.5 text-ink-2">
        <span data-chars-sum-rows>{{ tc('sum.rows', { n: filledCount }) }}</span>
        <span data-chars-sum-qty>{{ tc('sum.quantity', { value: qtySum || '—' }) }} <span class="text-muted">({{ tc('sum.gr41', { value: goodsQty }) }})</span></span>
        <span data-chars-sum-value>{{ tc('sum.value', { value: totals.value == null ? '—' : num(totals.value), currency }) }} <span class="text-muted">({{ tc('sum.gr42', { value: goodsValue }) }})</span></span>
      </span>
      <span v-if="qtyWarning" class="text-gold-ink" role="status" data-chars-qty-warning>{{ qtyWarning }}</span>
      <span v-if="valueWarning" class="text-gold-ink" role="status" data-chars-value-warning>{{ valueWarning }}</span>
      <span v-for="w in measureWarnings" :key="w" class="text-gold-ink" role="status" data-chars-measure-warning>{{ w }}</span>
    </div>

    <div v-if="preview" class="flex min-w-0 flex-col gap-1" data-gr31-preview>
      <span class="text-sm font-medium text-ink-2">{{ tc('preview') }}</span>
      <p class="m-0 rounded-field bg-sunken px-3 py-2 text-[13px] break-words whitespace-pre-line text-ink" data-gr31-preview-text>{{ previewShown }}</p>
      <button
        v-if="previewLines > PREVIEW_LINES"
        type="button"
        class="cursor-pointer self-start rounded-field border-0 bg-transparent p-0 text-[13px] text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus"
        :aria-expanded="previewAll"
        data-gr31-preview-all
        @click="previewAll = !previewAll"
      >{{ previewAll ? tc('previewLess') : tc('previewAll', { n: previewLines }) }}</button>
    </div>

    <GoodsCharacteristicsPasteModal v-if="!readonly" v-model:open="pasteOpen" :existing="filledCount" :max="MAX" @apply="onPaste" />
  </div>
</template>
