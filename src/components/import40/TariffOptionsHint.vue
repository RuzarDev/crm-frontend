<!-- Под «Страной происхождения» товара ДТ — то, что есть в КЕДЕН по коду и стране сверх базовой ставки:
     ставка по соглашению о ЗСТ (применяется в расчёте автоматически), выбор вида акциза (у кода их
     бывает несколько) и выбор антидемпинговой пошлины (условие часто по производителю, по умолчанию
     не начисляется). Выбор хранится в товаре (exciseKind / antiDumpingKind) и идёт в расчёт гр.47. -->
<template>
  <div v-if="opts && (opts.countryRate || opts.excise.length > 1 || opts.antiDumping.length || neededFields.length)" class="to-hint">
    <div v-if="opts.countryRate" class="to-line info">
      {{ t('dt.tariffCountryRate', { country: opts.countryRate.country, rate: opts.countryRate.rate }) }}
    </div>
    <div v-if="opts.excise.length > 1" class="to-field" :class="{ warn: !exciseKind }">
      <div class="to-label">{{ t('dt.tariffExciseKind') }}<template v-if="!exciseKind"> · {{ t('dt.tariffExciseDefault') }}</template></div>
      <a-select
        :value="exciseKind ?? opts.excise[0]?.key"
        size="small"
        :disabled="readonly"
        style="width: 100%"
        :options="opts.excise.map((o) => ({ value: o.key, label: `${o.rate} — ${o.condition ?? ''}` }))"
        @change="(v: string) => emit('update:exciseKind', v)"
      />
    </div>
    <div v-if="opts.antiDumping.length" class="to-field warn">
      <div class="to-label">{{ t('dt.tariffAntiDumping') }}</div>
      <a-select
        :value="antiDumpingKind ?? ''"
        size="small"
        :disabled="readonly"
        style="width: 100%"
        :options="[{ value: '', label: t('dt.tariffAntiDumpingNone') },
                   ...opts.antiDumping.map((o) => ({ value: o.key, label: adLabel(o) }))]"
        @change="(v: string) => emit('update:antiDumpingKind', v || null)"
      />
    </div>
    <!-- Специфическая ставка (за л, л 100% спирта, шт, см³), а такой единицы нет в ДЕИ товара —
         без этого количества пошлина/акциз не считаются (раньше молча выходил 0). -->
    <div v-for="f in neededFields" :key="f.field" class="to-field" :class="{ warn: quantities[f.field] == null }">
      <div class="to-label">{{ t(f.label) }} · {{ t('dt.taxQtyFor', { rate: f.rate }) }}</div>
      <a-input-number
        :value="quantities[f.field] ?? null"
        size="small"
        :min="0"
        :disabled="readonly"
        style="width: 100%"
        @change="(v: number | string | null) => emit('update:taxQuantity', f.field, v === '' || v == null ? null : Number(v))"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { tnvedApi, type TariffOptionsDto } from '@/api/tnved'
import type { TnvedTariffOptionDto } from '@/types/api'

type TaxQtyField = 'taxVolumeL' | 'taxAlcoholL' | 'taxPieces' | 'engineVolumeCm3'

const props = defineProps<{
  code?: string | null
  country?: string | null
  exciseKind?: string | null
  antiDumpingKind?: string | null
  readonly?: boolean
  /** ДЕИ товара (ОКЕИ) и уже введённые количества в единицах ставок. */
  unitCode?: string | null
  quantities?: Partial<Record<TaxQtyField, number | null>>
}>()
const emit = defineEmits<{
  (e: 'update:exciseKind', v: string | null): void
  (e: 'update:antiDumpingKind', v: string | null): void
  (e: 'update:taxQuantity', field: TaxQtyField, v: number | null): void
}>()
const { t } = useI18n()
const opts = ref<TariffOptionsDto | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const quantities = computed(() => props.quantities ?? {})

