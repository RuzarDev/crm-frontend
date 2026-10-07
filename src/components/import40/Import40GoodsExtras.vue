<!-- Доп. сведения товара гр.31 по форме КЕДЕН: характеристики (31.1), акцизные марки (31.4), сведения
     об автомобиле, период поставки (31.7), товар для инвестпроекта (31.12), прослеживаемость (31.15).
     Состав и длины полей — по структуре ДТ R.055 (Решение Коллегии ЕЭК №75); в XML уходят только
     заполненные блоки. Товар мутируется на месте, как в Import40GoodsKedenFields. -->
<template>
  <a-collapse v-model:active-key="open" ghost class="gx-collapse zf-s12">
    <a-collapse-panel key="gx">
      <template #header>
        <span>{{ t('gx.title') }}</span>
        <span v-if="filledCount" class="gx-count"> — {{ filledCount }}</span>
        <span class="gx-sub">{{ t('gx.titleHint') }}</span>
      </template>

      <div class="zf-grid">
        <!-- 31.1 характеристики -->
        <div class="zf-sec zf-s12">{{ t('gx.secChars') }}</div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.productionPlace') }}</div>
          <a-input v-uppercase v-model:value="x.productionPlaceName" :disabled="readonly" :maxlength="250" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.sort') }}</div>
          <a-input v-uppercase v-model:value="x.productSortName" :disabled="readonly" :maxlength="250" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.standard') }}
            <a-tooltip :title="t('gx.standardHint')"><QuestionCircleOutlined class="label-help" /></a-tooltip></div>
          <a-input v-uppercase v-model:value="x.standardName" :disabled="readonly" :maxlength="40" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.manufactureDate') }}</div>
          <a-date-picker v-model:value="x.manufactureDate" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" @change="changed" /></div>

        <!-- 31.4 акцизные и специальные марки -->
        <div class="zf-sec zf-s12">
          <span>{{ t('gx.secStamps') }}</span>
          <span class="zf-sec-actions">
            <a-button v-if="!readonly" type="dashed" size="small" @click="addStamp">{{ t('gx.addStamp') }}</a-button>
          </span>
        </div>
        <div v-if="!x.exciseStamps.length" class="zf-help zf-s12">{{ t('gx.stampsHint') }}</div>
        <template v-for="(s, si) in x.exciseStamps" :key="'s' + si">
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.stampQty') }}</div>
            <a-input-number v-model:value="s.quantity" :disabled="readonly" :min="1" :max="99999999" :precision="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.stampSeries') }}</div>
            <a-input v-uppercase v-model:value="s.seriesId" :disabled="readonly" :maxlength="8" @change="changed" /></div>
          <div class="zf-field zf-s6 gx-remove">
            <a-button v-if="!readonly" type="text" danger size="small" @click="removeStamp(si)"><CloseOutlined /> {{ t('gx.remove') }}</a-button></div>
        </template>

        <!-- Сведения об автомобиле -->
        <div class="zf-sec zf-s12">
          <span>{{ t('gx.secCars') }}</span>
          <span class="zf-sec-actions">
            <a-button v-if="!readonly" type="dashed" size="small" @click="addCar">{{ t('gx.addCar') }}</a-button>
          </span>
        </div>
        <div v-if="!x.vehicles.length" class="zf-help zf-s12" :class="{ 'gx-warn': isVehicleCode }">{{ t('gx.carsHint') }}</div>
        <div v-for="(v, vi) in x.vehicles" :key="'v' + vi" class="gx-block zf-grid zf-s12">
          <div class="gx-block-head zf-s12">
            <b>{{ t('gx.carN', { n: vi + 1 }) }}</b>
            <a-button v-if="!readonly" type="text" danger size="small" @click="removeCar(vi)"><CloseOutlined /> {{ t('gx.remove') }}</a-button>
          </div>
          <div class="zf-field zf-s4"><div class="zf-label">{{ t('gx.vin') }}</div>
            <a-input v-uppercase v-model:value="v.vin" :disabled="readonly" :maxlength="17" @change="changed" /></div>
          <div class="zf-field zf-s4"><div class="zf-label">{{ t('gx.chassis') }}</div>
            <a-input v-uppercase v-model:value="v.chassisId" :disabled="readonly" :maxlength="20" @change="changed" /></div>
          <div class="zf-field zf-s4"><div class="zf-label">{{ t('gx.body') }}</div>
            <a-input v-uppercase v-model:value="v.bodyId" :disabled="readonly" :maxlength="20" @change="changed" /></div>
          <div class="zf-field zf-s2"><div class="zf-label">{{ t('gx.makeCode') }}</div>
            <a-input v-model:value="v.makeCode" :disabled="readonly" :maxlength="3" placeholder="000" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.makeName') }}</div>
            <a-input v-uppercase v-model:value="v.makeName" :disabled="readonly" :maxlength="120" @change="changed" /></div>
          <div class="zf-field zf-s4"><div class="zf-label">{{ t('gx.model') }}</div>
            <a-input v-uppercase v-model:value="v.modelName" :disabled="readonly" :maxlength="250" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.carDate') }}</div>
            <a-date-picker v-model:value="v.manufactureDate" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.engineId') }}</div>
            <a-input v-uppercase v-model:value="v.engineId" :disabled="readonly" :maxlength="20" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.engineVolume') }}</div>
            <a-input-number v-model:value="v.engineVolumeCm3" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.powerKw') }}</div>
            <a-input-number v-model:value="v.powerKw" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.powerHp') }}</div>
            <a-input-number v-model:value="v.powerHp" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.capacity') }}</div>
            <a-input-number v-model:value="v.carryingCapacityKg" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.mileage') }}</div>
            <a-input-number v-model:value="v.mileageKm" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.cost') }}</div>
            <a-input-number v-model:value="v.cost" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s2"><div class="zf-label">{{ t('gx.currency') }}</div>
            <a-input v-uppercase v-model:value="v.costCurrency" :disabled="readonly" :maxlength="3" placeholder="USD" @change="changed" /></div>
          <div class="zf-field zf-s4"><div class="zf-label">{{ t('gx.emergency') }}</div>
            <a-input v-model:value="v.emergencyDeviceId" :disabled="readonly" :maxlength="50" @change="changed" /></div>
        </div>

        <!-- 31.7 период поставки -->
        <div class="zf-sec zf-s12">{{ t('gx.secPeriod') }}</div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.periodStart') }}</div>
          <a-date-picker v-model:value="x.periodStartDate" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.periodEnd') }}</div>
          <a-date-picker v-model:value="x.periodEndDate" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" @change="changed" /></div>

        <!-- 31.12 инвестпроект -->
        <div class="zf-sec zf-s12">{{ t('gx.secInvest') }}</div>
        <div class="zf-help zf-s12">{{ t('gx.investHint') }}</div>
        <div class="zf-field zf-s2"><div class="zf-label">{{ t('gx.investCountry') }}</div>
          <a-select v-model:value="x.investCountryCode" :disabled="readonly" show-search allow-clear
            :options="countryAlpha2Options" :filter-option="filterAlpha2" :dropdown-match-select-width="false"
            :get-popup-container="popupContainer" placeholder="KZ" @change="changed" /></div>
        <div class="zf-field zf-s2"><div class="zf-label">{{ t('gx.investSeq') }}</div>
          <a-input v-model:value="x.investProjectSeqId" :disabled="readonly" :maxlength="4" placeholder="0001" @change="changed" /></div>
        <div class="zf-field zf-s2"><div class="zf-label">{{ t('gx.investYear') }}</div>
          <a-input-number v-model:value="x.investProjectYear" :disabled="readonly" :min="2000" :max="2100" :precision="0" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.investKind') }}</div>
          <a-select v-model:value="x.investGoodsListKindCode" :disabled="readonly" allow-clear
            :options="investKindOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" @change="changed" /></div>
        <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.investGoodsSeq') }}</div>
          <a-input-number v-model:value="x.investProjectGoodsSeqId" :disabled="readonly" :min="1" :max="999999999" :precision="0" @change="changed" /></div>

        <!-- 31.15 прослеживаемость -->
        <div class="zf-sec zf-s12">{{ t('gx.secTrace') }}</div>
        <div class="zf-field zf-s6">
          <a-checkbox v-model:checked="x.traceable" :disabled="readonly" @change="onTraceable">{{ t('gx.traceable') }}</a-checkbox></div>
        <template v-if="x.traceable">
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.traceQty') }}</div>
            <a-input-number v-model:value="x.traceQuantity" :disabled="readonly" :min="0" @change="changed" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('gx.traceUnit') }}</div>
            <a-input v-model:value="x.traceUnitCode" :disabled="readonly" :maxlength="4" placeholder="796" @change="changed" /></div>
        </template>
      </div>
    </a-collapse-panel>
  </a-collapse>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import type { Import40GoodsExtras, Import40GoodsItemInput } from '@/types/api'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'

