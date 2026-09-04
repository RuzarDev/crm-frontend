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

    <template v-if="form.borderTransportModeCode !== '20'">
      <div class="dt-section-bar"><DtGraphLabel graph="21" text="Транспортное средство на границе" /></div>
      <div class="transport-list">
        <div v-for="(m, i) in form.borderTransportNumbers" :key="i" class="transport-list-row transport-list-row-wrap">
          <a-switch v-if="isRoadMode(form.borderTransportModeCode)" v-model:checked="m.isTrailer" :disabled="readonly" checked-children="Прицеп" un-checked-children="Голова" @change="emitChange" />
          <a-input v-uppercase v-model:value="m.number" :disabled="readonly" placeholder="Номер ТС" style="max-width: 200px" @change="emitChange" />
          <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
            :disabled="readonly" placeholder="319" style="max-width: 160px" @change="emitChange" />
          <a-select v-model:value="m.mark" :options="classifiers.options('vehicle-marks')" :disabled="readonly"
            show-search allow-clear placeholder="Марка" style="min-width: 180px" @change="emitChange" />
          <a-select v-model:value="m.nationality" :options="countryAlpha2Options" :disabled="readonly"
            show-search allow-clear :filter-option="filterAlpha2" placeholder="Нац." style="max-width: 140px" @change="emitChange" />
          <a-select v-if="isRoadMode(form.borderTransportModeCode) && m.isTrailer" v-model:value="m.headNumber" :options="borderHeadOptions" :disabled="readonly"
            allow-clear placeholder="Голова" style="min-width: 160px" @change="emitChange" />
          <a-button v-if="!readonly" type="text" danger size="small" @click="removeBorderTransport(i)"><CloseOutlined /></a-button>
        </div>
        <div class="transport-actions">
          <template v-if="isRoadMode(form.borderTransportModeCode)">
            <a-button v-if="!readonly" type="dashed" size="small" @click="addBorderTransport(false)">+ Голова</a-button>
            <a-button v-if="!readonly" type="dashed" size="small" @click="addBorderTransport(true)">+ Прицеп</a-button>
          </template>
          <a-button v-else-if="!readonly" type="dashed" size="small" @click="addBorderTransport(false)">+ Добавить</a-button>
          <a-button v-if="!readonly && form.borderTransportNumbers.length" size="small" @click="copyBorderToArrival">Скопировать в гр.18 <ArrowDownOutlined /></a-button>
        </div>
      </div>
    </template>

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
      <div v-for="(m, i) in form.arrivalTransportNumbers" :key="i" class="transport-list-row transport-list-row-wrap">
        <a-switch v-if="isRoadMode(form.arrivalTransportModeCode)" v-model:checked="m.isTrailer" :disabled="readonly" checked-children="Прицеп" un-checked-children="Голова" @change="emitChange" />
        <a-input v-uppercase v-model:value="m.number" :disabled="readonly" placeholder="Номер ТС" style="max-width: 200px" @change="emitChange" />
        <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
          :disabled="readonly" placeholder="319" style="max-width: 160px" @change="emitChange" />
        <a-select v-model:value="m.mark" :options="classifiers.options('vehicle-marks')" :disabled="readonly"
          show-search allow-clear placeholder="Марка" style="min-width: 180px" @change="emitChange" />
        <a-select v-model:value="m.nationality" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="Нац." style="max-width: 140px" @change="emitChange" />
        <a-select v-if="isRoadMode(form.arrivalTransportModeCode) && m.isTrailer" v-model:value="m.headNumber" :options="arrivalHeadOptions" :disabled="readonly"
          allow-clear placeholder="Голова" style="min-width: 160px" @change="emitChange" />
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeArrivalTransport(i)"><CloseOutlined /></a-button>
      </div>
      <div class="transport-actions">
        <template v-if="isRoadMode(form.arrivalTransportModeCode)">
          <a-button v-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(false)">+ Голова</a-button>
          <a-button v-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(true)">+ Прицеп</a-button>
        </template>
        <a-button v-else-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(false)">+ Добавить</a-button>
        <a-button v-if="!readonly && form.arrivalTransportNumbers.length" size="small" @click="copyArrivalToBorder">Скопировать в гр.21 <ArrowUpOutlined /></a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
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

// Голова/прицеп — только для автомобильного транспорта (30 — авто, 31 — состав ТС/тягач с прицепом).
// Для воздушного (40) и прочих режимов — простой ввод номера ТС/борта без переключателя и селекта «Голова».
function isRoadMode(code: string | null | undefined) {
  return code === '30' || code === '31'
}

// «Голова» у прицепа выбирается из номеров головных ТС (isTrailer=false) той же графы.
const borderHeadOptions = computed(() =>
  form.borderTransportNumbers
    .filter((m) => !m.isTrailer && m.number)
    .map((m) => ({ value: m.number, label: m.number })),
)
const arrivalHeadOptions = computed(() =>
  form.arrivalTransportNumbers
    .filter((m) => !m.isTrailer && m.number)
    .map((m) => ({ value: m.number, label: m.number })),
)

function addBorderTransport(isTrailer: boolean) {
  form.borderTransportNumbers.push({ number: '', typeCode: null, nationality: null, mark: null, isTrailer, headNumber: null })
  emitChange()
}
function removeBorderTransport(idx: number) {
  form.borderTransportNumbers.splice(idx, 1)
  emitChange()
}
function addArrivalTransport(isTrailer: boolean) {
  form.arrivalTransportNumbers.push({ number: '', typeCode: null, nationality: null, mark: null, isTrailer, headNumber: null })
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

<style scoped>
.transport-list-row-wrap {
  flex-wrap: wrap;
}
</style>
