<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import type { AnalyticsMonth } from '@/api/analytics'
import { MONTH_SERIES, barHeight, chartDescription, formatPayments, maxOf, monthLabel } from './analytics'

// Шесть месяцев: по месяцу три столбика (заявки, ДТ, транзит) на CSS, без библиотеки. Каждый ряд масштабируется
// по своему максимуму. Последний месяц (текущий, неполный) приглушён. Под столбиками — месяц, числа «з · д · т»
// и платежи гр. B. График для скринридера — одно изображение с описанием всех значений; у столбика свой aria-label.
const props = defineProps<{ months: AnalyticsMonth[] }>()
const { t, locale } = useI18n()

const maxes = computed(() => Object.fromEntries(MONTH_SERIES.map((s) => [s.key, maxOf(props.months.map(s.value))])))
const last = computed(() => props.months.length - 1)
const description = computed(() => chartDescription(props.months, t))
</script>

<template>
  <div
    role="img"
    :aria-label="description"
    class="grid grid-cols-3 gap-x-2 gap-y-5 border-b border-line pb-3 sm:grid-cols-6"
    data-months-chart
  >
    <div
      v-for="(m, i) in months"
      :key="m.month"
      class="flex min-w-0 flex-col items-center gap-1.5"
      data-month
    >
      <div class="flex h-[154px] items-end gap-[3px]">
        <span
          v-for="s in MONTH_SERIES"
          :key="s.key"
          :aria-label="`${t(`broker.analytics.series.${s.key}`)}: ${s.value(m)}`"
          :title="`${t(`broker.analytics.series.${s.key}`)}: ${s.value(m)}`"
          :class="cn('block w-3.5 rounded-t-[3px]', s.bar, i === last && 'opacity-45')"
          :style="{ height: `${barHeight(s.value(m), maxes[s.key])}%` }"
          :data-bar="s.key"
        />
      </div>
      <div :class="cn('text-[12.5px] font-medium', i === last ? 'text-muted' : 'text-ink-2')" data-month-label>{{ monthLabel(m.month, t) }}</div>
      <div class="text-xs whitespace-nowrap text-muted tabular-nums" data-month-nums>{{ m.cases }} · {{ m.declarations }} · {{ m.transitEntries }}</div>
      <div v-if="m.paymentsKzt" class="text-xs whitespace-nowrap text-ink-3 tabular-nums" data-month-pay>{{ formatPayments(m.paymentsKzt, locale, t) }}</div>
    </div>
  </div>
</template>
