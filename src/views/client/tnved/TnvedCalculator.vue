<script setup lang="ts">
import { computed, reactive, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileText, PhInfo } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { tnvedApi } from '@/api/tnved'
import { byCurrencyRank, currencyName, loadCurrencies, POPULAR_CURRENCIES } from '@/views/client/tnved/currency'
import { referencesApi } from '@/api/references'
import type { RefCodeItem, TnvedCalculateRequest, TnvedCalculateResult, TnvedCurrencyDto } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'
import { phoneField, phoneSelect } from '@/views/client/wizard/wizardUi'
import { isRateLimited, VAT_RATE } from './tnved'

// Калькулятор платежей клиента (доска Tools): стоимость, валюта, страна происхождения, вес → пошлина, сбор,
// акциз, НДС и итог в тенге. Расчёт предварительный: точную сумму считает декларант по документам.
// Поля живут дольше кода: выбрали другой код — стоимость и валюта остаются, прежний результат сбрасывается.
const props = defineProps<{ code: string }>()
const emit = defineEmits<{ result: [r: TnvedCalculateResult | null] }>()

const { t, locale } = useI18n()
const uid = useId()
const headingId = `tnved-calc-${uid}`

const form = reactive<{ value: number | null; currency: string; country: string | null; weight: number | null }>({
  value: null, currency: 'USD', country: null, weight: null,
})

// ---- Валюты (курсы НБ РК на сервере, общий кэш с «Курсами валют»). Не загрузились — частые валюты:
// сервер посчитает по своему курсу ----
const currencies = shallowRef<TnvedCurrencyDto[]>([])
const currenciesLoading = ref(true)
loadCurrencies()
  .then((list) => { currencies.value = list })
  .catch(() => { currencies.value = [] })
  .finally(() => { currenciesLoading.value = false })

const currencyOptions = computed<ZOption[]>(() => {
  const list = currencies.value.length
    ? currencies.value.map((c) => ({ code: c.codeLat, name: c.name }))
    : POPULAR_CURRENCIES.map((code) => ({ code, name: '' }))
  return [...list]
    .sort((a, b) => byCurrencyRank(a.code, b.code))
    .map(({ code, name }) => {
      const label = currencyName(code, name, locale.value)
      return { value: code, label: label ? `${code} — ${label}` : code }
    })
})
const currency = computed<ZOptionValue | null>({
  get: () => form.currency,
  set: (v) => { form.currency = v === null || v === undefined ? 'USD' : String(v) },
})

// ---- Страны (цифровой ОКСМ — его ждёт калькулятор: ставки ЗСТ и антидемпинг из КЕДЕН) ----
const countries = shallowRef<RefCodeItem[]>([])
const countriesLoading = ref(true)
referencesApi.listCountries({ silent: true })
  .then((list) => { countries.value = Array.isArray(list) ? list : [] })
  .catch(() => { countries.value = [] })
  .finally(() => { countriesLoading.value = false })
