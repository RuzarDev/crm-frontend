<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="25" :text="t('dt.vidTransportaNaGranice')" /></template>
        <a-auto-complete v-model:value="form.borderTransportModeCode" :options="classifiers.options('2004')"
          :disabled="readonly" placeholder="30" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="26" :text="t('dt.vidTransportaVnutriStrany')" /></template>
        <a-auto-complete v-model:value="form.inlandTransportModeCode" :options="classifiers.options('2004')"
          :disabled="readonly" placeholder="30" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="19" :text="t('dt.konteyner')" /></template>
        <a-switch v-model:checked="form.containerIndicator" :disabled="readonly" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-2">
      <a-form-item :label="t('dt.stranaRegistraciiTsPribytie')">
        <a-select v-model:value="form.arrivalTransportNationality" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-section-bar">
      <DtGraphLabel graph="18" :text="t('dt.transportnoeSredstvoPriPribytii')" />
      <span class="transport-count">{{ t('dt.kolichestvoTs', { n: form.arrivalTransportNumbers.length }) }}</span>
    </div>
    <div class="transport-list">
      <div v-for="(m, i) in form.arrivalTransportNumbers" :key="i" class="transport-list-row transport-list-row-wrap">
        <a-switch v-if="isRoadMode(arrivalModeCode)" v-model:checked="m.isTrailer" :disabled="readonly" :checked-children="t('dt.pricepWord')" :un-checked-children="t('dt.golova')" @change="emitChange" />
        <a-input v-uppercase v-model:value="m.number" :disabled="readonly" :placeholder="t('dt.nomerTs')" style="max-width: 200px" @change="emitChange" />
        <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
          :disabled="readonly" placeholder="319" style="max-width: 160px" @change="emitChange" />
        <a-select v-model:value="m.mark" :options="classifiers.options('vehicle-marks')" :disabled="readonly"
          show-search allow-clear :placeholder="t('dt.marka')" style="min-width: 180px" @change="emitChange" />
        <a-select v-model:value="m.nationality" :options="countryAlpha2Options" :disabled="readonly"
          show-search allow-clear :filter-option="filterAlpha2" :placeholder="t('dt.nac')" style="max-width: 140px" @change="emitChange" />
        <a-select v-if="isRoadMode(arrivalModeCode) && m.isTrailer" v-model:value="m.headNumber" :options="arrivalHeadOptions" :disabled="readonly"
          allow-clear :placeholder="t('dt.golova')" style="min-width: 160px" @change="emitChange" />
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeArrivalTransport(i)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
      </div>
      <div class="transport-actions">
        <template v-if="isRoadMode(arrivalModeCode)">
          <a-button v-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(false)">{{ t('dt.golova2') }}</a-button>
          <a-button v-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(true)">{{ t('dt.pricep') }}</a-button>
        </template>
        <a-button v-else-if="!readonly" type="dashed" size="small" @click="addArrivalTransport(false)">{{ t('dt.dobavit') }}</a-button>
        <a-button v-if="!readonly && form.arrivalTransportNumbers.length" size="small" @click="copyArrivalHeadToBorder">{{ t('dt.skopirovatGolovuVGr21') }} <ArrowDownOutlined /></a-button>
      </div>
    </div>

    <a-form-item :label="t('dt.stranaRegistraciiTsGranica')">
      <a-select v-model:value="form.borderTransportNationality" :options="countryAlpha2Options" :disabled="readonly"
        show-search allow-clear :filter-option="filterAlpha2" placeholder="KZ" style="max-width: 260px" @change="emitChange" />
    </a-form-item>

    <!-- Гр.21 показываем для всех видов транспорта, включая ЖД (вагоны — ТС на границе). -->
    <div class="dt-section-bar">
        <DtGraphLabel graph="21" :text="t('dt.transportnoeSredstvoNaGranice')" />
        <span class="transport-count">{{ t('dt.kolichestvoTs', { n: form.borderTransportNumbers.length }) }}</span>
      </div>
      <div class="transport-list">
        <div v-for="(m, i) in form.borderTransportNumbers" :key="i" class="transport-list-row transport-list-row-wrap">
          <a-switch v-if="isRoadMode(form.borderTransportModeCode)" v-model:checked="m.isTrailer" :disabled="readonly" :checked-children="t('dt.pricepWord')" :un-checked-children="t('dt.golova')" @change="emitChange" />
          <a-input v-uppercase v-model:value="m.number" :disabled="readonly" :placeholder="t('dt.nomerTs')" style="max-width: 200px" @change="emitChange" />
          <a-auto-complete v-model:value="m.typeCode" :options="classifiers.options('2024')"
            :disabled="readonly" placeholder="319" style="max-width: 160px" @change="emitChange" />
          <a-select v-model:value="m.mark" :options="classifiers.options('vehicle-marks')" :disabled="readonly"
            show-search allow-clear :placeholder="t('dt.marka')" style="min-width: 180px" @change="emitChange" />
          <a-select v-model:value="m.nationality" :options="countryAlpha2Options" :disabled="readonly"
            show-search allow-clear :filter-option="filterAlpha2" :placeholder="t('dt.nac')" style="max-width: 140px" @change="emitChange" />
          <a-select v-if="isRoadMode(form.borderTransportModeCode) && m.isTrailer" v-model:value="m.headNumber" :options="borderHeadOptions" :disabled="readonly"
            allow-clear :placeholder="t('dt.golova')" style="min-width: 160px" @change="emitChange" />
          <a-button v-if="!readonly" type="text" danger size="small" @click="removeBorderTransport(i)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
        </div>
        <div class="transport-actions">
          <template v-if="isRoadMode(form.borderTransportModeCode)">
            <a-button v-if="!readonly" type="dashed" size="small" @click="addBorderTransport(false)">{{ t('dt.golova2') }}</a-button>
            <a-button v-if="!readonly" type="dashed" size="small" @click="addBorderTransport(true)">{{ t('dt.pricep') }}</a-button>
          </template>
          <a-button v-else-if="!readonly" type="dashed" size="small" @click="addBorderTransport(false)">{{ t('dt.dobavit') }}</a-button>
          <a-button v-if="!readonly && form.borderTransportNumbers.length" size="small" @click="copyBorderToArrival">{{ t('dt.skopirovatVGr18') }} <ArrowUpOutlined /></a-button>
          <!-- Авто/прочие: гр.18 заполнена, гр.21 пуста — КЕДЕН-XML не формируется,
               поэтому кнопка стоит там, куда ведёт сообщение об ошибке. При ЖД гр.21
               не заполняется (вагоны идут в гр.18) — вместо кнопки подсказка. -->
          <a-button v-if="!readonly && !isRailMode(form.borderTransportModeCode) && !form.borderTransportNumbers.length && form.arrivalTransportNumbers.length"
            type="primary" ghost size="small" @click="copyArrivalHeadToBorder">
            <ArrowDownOutlined /> {{ t('dt.skopirovatIzGr18') }}
          </a-button>
          <span v-if="isRailMode(form.borderTransportModeCode) && !form.borderTransportNumbers.length" class="transport-hint">
            {{ t('dt.priZhdGr21NeZapolnyaetsya') }}
          </span>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, reactive, watch } from 'vue'
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from '@ant-design/icons-vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState } from '@/api/import40'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()

