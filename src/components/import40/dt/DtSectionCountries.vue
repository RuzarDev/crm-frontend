<template>
  <div class="dt-section">
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="15" :text="t('dt.stranaOtpravleniyaOksm')" /></template>
        <a-select v-model:value="form.departureCountryCode" show-search allow-clear :disabled="readonly"
          :options="countryOptions" :filter-option="filterCountry" :placeholder="t('dt.vyberiteStranuPoKodu')" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="17" :text="t('dt.stranaNaznacheniyaOksm')" /></template>
        <a-select v-model:value="form.destinationCountryCode" show-search allow-clear :disabled="readonly"
          :options="countryOptions" :filter-option="filterCountry" :placeholder="t('dt.vyberiteStranuPoKodu')" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="11" :text="t('dt.torguyuschayaStranaOksm')" /></template>
        <a-select v-model:value="form.tradeCountryCode" show-search allow-clear :disabled="readonly"
          :options="countryOptions" :filter-option="filterCountry" :placeholder="t('dt.vyberiteStranuPoKodu')" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="16" :text="t('dt.stranaProishozhdeniyaShapka')" /></template>
        <a-select v-model:value="form.originCountryCode" show-search allow-clear :disabled="readonly"
          :options="countryOptions" :filter-option="filterCountry" :placeholder="t('dt.vyberiteStranuPoKodu')" @change="emitChange" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const { t } = useI18n()

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
