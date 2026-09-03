<!-- crm-frontend/src/components/Import40GoodsKedenPanel.vue -->
<template>
  <div class="keden-panel">
    <div class="section-bar">
      <span class="section-label">ДАННЫЕ КЕДЕН ПО ТОВАРАМ (гр.31/36/43–47)</span>
      <div class="header-buttons">
        <a-button v-if="!readonly && items.length > 1" size="small" @click="applyMonthsToAll">
          Проставить месяцы всем товарам
        </a-button>
        <a-button v-if="!readonly" size="small" @click="emit('calc-tpin')">Рассчитать ТПиН (авто)</a-button>
      </div>
    </div>

    <!-- Гр.47 — платежи: явная, всегда развёрнутая подсекция (не внутри свёрнутого
         a-collapse ниже) — раньше платежи были видны только после раскрытия панели
         товара, декларант их не находила. Показываем то, что реально записано в
         g.payments; редактирование строк остаётся в панели товара ниже. -->
    <div v-if="items.length" class="section-bar payments-summary-bar">
      <span class="section-label">ГР.47 — ПЛАТЕЖИ</span>
    </div>
    <a-table
      v-if="paymentsSummaryRows.length"
      class="payments-summary-table"
      :data-source="paymentsSummaryRows"
      :columns="paymentsSummaryColumns"
      :pagination="false"
      size="small"
      row-key="key"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'base' || column.key === 'rate' || column.key === 'amount'">
          {{ fmtAmount(record[column.key]) }}
        </template>
      </template>
    </a-table>
    <div v-else-if="items.length" class="empty-state payments-summary-empty">
      Платежи гр.47 не рассчитаны — нажмите «Рассчитать ТПиН (авто)» выше или «Рассчитать платежи» в шапке ДТ.
    </div>

    <a-collapse v-if="items.length" ghost>
      <a-collapse-panel v-for="(g, i) in items" :key="i" :header="`Товар ${i + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`">
        <template #extra>
          <a-tag v-if="g.needsTpinRecalc" color="orange" @click.stop>Пересчитать ТПиН</a-tag>
        </template>
        <div class="field-row">
          <div class="field"><div class="field-label">Торговая марка</div>
            <a-input v-model:value="g.tradeMarkName" size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Знак</div>
            <a-input v-model:value="g.productMarkName" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Модель</div>
            <a-input v-model:value="g.productModelName" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Артикул</div>
            <a-input v-model:value="g.productArticle" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field f-2"><div class="field-label">Производитель</div>
            <a-input v-model:value="g.manufacturerName" size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Вид упаковки</div>
            <a-auto-complete v-model:value="g.packageKindCode" size="small" :disabled="readonly"
              :options="pkgOptions" placeholder="PK" @change="sync" /></div>
          <div class="field"><div class="field-label">Грузовых мест</div>
            <a-input-number v-model:value="g.cargoPlacesQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Упаковок</div>
            <a-input-number v-model:value="g.packageQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Преференция: сбор</div>
            <a-auto-complete v-model:value="g.prefClearanceCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Пошлина</div>
            <a-auto-complete v-model:value="g.prefDutyCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Акциз</div>
            <a-auto-complete v-model:value="g.prefExciseCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="Z" @change="sync" /></div>
          <div class="field"><div class="field-label">НДС</div>
            <a-auto-complete v-model:value="g.prefVatCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
        </div>
        <div v-if="containerIndicator" class="field-row">
          <div class="field"><div class="field-label">Номер контейнера (гр.31.3)</div>
            <a-input v-uppercase v-model:value="g.containerNumber" size="small" :disabled="readonly" placeholder="GLDU9071686" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Процедура (гр.37)</div>
            <a-input v-model:value="g.procedureCode" size="small" :disabled="readonly" placeholder="4000" @change="sync" /></div>
          <div class="field"><div class="field-label">Предш. процедура</div>
            <a-auto-complete v-model:value="g.previousProcedureCode" size="small" :disabled="readonly" :options="procOptions" placeholder="00" @change="sync" /></div>
          <div class="field"><div class="field-label">Особенность перемещения</div>
            <a-auto-complete v-model:value="g.goodsMoveFeatureCode" size="small" :disabled="readonly" :options="moveFeatureOptions" placeholder="000" @change="sync" /></div>
          <div class="field"><div class="field-label">Метод ТС (гр.43)</div>
            <a-auto-complete v-model:value="g.valuationMethodCode" size="small" :disabled="readonly" :options="valuationOptions" placeholder="1" @change="sync" /></div>
          <div class="field"><div class="field-label">Квота (гр.39)</div>
            <a-input-number v-model:value="g.quotaAmount" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Кол-во месяцев (врем. ввоз)</div>
            <a-input-number v-model:value="g.tempImportMonths" size="small" :disabled="readonly" :min="0" :precision="0" style="width: 100%" placeholder="0" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Таможенная стоимость, ₸ (гр.45)</div>
            <a-input-number v-model:value="g.customsValueKzt" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Статистическая, USD (гр.46)</div>
            <a-input-number v-model:value="g.statisticValueUsd" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Код запрета</div>
            <a-input v-model:value="g.prohibitionCode" size="small" :disabled="readonly" placeholder="D0110" @change="sync" /></div>
          <div class="field"><div class="field-label">Код ИС</div>
            <a-input v-model:value="g.ipoCode" size="small" :disabled="readonly" placeholder="N" @change="sync" /></div>
        </div>

        <div class="section-bar payments-bar">
          <span class="section-label">ПЛАТЕЖИ гр.47</span>
          <a-tag v-if="g.tempImportMonths" color="blue">Врем. ввоз: 3%×{{ g.tempImportMonths }} мес</a-tag>
          <a-button v-if="!readonly" type="dashed" size="small" @click="addPayment(g)">+ Строка</a-button>
        </div>
        <div v-for="(p, pi) in sortedPayments(g)" :key="pi" class="payment-row">
          <a-auto-complete v-model:value="p.taxModeCode" size="small" :disabled="readonly" :options="taxModeOptions" placeholder="Вид (2010)" style="width: 140px" @change="sync" />
          <a-input-number v-model:value="p.taxBase" size="small" :disabled="readonly" placeholder="Основа" style="width: 130px" @change="sync" />
          <a-select v-model:value="p.rateKindCode" size="small" :disabled="readonly" :options="rateKindOptions" placeholder="Вид ставки" style="width: 130px" @change="sync" />
          <a-input-number v-model:value="p.rateValue" size="small" :disabled="readonly" placeholder="Ставка" style="width: 100px" @change="sync" />
          <template v-if="p.rateKindCode === '*'">
            <a-input v-model:value="p.rateUnitCode" size="small" :disabled="readonly" placeholder="ОКЕИ (166)" style="width: 90px" @change="sync" />
            <a-input v-model:value="p.rateCurrencyCode" size="small" :disabled="readonly" placeholder="Валюта N3 (978)" style="width: 110px" @change="sync" />
            <a-input-number v-model:value="p.weightRatio" size="small" :disabled="readonly" placeholder="Коэф." style="width: 80px" @change="sync" />
          </template>
          <a-date-picker v-model:value="p.rateDate" size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" placeholder="Дата" style="width: 130px" allow-clear @change="sync" />
          <a-input-number v-model:value="p.amountKzt" size="small" :disabled="readonly" placeholder="Сумма, ₸" style="width: 130px" @change="sync" />
          <a-button v-if="!readonly" type="text" danger size="small" @click="removePayment(g, p)"><CloseOutlined /></a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
    <div v-else class="empty-state">Сначала добавьте товары</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { Import40GoodsItemInput, Import40GoodsPayment } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const props = defineProps<{
  modelValue: Import40GoodsItemInput[]
  readonly?: boolean
  // гр.19: показываем поле «Номер контейнера» (гр.31.3) только при контейнерных
  // перевозках — иначе поле не заполняется и загромождает панель.
  containerIndicator?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Import40GoodsItemInput[]): void
  (e: 'calc-tpin'): void
}>()

