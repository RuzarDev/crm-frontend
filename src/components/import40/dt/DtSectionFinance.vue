<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="20" text="Условия поставки" /></template>
        <a-input v-model:value="form.incoterms" :disabled="readonly" placeholder="FOB / CIF" @change="emitChange" />
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
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })
</script>
