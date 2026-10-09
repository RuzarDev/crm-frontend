<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhPencilSimple, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'
import { cn } from '@/ui/cn'
import type { ZOption, ZOptionValue } from '@/ui/options'
import type { Import40GoodsPayment } from '@/types/api'
import { formatMoney } from '../goodsList'
import { goodsPaymentsStale } from '../goodsStatus'
import { emptyPayment, paymentsTotal, setPaymentField, sortPayments, taxModeLabelKey, TEMP_IMPORT_CODES } from './payments'
import type { GoodsSectionProps } from './types'

// «Платежи» (гр. 47 этого товара). По умолчанию — только чтение: суммы рассчитывает сервер («Рассчитать платежи» /
// «ТПиН по данным экрана» в итогах списка), клиент их не пересчитывает. Порядок 1010 → 2010 → 5060 → прочие; подпись
// вида по коду (2050 — «Антидемпинговая пошлина», P3); основа и ставка — подписи последнего расчёта (basisLabel /
// rateLabel), иначе числа; сумма — в ₸. «Править вручную» — как в прежней карточке: добавить/удалить строку, вид,
// основа, вид ставки, ставка, дата, сумма; для вида ставки «*» — единица, валюта и коэффициент. Правка поля снимает
// устаревшие подписи расчёта (payments.setPaymentField). Ручная правка не ставит «Пересчитать» и уходит в PUT как есть;
// следующий расчёт перезапишет строки тех же видов, а расчётные виды, которых в нём нет, удалит
// (useDtPayments.applyGoodsPaymentRows). Вид ставки, выбранный вручную, расчёт без своего вида не затирает.
// Просмотр — без «Править вручную».
const props = defineProps<GoodsSectionProps>()
const { t, te, locale } = useI18n()
const tp = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.payments.${key}`, p ?? {})

const classifiers = useClassifiersStore()
const editing = ref(false)
const canEdit = computed(() => editing.value && !props.readonly)

const rows = computed(() => sortPayments(props.item.payments))
const stale = computed(() => !!rows.value.length && goodsPaymentsStale(props.item))
const total = computed(() => paymentsTotal(props.item.payments))
const months = computed(() => props.item.tempImportMonths || null)

// Стабильный ключ строки: при смене вида строка переезжает по порядку — поля не путаются.
const rowKeys = new WeakMap<object, number>()
let nextKey = 0
const keyOfRow = (p: Import40GoodsPayment) => {
  let k = rowKeys.get(p)
  if (k == null) rowKeys.set(p, (k = ++nextKey))
  return k
}

const classifierName = (classifier: string, code: string | null | undefined) =>
  (code ? classifiers.cache[classifier]?.find((c) => c.code === code)?.nameRu ?? '' : '')
const modeLabel = (code: string | null | undefined) => {
  const key = taxModeLabelKey(code)
  return key && te(`broker.dt.goods.editor.payments.modes.${key}`) ? tp(`modes.${key}`) : classifierName('tax-modes', code)
}

const num = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v, locale.value))
const exact = (v: number) => formatNumberIn(locale.value, v, 6)
const baseText = (p: Import40GoodsPayment) => p.basisLabel?.trim() || num(p.taxBase)
const rateText = (p: Import40GoodsPayment) => {
  const label = p.rateLabel?.trim() || null
  // Без подписи расчёта — число как есть (специфические ставки бывают 0,004 EUR/кг: не округлять до 0,00).
  const text = label ?? (p.rateValue == null ? '—' : `${exact(p.rateValue)}${p.rateKindCode === '%' ? '%' : ''}`)
  // rateLabel сервера — номинальная ставка; при временном ввозе пошлина и НДС уже умножены на 3% × мес.
  return label && months.value && p.taxModeCode && TEMP_IMPORT_CODES.has(p.taxModeCode)
    ? tp('rateTemp', { label, months: months.value })
    : text
}
const specificText = (p: Import40GoodsPayment) =>
  [p.rateUnitCode, p.rateCurrencyCode, p.weightRatio != null ? `× ${exact(p.weightRatio)}` : null].filter(Boolean).join(' · ')
const money = (v: number | null | undefined) => (v == null ? '—' : `${formatMoney(v, locale.value)} ₸`)

// ---- Ручная правка ----
const withValue = (opts: ZOption[], v: string | null | undefined): ZOption[] =>
  (!v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v }, ...opts])
const taxModeOptions = computed(() => classifiers.options('tax-modes'))
const rateKindOptions = computed(() => classifiers.options('rate-kinds'))
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))
const text = (v: string) => (v.trim() ? v.trim() : null)
const set = <K extends keyof Import40GoodsPayment>(p: Import40GoodsPayment, key: K, v: Import40GoodsPayment[K]) => { setPaymentField(p, key, v) }

const list = (): Import40GoodsPayment[] => {
  const g = props.item
  g.payments ??= []
  return g.payments
}
const add = () => { list().push(emptyPayment()) }
const remove = (p: Import40GoodsPayment) => {
  const arr = list()
  const i = arr.indexOf(p)
  if (i >= 0) arr.splice(i, 1)
}

const grid = '@xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_4.5rem_minmax(0,1.2fr)_5.75rem_minmax(0,1.2fr)_2.75rem]'
const cellLabel = 'text-xs text-muted @xl:hidden'
const field = 'flex min-w-0 flex-col gap-1'
const fieldLabel = 'text-xs text-muted'
const tall = 'max-sm:h-11'
const removeBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11',
)
</script>

<template>
  <div class="flex flex-col gap-3" data-goods-payments-section>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p class="m-0 min-w-0 flex-1 text-xs text-muted" data-payments-hint>{{ canEdit ? tp('manualHint') : tp('serverHint') }}</p>
      <ZTag v-if="months" tone="info" size="sm" data-payments-temp>{{ tp('tempImport', { months }) }}</ZTag>
      <ZButton
        v-if="!readonly"
        variant="ghost"
        size="sm"
        class="max-sm:h-11"
        :aria-pressed="editing"
        data-payments-manual
        @click="editing = !editing"
      >
        <PhCheck v-if="editing" :size="14" aria-hidden="true" />
        <PhPencilSimple v-else :size="14" aria-hidden="true" />
        {{ editing ? tp('done') : tp('manual') }}
      </ZButton>
    </div>

    <p v-if="stale" class="m-0 inline-flex items-center gap-1.5 text-[13px] text-gold-ink" data-payments-stale>
      <span class="size-2 rounded-pill bg-gold" aria-hidden="true" />{{ tp('stale') }}
    </p>

    <div class="flex flex-col gap-2" data-graph="47" data-goods-field="payments" :data-goods-index="index">
      <p v-if="!rows.length" class="m-0 text-[13px] text-muted" data-payments-empty>{{ tp('empty') }}</p>

      <!-- Только чтение: таблица (узко — карточки с подписями). -->
      <div v-else-if="!canEdit" role="table" :aria-label="tp('label')" class="flex flex-col" data-payments-table>
        <div role="row" :class="['hidden gap-3 border-b border-line pb-1.5 text-xs text-muted @xl:grid', grid]">
          <span role="columnheader">{{ tp('col.mode') }}</span>
          <span role="columnheader">{{ tp('col.base') }}</span>
          <span role="columnheader">{{ tp('col.rateKind') }}</span>
          <span role="columnheader">{{ tp('col.rate') }}</span>
          <span role="columnheader">{{ tp('col.date') }}</span>
          <span role="columnheader" class="text-right">{{ tp('col.amount') }}</span>
          <span role="columnheader">{{ tp('col.feature') }}</span>
        </div>
        <div
          v-for="p in rows"
          :key="keyOfRow(p)"
          role="row"
          :class="['grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-line py-2 text-[13px] text-ink last:border-b-0', grid]"
          :data-payment-row="p.taxModeCode ?? ''"
        >
          <span role="cell" class="col-span-2 flex min-w-0 items-baseline gap-2 @xl:col-span-1" data-payment-cell="mode">
            <span class="font-mono font-semibold">{{ p.taxModeCode || '—' }}</span>
            <span class="min-w-0 truncate text-ink-2" :title="modeLabel(p.taxModeCode)">{{ modeLabel(p.taxModeCode) }}</span>
          </span>
          <span role="cell" :class="field" data-payment-cell="base">
            <span :class="cellLabel">{{ tp('col.base') }}</span><span class="tabular-nums">{{ baseText(p) }}</span>
          </span>
          <span role="cell" :class="field" data-payment-cell="rateKind">
            <span :class="cellLabel">{{ tp('col.rateKind') }}</span>
            <span class="font-mono" :title="classifierName('rate-kinds', p.rateKindCode)">{{ p.rateKindCode || '—' }}</span>
          </span>
          <span role="cell" :class="field" data-payment-cell="rate">
            <span :class="cellLabel">{{ tp('col.rate') }}</span>
            <span class="tabular-nums">{{ rateText(p) }}</span>
            <span v-if="p.rateKindCode === '*' && specificText(p)" class="text-xs text-muted" data-payment-specific>{{ specificText(p) }}</span>
          </span>
          <span role="cell" :class="field" data-payment-cell="date">
            <span :class="cellLabel">{{ tp('col.date') }}</span><span class="tabular-nums">{{ formatDateText(p.rateDate) || '—' }}</span>
          </span>
          <span role="cell" :class="[field, '@xl:text-right']" data-payment-cell="amount">
            <span :class="cellLabel">{{ tp('col.amount') }}</span><span class="font-semibold whitespace-nowrap tabular-nums">{{ money(p.amountKzt) }}</span>
          </span>
          <span role="cell" :class="field" data-payment-cell="feature">
            <span :class="cellLabel">{{ tp('col.feature') }}</span><span class="font-mono">{{ p.paymentFeatureCode || '—' }}</span>
          </span>
        </div>
      </div>

      <!-- Ручная правка: строка-карточка на платёж. -->
      <template v-else>
        <div v-for="p in rows" :key="keyOfRow(p)" class="flex flex-col gap-2 rounded-row border border-line p-2" :data-payment-row="p.taxModeCode ?? ''">
          <div class="grid grid-cols-2 gap-2 @xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div :class="[field, 'col-span-2 @xl:col-span-1']">
              <span :class="fieldLabel">{{ tp('col.mode') }}</span>
              <ZSelect
                :value="p.taxModeCode || null"
                :options="withValue(taxModeOptions, p.taxModeCode)"
                show-search
                allow-clear
                placeholder="2010"
                :aria-label="tp('col.mode')"
                popup-width="320px"
                :class="tall"
                data-f="payment-mode"
                @update:value="set(p, 'taxModeCode', str($event))"
              />
            </div>
            <div :class="field">
              <span :class="fieldLabel">{{ tp('col.base') }}</span>
              <ZNumber :value="p.taxBase" placeholder="—" :aria-label="tp('col.base')" :class="tall" data-f="payment-base" @update:value="set(p, 'taxBase', $event)" />
            </div>
            <div :class="field">
              <span :class="fieldLabel">{{ tp('col.rateKind') }}</span>
              <ZSelect
                :value="p.rateKindCode || null"
                :options="withValue(rateKindOptions, p.rateKindCode)"
                allow-clear
                :placeholder="tp('auto')"
                :aria-label="tp('col.rateKind')"
                popup-width="260px"
                :class="tall"
                data-f="payment-rate-kind"
                @update:value="set(p, 'rateKindCode', str($event))"
              />
            </div>
            <div :class="field">
              <span :class="fieldLabel">{{ tp('col.rate') }}</span>
              <ZNumber :value="p.rateValue" placeholder="—" :aria-label="tp('col.rate')" :class="tall" data-f="payment-rate" @update:value="set(p, 'rateValue', $event)" />
            </div>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <div :class="[field, 'w-40']">
              <span :class="fieldLabel">{{ tp('col.date') }}</span>
              <ZDate :value="p.rateDate" allow-clear :placeholder="tp('auto')" :aria-label="tp('col.date')" :class="tall" data-f="payment-date" @update:value="set(p, 'rateDate', $event)" />
            </div>
            <div :class="[field, 'w-40']">
              <span :class="fieldLabel">{{ tp('col.amount') }}</span>
              <ZNumber :value="p.amountKzt" placeholder="—" :aria-label="tp('col.amount')" :class="tall" data-f="payment-amount" @update:value="set(p, 'amountKzt', $event)" />
            </div>
            <span :class="[field, 'w-12']">
              <span :class="fieldLabel">{{ tp('col.feature') }}</span>
              <span class="flex h-9 items-center font-mono text-[13px] text-ink-2">{{ p.paymentFeatureCode || '—' }}</span>
            </span>
            <button type="button" :class="[removeBtn, 'ml-auto']" :aria-label="tp('remove')" :title="tp('remove')" data-payment-remove @click="remove(p)">
              <PhX :size="16" aria-hidden="true" />
            </button>
          </div>
          <!-- Специфическая ставка (*): единица, валюта, коэффициент. Единица и валюта — не длиннее 8 (колонки БД
               RateUnitCode / RateCurrencyCode): длиннее — PUT всей ДТ падал бы. -->
          <div v-if="p.rateKindCode === '*'" class="flex flex-wrap items-end gap-2" data-payment-specific>
            <span class="w-full text-xs text-muted">{{ tp('specific') }}</span>
            <div :class="[field, 'w-32']">
              <span :class="fieldLabel">{{ tp('unit') }}</span>
              <ZInput :value="p.rateUnitCode ?? ''" mono :maxlength="8" placeholder="166" :aria-label="tp('unit')" :class="tall" data-f="payment-unit" @update:value="set(p, 'rateUnitCode', text($event))" />
            </div>
            <div :class="[field, 'w-32']">
              <span :class="fieldLabel">{{ tp('currency') }}</span>
              <ZInput :value="p.rateCurrencyCode ?? ''" mono :maxlength="8" placeholder="978" :aria-label="tp('currency')" :class="tall" data-f="payment-currency" @update:value="set(p, 'rateCurrencyCode', text($event))" />
            </div>
            <div :class="[field, 'w-32']">
              <span :class="fieldLabel">{{ tp('ratio') }}</span>
              <ZNumber :value="p.weightRatio" placeholder="1" :aria-label="tp('ratio')" :class="tall" data-f="payment-ratio" @update:value="set(p, 'weightRatio', $event)" />
            </div>
          </div>
        </div>
      </template>

      <div v-if="canEdit">
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-payment-add @click="add">
          <PhPlus :size="14" aria-hidden="true" />{{ tp('add') }}
        </ZButton>
      </div>

      <div v-if="total != null" class="flex items-baseline justify-end gap-3 pt-1 text-[13px]" data-payments-total>
        <span class="text-muted">{{ tp('total') }}</span>
        <span class="font-semibold whitespace-nowrap text-ink tabular-nums">{{ money(total) }}</span>
      </div>
    </div>
  </div>
</template>
