<!-- crm-frontend/src/components/Import40GoodsKedenPanel.vue -->
<template>
  <div class="keden-panel">
    <div class="section-bar">
      <span class="section-label">ДАННЫЕ КЕДЕН ПО ТОВАРАМ (гр.31/36/43–47)</span>
      <a-button v-if="!readonly" size="small" @click="emit('calc-tpin')">Рассчитать ТПиН (авто)</a-button>
    </div>

    <a-collapse v-if="items.length" ghost>
      <a-collapse-panel v-for="(g, i) in items" :key="i" :header="`Товар ${i + 1}: ${g.tnvedCode || 'без кода'} — ${g.description || ''}`">
        <div class="field-row">
          <div class="field"><div class="field-label">Торговая марка</div>
            <a-input v-model:value="g.tradeMarkName" size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Знак</div>
            <a-input v-model:value="g.productMarkName" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Модель</div>
            <a-input v-model:value="g.productModelName" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
          <div class="field"><div class="field-label">Артикул</div>
            <a-input v-model:value="g.productArticle" size="small" :disabled="readonly" placeholder="НЕ УКАЗАН" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field f-2"><div class="field-label">Производитель</div>
            <a-input v-model:value="g.manufacturerName" size="small" :disabled="readonly" @change="sync" /></div>
          <div class="field"><div class="field-label">Вид упаковки</div>
            <a-auto-complete v-model:value="g.packageKindCode" size="small" :disabled="readonly"
              :options="pkgOptions" placeholder="PK" @change="sync" /></div>
          <div class="field"><div class="field-label">Грузовых мест</div>
            <a-input-number v-model:value="g.cargoPlacesQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Упаковок</div>
            <a-input-number v-model:value="g.packageQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Преференция: сбор</div>
            <a-auto-complete v-model:value="g.prefClearanceCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Пошлина</div>
            <a-auto-complete v-model:value="g.prefDutyCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
          <div class="field"><div class="field-label">Акциз</div>
            <a-auto-complete v-model:value="g.prefExciseCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="Z" @change="sync" /></div>
          <div class="field"><div class="field-label">НДС</div>
            <a-auto-complete v-model:value="g.prefVatCode" size="small" :disabled="readonly" :options="prefOptions" placeholder="ОО" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Процедура (гр.37)</div>
            <a-input v-model:value="g.procedureCode" size="small" :disabled="readonly" placeholder="4000" @change="sync" /></div>
          <div class="field"><div class="field-label">Предш. процедура</div>
            <a-input v-model:value="g.previousProcedureCode" size="small" :disabled="readonly" placeholder="00" @change="sync" /></div>
          <div class="field"><div class="field-label">Особенность перемещения</div>
            <a-input v-model:value="g.goodsMoveFeatureCode" size="small" :disabled="readonly" placeholder="000" @change="sync" /></div>
          <div class="field"><div class="field-label">Метод ТС (гр.43)</div>
            <a-auto-complete v-model:value="g.valuationMethodCode" size="small" :disabled="readonly" :options="valuationOptions" placeholder="1" @change="sync" /></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Таможенная стоимость, ₸ (гр.45)</div>
            <a-input-number v-model:value="g.customsValueKzt" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Статистическая, USD (гр.46)</div>
            <a-input-number v-model:value="g.statisticValueUsd" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="sync" /></div>
          <div class="field"><div class="field-label">Код запрета</div>
            <a-input v-model:value="g.prohibitionCode" size="small" :disabled="readonly" placeholder="D0110" @change="sync" /></div>
          <div class="field"><div class="field-label">Код ИС</div>
            <a-input v-model:value="g.ipoCode" size="small" :disabled="readonly" placeholder="N" @change="sync" /></div>
        </div>

        <div class="section-bar payments-bar">
          <span class="section-label">ПЛАТЕЖИ гр.47</span>
          <a-button v-if="!readonly" type="dashed" size="small" @click="addPayment(g)">+ Строка</a-button>
        </div>
        <div v-for="(p, pi) in g.payments ?? []" :key="pi" class="payment-row">
          <a-auto-complete v-model:value="p.taxModeCode" size="small" :disabled="readonly" :options="taxModeOptions" placeholder="Вид (2010)" style="width: 140px" @change="sync" />
          <a-input-number v-model:value="p.taxBase" size="small" :disabled="readonly" placeholder="Основа" style="width: 130px" @change="sync" />
          <a-select v-model:value="p.rateKindCode" size="small" :disabled="readonly" :options="rateKindOptions" placeholder="Вид ставки" style="width: 130px" @change="sync" />
          <a-input-number v-model:value="p.rateValue" size="small" :disabled="readonly" placeholder="Ставка" style="width: 100px" @change="sync" />
          <template v-if="p.rateKindCode === '*'">
            <a-input v-model:value="p.rateUnitCode" size="small" :disabled="readonly" placeholder="ОКЕИ (166)" style="width: 90px" @change="sync" />
            <a-input v-model:value="p.rateCurrencyCode" size="small" :disabled="readonly" placeholder="Валюта N3 (978)" style="width: 110px" @change="sync" />
            <a-input-number v-model:value="p.weightRatio" size="small" :disabled="readonly" placeholder="Коэф." style="width: 80px" @change="sync" />
          </template>
          <a-input v-model:value="p.rateDate" size="small" :disabled="readonly" placeholder="Дата ГГГГ-ММ-ДД" style="width: 130px" @change="sync" />
          <a-input-number v-model:value="p.amountKzt" size="small" :disabled="readonly" placeholder="Сумма, ₸" style="width: 130px" @change="sync" />
          <a-button v-if="!readonly" type="text" danger size="small" @click="removePayment(g, pi)">✕</a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
    <div v-else class="empty-state">Сначала добавьте товары</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsPayment } from '@/types/api'
