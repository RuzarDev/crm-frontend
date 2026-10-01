<!-- crm-frontend/src/components/Import40FactPaymentsSection.vue -->
<template>
  <div class="fact-payments">
    <div class="section-bar">
      <span class="section-label">{{ t('sales.fakticheskiUplachennyePlatezhiBlok') }}</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">{{ t('sales.platezh') }}</a-button>
    </div>
    <div v-if="!items.length" class="empty-state">{{ t('sales.platezhiNeVneseny') }}</div>
    <div v-for="(p, i) in items" :key="i" class="payment-row">
      <a-auto-complete v-model:value="p.taxModeCode" size="small" :disabled="readonly" :options="taxModeOptions" :placeholder="t('sales.vid2010')" style="width: 140px" @change="emitChange" />
      <a-input-number v-model:value="p.amount" size="small" :disabled="readonly" :placeholder="t('sales.summa')" style="width: 140px" @change="emitChange" />
      <a-input-number v-model:value="p.exchangeRate" size="small" :disabled="readonly" :placeholder="t('sales.kurs')" style="width: 90px" @change="emitChange" />
      <a-date-picker v-model:value="p.paymentDocDate" size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :placeholder="t('sales.dataPlatezhki')" style="width: 150px" allow-clear @change="emitChange" />
      <a-input v-model:value="p.payerTaxpayerId" size="small" :disabled="readonly" :placeholder="t('sales.iinBinPlatelschika')" style="width: 150px" @change="emitChange" />
      <a-date-picker v-model:value="p.paymentDate" size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :placeholder="t('sales.dataOplaty')" style="width: 140px" allow-clear @change="emitChange" />
      <a-select v-model:value="p.paymentMethodCode" size="small" :disabled="readonly" :options="methodOptions" style="width: 100px" @change="emitChange" />
      <a-button v-if="!readonly" type="text" danger size="small" @click="removeItem(i)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { Import40FactPayment } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const { t } = useI18n()

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

const classifiers = useClassifiersStore()
const taxModeOptions = computed(() => classifiers.options('tax-modes'))
const methodOptions = computed(() => classifiers.options('payment-methods'))

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
