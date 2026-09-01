<template>
  <div class="dt-section">
    <div class="dt-grid-2">
      <a-form-item>
        <template #label><DtGraphLabel graph="29" text="Пост на границе (код)" /></template>
        <a-input v-model:value="form.borderCustomsOfficeCode" :disabled="readonly" placeholder="код поста" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="29" text="Пост на границе (название)" /></template>
        <a-input v-uppercase v-model:value="form.borderCustomsOfficeName" :disabled="readonly" placeholder="название" @change="emitChange" />
      </a-form-item>
    </div>

    <a-form-item label="Орган подачи (код, КЕДЕН)">
      <a-input v-model:value="form.submissionCustomsOfficeCode" :disabled="readonly" placeholder="код органа подачи" style="max-width: 260px" @change="emitChange" />
    </a-form-item>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Место нахождения товаров" /></template>
        <a-auto-complete v-model:value="form.goodsLocationCode" :options="classifiers.options('goods-locations')"
          :disabled="readonly" placeholder="11" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Номер СВХ" /></template>
        <a-input v-uppercase v-model:value="form.goodsLocationRegisterNumber" :disabled="readonly" placeholder="Рег. номер СВХ" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="30" text="Страна места товаров" /></template>
        <a-select v-model:value="form.goodsLocationCountryCode" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState } from '@/api/import40'
import { ALPHA2_COUNTRIES } from '@/types/api'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

// Страна места товаров (гр.30) — 2-буквенный код (в КЕДЕН уходит буквами).
const countryAlpha2Options = ALPHA2_COUNTRIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
const filterAlpha2 = (input: string, option: { value: string; label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })
</script>