const countryOptions = computed<ZOption[]>(() =>
  countries.value
    .filter((c) => c.isActive !== false)
    .map((c) => ({ value: c.code, label: c.name, alpha2: c.alpha2 ?? '' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
)
const filterCountry = (input: string, o: ZOption) => {
  const q = input.trim().toLocaleLowerCase('ru')
  return `${o.label} ${String(o.alpha2 ?? '')}`.toLocaleLowerCase('ru').includes(q)
}
const country = computed<ZOptionValue | null>({
  get: () => form.country,
  set: (v) => { form.country = v === null || v === undefined || v === '' ? null : String(v) },
})

// ---- Расчёт ----
const submitted = ref(false)
const hasValue = computed(() => form.value !== null && form.value > 0)
const valueError = computed(() => (submitted.value && !hasValue.value ? t('client.tnved.calc.valueRequired') : undefined))
const loading = ref(false)
const error = ref<'limit' | 'error' | null>(null)
const result = shallowRef<TnvedCalculateResult | null>(null)
const paramsKey = () => JSON.stringify([props.code, form.value, form.currency, form.country, form.weight])
const resultKey = ref('')
// Поля поменяли после расчёта — сумма уже не про них: приглушаем и просим пересчитать.
const stale = computed(() => !!result.value && resultKey.value !== paramsKey())
let seq = 0

const request = (): TnvedCalculateRequest => ({
  code: props.code,
  customsValue: form.value ?? 0,
  currencyCode: form.currency,
  weightKg: form.weight !== null && form.weight > 0 ? form.weight : undefined,
  originCountry: form.country ?? undefined,
})

const calculate = async () => {
  submitted.value = true
  if (!hasValue.value) return
  const my = ++seq
  const key = paramsKey()
  loading.value = true
  error.value = null
  try {
    const { data } = await tnvedApi.calculate(request(), { silent: true })
    if (my !== seq) return
    result.value = data
    resultKey.value = key
    emit('result', data)
  } catch (e) {
    if (my !== seq) return
    error.value = isRateLimited(e) ? 'limit' : 'error'
  } finally {
    if (my === seq) loading.value = false
  }
}

// Другой код — прежний расчёт не про него.
watch(() => props.code, () => {
  seq += 1
  loading.value = false
  error.value = null
  result.value = null
  resultKey.value = ''
  submitted.value = false
  emit('result', null)
})

const positive = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0
const measures = computed(() => {
  const seen = new Set<string>()
  return (result.value?.nonTariffMeasures ?? []).filter((m) => {
    const k = `${m.name}|${m.comment ?? ''}`
    if (!m.name || seen.has(k)) return false
    seen.add(k)
    return true
  })
})
// Пояснения сервера — одним абзацем: «; » внутри — часть фразы (перечисления, оговорки), а не разделитель пунктов.
const notes = computed(() => (result.value?.notes ?? '').trim())
// Для скринридера — только короткий итог, а не вся таблица расчёта при каждом изменении.
const liveTotal = computed(() =>
  result.value && !loading.value && !stale.value ? t('client.tnved.calc.liveTotal', { total: formatMoney(result.value.totalKzt) }) : '')

const dt = 'text-ink-2'
const dd = 'm-0 text-right tabular-nums text-ink'
</script>

<template>
  <section :aria-labelledby="headingId" class="@container flex flex-col gap-4" data-tnved-calc>
    <h3 :id="headingId" class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t('client.tnved.calc.title') }}</h3>

    <form class="flex flex-col gap-3" novalidate @submit.prevent="calculate">
      <div class="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-4">
        <ZField :label="t('client.tnved.calc.value')" :error="valueError">
          <ZNumber
            v-model:value="form.value"
            :min="0"
            :precision="2"
            inputmode="decimal"
            placeholder="0.00"
            :class="[phoneField, 'tabular-nums']"
            data-calc-value
          />
        </ZField>
        <ZField :label="t('client.tnved.calc.currency')">
          <ZSelect
            v-model:value="currency"
            :options="currencyOptions"
            show-search
            :loading="currenciesLoading"
            :popup-width="260"
            :class="phoneSelect"
            data-calc-currency
          />
        </ZField>
        <ZField :label="t('client.tnved.calc.country')">
          <ZSelect
            v-model:value="country"
            :options="countryOptions"
            show-search
            allow-clear
            :filter-option="filterCountry"
            :loading="countriesLoading"
            :placeholder="t('client.tnved.calc.optional')"
            :popup-width="260"
            :class="phoneSelect"
            data-calc-country
          />
        </ZField>
        <ZField :label="t('client.tnved.calc.weight')">
          <ZNumber
            v-model:value="form.weight"
            :min="0"
            :precision="3"
            inputmode="decimal"
            :placeholder="t('client.tnved.calc.optional')"
            :class="[phoneField, 'tabular-nums']"
            data-calc-weight
          />
        </ZField>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <ZButton html-type="submit" :loading="loading" class="h-10 rounded-row px-4 text-[14.5px] max-sm:h-11 max-sm:w-full" data-calc-submit>
          {{ t('client.tnved.calc.submit') }}
        </ZButton>
        <p v-if="!result && !loading && !error" class="m-0 min-w-0 flex-1 text-sm text-ink-3 max-sm:basis-full">{{ t('client.tnved.calc.hint') }}</p>
      </div>
    </form>

    <p class="sr-only" role="status" data-calc-live>{{ liveTotal }}</p>

    <div class="flex flex-col gap-3">
      <p v-if="error" role="alert" class="m-0 rounded-row bg-tone-danger-bg px-4 py-3 text-sm text-tone-danger-fg" data-calc-error>
        {{ error === 'limit' ? t('client.tnved.limit') : t('client.tnved.calc.error') }}
      </p>

      <div v-if="loading && !result" class="flex flex-col gap-3 rounded-row bg-canvas px-[18px] py-4" aria-busy="true" data-calc-skeleton>
        <div v-for="i in 4" :key="i" class="flex items-center justify-between gap-6">
          <ZSkeleton width="46%" height="14px" />
          <ZSkeleton width="84px" height="14px" />
        </div>
      </div>

      <template v-else-if="result">
        <p v-if="stale" class="m-0 text-sm text-gold-ink" data-calc-stale>{{ t('client.tnved.calc.stale') }}</p>
        <dl
          :class="cn(
            'm-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-row bg-canvas px-[18px] py-4 text-[14.5px] leading-[22px]',
            'transition-opacity duration-150 ease-out motion-reduce:transition-none',
            (stale || loading) && 'opacity-55',
          )"
          data-calc-result
        >
          <dt :class="dt">{{ t('client.tnved.calc.customsValue') }}</dt>
          <dd :class="dd" data-calc-row="customsValue">{{ formatMoney(result.customsValueKzt) }}</dd>
          <dt :class="dt">{{ result.rateStr ? t('client.tnved.calc.duty', { rate: result.rateStr }) : t('client.tnved.calc.dutyPlain') }}</dt>
          <dd :class="dd" data-calc-row="duty">{{ formatMoney(result.importDutyKzt) }}</dd>
          <template v-if="positive(result.antiDumpingKzt)">
            <dt :class="dt">{{ t('client.tnved.calc.antiDumping') }}</dt>
            <dd :class="dd" data-calc-row="antiDumping">{{ formatMoney(result.antiDumpingKzt) }}</dd>
          </template>
          <dt :class="dt">{{ t('client.tnved.calc.fee') }}</dt>
          <dd :class="dd" data-calc-row="fee">{{ formatMoney(result.customsFeeKzt) }}</dd>
          <template v-if="positive(result.exciseKzt)">
            <dt :class="dt">{{ t('client.tnved.calc.excise') }}</dt>
            <dd :class="dd" data-calc-row="excise">{{ formatMoney(result.exciseKzt) }}</dd>
          </template>
          <dt :class="dt">{{ t('client.tnved.calc.vat', { rate: VAT_RATE }) }}</dt>
          <dd :class="dd" data-calc-row="vat">{{ formatMoney(result.vatKzt) }}</dd>
          <dt class="mt-1 border-t border-line pt-2.5 font-semibold text-ink">{{ t('client.tnved.calc.total') }}</dt>
          <dd :class="cn(dd, 'mt-1 border-t border-line pt-2.5 font-semibold')" data-calc-row="total">{{ formatMoney(result.totalKzt) }}</dd>
        </dl>

        <p v-if="notes" class="m-0 flex gap-2 text-sm text-ink-2" data-calc-notes>
          <PhInfo :size="16" class="mt-0.5 flex-none text-zircon-ink" aria-hidden="true" />
          <span class="min-w-0">{{ notes }}</span>
        </p>
      </template>

      <p v-if="result" class="m-0 text-[13px] leading-5 text-muted" data-calc-disclaimer>{{ t('client.tnved.calc.disclaimer') }}</p>

      <div v-if="result && measures.length" class="flex flex-col gap-2" data-calc-docs>
        <h4 class="m-0 text-sm font-semibold text-ink">{{ t('client.tnved.calc.docs') }}</h4>
        <ul role="list" class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="(m, i) in measures" :key="i" class="flex gap-2.5 rounded-row border border-line px-3.5 py-2.5" data-calc-doc>
            <PhFileText :size="18" class="mt-px flex-none text-ink-3" aria-hidden="true" />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-ink">{{ m.name }}</span>
              <span v-if="m.comment" class="block text-[13px] leading-5 text-ink-3">{{ m.comment }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
