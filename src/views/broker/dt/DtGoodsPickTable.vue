<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZTable from '@/components/z/ZTable.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { formatAmount } from '@/ui/number'
import type { ZColumn, ZKey } from '@/ui/table'
import type { DtPickRow } from './dtForms'

// Таблица товаров ДТ с галочками для документов по ДТ (23.10.2026; образец — DtSplitModal): №, своя колонка окна (подпункт
// п. 6 у уведомления, документ у обязательства), код ТН ВЭД, страна, описание гр. 31 (2 строки, полный текст — в
// подсказке), количество (гр. 31.1 / гр. 41), нетто, фактурная стоимость. Ключ строки — позиция товара (SortOrder).
const props = defineProps<{
  rows: DtPickRow[]
  selected: number[]
  currency: string | null
  /** Своя колонка окна после «№»; ячейка — слот extra. */
  extra?: { title: string; width?: number } | null
  label: string
}>()
const emit = defineEmits<{ 'update:selected': [keys: number[]] }>()
defineSlots<{ extra?(p: { row: DtPickRow }): unknown }>()
const { t } = useI18n()

const columns = computed<ZColumn<DtPickRow>[]>(() => [
  { title: '№', key: 'no', width: 48 },
  ...(props.extra ? [{ title: props.extra.title, key: 'extra', width: props.extra.width ?? 220 }] : []),
  { title: t('broker.dt.forms.col.tnved'), key: 'tnved', width: 120 },
  { title: t('broker.dt.forms.col.country'), key: 'country', width: 72 },
  { title: t('broker.dt.forms.col.description'), key: 'description', minWidth: 220 },
  { title: t('broker.dt.forms.col.quantity'), key: 'quantity', width: 120 },
  { title: t('broker.dt.forms.col.net'), key: 'net', width: 96, align: 'right' },
  { title: props.currency ? t('broker.dt.forms.col.valueIn', { cur: props.currency }) : t('broker.dt.forms.col.value'), key: 'value', width: 120, align: 'right' },
])
const rowSelection = computed(() => ({
  selectedRowKeys: props.selected,
  onChange: (keys: ZKey[]) => emit('update:selected', keys.map(Number).sort((a, b) => a - b)),
}))
const num = (v: number | null) => (v == null ? '—' : formatAmount(v))
</script>

<template>
  <ZTable
    :columns="columns"
    :data-source="rows"
    row-key="index"
    size="small"
    :pagination="false"
    :row-selection="rowSelection"
    :scroll="{ x: extra ? 1040 : 860 }"
    :aria-label="label"
    data-dt-pick-table
  >
    <template #bodyCell="{ column, record }">
      <span v-if="column.key === 'no'" class="tabular-nums text-ink-3">{{ record.index + 1 }}</span>
      <slot v-else-if="column.key === 'extra'" name="extra" :row="record" />
      <span v-else-if="column.key === 'tnved'" class="font-mono">{{ record.tnvedCode || '—' }}</span>
      <template v-else-if="column.key === 'country'">{{ record.country || '—' }}</template>
      <ZTooltip v-else-if="column.key === 'description'" :title="record.description">
        <span class="line-clamp-2 text-ink-2 [overflow-wrap:anywhere]" data-dt-pick-description>{{ record.description || '—' }}</span>
      </ZTooltip>
      <span v-else-if="column.key === 'quantity'" class="tabular-nums">{{ record.quantity || '—' }}</span>
      <span v-else-if="column.key === 'net'" class="tabular-nums">{{ num(record.netWeightKg) }}</span>
      <span v-else-if="column.key === 'value'" class="tabular-nums">{{ num(record.invoiceValue) }}</span>
    </template>
  </ZTable>
</template>
