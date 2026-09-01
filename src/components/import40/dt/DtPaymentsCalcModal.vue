<!-- crm-frontend/src/components/import40/dt/DtPaymentsCalcModal.vue
     Task 10b: читаемая (светлый фон, обычный AntD a-modal) модалка расчёта
     платежей гр.47/гр.B — заменяет прежний нечитаемый "чёрный" попап, на
     который жаловалась декларант. Числа здесь ВСЕГДА берутся из последнего
     ответа calculate-payments (result prop), клиент их не пересчитывает —
     см. требование консистентности в брифе Task 10. -->
<template>
  <a-modal
    :open="open"
    title="Расчёт платежей (гр.47 / гр.B)"
    width="820px"
    :confirm-loading="applying"
    ok-text="Записать в гр.47 и гр.B"
    cancel-text="Закрыть"
    :ok-button-props="{ disabled: !result }"
    @update:open="(v: boolean) => emit('update:open', v)"
    @ok="emit('apply')"
    @cancel="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
      <div v-if="!result && !loading" class="calc-empty">Нет данных расчёта</div>

      <template v-else-if="result">
        <div v-for="row in result.goodsRows" :key="row.index" class="goods-block">
          <div class="goods-block-header">
            <span class="goods-title">{{ goodsLabel(row.index) }}</span>
            <a-tag v-if="row.excisePossible" color="orange">Возможен акциз — проверьте ТНВЭД</a-tag>
          </div>

          <div class="goods-vat-toggle">
            <a-checkbox
              :checked="isMedical(row.index)"
              :disabled="readonly"
              @change="(e: any) => emit('toggle-medical', row.index, e.target.checked)"
            >
              Медизделие (НДС 5%)
            </a-checkbox>
          </div>

          <a-table
            :data-source="rowsFor(row)"
            :columns="goodsColumns"
            :pagination="false"
            size="small"
            row-key="taxModeCode"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'base' || column.key === 'rate' || column.key === 'amount'">
                {{ fmt2(record[column.key]) }}
              </template>
            </template>
          </a-table>
        </div>

        <div class="totals-block">
          <div class="totals-row" v-for="(amount, code) in result.totalsByTaxMode" :key="code">
            <span class="totals-label">{{ taxModeLabel(String(code)) }}</span>
            <span class="totals-value">{{ fmt2(amount) }} ₸</span>
          </div>
        </div>

        <div class="grand-total">
          <span class="grand-total-label">Итого гр.B</span>
          <span class="grand-total-value">{{ fmt0(result.grandTotalB) }} ₸</span>
        </div>
      </template>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import type { Import40CalculatePaymentsResponse, Import40PaymentGoodsRowDto } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'

const props = defineProps<{
  open: boolean
  loading?: boolean
  applying?: boolean
  readonly?: boolean
  result: Import40CalculatePaymentsResponse | null
  goods: Import40GoodsItemInput[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'toggle-medical', index: number, checked: boolean): void
  (e: 'apply'): void
}>()

// Коды видов платежа гр.47 → русские названия (см. tax-modes в
// DatabaseExtensions.cs на бэке) — тот же список, что и в Import40GoodsKedenPanel,
// намеренно не выносим в общий модуль ради простоты (Task 10, две небольших карты).
const TAX_MODE_LABELS: Record<string, string> = {
  '2010': 'Пошлина',
  '4010': 'Акциз',
  '1010': 'Сбор',
  '5060': 'НДС',
}
const taxModeLabel = (code: string) => TAX_MODE_LABELS[code] ?? code

const goodsLabel = (index: number) => {
  const g = props.goods[index]
  if (!g) return `Товар ${index + 1}`
  return `Товар ${index + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`
}

const isMedical = (index: number) => (props.goods[index]?.vatRatePreferential ?? null) === 0.05

const goodsColumns = [
  { title: 'Вид платежа', dataIndex: 'taxModeCode', key: 'taxModeCode', width: 140,
    customRender: ({ text }: { text: string }) => taxModeLabel(text) },
  { title: 'Основа', dataIndex: 'base', key: 'base', width: 160 },
  { title: 'Ставка', dataIndex: 'rate', key: 'rate', width: 110 },
  { title: 'Сумма, ₸', dataIndex: 'amount', key: 'amount', width: 150 },
]

const rowsFor = (row: Import40PaymentGoodsRowDto) => row.rows

const fmt2 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
</script>

<style scoped>
/* Явно светлая тема — сознательная противоположность прежнему "чёрному"
   нечитаемому попапу (жалоба декларанта), поэтому фон/текст фиксированы
   и не следуют тёмной теме приложения. */
:deep(.ant-modal-content) {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.88);
}
:deep(.ant-modal-header) {
  background: #ffffff;
}

.calc-empty {
  padding: 24px;
  text-align: center;
  color: rgba(0, 0, 0, 0.45);
}

.goods-block {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.goods-block:last-of-type {
  border-bottom: none;
}
.goods-block-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.goods-title {
  font-weight: 600;
  font-size: 13px;
}
.goods-vat-toggle {
  margin-bottom: 8px;
}

.totals-block {
  margin-top: 8px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.totals-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.totals-label {
  color: rgba(0, 0, 0, 0.65);
}
.totals-value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.grand-total {
  margin-top: 14px;
  padding: 14px 16px;
  background: #f0f7ff;
  border: 1px solid #91caff;
  border-radius: 8px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.grand-total-label {
  font-size: 14px;
  font-weight: 600;
  color: #0958d9;
}
.grand-total-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0958d9;
}
</style>
