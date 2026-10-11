<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhWarningCircle } from '@phosphor-icons/vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { Import40PaymentGoodsRowDto } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'
import { formatNumberIn } from '@/ui/number'
import { formatTnved } from '@/utils/tnvedFormat'
import { TEMP_IMPORT_CODES } from '../goods/editor/payments'
import { formatMoney } from '../goods/goodsList'
import { goodsPaymentsStale } from '../goods/goodsStatus'
import { isMedical, previewLines, savedLines, type PaymentLine } from './paymentsView'
import { useModeLabel } from './useModeLabel'

// Карточка товара в «Платежах» (доска DtPayments): №, код, описание, «Медизделие — НДС 5%», строки гр. 47 (вид, основа,
// ставка, сумма, СП). Во время предпросмотра — строки, какими их запишет «Записать» (виды из расчёта помечены «расчёт,
// не записан»); ошибка расчёта и примечания сервера — внизу, со ссылкой «Открыть товар». Суммы — только с сервера.
// Переключатель «Медизделие» не пишет в товар сам: событие medical — страница правит товар через setField модели
// товаров («Пересчитать», сброс предпросмотра). tabindex="-1" — переход «До подачи» к гр. 47 ставит фокус на карточку.
const props = defineProps<{
  item: Import40GoodsItemInput
  /** Позиция товара (с 0). */
  index: number
  /** Строка расчёта товара — только живой предпросмотр. */
  calc: Import40PaymentGoodsRowDto | null
  /** Расчёт товар не пересчитал (в предпросмотре). */
  notRecalculated: boolean
  readonly: boolean
}>()
const emit = defineEmits<{ medical: [checked: boolean]; open: [] }>()
const { t, locale } = useI18n()
const tc = (key: string, p?: Record<string, unknown>) => t(`broker.dt.payments.card.${key}`, p ?? {})
const modeLabel = useModeLabel()

const lines = computed<PaymentLine[]>(() => (props.calc ? previewLines(props.item, props.calc) : savedLines(props.item.payments)))
const preview = computed(() => !!props.calc)
const stale = computed(() => !preview.value && goodsPaymentsStale(props.item) && !!props.item.payments?.length)
const error = computed(() => props.calc?.error?.trim() || null)
const notes = computed(() => (props.calc && !props.calc.error ? props.calc.notes?.trim() || null : null))
const medical = computed(() => isMedical(props.item))
const months = computed(() => props.item.tempImportMonths || null)
const code = computed(() => (props.item.tnvedCode ? formatTnved(props.item.tnvedCode) : null))
const description = computed(() => props.item.description?.trim() || props.item.tnvedDescription?.trim() || '')
const state = computed(() => (error.value ? 'error' : props.notRecalculated ? 'not-recalculated' : notes.value ? 'note' : stale.value ? 'stale' : lines.value.length ? 'ok' : 'empty'))

const money = (v: number | null) => (v == null ? '—' : formatMoney(v, locale.value))
const exact = (v: number) => formatNumberIn(locale.value, v, 6)
const baseText = (l: PaymentLine) => l.basisLabel ?? money(l.base)
const rateText = (l: PaymentLine) => {
  const label = l.rateLabel
  const text = label ?? (l.rate == null ? '—' : `${exact(l.rate)}${l.rateKind === '%' ? '%' : ''}`)
  // rateLabel сервера — номинальная ставка; при временном ввозе пошлина и НДС уже умножены на 3% × мес.
  return label && months.value && l.code && TEMP_IMPORT_CODES.has(l.code)
    ? t('broker.dt.goods.editor.payments.rateTemp', { label, months: months.value })
    : text
}

const grid = '@2xl:grid-cols-[3.5rem_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_2.5rem]'
const cellLabel = 'text-xs text-muted @2xl:hidden'
const cell = 'flex min-w-0 flex-col gap-0.5'
</script>

