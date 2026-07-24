<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="1" text="Тип декларации" /></template>
        <a-auto-complete v-model:value="form.declarationTypeCode" :options="classifiers.options('declaration-types')"
          placeholder="ИМ" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="1" text="Процедура" /></template>
        <a-input v-model:value="form.procedureCode" placeholder="40" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="1" text="Признак" /></template>
        <a-input v-model:value="form.declarationFeatureCode" placeholder="ЭД" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="3" text="Лист номер" /></template>
        <a-input-number v-model:value="form.sheetNumber" style="width: 100%" :min="1" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="3" text="Всего листов" /></template>
        <a-input-number v-model:value="form.totalSheets" style="width: 100%" :min="1" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="4" text="Отгрузочные спецификации" /></template>
        <a-input-number v-model:value="form.shippingSpecSheets" style="width: 100%" :min="0" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="7" text="Справочный номер" /></template>
        <a-input v-model:value="form.referenceNumber" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="5" text="Всего товаров" /></template>
        <a-input :value="totals.goods" disabled />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="6" text="Всего мест" /></template>
        <a-input :value="totals.places" disabled />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState } from '@/api/import40'

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