// Национальность ТС (гр.21/18) — 2-буквенный код страны (KZ/CN/RU), в КЕДЕН уходит буквами.
const countryAlpha2Options = useCountryAlpha2Options()
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
    // Вид транспорта гр.18 всегда тот же, что в гр.26 (фолбэк гр.25) — см. arrivalModeCode.
    arrivalTransportModeCode: arrivalModeCode.value || form.arrivalTransportModeCode,
    borderTransportNumbers: form.borderTransportNumbers.map((m) => ({ ...m })),
    arrivalTransportNumbers: form.arrivalTransportNumbers.map((m) => ({ ...m })),
  })

// Голова/прицеп — только для автомобильного транспорта (30 — авто, 31 — состав ТС/тягач
// с прицепом, 32 — тягач/прицеп раздельно, весь автомобильный набор классификатора КЕДЕН).
// Для воздушного (40) и прочих режимов — простой ввод номера ТС/борта без переключателя и селекта «Голова».
function isRoadMode(code: string | null | undefined) {
  return code === '30' || code === '31' || code === '32'
}

// ЖД (20): ТС на границе — те же вагоны, что в гр.18, поэтому гр.21 не заполняют
// (то же правило в KedenXmlReadiness на бэке и в печатном бланке DtBlankPdf).
function isRailMode(code: string | null | undefined) {
  return code === '20'
}

// Вид транспорта для гр.18 (ТС при прибытии). Гр.18 парна гр.26 (вид транспорта внутри
// страны; в XML КЕДЕН это один элемент) — берём её, с фолбэком на гр.25 (граница).
// Своего поля ввода у arrivalTransportModeCode нет, поэтому он только зеркалит гр.26/25.
// Раньше он шёл первым и «застывал» при добавлении первого ТС: ДТ a7961279 создана по
// заявке с «10», гр.25/26 потом сменили на «31», а переключатель голова/прицеп пропал.
const arrivalModeCode = computed(
  () => form.inlandTransportModeCode || form.borderTransportModeCode || form.arrivalTransportModeCode,
)

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
  if (!form.arrivalTransportNationality) form.arrivalTransportNationality = form.borderTransportNationality
  emitChange()
}
// Основной сценарий декларанта: заполняем гр.18 (голова+прицеп), затем копируем в гр.21
// ТОЛЬКО голову (isTrailer=false) — на границе прицеп отдельно не декларируется как ТС.
function copyArrivalHeadToBorder() {
  form.borderTransportNumbers = form.arrivalTransportNumbers
    .filter((m) => !m.isTrailer)
    .map((m) => ({ ...m, headNumber: null }))
  if (!form.borderTransportModeCode) form.borderTransportModeCode = arrivalModeCode.value
  if (!form.borderTransportNationality) form.borderTransportNationality = form.arrivalTransportNationality
  emitChange()
}
</script>

<style scoped>
.transport-list-row-wrap {
  flex-wrap: wrap;
}
.transport-hint {
  font-size: 12px;
  color: var(--z-muted);
  align-self: center;
}
.transport-count {
  font-size: 12px;
  color: var(--z-text-secondary, #8c8c8c);
  white-space: nowrap;
}
</style>