import {
  KEDEN_PACKAGE_KINDS, KEDEN_PREFERENCES, KEDEN_RATE_KINDS,
  KEDEN_TAX_MODES, KEDEN_VALUATION_METHODS, kedenOptions,
} from '@/constants/keden'

const props = defineProps<{
  modelValue: Import40GoodsItemInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Import40GoodsItemInput[]): void
  (e: 'calc-tpin'): void
}>()

const items = computed(() => props.modelValue)

// ВАЖНО: эмитим НОВЫЙ массив с копиями объектов. ReestrGoodsSection выше по форме
// держит внутренние копии строк и пересинхронизируется только по watch на modelValue;
// эмит той же ссылки не триггерит watch — его копии остались бы без КЕДЕН-правок,
// и следующее редактирование товара там откатило бы поля этой панели.
const sync = () =>
  emit(
    'update:modelValue',
    props.modelValue.map((g) => ({ ...g, payments: (g.payments ?? []).map((p) => ({ ...p })) })),
  )

const pkgOptions = kedenOptions(KEDEN_PACKAGE_KINDS)
const prefOptions = kedenOptions(KEDEN_PREFERENCES)
const taxModeOptions = kedenOptions(KEDEN_TAX_MODES)
const rateKindOptions = kedenOptions(KEDEN_RATE_KINDS)
const valuationOptions = kedenOptions(KEDEN_VALUATION_METHODS)

const emptyPayment = (): Import40GoodsPayment => ({
  taxModeCode: null, taxBase: null, rateKindCode: '%', rateValue: null,
  rateUnitCode: null, rateCurrencyCode: null, weightRatio: null,
  rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: null,
})

const addPayment = (g: Import40GoodsItemInput) => {
  g.payments = [...(g.payments ?? []), emptyPayment()]
  sync()
}

const removePayment = (g: Import40GoodsItemInput, idx: number) => {
  g.payments = (g.payments ?? []).filter((_, i) => i !== idx)
  sync()
}
</script>

<style scoped>
.keden-panel { display: flex; flex-direction: column; gap: 8px; }
.section-bar { display: flex; align-items: center; justify-content: space-between; }
.section-label { font-size: 12px; font-weight: 600; color: var(--atg-muted); }
.payments-bar { margin-top: 12px; }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; }
.field.f-2 { flex: 2; }
.field-label { font-size: 11px; color: var(--atg-muted); margin-bottom: 2px; }
.payment-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.empty-state { color: var(--atg-muted); font-size: 12px; }
</style>