// Единица специфической ставки: «18051 KZT за 1 1 000 ШТ» → ШТ, «2805 KZT за 1 Л 100% СПИРТА» → Л100.
// КГ/Т считаются по весу нетто — поле не нужно.
const UNIT_RE = /(?:EUR|USD|KZT)\s+за\s+[\d\s]*?(Л\s+100%\s+СПИРТА|СМ3|ШТ|Л)(?![A-Za-zА-Яа-яЁё0-9])/i
const unitOf = (rate: string | null | undefined): string | null => {
  const m = rate ? UNIT_RE.exec(rate) : null
  if (!m) return null
  const u = m[1].toUpperCase().replace(/\s+/g, ' ')
  return u.startsWith('Л 100%') ? 'Л100' : u
}
// Какую единицу ставки закрывает ДЕИ товара (как на бэке: TaxQuantities.OkeiUnit).
const DEI_UNIT: Record<string, string> = { '112': 'Л', '831': 'Л100', '796': 'ШТ', '798': 'ШТ' }
const FIELD_OF: Record<string, { field: TaxQtyField; label: string }> = {
  Л: { field: 'taxVolumeL', label: 'dt.taxQtyL' },
  Л100: { field: 'taxAlcoholL', label: 'dt.taxQtyAlc' },
  ШТ: { field: 'taxPieces', label: 'dt.taxQtyPcs' },
  СМ3: { field: 'engineVolumeCm3', label: 'dt.taxQtyCm3' },
}
const neededFields = computed(() => {
  const o = opts.value
  if (!o) return []
  const chosenExcise = o.excise.find((x) => x.key === props.exciseKind) ?? o.excise[0]
  const chosenAd = o.antiDumping.find((x) => x.key === props.antiDumpingKind)
  const rates = [...(o.dutyRates ?? []), o.countryRate?.rate, chosenExcise?.rate, chosenAd?.rate]
  const covered = DEI_UNIT[(props.unitCode ?? '').trim()]
  const out: { field: TaxQtyField; label: string; rate: string }[] = []
  for (const rate of rates) {
    const unit = unitOf(rate)
    if (!unit || unit === covered || !FIELD_OF[unit] || out.some((x) => x.field === FIELD_OF[unit].field)) continue
    out.push({ ...FIELD_OF[unit], rate: rate! })
  }
  return out
})

const until = (d: string | null) => (d ? d.split('-').reverse().join('.') : t('dt.antiDumpingNoEnd'))
const adLabel = (o: TnvedTariffOptionDto) =>
  `${o.rate} (${o.country ?? t('dt.antiDumpingAnyCountry')}, ${t('dt.tariffUntil', { date: until(o.endDate) })}) — ${o.condition ?? ''}`

watch(
  () => [props.code?.trim() ?? '', props.country?.trim() ?? ''] as const,
  ([code, country]) => {
    clearTimeout(timer)
    if (code.length !== 10) {
      opts.value = null
      return
    }
    const my = ++seq
    timer = setTimeout(async () => {
      try {
        const { data } = await tnvedApi.tariffOptions(code, country || null)
        if (my === seq) opts.value = data
      } catch {
        if (my === seq) opts.value = null
      }
    }, 300)
  },
  { immediate: true },
)
</script>

<style scoped>
.to-hint { margin-top: 4px; display: grid; gap: 4px; }
.to-line { font-size: 12px; border-radius: var(--r-sm, 6px); padding: 3px 8px; }
.to-line.info { color: var(--z-zircon-ink, #0f6e8f); background: var(--z-accent-soft, #e4f5fa); }
.to-field { display: grid; gap: 2px; }
.to-field.warn { background: var(--z-warning-soft, #fdf1d8); border-radius: var(--r-sm, 6px); padding: 4px 6px; }
.to-label { font-size: 12px; color: var(--z-muted, var(--z-muted)); }
.to-field.warn .to-label { color: var(--z-warning, #8a6410); font-weight: 500; }
</style>