const items = computed(() => props.modelValue)

// Русские названия видов платежа гр.47 (см. tax-modes в DatabaseExtensions.cs
// на бэке) — для явной, не-кодовой подписи в сводной таблице ниже.
const TAX_MODE_LABELS: Record<string, string> = {
  '2010': 'Пошлина',
  '4010': 'Акциз',
  '1010': 'Сбор',
  '5060': 'НДС',
}
const taxModeLabel = (code: string | null | undefined) =>
  code ? (TAX_MODE_LABELS[code] ?? code) : '—'

// Порядок гр.47 в отображении: Сборы (1010) → Пошлина (2010) → НДС (5060) → прочие,
// как их уже отдаёт backend calculate-payments (Task 3) — сортируем то же самое, что
// пришло в g.payments, чтобы визуальный порядок совпадал с ответом расчёта.
const TAX_MODE_PRIORITY: Record<string, number> = { '1010': 0, '2010': 1, '5060': 2 }
const taxModePriority = (code: string | null | undefined) =>
  code != null && code in TAX_MODE_PRIORITY ? TAX_MODE_PRIORITY[code] : 99

const sortedPayments = (g: Import40GoodsItemInput): Import40GoodsPayment[] =>
  [...(g.payments ?? [])].sort((a, b) => taxModePriority(a.taxModeCode) - taxModePriority(b.taxModeCode))

