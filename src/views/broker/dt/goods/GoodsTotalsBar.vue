<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator, PhDotsThree } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import { formatKg, formatQty, formatValue } from '@/views/broker/transit/record/sections/goods'
import { formatMoney, type GoodsTotals } from './goodsList'

// Итоги раздела «Товары» (доска DtGoods), закреплены внизу раздела (на телефоне — просто в конце списка): товаров,
// мест, брутто, нетто, фактурная (с кодом валюты — P1), Σ гр. 45 ₸, ТПиН ₸; «Платежи устарели», если у товаров есть
// «Пересчитать»; «Рассчитать» (окно расчёта платежей useDtPayments) и «Ещё» → «ТПиН по данным экрана».
// В просмотре — только итоги.
const props = defineProps<{ totals: GoodsTotals; stale: boolean; readonly: boolean; loading?: boolean }>()
const emit = defineEmits<{ 'calc-payments': []; 'calc-tpin': [] }>()
const { t, locale } = useI18n()
const tt = (key: string) => t(`broker.dt.goods.totals.${key}`)

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
const moreItems = computed<ZDropdownItem[]>(() => [{ key: 'tpin', label: tt('tpinScreen') }])
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
        <dd class="m-0 text-sm font-semibold whitespace-nowrap text-ink tabular-nums">{{ c.value }}</dd>
      </div>
    </dl>
    <div class="ml-auto flex items-center gap-2.5 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
      <span v-if="stale" class="inline-flex items-center gap-1.5 text-[13px] text-gold-ink" data-goods-stale>
        <span class="size-2 rounded-pill bg-gold" aria-hidden="true" />{{ tt('stale') }}
      </span>
      <template v-if="!readonly">
        <ZButton :loading="loading" class="max-sm:h-11" data-goods-calc @click="emit('calc-payments')">
          <template #icon><PhCalculator :size="16" aria-hidden="true" /></template>
          {{ tt('calc') }}
        </ZButton>
        <ZDropdown :items="moreItems" @select="(k) => k === 'tpin' && emit('calc-tpin')">
          <button
            type="button"
            :aria-label="tt('more')"
            class="flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
            data-goods-calc-more
          >
            <PhDotsThree :size="20" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </template>
    </div>
  </div>
</template>
