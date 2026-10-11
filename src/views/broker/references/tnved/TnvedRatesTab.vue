<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import TnvedTabStatus from './TnvedTabStatus.vue'
import type { TnvedNodeDto, TnvedRateDto } from '@/types/api'
import { VAT_RATE } from '@/views/references/tnvedShared'
import { formatUpdated, hasRates, type Loaded } from './tnvedRules'

// Вкладка «Ставки»: ввозная пошлина ЕТТ (с основанием), статус ВТО и НДС. У группы — подсказка раскрыть её.
const props = defineProps<{ node: TnvedNodeDto; state?: Loaded<TnvedRateDto> }>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()

interface Row { key: string; rate: string; kind: string; unit: string; basis: string; url: string | null }
const rows = computed<Row[]>(() => {
  const r = props.state?.data
  if (!r) return []
  const out: Row[] = [{
    key: 'duty', rate: r.rateStr || '—', kind: t('broker.references.tnved.rates.duty'), unit: r.unitName || '—',
    basis: r.rateSourceName || (r.rateSourceUrl ? t('broker.references.tnved.rates.source') : '—'), url: r.rateSourceUrl,
  }]
  if (r.vtoStatus) out.push({ key: 'vto', rate: r.vtoStatus, kind: t('broker.references.tnved.rates.vto'), unit: '—', basis: '—', url: null })
  out.push({ key: 'vat', rate: VAT_RATE, kind: t('broker.references.tnved.rates.vat'), unit: '—', basis: t('broker.references.tnved.rates.vatBasis'), url: null })
  return out
})
const updated = computed(() => formatUpdated(props.state?.data?.updatedAtUtc, locale.value))
const th = 'h-9 px-3 text-left text-xs font-semibold tracking-[0.02em] text-ink-3 whitespace-nowrap'
const td = 'border-t border-line px-3 py-2.5 align-top'
</script>

<template>
  <div data-tnved-rates>
    <p v-if="!hasRates(node)" class="m-0 rounded-row bg-sunken px-3.5 py-3 text-sm text-ink-2" data-rates-group>{{ t('broker.references.tnved.card.group') }}</p>
    <div v-else-if="!state || state.status === 'loading'" class="flex flex-col gap-2.5" aria-busy="true">
      <ZSkeleton v-for="i in 3" :key="i" height="18px" :width="['80%', '64%', '72%'][i - 1]" />
    </div>
    <p v-else-if="state.status === 'missing' || (state.status === 'done' && !state.data)" class="m-0 py-2 text-sm text-ink-3" data-rates-missing>{{ t('broker.references.tnved.rates.missing') }}</p>
    <TnvedTabStatus v-else-if="state.status !== 'done'" :status="state.status" @retry="emit('retry')" />
    <template v-else>
      <div class="overflow-x-clip">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[460px] border-collapse text-sm text-ink-2">
            <thead>
              <tr>
                <th :class="th">{{ t('broker.references.tnved.rates.rate') }}</th>
                <th :class="th">{{ t('broker.references.tnved.rates.kind') }}</th>
                <th :class="th">{{ t('broker.references.tnved.rates.unit') }}</th>
                <th :class="th">{{ t('broker.references.tnved.rates.basis') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key" :data-rate-row="r.key">
                <td :class="[td, 'font-semibold text-ink tabular-nums']" data-rate-value>{{ r.rate }}</td>
                <td :class="td">{{ r.kind }}</td>
                <td :class="td">{{ r.unit }}</td>
                <td :class="td">
                  <a
                    v-if="r.url"
                    :href="r.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 rounded-field text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus"
                  >{{ r.basis }}<PhArrowSquareOut :size="13" aria-hidden="true" /></a>
                  <span v-else>{{ r.basis }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-if="updated" class="m-0 mt-2 text-[13px] text-muted">{{ t('broker.references.tnved.rates.updated', { date: updated }) }}</p>
    </template>
  </div>
</template>
