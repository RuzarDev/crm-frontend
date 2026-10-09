<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZModal from '@/components/z/ZModal.vue'
import type { ReestrGoodsItemInput } from '@/types/api'
import { formatKg, formatQty } from '@/views/broker/transit/record/sections/goods'
import { excelPreview } from './goodsImport'

// Предпросмотр «Из Excel» (доска DtGoods): сколько строк с товарами, что распознано (по каждому столбцу — в скольких
// строках есть значение), сколько без кода ТН ВЭД, первые строки файла. «Добавить в конец» — как прежде: товары
// добавляются после имеющихся, ничего не заменяется.
const PREVIEW_ROWS = 5
const props = defineProps<{ open: boolean; fileName: string; rows: readonly ReestrGoodsItemInput[]; existing: number }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; append: [] }>()
const { t, locale } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.excel.${key}`, p ?? {})

const summary = computed(() => excelPreview(props.rows))
const recognized = computed(() => {
  const r = summary.value.recognized
  return [
    { key: 'code', n: summary.value.withCode },
    { key: 'description', n: r.description },
    { key: 'gross', n: r.gross },
    { key: 'quantity', n: r.quantity },
    { key: 'packaging', n: r.packaging },
    { key: 'places', n: r.places },
  ]
})
const head = computed(() => props.rows.slice(0, PREVIEW_ROWS))
const num = (v: number | null, kg = false) => (v == null ? '—' : kg ? formatKg(v, locale.value) : formatQty(v, locale.value))
const th = 'border-b border-line px-2 py-1.5 text-left text-xs font-medium text-ink-3'
const td = 'border-b border-line px-2 py-1.5 align-top'
</script>

<template>
  <ZModal
    :open="open"
    :title="tx('title')"
    :width="720"
    :ok-text="tx('append')"
    :cancel-text="t('common.cancel')"
    :ok-button-props="{ disabled: !rows.length }"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="emit('append')"
  >
    <div class="flex flex-col gap-4 text-sm text-ink" data-goods-excel-modal>
      <p class="m-0 text-ink-2">
        <span class="font-mono text-xs break-all text-muted">{{ fileName }}</span><br>
        <b data-goods-excel-rows>{{ tx('rows', { n: summary.rows }) }}</b>
      </p>
      <div>
        <p class="m-0 mb-1.5 text-xs text-ink-3">{{ tx('recognized') }}</p>
        <ul class="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0 sm:grid-cols-3">
          <li v-for="r in recognized" :key="r.key" class="flex justify-between gap-2" :data-goods-excel-field="r.key">
            <span class="text-ink-2">{{ tx(`fields.${r.key}`) }}</span>
            <span class="tabular-nums" :class="r.n ? 'text-ink' : 'text-muted'">{{ tx('of', { n: r.n, total: summary.rows }) }}</span>
          </li>
        </ul>
      </div>
      <p v-if="summary.withoutCode" class="m-0 rounded-row bg-gold-soft px-3 py-2 text-gold-ink" data-goods-excel-no-code>
        {{ tx('withoutCode', { n: summary.withoutCode }) }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0 text-[13px]" :aria-label="tx('previewLabel')">
          <thead>
            <tr>
              <th :class="th">{{ tx('fields.code') }}</th>
              <th :class="th">{{ tx('fields.description') }}</th>
              <th :class="[th, 'text-right']">{{ tx('fields.gross') }}</th>
              <th :class="[th, 'text-right']">{{ tx('fields.quantity') }}</th>
              <th :class="th">{{ tx('fields.packaging') }}</th>
              <th :class="[th, 'text-right']">{{ tx('fields.places') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in head" :key="i" data-goods-excel-preview-row>
              <td :class="[td, 'font-mono whitespace-nowrap']">
                <span v-if="r.tnvedCode">{{ r.tnvedCode }}</span><span v-else class="font-sans text-danger">{{ t('broker.dt.goods.noCode') }}</span>
              </td>
              <td :class="[td, 'max-w-60 truncate']" :title="r.description ?? ''">{{ r.description || '—' }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ num(r.grossWeightKg, true) }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ num(r.quantity) }}</td>
              <td :class="td">{{ r.unit || '—' }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ num(r.packagesCount) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="rows.length > head.length" class="m-0 mt-1.5 text-xs text-muted">{{ tx('more', { n: rows.length - head.length }) }}</p>
      </div>
      <p class="m-0 text-xs text-ink-3">{{ tx('appendNote', { n: existing }) }}</p>
    </div>
  </ZModal>
</template>
