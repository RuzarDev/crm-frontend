<!-- crm-frontend/src/components/Import40FactPaymentsSection.vue -->
<template>
  <div class="fact-payments">
    <div class="section-bar">
      <span class="section-label">ФАКТИЧЕСКИ УПЛАЧЕННЫЕ ПЛАТЕЖИ (блок B)</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Платёж</a-button>
    </div>
    <div v-if="!items.length" class="empty-state">Платежи не внесены</div>
    <div v-for="(p, i) in items" :key="i" class="payment-row">
      <a-auto-complete v-model:value="p.taxModeCode" size="small" :disabled="readonly" :options="taxModeOptions" placeholder="Вид (2010)" style="width: 140px" @change="emitChange" />
      <a-input-number v-model:value="p.amount" size="small" :disabled="readonly" placeholder="Сумма" style="width: 140px" @change="emitChange" />
      <a-input-number v-model:value="p.exchangeRate" size="small" :disabled="readonly" placeholder="Курс" style="width: 90px" @change="emitChange" />
      <a-input v-model:value="p.paymentDocDate" size="small" :disabled="readonly" placeholder="Дата платёжки ГГГГ-ММ-ДД" style="width: 170px" @change="emitChange" />
      <a-input v-model:value="p.payerTaxpayerId" size="small" :disabled="readonly" placeholder="ИИН/БИН плательщика" style="width: 150px" @change="emitChange" />
      <a-input v-model:value="p.paymentDate" size="small" :disabled="readonly" placeholder="Дата оплаты" style="width: 120px" @change="emitChange" />
      <a-select v-model:value="p.paymentMethodCode" size="small" :disabled="readonly" :options="methodOptions" style="width: 100px" @change="emitChange" />
      <a-button v-if="!readonly" type="text" danger size="small" @click="removeItem(i)">✕</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Import40FactPayment } from '@/types/api'
import { KEDEN_PAYMENT_METHODS, KEDEN_TAX_MODES, kedenOptions } from '@/constants/keden'

const props = defineProps<{
  modelValue: Import40FactPayment[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Import40FactPayment[]): void
}>()

const items = ref<Import40FactPayment[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((p) => ({ ...p })) },
  { immediate: true },
)

const taxModeOptions = kedenOptions(KEDEN_TAX_MODES)
const methodOptions = kedenOptions(KEDEN_PAYMENT_METHODS)

const emitChange = () => emit('update:modelValue', items.value.map((p) => ({ ...p })))

const addItem = () => {
  items.value.push({
    taxModeCode: null, amount: null, exchangeRate: 1,
    paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН',
  })
  emitChange()
}

const removeItem = (i: number) => {
  items.value.splice(i, 1)
  emitChange()
}
</script>

<style scoped>
.fact-payments { display: flex; flex-direction: column; gap: 8px; }
.section-bar { display: flex; align-items: center; justify-content: space-between; }
.section-label { font-size: 12px; font-weight: 600; color: var(--atg-muted); }
.payment-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.empty-state { color: var(--atg-muted); font-size: 12px; }
</style>
