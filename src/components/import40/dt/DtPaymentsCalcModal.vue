<!-- crm-frontend/src/components/import40/dt/DtPaymentsCalcModal.vue
     Task 10b: читаемая (светлый фон, обычный AntD a-modal) модалка расчёта
     платежей гр.47/гр.B — заменяет прежний нечитаемый "чёрный" попап, на
     который жаловалась декларант. Числа здесь ВСЕГДА берутся из последнего
     ответа calculate-payments (result prop), клиент их не пересчитывает —
     см. требование консистентности в брифе Task 10. -->
<template>
  <a-modal
    :open="open"
    :title="t('dt.raschetPlatezheyGr47Grb')"
    width="820px"
    :confirm-loading="applying"
    :ok-text="t('dt.zapisatVGr47I')"
    :cancel-text="t('dt.zakryt')"
    :ok-button-props="{ disabled: !result }"
    @update:open="(v: boolean) => emit('update:open', v)"
    @ok="emit('apply')"
    @cancel="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
      <div v-if="!result && !loading" class="calc-empty">{{ t('dt.netDannyhRascheta') }}</div>

      <template v-else-if="result">
        <div v-for="row in result.goodsRows" :key="row.index" class="goods-block">
          <div class="goods-block-header">
            <span class="goods-title">{{ goodsLabel(row.index) }}</span>
            <a-tag v-if="tempImportMonths(row.index)" color="blue">{{ t('dt.vremVvoz', { months: tempImportMonths(row.index) }) }}</a-tag>
            <a-tag v-if="row.excisePossible" color="orange">{{ t('dt.vozmozhenAkcizProverteTnved') }}</a-tag>
          </div>

          <!-- Товар не посчитался (нет кода в справочнике ТН ВЭД, не задана стоимость и т.п.):
               строк гр.47 по нему нет — показываем причину вместо пустой таблицы. -->
          <a-alert v-if="row.error" type="error" show-icon :message="row.error" class="goods-error" />
          <!-- Пояснения расчёта: акциз/пошлина не посчитаны без нужного количества, вид акциза по умолчанию… -->
          <a-alert v-else-if="row.notes" type="warning" show-icon :message="t('dt.raschetPoyasneniya')" class="goods-error">
            <template #description>
              <div v-for="(n, ni) in row.notes.split('; ')" :key="ni">{{ n }}</div>
            </template>
          </a-alert>

          <div class="goods-vat-toggle">
            <a-checkbox
              :checked="isMedical(row.index)"
              :disabled="readonly"
              @change="(e: any) => emit('toggle-medical', row.index, e.target.checked)"
            > {{ t('dt.medizdelieNds5') }} </a-checkbox>
          </div>

          <a-table
            v-if="!row.error"
            :data-source="rowsFor(row)"
            :columns="goodsColumns"
            :pagination="false"
            size="small"
            row-key="taxModeCode"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'amount'">
                {{ fmt2(record[column.key]) }}
              </template>
              <template v-else-if="column.key === 'base'">
                {{ record.basisLabel ?? fmt2(record.base) }}
              </template>
              <template v-else-if="column.key === 'rate'">
                {{ rateDisplay(record, row.index) }}
              </template>
              <template v-else-if="column.key === 'sp'">
                {{ record.featureCode || '—' }}
              </template>
            </template>
          </a-table>

          <!-- Task 10, №2: гр.B (детализация) — строки, которые лягут в гр.B по кнопке
               «Записать в гр.47 и гр.B» (см. FormatBLine на бэке). -->
          <div v-if="bLinesFor(row).length" class="b-line-row">
            <span class="b-line-label">{{ t('dt.grb') }}</span>
            <span class="b-line-value">{{ bLinesFor(row).join('; ') }}</span>
          </div>
        </div>

        <div class="totals-block">
          <div class="totals-row" v-for="(amount, code) in result.totalsByTaxMode" :key="code">
            <span class="totals-label">{{ taxModeLabel(String(code)) }}</span>
            <span class="totals-value">{{ fmt2(amount) }} ₸</span>
          </div>
        </div>

        <div class="grand-total">
          <span class="grand-total-label">{{ t('dt.itogoGrb') }}</span>
          <span class="grand-total-value">{{ fmt0(result.grandTotalB) }} ₸</span>
        </div>
      </template>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Import40CalculatePaymentsResponse, Import40PaymentGoodsRowDto } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'

const { t } = useI18n()

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
const TAX_MODE_LABELS = computed((): Record<string, string> => ({

  '2010': t('dt.poshlina'),
  '4010': t('dt.akciz'),
  '1010': t('dt.sbor'),
  '5060': t('dt.nds'),
}))
const taxModeLabel = (code: string) => TAX_MODE_LABELS.value[code] ?? code

const goodsLabel = (index: number) => {
  const g = props.goods[index]
  if (!g) return t('dt.tovarIndex1', { n: index + 1 })
  return t('dt.tovarIndex1G', { n: index + 1, code: g.tnvedCode || t('dt.bezKoda'), desc: g.description || '' })
}

const isMedical = (index: number) => (props.goods[index]?.vatRatePreferential ?? null) === 0.05

// Task 6c: подпись множителя для временного ввоза — суммы в rows уже посчитаны
// backend'ом (Task 3, ×3%×мес), здесь только показываем это декларанту.
const tempImportMonths = (index: number) => props.goods[index]?.tempImportMonths ?? null

// Task 10, №9: Вид / Основа начисления / Ставка / Сумма / СП.
const goodsColumns = computed(() => ([

  { title: t('dt.vid'), dataIndex: 'taxModeCode', key: 'taxModeCode', width: 120,
    customRender: ({ text }: { text: string }) => taxModeLabel(text) },
  { title: t('dt.osnovaNachisleniya'), dataIndex: 'base', key: 'base', width: 170 },
  { title: t('dt.stavka'), dataIndex: 'rate', key: 'rate', width: 150 },
  { title: t('dt.summa'), dataIndex: 'amount', key: 'amount', width: 140 },
  { title: t('dt.sp'), dataIndex: 'featureCode', key: 'sp', width: 60 },
]))
const rowsFor = (row: Import40PaymentGoodsRowDto) => row.rows

// Task 10, №2: строки гр.B ("{код}-{сумма}-398-{дата}-БН"), присланные бэком
// для каждой строки гр.47 этого товара.
const bLinesFor = (row: Import40PaymentGoodsRowDto): string[] =>
  row.rows.map((r) => r.bLine).filter((v): v is string => !!v)

// Task 10, №13: RateLabel с бэка — НОМИНАЛЬНАЯ ставка (без коэфф. временного
// ввоза, см. Import40PaymentCalculator.cs); аннотируем 2010/5060, чтобы не
// выглядело как ошибка расчёта рядом с уже уменьшенной суммой.
const TEMP_IMPORT_ANNOTATED_CODES = new Set(['2010', '5060'])
const rateDisplay = (record: { taxModeCode: string; rate?: number | null; rateLabel?: string | null }, goodsIndex: number) => {
  const label = record.rateLabel ?? fmt2(record.rate)
  const months = tempImportMonths(goodsIndex)
  if (!months || !TEMP_IMPORT_ANNOTATED_CODES.has(record.taxModeCode) || record.rateLabel == null) return label
  return t('dt.label3MonthsMes', { label, months })
}

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
.goods-error { margin-bottom: 10px; }
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
.b-line-row {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}
.b-line-label {
  font-weight: 600;
  margin-right: 6px;
}
.b-line-value {
  font-variant-numeric: tabular-nums;
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
