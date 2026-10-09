// Курсы НБ РК для страницы ДТ — НА ДАТУ гр.А (/import40/rates-on-date) поверх текущих из справочника валют.
// Перенос из Import40DtView.vue (loadRatesOnDate, currencyBoxCodes, справочник валют) — волна 6а, Task 2.
//
// Правило гр.23: смена даты гр.А ПОЛЬЗОВАТЕЛЕМ → гр.23 следует за курсом валюты сделки (гр.22) на новую дату.
// При загрузке ДТ гр.23 не трогается молча: расхождение подсвечивается (rateMismatch), «Подставить» — applyDealRate.
import { computed, ref, watch } from 'vue'
import { import40Api } from '@/api/import40'
import { tnvedApi } from '@/api/tnved'
import { CURRENCY_NUMERIC } from '@/types/api'
import { toIsoDate } from './dtPayload'

export interface RateInfo {
  rate: number
  /** Дата курса: дата гр.А для курсов на дату, иначе дата обновления справочника. */
  date: string
}
export type RateMap = Record<string, RateInfo>

/** Что useDtRates читает из формы ДТ (и пишет: exchangeRate). */
export interface DtRatesForm {
  submissionDate?: string | null
  currency?: string | null
  exchangeRate?: number | null
  goodsItems?: { currency?: string | null }[]
  expenses?: { currencyCode?: string | null }[] | null
}

export interface DtRatesOptions {
  /** Идёт загрузка ДТ в форму: смена даты — не правка пользователя. */
  applying: () => boolean
}

const up = (c: string | null | undefined) => (c ? c.toUpperCase() : '')

export function useDtRates(form: DtRatesForm, opts: DtRatesOptions) {
  const currencyOptions = ref<{ value: string; label: string }[]>([])
  /** Текущие курсы справочника валют (на день заполнения). */
  const currentRates = ref<RateMap>({})
  /** Курсы на дату гр.А — последний успешный ответ. */
  const onDateRates = ref<RateMap>({})
  /** false — НБ РК недоступен, сервер отдал курсы не на дату гр.А. */
  const official = ref(true)

  const rates = computed<RateMap>(() => ({ ...currentRates.value, ...onDateRates.value }))
  const usdRate = computed(() => rates.value.USD?.rate ?? null)
  const nbUnavailable = computed(() => !official.value)
  /** Курс валюты сделки (гр.22) на дату гр.А. */
  const dealRate = computed<RateInfo | null>(() => rates.value[up(form.currency)] ?? null)
  const rateMismatch = computed(
    () => !!dealRate.value && form.exchangeRate != null && Number(form.exchangeRate) !== dealRate.value.rate,
  )

  /** Валюты, чьи курсы нужны ДТ: USD (гр.46), EUR (специфические ставки), гр.22, товары, расходы. */
  const rateCodes = computed(() => {
    const set = new Set<string>(['USD', 'EUR'])
    const add = (c: string | null | undefined) => { if (c && c.toUpperCase() !== 'KZT') set.add(c.toUpperCase()) }
    add(form.currency)
    for (const g of form.goodsItems ?? []) add(g.currency)
    for (const e of form.expenses ?? []) add(e.currencyCode)
    return Array.from(set).sort()
  })

  /** Коды для полосы курсов у гр.А: USD, EUR, гр.22 и валюты расходов; без KZT и повторов. */
  const boxCodes = computed(() => {
    const raw = ['USD', 'EUR', form.currency, ...(form.expenses ?? []).map((e) => e.currencyCode)]
    const set = new Set<string>()
    for (const c of raw) {
      if (!c) continue
      const u = c.toUpperCase()
      if (u === 'KZT') continue
      set.add(u)
    }
    return Array.from(set)
  })

  /** Справочник валют НБ РК: варианты выбора и текущие курсы. Сбой — форма работает без них. */
  const loadCurrencies = async () => {
    try {
      const currencies = (await tnvedApi.currencies()).data
      currencyOptions.value = currencies.map((c) => {
        const num = CURRENCY_NUMERIC[c.codeLat]
        // В label — и буквенный, и цифровой код: поиск по label находит и «USD», и «840»
        return { value: c.codeLat, label: `${c.codeLat}${num ? ' / ' + num : ''} — ${c.name}` }
      })
      const map: RateMap = { KZT: { rate: 1, date: '' } }
      for (const c of currencies) map[c.codeLat] = { rate: c.rate, date: c.updatedAtUtc }
      currentRates.value = map
    } catch {
      /* справочник валют НБ РК не загрузился — расходы и гр.23 не блокируют форму */
    }
  }

  // Пользователь сменил дату — после ответа на эту дату гр.23 встанет на курс сделки.
  let syncPending = false
  let seq = 0
  const refresh = async () => {
    const my = ++seq
    const date = toIsoDate(form.submissionDate)
    if (!date) {
      onDateRates.value = {}
      official.value = true
      syncPending = false
      return
    }
    try {
      const res = await import40Api.ratesOnDate(date, rateCodes.value)
      if (my !== seq) return
      const next: RateMap = {}
      for (const [code, rate] of Object.entries(res.rates)) next[code] = { rate, date }
      onDateRates.value = next
      official.value = res.official
      const deal = up(form.currency)
      if (syncPending && deal && rates.value[deal]) form.exchangeRate = rates.value[deal].rate
    } catch {
      /* курсы на дату не загрузились — остаются прежние; расчёты на сервере всё равно по дате гр.А */
    } finally {
      if (my === seq) syncPending = false
    }
  }

  /** «Подставить»: гр.23 = курс валюты сделки на дату гр.А. */
  const applyDealRate = () => {
    if (dealRate.value) form.exchangeRate = dealRate.value.rate
  }

  watch(
    () => [toIsoDate(form.submissionDate), rateCodes.value.join(',')] as const,
    (next, prev) => {
      if (!opts.applying() && prev && next[0] !== prev[0]) syncPending = true
      void refresh()
    },
  )

  return {
    currencyOptions,
    rates,
    official,
    nbUnavailable,
    usdRate,
    dealRate,
    rateMismatch,
    rateCodes,
    boxCodes,
    loadCurrencies,
    refresh,
    applyDealRate,
  }
}
