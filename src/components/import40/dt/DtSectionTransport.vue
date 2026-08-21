<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="25" text="Вид транспорта на границе" /></template>
        <a-auto-complete v-model:value="form.borderTransportModeCode" :options="classifiers.options('2004')"
          :disabled="readonly" placeholder="30" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="26" text="Вид транспорта внутри страны" /></template>
        <a-auto-complete v-model:value="form.inlandTransportModeCode" :options="classifiers.options('2004')"
          :disabled="readonly" placeholder="30" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="19" text="Контейнер" /></template>
        <a-switch v-model:checked="form.containerIndicator" :disabled="readonly" @change="emitChange" />
      </a-form-item>
    </div>

    <a-form-item label="Страна регистрации ТС (граница)">
      <a-select v-model:value="form.borderTransportNationality" :options="countryAlpha2Options" :disabled="readonly"
        show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="max-width: 260px" @change="emitChange" />
    </a-form-item>

    <div class="dt-section-bar"><DtGraphLabel graph="21" text="Транспортное средство на границе" /></div>
    <div class="transport-list">
      <div v-for="(m, i) in form.borderTransportNumbers" :key="i" class="transport-list-row">
        <a-input v-model:value="m.number" :disabled="readonly" placeholder="Номер ТС" style="max-width: 220px" @change="emitChange" />
        <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
          :disabled="readonly" placeholder="319" style="max-width: 200px" @change="emitChange" />
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeBorderTransport(i)"><CloseOutlined /></a-button>
      </div>
      <div class="transport-actions">
        <a-button v-if="!readonly" type="dashed" size="small" @click="addBorderTransport">+ Номер ТС (граница)</a-button>
        <a-button v-if="!readonly && form.borderTransportNumbers.length" size="small" @click="copyBorderToArrival">Скопировать в гр.18 <ArrowDownOutlined /></a-button>
      </div>
    </div>

    <div class="dt-grid-2">
      <a-form-item label="Вид транспорта прибытия">
        <a-auto-complete v-model:value="form.arrivalTransportModeCode" :options="classifiers.options('2004')"
          :disabled="readonly" placeholder="30" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Страна регистрации ТС (прибытие)">
        <a-select v-model:value="form.arrivalTransportNationality" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-section-bar"><DtGraphLabel graph="18" text="Транспортное средство при прибытии" /></div>
    <div class="transport-list">
      <div v-for="(m, i) in form.arrivalTransportNumbers" :key="i" class="transport-list-row">
        <a-input v-model:value="m.number" :disabled="readonly" placeholder="Номер ТС" style="max-width: 220px" @change="emitChange" />
        <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
          :disabled="readonly" placeholder="319" style="max-width: 200px" @change="emitChange" />
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeArrivalTransport(i)"><CloseOutlined /></a-button>
      </div>
      <div class="transport-actions">
        <a-button v-if="!readonly" type="dashed" size="small" @click="addArrivalTransport">+ Номер ТС (прибытие)</a-button>
        <a-button v-if="!readonly && form.arrivalTransportNumbers.length" size="small" @click="copyArrivalToBorder">Скопировать в гр.21 <ArrowUpOutlined /></a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from '@ant-design/icons-vue'
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

// Национальность ТС (гр.21/18) — 2-буквенный код страны (KZ/CN/RU), в КЕДЕН уходит буквами.
const countryAlpha2Options = ALPHA2_COUNTRIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
const filterAlpha2 = (input: string, option: { value: string; label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())

// borderTransportNumbers/arrivalTransportNumbers — массивы объектов, поэтому
// buildForm делает свежие копии массива и каждого элемента (та же дисциплина,
// что и sender/receiver в DtSectionParties.vue), иначе правка поля в списке
// мутировала бы modelValue родителя напрямую.
function buildForm(v: Import40DtFormState) {
  return {
    ...v,
    borderTransportNumbers: (v.borderTransportNumbers ?? []).map((m) => ({ ...m })),
    arrivalTransportNumbers: (v.arrivalTransportNumbers ?? []).map((m) => ({ ...m })),
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
    borderTransportNumbers: form.borderTransportNumbers.map((m) => ({ ...m })),
    arrivalTransportNumbers: form.arrivalTransportNumbers.map((m) => ({ ...m })),
  })

function addBorderTransport() {
  form.borderTransportNumbers.push({ number: '', typeCode: null })
  emitChange()
}
function removeBorderTransport(idx: number) {
  form.borderTransportNumbers.splice(idx, 1)
  emitChange()
}
function addArrivalTransport() {
  form.arrivalTransportNumbers.push({ number: '', typeCode: null })
  emitChange()
}
function removeArrivalTransport(idx: number) {
  form.arrivalTransportNumbers.splice(idx, 1)
  emitChange()
}
// Для авто-перевозки ТС на границе (гр.21) обычно = ТС при прибытии (гр.18):
// копируем номера/типы между графами, чтобы не вводить дважды.
function copyBorderToArrival() {
  form.arrivalTransportNumbers = form.borderTransportNumbers.map((m) => ({ ...m }))
  if (!form.arrivalTransportModeCode) form.arrivalTransportModeCode = form.borderTransportModeCode
  if (!form.arrivalTransportNationality) form.arrivalTransportNationality = form.borderTransportNationality
  emitChange()
}
function copyArrivalToBorder() {
  form.borderTransportNumbers = form.arrivalTransportNumbers.map((m) => ({ ...m }))
  if (!form.borderTransportModeCode) form.borderTransportModeCode = form.arrivalTransportModeCode
  if (!form.borderTransportNationality) form.borderTransportNationality = form.arrivalTransportNationality
  emitChange()
}
</script>
