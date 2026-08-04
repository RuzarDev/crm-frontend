<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="20" text="Условия поставки" /></template>
        <a-auto-complete v-model:value="form.incoterms" :options="classifiers.options('incoterms')"
          :disabled="readonly" placeholder="FOB / CIF" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="20" text="Место Инкотермс" /></template>
        <a-input v-model:value="form.incotermsPlace" :disabled="readonly" placeholder="Алматы" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="22" text="Валюта" /></template>
        <a-input v-model:value="form.currency" :disabled="readonly" placeholder="USD" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="22" text="Общая фактурная стоимость" /></template>
        <a-input-number v-model:value="form.totalInvoiceValue" :disabled="readonly" style="width: 100%" :min="0" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="23" text="Курс" /></template>
        <a-input-number v-model:value="form.exchangeRate" :disabled="readonly" style="width: 100%" :min="0" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="12" text="Общая таможенная стоимость" /></template>
        <a-input :value="totals.customsValue" disabled />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="24" text="Характер сделки" /></template>
        <a-auto-complete v-model:value="form.transactionNatureCode" :options="classifiers.options('transaction-natures')"
          :disabled="readonly" placeholder="021" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="24" text="Особенность сделки" /></template>
        <a-input v-model:value="form.transactionFeatureCode" :disabled="readonly" placeholder="000" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Тип ставок (КЕДЕН)">
        <a-auto-complete v-model:value="form.rateType" :options="classifiers.options('rate-types')"
          :disabled="readonly" placeholder="ETT" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-section-bar">
      <span class="dt-section-label">РАСХОДЫ (для распределения на таможенную стоимость)</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addExpense">+ Расход</a-button>
    </div>
    <div v-if="(form.expenses ?? []).length" class="dt-expenses-header">
      <span>Статья расхода</span><span>Сумма</span><span>Валюта</span><span />
    </div>
    <!-- Биндим напрямую на объекты form.expenses (не на копии) — иначе правки
         в селектах/полях теряются при следующем ререндере, см. аналогичный
         паттерн payments в Import40GoodsKedenPanel.vue -->
    <div v-for="(e, i) in form.expenses ?? []" :key="i" class="dt-expense-row">
      <a-select
        v-model:value="e.expenseTypeCode" :options="expenseTypeOptions" :disabled="readonly"
        show-search :filter-option="filterOption" placeholder="Статья расхода" @change="emitChange"
      />
      <a-input-number v-model:value="e.amount" :disabled="readonly" :min="0" @change="emitChange" />
      <a-select
        v-model:value="e.currencyCode" :options="currencyOptions" :disabled="readonly"
        show-search :filter-option="filterOption" placeholder="Валюта" @change="emitChange"
      />
      <a-button v-if="!readonly" type="text" danger size="small" @click="removeExpense(i)">✕</a-button>
    </div>
    <div v-if="!(form.expenses ?? []).length" class="muted">Расходов нет</div>

    <div class="dt-expenses-actions">
      <a-button v-if="!readonly" @click="emit('calc-customs-value')">
        Рассчитать там. стоимость (распределить расходы)
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  totals: { goods: number; places: number; customsValue: number }
  expenseTypeOptions: { value: string; label: string }[]
  currencyOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  'update:modelValue': [Import40DtFormState]
  'calc-customs-value': []
}>()

const classifiers = useClassifiersStore()
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

const filterOption = (input: string, option: { label?: string }) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const addExpense = () => {
  form.expenses = [...(form.expenses ?? []), { expenseTypeCode: null, amount: null, currencyCode: null }]
  emitChange()
}

const removeExpense = (index: number) => {
  form.expenses = (form.expenses ?? []).filter((_, i) => i !== index)
  emitChange()
}
</script>

<style scoped>
.dt-expenses-header,
.dt-expense-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 32px;
  gap: 8px;
  align-items: center;
}
.dt-expenses-header {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--atg-muted);
}
.dt-expense-row {
  margin-bottom: 8px;
}
.dt-expenses-actions {
  margin-top: 8px;
  margin-bottom: 20px;
}
.muted {
  color: var(--atg-muted);
  font-size: 12px;
  margin-bottom: 12px;
}
</style>
