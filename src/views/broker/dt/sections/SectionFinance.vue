<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator, PhDotsThree } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import { useConfirm } from '@/ui/confirm'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions, withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'
import ExpensesTable from './ExpensesTable.vue'

// Условия и стоимость: гр. 20 (Инкотермс и место), 22 (валюта и фактурная стоимость), 23 (курс), 12 (общая таможенная
// стоимость — только чтение), 24 (характер сделки, форма расчётов), «Место для ДТС», расходы и пересчёт гр. 45.
// Инкотермс, характер и форма расчётов — выбор из классификаторов без свободного ввода (значение вне списка видно с
// предупреждением). Курс гр. 23 не правится молча: расхождение с курсом НБ РК на дату гр. А подсвечено, «Подставить» —
// по клику. Гр. 12: пока есть несохранённые правки — предпросмотр, после сохранения — значение сервера (с пометкой).
// Тип ставок (ЕТТ/ВТО) — не графа, а служебный признак: тегом; меняет его разделение ДТ, администратор — в «Ещё»,
// с подтверждением. Результат пересчёта гр. 45 показан в самом разделе (recalc), а не только тостом.
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  /** Гр. 12: итог и откуда он — сервер (после сохранения) или предпросмотр. */
  customsValue: number
  customsValueFromServer: boolean
  currencyOptions: ZOption[]
  currencyRates?: Record<string, { rate: number; date: string }>
  expenseTypeOptions: ZOption[]
  expenseDistributionByCode?: Record<string, 'GrossWeight' | 'CustomsValue'>
  expenseDeductionByCode?: Record<string, boolean>
  /** Итог последнего «Рассчитать там. стоимость» (по товарам); null — не считали. */
  recalc?: { updated: number; total: number } | null
  recalcLoading?: boolean
  /** Администратор: может сменить тип ставок вручную (в «Ещё», с подтверждением). */
  canChangeRateType?: boolean
}>()
const emit = defineEmits<{ 'calc-customs-value': [] }>()
const { t, locale } = useI18n()
const classifiers = useClassifiersStore()
const { confirm } = useConfirm()
const tf = (key: string, p?: Record<string, unknown>) => t(`broker.dt.finance.${key}`, p ?? {})

const optionsOf = (code: string): ZOption[] => dedupeOptions(classifiers.options(code))
const incoterms = computed(() => withCurrent(optionsOf('incoterms'), props.form.incoterms))
const nature = computed(() => withCurrent(optionsOf('transaction-natures'), props.form.transactionNatureCode))
const feature = computed(() => withCurrent(optionsOf('settlement-terms'), props.form.transactionFeatureCode))
const currency = computed(() => withCurrent(props.currencyOptions, props.form.currency))
const warn = (unknown: boolean, value: string | null | undefined) =>
  unknown ? { validateStatus: 'warning' as const, help: t('broker.dt.general.notInList', { value: value ?? '' }) } : {}

const str = (v: unknown): string => (v == null ? '' : String(v))
const dealRate = computed(() => props.currencyRates?.[props.form.currency ?? ''] ?? null)
const rateMismatch = computed(() => !!dealRate.value && props.form.exchangeRate != null && Number(props.form.exchangeRate) !== dealRate.value.rate)
const fmtRate = (n: number) => formatNumberIn(locale.value, n, 4)
const fmtMoney = (n: number) => `${formatNumberIn(locale.value, n, 2, 2)} ₸`

// Выбор валюты — гр. 23 встаёт на курс НБ РК (как раньше); очистка курс не трогает.
const onCurrency = (v: unknown) => {
  props.form.currency = str(v)
  const info = v ? props.currencyRates?.[str(v)] : null
  if (info) props.form.exchangeRate = info.rate
}
const applyRate = () => { if (dealRate.value) props.form.exchangeRate = dealRate.value.rate }

// Тип ставок: ЕТТ — обычный; EATT — ВТО. Прочее значение показывается как есть.
const rateKind = computed(() => {
  const v = (props.form.rateType ?? '').toUpperCase()
  if (v === 'EATT') return 'vto'
  if (v === 'ETT' || !v) return 'ett'
  return 'other'
})
const rateTag = computed(() => (rateKind.value === 'other' ? String(props.form.rateType) : tf(rateKind.value === 'vto' ? 'rateVto' : 'rateEtt')))
const rateMenu = computed<ZDropdownItem[]>(() => (props.canChangeRateType && !props.readonly
  ? [{ key: 'switch', label: tf(rateKind.value === 'vto' ? 'rateChangeToEtt' : 'rateChangeToVto') }]
  : []))
