<template>
  <div class="dt-section">
    <div class="dt-grid-2 dt-checkboxes">
      <a-checkbox v-model:checked="form.consigneeEqualsDeclarant" :disabled="readonly" @change="onConsigneeEqualsDeclarantChange">
        Гр.8 · Получатель = декларант
      </a-checkbox>
      <a-checkbox v-model:checked="form.financialSubjectEqualsDeclarant" :disabled="readonly" @change="onFinancialSubjectEqualsDeclarantChange">
        Гр.9 · Лицо, ответственное за фин. урегулирование = декларант
      </a-checkbox>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="2" text="Отправитель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-uppercase v-model:value="form.sender.name" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.sender.countryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.sender.city" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.sender.region" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.sender.street" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.senderHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="8" text="Получатель" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-uppercase v-model:value="form.receiver.name" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.receiverBin" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.receiver.countryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.receiver.city" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.receiver.region" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.receiver.street" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.receiverHouse" :disabled="readonly || form.consigneeEqualsDeclarant" @change="emitChange" /></a-form-item>
      <a-form-item label="Категория">
        <a-select v-model:value="form.receiverCategoryCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item label="КАТО">
        <a-select v-model:value="form.receiverKatoCode" show-search allow-clear :disabled="readonly || form.consigneeEqualsDeclarant" :options="classifiers.options('kato')" @change="emitChange" />
      </a-form-item>
    </div>

    <template v-if="!form.financialSubjectEqualsDeclarant">
      <div class="dt-section-bar"><DtGraphLabel graph="9" text="Лицо, ответственное за фин. урегулирование" /></div>
      <div class="dt-grid-3">
        <a-form-item label="Наименование"><a-input v-uppercase v-model:value="form.financialSubjectName" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="БИН"><a-input v-model:value="form.financialSubjectBin" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Страна">
          <a-select v-model:value="form.financialSubjectCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
        </a-form-item>
        <a-form-item label="Город"><a-input v-uppercase v-model:value="form.financialSubjectCity" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Область"><a-input v-uppercase v-model:value="form.financialSubjectRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.financialSubjectStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.financialSubjectHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
        <a-form-item label="Категория">
          <a-select v-model:value="form.financialSubjectCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
        </a-form-item>
        <a-form-item label="КАТО">
          <a-select v-model:value="form.financialSubjectKatoCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('kato')" @change="emitChange" />
        </a-form-item>
      </div>
    </template>

    <div class="dt-section-bar"><DtGraphLabel graph="14" text="Декларант" /></div>
    <div class="dt-grid-3">
      <a-form-item label="Наименование"><a-input v-uppercase v-model:value="form.declarantName" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="БИН"><a-input v-model:value="form.declarantBin" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Страна">
        <a-select v-model:value="form.declarantCountryCode" show-search allow-clear :disabled="readonly" :options="countryOptions" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Город"><a-input v-uppercase v-model:value="form.declarantCity" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Область"><a-input v-uppercase v-model:value="form.declarantRegion" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Улица"><a-input v-uppercase v-model:value="form.declarantStreet" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Дом"><a-input v-uppercase v-model:value="form.declarantHouse" :disabled="readonly" @change="emitChange" /></a-form-item>
      <a-form-item label="Категория">
        <a-select v-model:value="form.declarantCategoryCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('itn-categories')" @change="emitChange" />
      </a-form-item>
      <a-form-item label="КАТО">
        <a-select v-model:value="form.declarantKatoCode" show-search allow-clear :disabled="readonly" :options="classifiers.options('kato')" @change="emitChange" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState, Import40Party } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  countryOptions?: { value: string; label: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

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

// applyingAutocopy защищает от повторного входа: пока копируем поля
// декларанта в получателя/фин.лицо, эмит и watch на props.modelValue не
// должны запускать ещё один цикл копирования.
let applyingAutocopy = false

watch(
  () => props.modelValue,
  (v) => {
    if (applyingAutocopy) return
    Object.assign(form, buildForm(v))
  },
  { deep: true },
)

const emitChange = () =>
  emit('update:modelValue', {
    ...props.modelValue,
    ...form,
    sender: { ...form.sender },
    receiver: { ...form.receiver },
  })

// Копирует набор полей декларанта (гр.14) в получателя (гр.8).
function copyDeclarantToReceiver() {
  form.receiver = {
    ...form.receiver,
    name: form.declarantName ?? null,
    countryCode: form.declarantCountryCode ?? null,
    region: form.declarantRegion ?? null,
    city: form.declarantCity ?? null,
    street: form.declarantStreet ?? null,
  }
  form.receiverHouse = form.declarantHouse ?? null
  form.receiverBin = form.declarantBin ?? null
  form.receiverCategoryCode = form.declarantCategoryCode ?? null
  form.receiverKatoCode = form.declarantKatoCode ?? null
}

// Копирует набор полей декларанта (гр.14) в лицо, ответственное за
// фин. урегулирование (гр.9).
function copyDeclarantToFinancialSubject() {
  form.financialSubjectName = form.declarantName ?? null
  form.financialSubjectBin = form.declarantBin ?? null
  form.financialSubjectCountryCode = form.declarantCountryCode ?? null
  form.financialSubjectRegion = form.declarantRegion ?? null
  form.financialSubjectCity = form.declarantCity ?? null
  form.financialSubjectStreet = form.declarantStreet ?? null
  form.financialSubjectHouse = form.declarantHouse ?? null
  form.financialSubjectCategoryCode = form.declarantCategoryCode ?? null
  form.financialSubjectKatoCode = form.declarantKatoCode ?? null
}

function runAutocopy(fn: () => void) {
  applyingAutocopy = true
  try {
    fn()
    emitChange()
  } finally {
    applyingAutocopy = false
  }
}

const onConsigneeEqualsDeclarantChange = () => {
  if (form.consigneeEqualsDeclarant) runAutocopy(copyDeclarantToReceiver)
  else emitChange()
}

const onFinancialSubjectEqualsDeclarantChange = () => {
  if (form.financialSubjectEqualsDeclarant) runAutocopy(copyDeclarantToFinancialSubject)
  else emitChange()
}

// Пока галочка включена, любое изменение полей декларанта должно тут же
// перетекать в получателя/фин.лицо — сравниваем по значению (не deep-объект
// целиком), чтобы не дёргать копирование на каждый watch тика без реальных
// изменений.
watch(
  () => [
    form.declarantName,
    form.declarantBin,
    form.declarantCountryCode,
    form.declarantRegion,
    form.declarantCity,
    form.declarantStreet,
    form.declarantHouse,
    form.declarantCategoryCode,
    form.declarantKatoCode,
  ],
  () => {
    if (applyingAutocopy) return
    if (form.consigneeEqualsDeclarant) runAutocopy(copyDeclarantToReceiver)
    if (form.financialSubjectEqualsDeclarant) runAutocopy(copyDeclarantToFinancialSubject)
  },
)

// На загрузке существующей ДТ с уже включённой галочкой держим гр.8/9
// в актуальном состоянии на случай, если декларант поменялся, пока
// значения не пересохранялись (readonly-поля иначе могли бы показать
// устаревшие данные).
onMounted(() => {
  if (form.consigneeEqualsDeclarant) copyDeclarantToReceiver()
  if (form.financialSubjectEqualsDeclarant) copyDeclarantToFinancialSubject()
})
</script>
