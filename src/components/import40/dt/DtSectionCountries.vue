<template>
  <div class="dt-section">
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="15" text="Страна отправления (ОКСМ)" /></template>
        <a-select v-model:value="form.departureCountryCode" show-search allow-clear
          :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="17" text="Страна назначения (ОКСМ)" /></template>
        <a-select v-model:value="form.destinationCountryCode" show-search allow-clear
          :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="11" text="Торгующая страна (ОКСМ)" /></template>
        <a-select v-model:value="form.tradeCountryCode" show-search allow-clear
          :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="16" text="Страна происхождения (шапка)" /></template>
        <a-select v-model:value="form.originCountryCode" show-search allow-clear
          :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" @change="emitChange" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import type { Import40DtFormState } from '@/api/import40'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  countryOptions?: { value: string; label: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}
</script>
