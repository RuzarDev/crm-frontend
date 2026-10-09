<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import type { TnvedTariffOptionDto } from '@/types/api'
import { formatDateText } from '@/ui/date'
import { useTariffOptions } from '../useTariffOptions'
import type { GoodsSectionProps } from './types'

// Подсказка ставок под стоимостью товара (перенос TariffOptionsHint на Z): что есть в КЕДЕН по коду и стране на дату
// гр. А (useTariffOptions: кэш, тихо): ставки пошлины и НДС, ставка по стране (ЗСТ — в расчёте сама), выбор вида
// акциза (у кода их бывает несколько; не выбран — считается первый), антидемпинг (по умолчанию «не начислять»),
// количества в единицах специфических ставок (л, л 100%, шт, см³) — когда единица ставки не покрыта ДЕИ товара.
// «Медизделие — НДС 5%» — свойство товара (vatRatePreferential = 0,05; M5), не только в окне расчёта.
// Все выборы — поля платежей: правка помечает «Пересчитать».
const props = defineProps<Pick<GoodsSectionProps, 'item' | 'index' | 'model' | 'readonly' | 'ctx'>>()
const { t } = useI18n()
const th = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.tariff.${key}`, p ?? {})

const tariff = useTariffOptions(() => ({ code: props.item.tnvedCode, country: props.item.countryOfOrigin, onDate: props.ctx.onDate }))
const opts = computed(() => tariff.data.value)
const hasCode = computed(() => /^\d{10}$/.test((props.item.tnvedCode ?? '').trim()))

const countryName = computed(() => {
  const c = (props.item.countryOfOrigin ?? '').trim()
  if (!c) return ''
  const label = props.ctx.countryOptions.find((o) => o.value === c)?.label ?? c
  return label.replace(/^\d+\s*[—-]\s*/, '')
})
const dateText = computed(() => (props.ctx.onDate ? th('onDate', { date: formatDateText(props.ctx.onDate) }) : th('onToday')))

// ---- Сводная строка: пошлина (ЕТТ, ВТО, если действует), НДС, антидемпинг ----
// НДС: «Медизделие» — 5%; после расчёта — ставка из строки 5060 гр. 47 (сервер сам находит пониженный НДС по коду);
// иначе — общая ставка расчёта (Import40PaymentCalculator.DefaultVatRate = 16%).
const DEFAULT_VAT = '16%'
const medical = computed(() => props.item.vatRatePreferential === 0.05)
const vatRate = computed(() => {
  if (medical.value) return '5%'
  const label = (props.item.payments ?? []).find((p) => p.taxModeCode === '5060')?.rateLabel?.trim()
  return label || DEFAULT_VAT
})
const summary = computed(() => {
  const o = opts.value
  if (!o) return ''
  const parts: string[] = []
  // Сервер отдаёт ставки пошлины списком без подписи: [ЕТТ, ВТО (если действует)], пустые убраны, одинаковые —
  // одной строкой (GetTnvedTariffOptions). Подписать можно только пару: одна ставка может быть и ЕТТ, и ВТО.
  const rates = o.dutyRates ?? []
  if (rates.length >= 2) {
    parts.push(th('duty', { rate: rates[0] }))
    parts.push(th('dutyVto', { rate: rates[1] }))
  } else if (rates.length === 1) parts.push(th('dutyBare', { rate: rates[0] }))
  parts.push(th('vat', { rate: vatRate.value }))
  if (!o.antiDumping.length && countryName.value) parts.push(th('noAntiDumping'))
  return parts.join(' · ')
})

// ---- Акциз и антидемпинг ----
const optLabel = (o: TnvedTariffOptionDto) => (o.condition ? `${o.rate} — ${o.condition}` : o.rate)
const until = (d: string | null) => (d ? th('until', { date: formatDateText(d) }) : th('noEnd'))
const exciseOptions = computed(() => (opts.value?.excise ?? []).map((o) => ({ value: o.key, label: optLabel(o) })))
const adOptions = computed(() => [
  { value: '', label: th('antiDumpingNone') },
  ...(opts.value?.antiDumping ?? []).map((o) => ({
    value: o.key,
    label: `${o.rate} (${o.country ?? th('anyCountry')}, ${until(o.endDate)})${o.condition ? ` — ${o.condition}` : ''}`,
  })),
])
const onExcise = (v: unknown) => { props.model.setField(props.item, 'exciseKind', v ? String(v) : null) }
const onAntiDumping = (v: unknown) => { props.model.setField(props.item, 'antiDumpingKind', v ? String(v) : null) }

// ---- Количества в единицах специфических ставок ----
type TaxQtyField = 'taxVolumeL' | 'taxAlcoholL' | 'taxPieces' | 'engineVolumeCm3'
// Единица специфической ставки: «18051 KZT за 1 1 000 ШТ» → ШТ, «2805 KZT за 1 Л 100% СПИРТА» → Л100.
// КГ/Т считаются по весу нетто — поле не нужно.
const UNIT_RE = /(?:EUR|USD|KZT)\s+за\s+[\d\s]*?(Л\s+100%\s+СПИРТА|СМ3|ШТ|Л)(?![A-Za-zА-Яа-яЁё0-9])/i
const unitOf = (rate: string | null | undefined): string | null => {
  const m = rate ? UNIT_RE.exec(rate) : null
  if (!m) return null
  const u = m[1].toUpperCase().replace(/\s+/g, ' ')
  return u.startsWith('Л 100%') ? 'Л100' : u
}
// Какую единицу ставки закрывает ДЕИ товара (как на сервере: TaxQuantities.OkeiUnit).
const DEI_UNIT: Record<string, string> = { '112': 'Л', '831': 'Л100', '796': 'ШТ', '798': 'ШТ' }
const FIELD_OF: Record<string, TaxQtyField> = { Л: 'taxVolumeL', Л100: 'taxAlcoholL', ШТ: 'taxPieces', СМ3: 'engineVolumeCm3' }
const neededFields = computed(() => {
  const o = opts.value
  if (!o) return []
  const chosenExcise = o.excise.find((x) => x.key === props.item.exciseKind) ?? o.excise[0]
  const chosenAd = o.antiDumping.find((x) => x.key === props.item.antiDumpingKind)
  const rates = [...(o.dutyRates ?? []), o.countryRate?.rate, chosenExcise?.rate, chosenAd?.rate]
  const covered = DEI_UNIT[(props.item.unitCode ?? '').trim()]
  const out: { field: TaxQtyField; rate: string }[] = []
  for (const rate of rates) {
    const unit = unitOf(rate)
    const field = unit ? FIELD_OF[unit] : undefined
    if (!unit || unit === covered || !field || out.some((x) => x.field === field)) continue
    out.push({ field, rate: rate! })
  }
  return out
})
const onQty = (field: TaxQtyField, v: number | null) => { props.model.setField(props.item, field, v) }

const onMedical = (checked: boolean) => { props.model.setField(props.item, 'vatRatePreferential', checked ? 0.05 : null) }

const choice = 'flex flex-col gap-2 rounded-field px-3 py-2.5'
</script>

<template>
  <div class="flex flex-col gap-3 rounded-panel border border-line bg-canvas p-4" data-goods-tariff>
    <template v-if="hasCode">
      <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span class="font-semibold text-ink">{{ countryName ? th('titleCountry', { country: countryName }) : th('title') }}</span>
        <span class="text-[13px] text-muted" data-goods-tariff-date>{{ dateText }}</span>
      </p>
      <p v-if="tariff.failed.value" class="m-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-3" data-goods-tariff-failed>
        {{ th('failed') }}
        <ZButton variant="link" class="max-sm:h-11" data-goods-tariff-retry @click="tariff.retry()">{{ th('retry') }}</ZButton>
      </p>
      <p v-else-if="!opts" class="m-0 text-[13px] text-muted" data-goods-tariff-loading>{{ th('loading') }}</p>
      <template v-else>
        <p class="m-0 text-[13px] text-ink-2" data-goods-tariff-summary>{{ summary }}</p>
        <p v-if="opts.countryRate" class="m-0 rounded-field bg-tone-info-bg px-2.5 py-1.5 text-[13px] text-tone-info-fg" data-goods-tariff-country>
          {{ th('countryRate', { country: opts.countryRate.country, rate: opts.countryRate.rate }) }}
        </p>
        <div v-if="opts.excise.length > 1" :class="[choice, !item.exciseKind ? 'bg-gold-soft' : 'bg-surface']" data-goods-excise>
          <ZField data-graph="47" data-goods-field="exciseKind" :data-goods-index="index">
            <template #label>{{ th('exciseKind') }}<span v-if="!item.exciseKind" class="font-normal text-gold-ink"> · {{ th('exciseDefault') }}</span></template>
            <ZRadioGroup orientation="vertical" :value="item.exciseKind ?? opts.excise[0]?.key ?? null" :options="exciseOptions" :disabled="readonly" @update:value="onExcise" />
          </ZField>
        </div>
        <div v-if="opts.antiDumping.length" :class="[choice, 'bg-gold-soft']" data-goods-antidumping>
          <ZField :label="th('antiDumping')" data-graph="47" data-goods-field="antiDumpingKind" :data-goods-index="index">
            <ZRadioGroup orientation="vertical" :value="item.antiDumpingKind ?? ''" :options="adOptions" :disabled="readonly" @update:value="onAntiDumping" />
          </ZField>
        </div>
        <div v-if="neededFields.length" class="grid grid-cols-1 gap-3 @md:grid-cols-2">
          <ZField
            v-for="f in neededFields"
            :key="f.field"
            :label="th(`qty.${f.field}`)"
            :extra="th('qtyFor', { rate: f.rate })"
            :validate-status="item[f.field] == null ? 'warning' : ''"
            :data-goods-tax-qty="f.field"
            data-graph="41"
            :data-goods-field="f.field"
            :data-goods-index="index"
          >
            <ZNumber :value="item[f.field] ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" @update:value="onQty(f.field, $event)" />
          </ZField>
        </div>
      </template>
    </template>
    <p v-else class="m-0 text-[13px] text-muted" data-goods-tariff-no-code>{{ th('noCode') }}</p>

    <div data-graph="47" data-goods-field="vatRatePreferential" :data-goods-index="index">
      <ZSwitch :checked="medical" :disabled="readonly" class="max-sm:min-h-11" data-goods-medical @update:checked="onMedical">{{ th('medical') }}</ZSwitch>
    </div>
  </div>
</template>