const onRateMenu = async () => {
  const toVto = rateKind.value !== 'vto'
  const ok = await confirm({
    title: tf('rateConfirmTitle'),
    content: tf('rateConfirmText', { to: tf(toVto ? 'rateVto' : 'rateEtt') }),
    okText: tf('rateConfirmOk'),
    cancelText: t('common.cancel'),
    danger: true,
  })
  if (ok) props.form.rateType = toVto ? 'EATT' : 'ETT'
}

// Результат пересчёта гр. 45 устаревает, когда правят то, от чего он зависит.
const stale = ref(false)
watch(() => props.recalc, () => { stale.value = false })
watch(
  () => [props.form.exchangeRate, props.form.currency, props.form.totalInvoiceValue, JSON.stringify(props.form.expenses ?? [])],
  () => { if (props.recalc) stale.value = true },
)

const h2 = 'm-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink'
const graphTag = 'font-mono text-xs font-normal text-muted'
const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3'
</script>

<template>
  <section class="@container flex flex-col gap-6" data-dt-finance>
    <div class="flex flex-col gap-4" data-finance-terms>
      <h2 :class="h2">
        {{ tf('termsTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '20, 22, 23, 12' }) }}</span>
      </h2>
      <div :class="grid">
        <ZField graph="20" data-graph="20" v-bind="warn(incoterms.unknown, form.incoterms)">
          <template #label>{{ tf('incoterms') }}<DtGraphHelp graph="20" /></template>
          <ZSelect :value="form.incoterms || null" :options="incoterms.options" show-search allow-clear :disabled="readonly" :placeholder="tf('incotermsPlaceholder')" popup-width="360px" @update:value="form.incoterms = str($event)" />
        </ZField>
        <ZField graph="20" :label="tf('incotermsPlace')">
          <ZInput v-uppercase :value="form.incotermsPlace" :disabled="readonly" :placeholder="tf('incotermsPlacePlaceholder')" data-incoterms-place @update:value="form.incotermsPlace = $event" />
        </ZField>
        <ZField graph="22" data-graph="22" v-bind="warn(currency.unknown, form.currency)">
          <template #label>{{ tf('currency') }}<DtGraphHelp graph="22" /></template>
          <ZSelect :value="form.currency || null" :options="currency.options" show-search allow-clear :disabled="readonly" :placeholder="tf('currencyPlaceholder')" popup-width="320px" @update:value="onCurrency" />
        </ZField>

        <ZField graph="22" :extra="tf('totalInvoiceAuto')">
          <template #label>{{ tf('totalInvoice') }}</template>
          <ZNumber :value="form.totalInvoiceValue" :min="0" :precision="2" :disabled="readonly" data-total-invoice @update:value="form.totalInvoiceValue = $event" />
        </ZField>
        <ZField graph="23" data-graph="23">
          <template #label>{{ tf('rate') }}<DtGraphHelp graph="23" /></template>
          <ZNumber :value="form.exchangeRate" :min="0" :disabled="readonly" data-exchange-rate @update:value="form.exchangeRate = $event" />
          <template v-if="dealRate" #extra>
            <span :class="rateMismatch ? 'text-danger' : ''" data-rate-hint>
              {{ dealRate.date ? tf('rateHint', { date: formatDateText(dealRate.date), rate: fmtRate(dealRate.rate) }) : tf('rateHintNoDate', { rate: fmtRate(dealRate.rate) }) }}
              <template v-if="rateMismatch"> — {{ tf('rateMismatch') }}</template>
            </span>
            <button
              v-if="rateMismatch && !readonly"
              type="button"
              class="ml-1.5 inline-flex min-h-6 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-xs font-semibold text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              data-rate-apply
              @click="applyRate"
            >{{ tf('apply') }}</button>
          </template>
        </ZField>
        <ZField graph="12" data-graph="12" :extra="tf('customsValueNote')">
          <template #label>{{ tf('customsValue') }}<DtGraphHelp graph="12" /></template>
          <ZInput :value="fmtMoney(customsValue)" readonly mono class="bg-sunken" data-customs-value :data-source="customsValueFromServer ? 'server' : 'preview'">
            <template #suffix>
              <ZTag :tone="customsValueFromServer ? 'done' : 'wait'" size="sm" data-customs-value-tag>{{ tf(customsValueFromServer ? 'customsValueServer' : 'customsValuePreview') }}</ZTag>
            </template>
          </ZInput>
        </ZField>
      </div>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-finance-deal>
      <h2 :class="h2">
        {{ tf('dealTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '24' }) }}</span>
        <DtGraphHelp graph="24" />
      </h2>
      <div :class="grid">
        <ZField graph="24" data-graph="24" :label="tf('nature')" v-bind="warn(nature.unknown, form.transactionNatureCode)">
          <ZSelect :value="form.transactionNatureCode || null" :options="nature.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" popup-width="360px" @update:value="form.transactionNatureCode = str($event)" />
        </ZField>
        <ZField graph="24" :label="tf('settlement')" v-bind="warn(feature.unknown, form.transactionFeatureCode)">
          <ZSelect :value="form.transactionFeatureCode || null" :options="feature.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" popup-width="360px" @update:value="form.transactionFeatureCode = str($event)" />
        </ZField>
        <div class="flex flex-col gap-1.5" data-rate-type>
          <span class="text-[13px] font-medium text-ink-2">{{ tf('rateType') }}</span>
          <div class="flex min-h-9 flex-wrap items-center gap-2">
            <ZTag :tone="rateKind === 'vto' ? 'accent' : 'info'" data-rate-type-tag>{{ rateTag }}</ZTag>
            <ZDropdown v-if="rateMenu.length" :items="rateMenu" @select="onRateMenu">
              <ZButton variant="ghost" class="max-sm:h-11" data-rate-type-more><PhDotsThree :size="18" weight="bold" aria-hidden="true" />{{ tf('rateMore') }}</ZButton>
            </ZDropdown>
          </div>
          <span class="text-xs text-muted">{{ tf('rateTypeNote') }}</span>
        </div>
      </div>
      <!-- «Место для ДТС» живёт здесь (в 6в переедет в раздел ДТС); к самой ДТ не относится — пометка «для ДТС». -->
      <ZField class="max-w-md" :extra="tf('dtsPlaceHint')">
        <template #label>{{ tf('dtsPlace') }} <ZTag tone="info" size="sm" class="ml-1.5 align-middle" data-dts-tag>{{ tf('dtsTag') }}</ZTag></template>
        <ZInput v-uppercase :value="form.dtsPlaceName" :disabled="readonly" :placeholder="form.incotermsPlace || tf('dtsPlacePlaceholder')" data-dts-place @update:value="form.dtsPlaceName = $event" />
      </ZField>
    </div>

    <div class="flex flex-col gap-4 border-t border-line pt-5" data-finance-expenses>
      <h2 :class="h2">{{ tf('expensesTitle') }}</h2>
      <ExpensesTable
        :form="form"
        :readonly="readonly"
        :type-options="expenseTypeOptions"
        :currency-options="currencyOptions"
        :distribution-by-code="expenseDistributionByCode"
        :deduction-by-code="expenseDeductionByCode"
      />
      <div v-if="!readonly" class="flex flex-col items-start gap-2" data-finance-calc>
        <ZButton class="max-sm:h-11" :loading="recalcLoading" data-calc-customs-value @click="emit('calc-customs-value')">
          <PhCalculator :size="16" aria-hidden="true" />{{ tf('calc') }}
        </ZButton>
        <p class="m-0 text-xs text-muted">{{ tf('calcHint') }}</p>
      </div>
      <p
        v-if="recalc"
        :class="['m-0 rounded-row px-3 py-2.5 text-sm', stale ? 'bg-sunken text-ink-2' : 'bg-tone-done-bg text-tone-done-fg']"
        role="status"
        data-recalc-result
        :data-stale="stale || undefined"
      >
        {{ tf('recalcDone', { n: recalc.updated, total: fmtMoney(recalc.total) }) }}
        <template v-if="stale"> {{ tf('recalcStale') }}</template>
      </p>
    </div>
  </section>
</template>
