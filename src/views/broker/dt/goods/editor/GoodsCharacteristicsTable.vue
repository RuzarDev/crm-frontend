<script setup lang="ts">
import { computed, nextTick, ref, shallowReactive, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCopy, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import { vUppercase } from '@/directives/uppercase'
import { cn } from '@/ui/cn'
import { formatNumberIn } from '@/ui/number'
import GoodsTroisHint from './GoodsTroisHint.vue'
import OkeiUnitSelect from './OkeiUnitSelect.vue'
import { blankCharacteristic, characteristicTotals, cloneCharacteristic, rowsWithoutMeasure, type GoodsRowValue } from './characteristics'
import { gr31Text } from './gr31Text'
import { okeiLabel, okeiShort } from './okei'
import type { GoodsSectionProps } from './types'

// Гр. 31 «Характеристики товара в группе» (как окно КЕДЕН): строки товара — наименование, количество в своей единице ОКЕИ
// (не гр. 41), стоимость (валюта гр. 22), производитель, товарный знак (подсказка ТРОИС), марка, модель, артикул, стандарт,
// сорт, серийные номера. Широко — таблица (№, наименование, количество, стоимость, модель/артикул) с раскрытием строки для
// правки; на телефоне — карточки. Добавить / копировать предыдущую / копировать строку / удалить. Итоги строк против
// гр. 41 и гр. 42 — предупреждение при расхождении (не блок). Ниже — текст гр. 31, как его напечатает КЕДЕН (gr31Text).
// Строки — не поля платежей: правятся на месте (без «Пересчитать»).
const props = defineProps<GoodsSectionProps>()
const { t, locale } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.chars.${key}`, p ?? {})

// Пределы структуры ДТ (Решение Коллегии ЕЭК №75): знак, марка, модель, сорт — Name250; артикул — Id50; стандарт — 40;
// производитель — как прежнее поле (300). Наименование строки в XML не идёт (только текст гр. 31).
const NAME_MAX = 250
const ARTICLE_MAX = 50
const STANDARD_MAX = 40
const MANUFACTURER_MAX = 300
const ROW_NAME_MAX = 500

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
const insert = (r: GoodsRowValue, at: number) => {
  const arr = list()
  arr.splice(at, 0, r)
  open.add(r)
  void focusRow(at)
}
const add = () => insert(blankCharacteristic(), rows.value.length)
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

type StrKey = 'name' | 'manufacturerName' | 'tradeMarkName' | 'productMarkName' | 'productModelName' | 'productArticle'
  | 'standardName' | 'productSortName' | 'serialNumbers'
const setStr = (r: GoodsRowValue, key: StrKey, v: string) => { r[key] = v.trim() ? v : null }

// Сводка строки (свёрнутая строка таблицы / карточки).
const num = (v: number | null | undefined) => (v == null ? '' : formatNumberIn(locale.value, v, 6))
const qtyText = (r: GoodsRowValue) => (r.quantity == null ? '—' : [num(r.quantity), okeiShort(r.unitCode) ?? r.unitCode ?? ''].join(' ').trim())
const valueText = (r: GoodsRowValue) => (r.invoiceValue == null ? '—' : num(r.invoiceValue))
const nameText = (r: GoodsRowValue) => r.name || props.item.description || props.item.tnvedDescription || tc('noName')
const modelText = (r: GoodsRowValue) => [r.productModelName, r.productArticle].filter(Boolean).join(' · ') || '—'

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

const preview = computed(() => gr31Text(props.item))

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

const head = 'hidden gap-3 px-2 text-xs text-muted @2xl:grid @2xl:grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_minmax(0,10rem)_6.5rem]'
const summary = cn(
  'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1',
  '@2xl:grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_minmax(0,10rem)_6.5rem]',
)
const meta = 'col-start-2 text-[13px] text-ink-2 @2xl:col-start-auto @2xl:row-start-1 tabular-nums'
const iconBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11',
)
const grid = 'grid grid-cols-1 gap-x-4 gap-y-3 @md:grid-cols-2 @4xl:grid-cols-4'
const wide = '@md:col-span-2'
const full = '@md:col-span-2 @4xl:col-span-4'
const tall = 'max-sm:h-11'
</script>

<template>
  <div ref="root" class="flex flex-col gap-3" data-goods-characteristics data-graph="31" data-goods-field="characteristics" :data-goods-index="index">
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-medium text-ink-2">{{ tc('title') }}</span>
      <span class="text-xs text-muted">{{ tc('hint') }}</span>
    </div>

    <p v-if="!rows.length" class="m-0 text-[13px] text-muted" data-chars-empty>{{ tc('empty') }}</p>
    <template v-else>
      <div :class="head" aria-hidden="true">
        <span>№</span><span>{{ tc('name') }}</span><span>{{ tc('quantity') }}</span><span>{{ tc('value') }}</span><span>{{ tc('modelArticle') }}</span><span />
      </div>
      <div
        v-for="(r, i) in rows"
        :key="rowKey(r)"
        class="flex flex-col gap-3 rounded-row border border-line p-2"
        :data-char-row="i"
        :data-open="open.has(r) ? 'true' : undefined"
      >
        <div :class="summary">
          <span class="text-[13px] text-muted tabular-nums">{{ i + 1 }}</span>
          <button
            type="button"
            class="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] text-ink outline-hidden focus-visible:shadow-focus"
            :aria-expanded="open.has(r)"
            :title="nameText(r)"
            :data-char-toggle="i"
            @click="toggle(r)"
          >{{ nameText(r) }}</button>
          <span :class="meta" :data-char-qty="i"><span class="text-muted @2xl:hidden">{{ tc('quantity') }}: </span>{{ qtyText(r) }}</span>
          <span :class="meta"><span class="text-muted @2xl:hidden">{{ tc('value') }}: </span>{{ valueText(r) }}</span>
          <span :class="[meta, 'truncate']"><span class="text-muted @2xl:hidden">{{ tc('modelArticle') }}: </span>{{ modelText(r) }}</span>
          <div class="col-start-3 row-start-1 flex items-center justify-end gap-0.5 @2xl:col-start-auto">
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
            <ZNumber :value="r.quantity ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`char-${i}-quantity`" @update:value="r.quantity = $event" />
          </ZField>
          <ZField graph="31" :label="tc('unit')">
            <OkeiUnitSelect v-model:value="r.unitCode" :disabled="readonly" :placeholder="tc('unitPlaceholder')" :class="tall" :data-f="`char-${i}-unit`" />
          </ZField>
          <ZField graph="31" :label="currency ? tc('valueIn', { currency }) : tc('value')" :class="wide">
            <ZNumber :value="r.invoiceValue ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`char-${i}-value`" @update:value="r.invoiceValue = $event" />
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

    <div v-if="!readonly" class="flex flex-wrap items-center gap-2">
      <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-chars-add @click="add">
        <PhPlus :size="14" aria-hidden="true" />{{ tc('add') }}
      </ZButton>
      <ZButton v-if="rows.length" variant="ghost" size="sm" class="max-sm:h-11" data-chars-copy-last @click="copyLast">
        <PhCopy :size="14" aria-hidden="true" />{{ tc('copyLast') }}
      </ZButton>
    </div>

    <div v-if="rows.length > 1 || qtyWarning || valueWarning || measureWarnings.length" class="flex flex-col gap-1 text-[13px]" data-chars-totals>
      <span v-if="rows.length > 1" class="text-ink-2">
        {{ tc('totals', { n: rows.length, quantity: totals.quantity == null ? '—' : num(totals.quantity), value: totals.value == null ? '—' : num(totals.value) }) }}
      </span>
      <span v-if="qtyWarning" class="text-gold-ink" role="status" data-chars-qty-warning>{{ qtyWarning }}</span>
      <span v-if="valueWarning" class="text-gold-ink" role="status" data-chars-value-warning>{{ valueWarning }}</span>
      <span v-for="w in measureWarnings" :key="w" class="text-gold-ink" role="status" data-chars-measure-warning>{{ w }}</span>
    </div>

    <div v-if="preview" class="flex min-w-0 flex-col gap-1" data-gr31-preview>
      <span class="text-sm font-medium text-ink-2">{{ tc('preview') }}</span>
      <p class="m-0 rounded-field bg-sunken px-3 py-2 text-[13px] break-words whitespace-pre-line text-ink">{{ preview }}</p>
    </div>
  </div>
</template>
