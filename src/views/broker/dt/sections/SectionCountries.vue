<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'
import { EU_CODES, isEuCode, normalizeOrigin, ORIGIN_UNKNOWN, ORIGIN_VARIOUS, specialCountryKey } from '../originCountry'

// Гр. 11 (торгующая страна), 15 (отправления), 16 (происхождения, шапка), 17 (назначения). Страны — ОКСМ,
// числовой код («398»), с поиском по коду и названию. Гр. 16 страница считает по товарам (originForGoods). В гр. 16 —
// ровно особые значения КЕДЕН / R.055 19.14.1: «99» РАЗНЫЕ, «00» НЕИЗВЕСТНО, «EU» ЕВРОСОЮЗ (в справочнике — «ЕС»);
// прежнее «000» показывается как «99».
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  countryOptions: { value: string; label: string }[]
}>()
const { t } = useI18n()

const base = computed<ZOption[]>(() => props.countryOptions)
// Евросоюз — тем кодом, что у товаров в гр. 34а (запись справочника «ЕС»), иначе авто-расчёт и выбор разойдутся.
const euValue = computed(() => String(base.value.find((o) => isEuCode(String(o.value)))?.value ?? EU_CODES[0]))
const originBase = computed<ZOption[]>(() => {
  const specials: ZOption[] = [
    { value: ORIGIN_VARIOUS, label: t('broker.dt.countries.originVarious') },
    { value: ORIGIN_UNKNOWN, label: t('broker.dt.countries.originUnknown') },
    { value: euValue.value, label: t('broker.dt.countries.originEu') },
  ]
  return [...specials, ...base.value.filter((o) => specialCountryKey(String(o.value)) === null)]
})

const departure = computed(() => withCurrent(base.value, props.form.departureCountryCode))
const destination = computed(() => withCurrent(base.value, props.form.destinationCountryCode))
const trade = computed(() => withCurrent(base.value, props.form.tradeCountryCode))
const originShown = computed(() => {
  const v = normalizeOrigin(props.form.originCountryCode)
  return isEuCode(v) ? euValue.value : v
})
const origin = computed(() => withCurrent(originBase.value, originShown.value))

const warn = (unknown: boolean, value: string | null | undefined) =>
  unknown ? { validateStatus: 'warning' as const, help: t('broker.dt.countries.notInList', { value: value ?? '' }) } : {}

const code = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const onDeparture = (v: unknown) => { props.form.departureCountryCode = code(v) }
const onDestination = (v: unknown) => { props.form.destinationCountryCode = code(v) }
const onTrade = (v: unknown) => { props.form.tradeCountryCode = code(v) ?? '' }
const onOrigin = (v: unknown) => { props.form.originCountryCode = code(v) ?? '' }
</script>

<template>
  <section class="@container flex flex-col gap-4" data-dt-countries>
    <h2 class="m-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink">
      {{ t('broker.dt.countries.title') }}
      <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '11, 15–17' }) }}</span>
    </h2>

    <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2">
      <ZField graph="15" data-graph="15" v-bind="warn(departure.unknown, form.departureCountryCode)">
        <template #label>{{ t('broker.dt.countries.departure') }}<DtGraphHelp graph="15" /></template>
        <ZSelect :value="form.departureCountryCode || null" :options="departure.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.countries.select')" @update:value="onDeparture" />
      </ZField>
      <ZField graph="17" data-graph="17" v-bind="warn(destination.unknown, form.destinationCountryCode)">
        <template #label>{{ t('broker.dt.countries.destination') }}<DtGraphHelp graph="17" /></template>
        <ZSelect :value="form.destinationCountryCode || null" :options="destination.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.countries.select')" @update:value="onDestination" />
      </ZField>
      <ZField graph="11" data-graph="11" v-bind="warn(trade.unknown, form.tradeCountryCode)">
        <template #label>{{ t('broker.dt.countries.trade') }}<DtGraphHelp graph="11" /></template>
        <ZSelect :value="form.tradeCountryCode || null" :options="trade.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.countries.select')" @update:value="onTrade" />
      </ZField>
      <ZField
        graph="16"
        data-graph="16"
        :extra="t('broker.dt.countries.originAuto')"
        v-bind="warn(origin.unknown, originShown)"
      >
        <template #label>{{ t('broker.dt.countries.origin') }}<DtGraphHelp graph="16" /></template>
        <ZSelect :value="originShown || null" :options="origin.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.countries.select')" @update:value="onOrigin" />
      </ZField>
    </div>
  </section>
</template>