<template>
  <article
    class="@container min-w-0 overflow-hidden rounded-row border border-line bg-surface outline-hidden focus-visible:shadow-focus"
    tabindex="-1"
    data-payments-goods
    :data-goods-index="index"
    :data-state="state"
  >
    <header class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-sunken px-4 py-2.5">
      <span class="font-mono text-[13px] text-muted tabular-nums">{{ index + 1 }}</span>
      <span class="font-mono text-[13px] font-semibold whitespace-nowrap text-ink" data-payments-goods-code>{{ code ?? '—' }}</span>
      <span class="min-w-0 flex-1 truncate text-[13px] text-ink-2 max-sm:basis-full" :title="description">{{ description }}</span>
      <ZTag v-if="stale" tone="accent" size="sm" data-payments-goods-stale>{{ tc('stale') }}</ZTag>
      <span data-goods-field="vatRatePreferential">
        <ZSwitch
          :checked="medical"
          :disabled="readonly"
          size="sm"
          class="text-[13px] text-ink-2 max-sm:min-h-11"
          data-payments-medical
          @update:checked="emit('medical', $event)"
        >{{ tc('medical') }}</ZSwitch>
      </span>
    </header>

    <div data-graph="47" data-goods-field="payments">
      <p v-if="!lines.length" class="m-0 px-4 py-2.5 text-[13px] text-muted" data-payments-goods-empty>{{ tc('noRows') }}</p>
      <div v-else role="table" :aria-label="tc('rowsLabel', { n: index + 1 })" class="flex flex-col">
        <div role="row" :class="['hidden gap-3 border-b border-line px-4 py-1.5 text-xs text-muted @2xl:grid', grid]">
          <span role="columnheader">{{ tc('col.mode') }}</span>
          <span role="columnheader">{{ tc('col.label') }}</span>
          <span role="columnheader" class="text-right">{{ tc('col.base') }}</span>
          <span role="columnheader" class="text-right">{{ tc('col.rate') }}</span>
          <span role="columnheader" class="text-right">{{ tc('col.amount') }}</span>
          <span role="columnheader">{{ tc('col.feature') }}</span>
        </div>
        <div
          v-for="(l, i) in lines"
          :key="`${l.code ?? ''}#${i}`"
          role="row"
          :class="['grid grid-cols-2 gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-[13px] text-ink last:border-b-0', grid]"
          :data-payments-line="l.code ?? ''"
          :data-fresh="l.fresh ? '' : undefined"
        >
          <span role="cell" class="col-span-2 flex min-w-0 items-baseline gap-2 @2xl:col-span-1">
            <span class="font-mono text-ink-2">{{ l.code || '—' }}</span>
            <span class="min-w-0 truncate text-ink @2xl:hidden">{{ modeLabel(l.code) }}</span>
          </span>
          <span role="cell" class="hidden min-w-0 truncate @2xl:block" :title="modeLabel(l.code)">{{ modeLabel(l.code) }}</span>
          <span role="cell" :class="[cell, '@2xl:text-right']">
            <span :class="cellLabel">{{ tc('col.base') }}</span><span class="tabular-nums">{{ baseText(l) }}</span>
          </span>
          <span role="cell" :class="[cell, '@2xl:text-right']">
            <span :class="cellLabel">{{ tc('col.rate') }}</span><span class="tabular-nums">{{ rateText(l) }}</span>
          </span>
          <span role="cell" :class="[cell, '@2xl:text-right']" data-payments-line-amount>
            <span :class="cellLabel">{{ tc('col.amount') }}</span>
            <span class="font-semibold whitespace-nowrap tabular-nums">{{ money(l.amount) }}</span>
            <span v-if="l.fresh" class="text-xs text-zircon-ink" data-payments-unsaved>{{ tc('unsaved') }}</span>
          </span>
          <span role="cell" :class="cell">
            <span :class="cellLabel">{{ tc('col.feature') }}</span><span class="font-mono text-ink-2">{{ l.feature || '—' }}</span>
          </span>
        </div>
      </div>
    </div>

    <footer
      v-if="error || notes || notRecalculated"
      :class="[
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-[13px]',
        error ? 'bg-tone-danger-bg text-danger' : 'text-ink-2',
      ]"
      data-payments-goods-issue
    >
      <PhWarningCircle v-if="error" :size="16" class="shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <template v-if="error">{{ tc('error', { error }) }}</template>
        <template v-else-if="notRecalculated">{{ tc('notRecalculated') }}</template>
        <template v-else>{{ notes }}</template>
      </span>
      <button
        type="button"
        class="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-1 font-sans text-[13px] font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
        data-payments-open-goods
        @click="emit('open')"
      >{{ tc('openGoods') }}<PhArrowRight :size="14" aria-hidden="true" /></button>
    </footer>
  </article>
</template>