const props = defineProps<{ good: Import40GoodsItemInput; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'change'): void }>()
const { t } = useI18n()

const emptyExtras = (): Import40GoodsExtras => ({ traceable: false, exciseStamps: [], vehicles: [] })

// Объект доп. сведений создаём заранее (не в computed — там побочные эффекты нельзя): у старых товаров extras нет.
const ensureExtras = (g: Import40GoodsItemInput) => {
  if (!g.extras) g.extras = emptyExtras()
  g.extras.exciseStamps ??= []
  g.extras.vehicles ??= []
}
watch(() => props.good, ensureExtras, { immediate: true })
const x = computed<Import40GoodsExtras>(() => props.good.extras ?? emptyExtras())

const changed = () => emit('change')

// Транспортные средства (8701–8705, 8711): подсказку о сведениях об автомобиле выделяем.
const isVehicleCode = computed(() => /^(870[1-5]|8711)/.test(props.good.tnvedCode ?? ''))

const filledCount = computed(() => {
  const e = props.good.extras
  if (!e) return 0
  return [
    e.productionPlaceName || e.productSortName || e.standardName || e.manufactureDate,
    e.exciseStamps?.length,
    e.vehicles?.length,
    e.periodStartDate || e.periodEndDate,
    e.investCountryCode || e.investProjectSeqId || e.investProjectYear || e.investGoodsListKindCode || e.investProjectGoodsSeqId,
    e.traceable,
  ].filter(Boolean).length
})
// Раскрыт сразу, если что-то уже заполнено или это автомобиль — иначе свёрнут, чтобы не загромождать карточку.
const open = ref<string[]>(filledCount.value || isVehicleCode.value ? ['gx'] : [])

