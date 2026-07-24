<template>
  <div class="dt-section">
    <div class="dt-grid-2 dt-checkboxes">
      <a-checkbox v-model:checked="form.consigneeEqualsDeclarant" :disabled="readonly" @change="emitChange">
        Гр.8 · Получатель = декларант
      </a-checkbox>
      <a-checkbox v-model:checked="form.financialSubjectEqualsDeclarant" :disabled="readonly" @change="emitChange">
        Гр.9 · Лицо, ответственное за фин. урегулирование = декларант
      </a-checkbox>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="2" text="Отправитель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.sender.name" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.sender.countryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.sender.city" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.sender.region" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.sender.street" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="8" text="Получатель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.receiver.name" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.receiver.countryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.receiver.city" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.receiver.region" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.receiver.street" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>

    <template v-if="!form.financialSubjectEqualsDeclarant">
      <div class="dt-section-bar"><DtGraphLabel graph="9" text="Лицо, ответственное за фин. урегулирование" /></div>
      <div class="dt-grid-3">
        <a-form-item label="Наименование"><a-input v-model:value="form.financialSubjectName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="БИН"><a-input v-model:value="form.financialSubjectBin" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Страна">
          <a-select v-model:value="form.financialSubjectCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
        </a-form-item>
        <a-form-item label="Город"><a-input v-model:value="form.financialSubjectCity" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Область"><a-input v-model:value="form.financialSubjectRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Улица"><a-input v-model:value="form.financialSubjectStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
      </div>
    </template>

    <div class="dt-section-bar"><DtGraphLabel graph="14" text="Декларант" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-model:value="form.declarantName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.declarantBin" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.declarantCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-model:value="form.declarantCity" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-model:value="form.declarantRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-model:value="form.declarantStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import type { Import40DtFormState, Import40Party } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  countryOptions?: { value: string; label: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

// Локальная копия эмита emptyParty() из Import40DtView.vue — там она не
// экспортируется, поэтому дублируем форму по типу Import40Party.
function emptyParty(): Import40Party {
  return {
    name: null,
    countryCode: null,
    region: null,
    city: null,
    street: null,
  }
}

function buildForm(v: Import40DtFormState) {
  return {
    ...v,
    sender: { ...(v.sender ?? emptyParty()) },
    receiver: { ...(v.receiver ?? emptyParty()) },
  }
}

const form = reactive(buildForm(props.modelValue))

watch(
  () => props.modelValue,
  (v) => Object.assign(form, buildForm(v)),
  { deep: true },
)

const emitChange = () =>
  emit('update:modelValue', {
    ...props.modelValue,
    ...form,
    sender: { ...form.sender },
    receiver: { ...form.receiver },
  })
</script>