interface PaymentsSummaryRow {
  key: string
  goods: string
  taxMode: string
  base: number | null
  rate: number | null
  amount: number | null
}

const paymentsSummaryColumns = [
  { title: 'Товар', dataIndex: 'goods', key: 'goods', width: 220, ellipsis: true },
  { title: 'Вид платежа', dataIndex: 'taxMode', key: 'taxMode', width: 140 },
  { title: 'Основа', dataIndex: 'base', key: 'base', width: 130 },
  { title: 'Ставка', dataIndex: 'rate', key: 'rate', width: 110 },
  { title: 'Сумма, ₸', dataIndex: 'amount', key: 'amount', width: 140 },
]

const fmtAmount = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const paymentsSummaryRows = computed<PaymentsSummaryRow[]>(() => {
  const rows: PaymentsSummaryRow[] = []
  items.value.forEach((g, gi) => {
    sortedPayments(g).forEach((p, pi) => {
      rows.push({
        key: `${gi}-${pi}`,
        goods: `Товар ${gi + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`,
        taxMode: taxModeLabel(p.taxModeCode),
        base: p.taxBase ?? null,
        rate: p.rateValue ?? null,
        amount: p.amountKzt ?? null,
      })
    })
  })
  return rows
})

// ВАЖНО: эмитим НОВЫЙ массив с копиями объектов. ReestrGoodsSection выше по форме
// держит внутренние копии строк и пересинхронизируется только по watch на modelValue;
// эмит той же ссылки не триггерит watch — его копии остались бы без КЕДЕН-правок,
// и следующее редактирование товара там откатило бы поля этой панели.
const sync = () =>
  emit(
    'update:modelValue',
    props.modelValue.map((g) => ({ ...g, payments: (g.payments ?? []).map((p) => ({ ...p })) })),
  )

const classifiers = useClassifiersStore()
const pkgOptions = computed(() => classifiers.options('2013'))
const prefOptions = computed(() => classifiers.options('2008'))
const taxModeOptions = computed(() => classifiers.options('tax-modes'))
const rateKindOptions = computed(() => classifiers.options('rate-kinds'))
const valuationOptions = computed(() => classifiers.options('2005'))
const procOptions = computed(() => classifiers.options('customs-procedures'))
const moveFeatureOptions = computed(() => classifiers.options('movement-features'))

const emptyPayment = (): Import40GoodsPayment => ({
  taxModeCode: null, taxBase: null, rateKindCode: '%', rateValue: null,
  rateUnitCode: null, rateCurrencyCode: null, weightRatio: null,
  rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: null,
})

const addPayment = (g: Import40GoodsItemInput) => {
  g.payments = [...(g.payments ?? []), emptyPayment()]
  sync()
}

// Принимает саму строку платежа (а не индекс) — строки рендерятся из
// sortedPayments(g), отсортированной копии, чей порядок индексов не совпадает
// с исходным g.payments; сравниваем по ссылке на объект.
const removePayment = (g: Import40GoodsItemInput, payment: Import40GoodsPayment) => {
  g.payments = (g.payments ?? []).filter((p) => p !== payment)
  sync()
}

// Task 6b: копирует g.tempImportMonths первого товара во все остальные.
const applyMonthsToAll = () => {
  const months = items.value[0]?.tempImportMonths ?? null
  items.value.forEach((g) => { g.tempImportMonths = months })
  sync()
}
</script>

<style scoped>
.keden-panel { display: flex; flex-direction: column; gap: 8px; }
.section-bar { display: flex; align-items: center; justify-content: space-between; }
.header-buttons { display: flex; align-items: center; gap: 8px; }
.section-label { font-size: 12px; font-weight: 600; color: var(--atg-muted); }
.payments-bar { margin-top: 12px; }
.payments-summary-bar { margin-top: 4px; }
.payments-summary-table { margin-bottom: 8px; }
.payments-summary-empty { margin-bottom: 8px; }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; }
.field.f-2 { flex: 2; }
.field-label { font-size: 11px; color: var(--atg-muted); margin-bottom: 2px; }
.payment-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.empty-state { color: var(--atg-muted); font-size: 12px; }
</style>