const investKindOptions = computed(() => [
  { value: 'Т', label: t('gx.investKindT') },
  { value: 'С', label: t('gx.investKindC') },
])

const countryAlpha2Options = useCountryAlpha2Options()
const filterAlpha2 = (input: string, option: { value: string; label: string }) =>
  `${option.value} ${option.label}`.toLowerCase().includes(input.trim().toLowerCase())
const popupContainer = () => document.body

const addStamp = () => {
  x.value.exciseStamps.push({ quantity: null, seriesId: null })
  changed()
}
const removeStamp = (i: number) => {
  x.value.exciseStamps.splice(i, 1)
  changed()
}
const addCar = () => {
  x.value.vehicles.push({ costCurrency: props.good.currency ?? null })
  changed()
}
const removeCar = (i: number) => {
  x.value.vehicles.splice(i, 1)
  changed()
}
// Единица прослеживаемости по умолчанию — ДЕИ товара (гр.41), если она есть.
const onTraceable = () => {
  if (x.value.traceable && !x.value.traceUnitCode && props.good.unitCode) x.value.traceUnitCode = props.good.unitCode
  changed()
}
</script>

<style scoped>
:not(#z) .gx-collapse :deep(.ant-collapse-header) { padding: 8px 0; font-weight: 600; color: var(--z-ink); align-items: baseline; }
:not(#z) .gx-collapse :deep(.ant-collapse-content-box) { padding: 4px 0 0; }
.gx-count { font-weight: 600; }
.gx-sub { margin-left: 8px; font-weight: 400; font-size: 12px; color: var(--z-muted); }
.gx-block { border: 1px solid var(--z-line); border-radius: 8px; padding: 12px; }
.gx-block-head { display: flex; align-items: center; justify-content: space-between; }
.gx-remove { align-self: end; align-items: flex-start; }
.gx-warn { color: var(--z-warning, #8a6410); font-weight: 500; }
@media (max-width: 640px) { .gx-sub { display: none; } }
</style>
