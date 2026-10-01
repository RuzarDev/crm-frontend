<!-- Под «Страной происхождения» товара ДТ — то, что есть в КЕДЕН по коду и стране сверх базовой ставки:
     ставка по соглашению о ЗСТ (применяется в расчёте автоматически), выбор вида акциза (у кода их
     бывает несколько) и выбор антидемпинговой пошлины (условие часто по производителю, по умолчанию
     не начисляется). Выбор хранится в товаре (exciseKind / antiDumpingKind) и идёт в расчёт гр.47. -->
<template>
  <div v-if="opts && (opts.countryRate || opts.excise.length > 1 || opts.antiDumping.length)" class="to-hint">
    <div v-if="opts.countryRate" class="to-line info">
      {{ t('dt.tariffCountryRate', { country: opts.countryRate.country, rate: opts.countryRate.rate }) }}
    </div>
    <div v-if="opts.excise.length > 1" class="to-field">
      <div class="to-label">{{ t('dt.tariffExciseKind') }}</div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { tnvedApi, type TariffOptionsDto } from '@/api/tnved'
import type { TnvedTariffOptionDto } from '@/types/api'

const props = defineProps<{
  code?: string | null
  country?: string | null
  exciseKind?: string | null
  antiDumpingKind?: string | null
  readonly?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:exciseKind', v: string | null): void
  (e: 'update:antiDumpingKind', v: string | null): void
}>()
const { t } = useI18n()
const opts = ref<TariffOptionsDto | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

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
.to-label { font-size: 12px; color: var(--z-muted, #8c95a6); }
.to-field.warn .to-label { color: var(--z-warning, #8a6410); font-weight: 500; }
</style>
