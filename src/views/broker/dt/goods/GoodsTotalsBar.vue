<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import { formatKg, formatQty, formatValue } from '@/views/broker/transit/record/sections/goods'
import { formatItemNumbers, formatMoney, type GoodsTotals } from './goodsList'

// Итоги раздела «Товары» (доска DtGoods), закреплены внизу раздела (на телефоне — просто в конце списка): товаров,
// мест, брутто, нетто, фактурная (с кодом валюты — P1), Σ гр. 45 ₸, ТПиН ₸; «Платежи устарели», если у товаров есть
// «Пересчитать»; «Рассчитать» — раздел «Платежи» и расчёт (useDtPayments.calculate; «ТПиН по данным экрана» убран
// в волне 6в — платежи считаются только по сохранённой ДТ). В просмотре — только итоги.
// Нетто > брутто (№14а): брутто и нетто красные, если у товара нетто больше брутто или Σ нетто > Σ брутто; под итогами —
// строка с номерами товаров и «Открыть» (первый такой товар; и в просмотре — открыть для чтения можно).
const props = defineProps<{ totals: GoodsTotals; stale: boolean; readonly: boolean; loading?: boolean }>()
const emit = defineEmits<{ 'calc-payments': []; open: [index: number] }>()
const { t, locale } = useI18n()
const tt = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.totals.${key}`, p ?? {})

const weightWarn = computed(() => props.totals.netOverGross.length > 0 || props.totals.sumNetOverGross)
const weightWarnText = computed(() => (props.totals.netOverGross.length
  ? tt('netOverGross', { list: formatItemNumbers(props.totals.netOverGross) })
  : tt('netOverGrossSum')))
const isWeight = (key: string) => key === 'gross' || key === 'net'

const cells = computed(() => {
  const s = props.totals
  const l = locale.value
  const invoice = s.invoice.length
    ? s.invoice.map((x) => `${formatMoney(x.amount, l)}${x.currency ? ` ${x.currency}` : ''}`).join(' + ')
    : '—'
  return [
    { key: 'goods', label: tt('goods'), value: formatQty(s.count, l) },
    { key: 'places', label: tt('places'), value: formatQty(s.places, l) },
    { key: 'gross', label: tt('gross'), value: formatKg(s.gross, l) },
    { key: 'net', label: tt('net'), value: formatKg(s.net, l) },
    { key: 'invoice', label: tt('invoice'), value: invoice },
    { key: 'kzt45', label: tt('kzt45'), value: `${formatValue(s.kzt45, l)} ₸` },
    { key: 'tpin', label: tt('tpin'), value: `${formatValue(s.tpin, l)} ₸` },
  ]
})
</script>

<template>
  <div
    role="region"
    :aria-label="tt('label')"
    class="z-[2] -mx-4 -mb-4 flex rounded-b-panel flex-wrap items-center gap-x-6 gap-y-3 border-t border-line bg-surface px-4 py-3 sm:sticky sm:bottom-0 sm:-mx-5 sm:-mb-5 sm:px-5"
    data-goods-totals
  >
    <dl class="m-0 flex min-w-0 flex-wrap gap-x-0 gap-y-2">
      <div
        v-for="(c, i) in cells"
        :key="c.key"
        class="flex min-w-0 flex-col gap-0.5 pr-4"
        :class="i > 0 && 'border-l border-line pl-4 max-sm:border-l-0 max-sm:pl-0'"
        :data-total="c.key"
      >
        <dt class="text-xs leading-4 text-ink-3">{{ c.label }}</dt>
        <dd
          class="m-0 text-sm font-semibold whitespace-nowrap tabular-nums"
          :class="weightWarn && isWeight(c.key) ? 'text-danger' : 'text-ink'"
          :data-total-warn="weightWarn && isWeight(c.key) ? '' : undefined"
        >{{ c.value }}</dd>
      </div>
    </dl>
    <div class="ml-auto flex items-center gap-2.5 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
      <span v-if="stale" class="inline-flex items-center gap-1.5 text-[13px] text-gold-ink" data-goods-stale>
        <span class="size-2 rounded-pill bg-gold" aria-hidden="true" />{{ tt('stale') }}
      </span>
      <ZButton v-if="!readonly" :loading="loading" class="max-sm:h-11" data-goods-calc @click="emit('calc-payments')">
        <template #icon><PhCalculator :size="16" aria-hidden="true" /></template>
        {{ tt('calc') }}
      </ZButton>
    </div>
    <p v-if="weightWarn" role="status" class="m-0 flex w-full flex-wrap items-baseline gap-x-2 text-[13px] text-danger" data-goods-weights-warn>
      <span>{{ weightWarnText }}</span>
      <ZButton
        v-if="totals.netOverGross.length"
        variant="link"
        class="max-sm:min-h-11"
        data-goods-weights-open
        @click="emit('open', totals.netOverGross[0])"
      >{{ tt('open') }}</ZButton>
    </p>
  </div>
</template>
