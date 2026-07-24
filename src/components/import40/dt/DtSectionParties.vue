<template>
  <div class="dt-section">
    <div class="dt-grid-2 dt-checkboxes">
      <a-checkbox v-model:checked="form.consigneeEqualsDeclarant" :disabled="readonly" @change="emitChange">
        Получатель = декларант
      </a-checkbox>
      <a-checkbox v-model:checked="form.financialSubjectEqualsDeclarant" :disabled="readonly" @change="emitChange">
        Лицо, ответственное за фин. урегулирование = декларант
      </a-checkbox>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="2" text="Отправитель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.sender!.name" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.sender!.countryCode" show-search allow-clear :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.sender!.city" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.sender!.region" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.sender!.street" @change="emitChange" /></a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="8" text="Получатель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.receiver!.name" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.receiver!.countryCode" show-search allow-clear :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.receiver!.city" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.receiver!.region" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.receiver!.street" @change="emitChange" /></a-form-item>
    </div>

    <template v-if="!form.financialSubjectEqualsDeclarant">
      <div class="dt-section-bar"><DtGraphLabel graph="9" text="Лицо, ответственное за фин. урегулирование" /></div>
      <div class="dt-grid-3">
        <a-form-item label="Наименование"><a-input v-model:value="form.financialSubjectName" @change="emitChange" /></a-form-item>
        <a-form-item label="БИН"><a-input v-model:value="form.financialSubjectBin" @change="emitChange" /></a-form-item>
        <a-form-item label="Страна">
          <a-select v-model:value="form.financialSubjectCountryCode" show-search allow-clear :options="countryOptions" @change="emitChange" />
        </a-form-item>
        <a-form-item label="Город"><a-input v-model:value="form.financialSubjectCity" @change="emitChange" /></a-form-item>
        <a-form-item label="Область"><a-input v-model:value="form.financialSubjectRegion" @change="emitChange" /></a-form-item>
        <a-form-item label="Улица"><a-input v-model:value="form.financialSubjectStreet" @change="emitChange" /></a-form-item>
      </div>
    </template>

    <div class="dt-section-bar"><DtGraphLabel graph="14" text="Декларант" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.declarantName" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.declarantBin" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.declarantCountryCode" show-search allow-clear :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.declarantCity" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.declarantRegion" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.declarantStreet" @change="emitChange" /></a-form-item>
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
</script>
