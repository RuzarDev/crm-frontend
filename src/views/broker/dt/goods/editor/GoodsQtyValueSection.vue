<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhLock } from '@phosphor-icons/vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { OKEI_QUANTITY_TYPE_CODES, type Import40GoodsItemInput } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { placesOfGoods } from '@/utils/goodsPlaces'
import { statUsdFrom } from '../../dtGoodsRules'
import { withCurrent } from '../../dtOptions'
import GoodsTariffHint from './GoodsTariffHint.vue'
import { ensureOkeiUnits, okeiName } from './okei'
import type { GoodsSectionProps } from './types'

// «Количество и стоимость» (доска DtGoodsEditor): гр. 41 количество, ДЕИ (заблокирована — по коду ТН ВЭД) и тип
// количества; гр. 35 брутто, гр. 38 нетто (нетто > брутто — предупреждение); места (гр. 6/31: одно поле, КЕДЕН-поле
// cargoPlacesQuantity = ему); гр. 42 фактурная (в форме customsValue, на сервере invoiceValue) и валюта (= гр. 22, когда
// задана — заблокирована); гр. 34 страна; гр. 45 / гр. 46; подсказка ставок. Числа пишутся сразу при вводе, с запятой.
// гр. 46 = гр. 45 / курс USD на дату гр. А (0,01) при правке гр. 45; ручная гр. 46 живёт до следующей правки гр. 45.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tq = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.qty.${key}`, p ?? {})
void ensureOkeiUnits()

type Goods = Import40GoodsItemInput
type NumKey = 'quantity' | 'grossWeightKg' | 'netWeightKg' | 'customsValue'
const setNum = (key: NumKey, v: number | null) => { props.model.setField(props.item, key, v) }
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))

// ДЕИ — «796 — шт»: код и наименование из справочника ОКЕИ (или из товара).
const unitText = computed(() => {
  const code = (props.item.unitCode ?? '').trim()
  const name = okeiName(code) ?? props.item.unit ?? ''
  return code ? (name ? `${code} — ${name}` : code) : name
})
const quantityTypes = OKEI_QUANTITY_TYPE_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

const netOverGross = computed(() => {
  const { grossWeightKg: g, netWeightKg: n } = props.item
  return g != null && n != null && n > g
})

// Места: одно видимое поле; КЕДЕН-поле — его копия (одна цифра на бланке и в XML). Не поле платежей.
const places = computed(() => placesOfGoods(props.item))
// Места — целые (готовность КЕДЕН требует целое число): дробный ввод округляется.
const onPlaces = (v: number | null) => {
  const n = v == null ? null : Math.round(v)
  props.item.packagesCount = n
  props.item.cargoPlacesQuantity = n
}

const lockedCurrency = computed(() => props.ctx.currency || null)
const currency = computed(() => withCurrent(props.ctx.currencyOptions, props.item.currency))
const country = computed(() => withCurrent(props.ctx.countryOptions as ZOption[], props.item.countryOfOrigin))

// гр. 45 — поле платежей; гр. 46 пересчитывается по ней (производное, если курс и гр. 45 известны).
const onCustomsKzt = (v: number | null) => {
  if (!props.model.setField(props.item, 'customsValueKzt', v)) return
  const stat = statUsdFrom(v, props.ctx.usdRate)
  if (stat != null) props.item.statisticValueUsd = stat
}
const onStatUsd = (v: number | null) => { props.item.statisticValueUsd = v }
const statAuto = computed(() => {
  const derived = statUsdFrom(props.item.customsValueKzt, props.ctx.usdRate)
  return derived != null && props.item.statisticValueUsd === derived
})

// Колонки — по ширине панели: в панели 780px — три (подписи «Гр.34 Страна происхождения» целиком), во всю ширину
// (< 1024) — четыре, на телефоне — одна.
const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4'
const lockedInput = 'bg-sunken max-sm:h-11'
// «авто» — внутри поля справа (как на доске), не в подписи: подпись узкой колонки не обрезается.
const autoTag = 'absolute top-1/2 right-2 -translate-y-1/2'
</script>

<template>
  <div class="flex flex-col gap-5" data-goods-qty-section>
    <div :class="grid">
      <ZField graph="41" :label="tq('quantity')" data-graph="41" data-goods-field="quantity" :data-goods-index="index">
        <ZNumber :value="item.quantity ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="quantity" @update:value="setNum('quantity', $event)" />
      </ZField>
      <ZField graph="41" :label="tq('unit')" :title="tq('unitLocked')" data-graph="41" data-goods-field="unitCode" :data-goods-index="index">
        <ZInput :value="unitText" readonly mono :placeholder="tq('unitAuto')" :class="lockedInput" :title="tq('unitLocked')" data-f="unitCode">
          <template #suffix><PhLock :size="14" aria-hidden="true" /></template>
        </ZInput>
      </ZField>
      <ZField graph="35" :label="tq('gross')" data-graph="35" data-goods-field="grossWeightKg" :data-goods-index="index">
        <ZNumber :value="item.grossWeightKg ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="grossWeightKg" @update:value="setNum('grossWeightKg', $event)" />
      </ZField>
      <ZField graph="38" :label="tq('net')" data-graph="38" data-goods-field="netWeightKg" :data-goods-index="index" :validate-status="netOverGross ? 'warning' : ''" :help="netOverGross ? tq('netOverGross') : undefined">
        <ZNumber :value="item.netWeightKg ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="netWeightKg" @update:value="setNum('netWeightKg', $event)" />
      </ZField>

      <ZField graph="31" :label="tq('places')" data-graph="31" data-goods-field="packagesCount" :data-goods-index="index">
        <ZNumber :value="places" :min="0" :precision="0" :disabled="readonly" class="max-sm:h-11" data-f="packagesCount" @update:value="onPlaces" />
      </ZField>
      <ZField graph="42" :label="tq('invoice')" data-graph="42" data-goods-field="customsValue" :data-goods-index="index">
        <ZNumber :value="item.customsValue ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="customsValue" @update:value="setNum('customsValue', $event)" />
      </ZField>
      <ZField v-if="lockedCurrency" graph="22" :label="tq('currency')" :title="tq('currencyLocked')" data-graph="42" data-goods-field="currency" :data-goods-index="index">
        <ZInput :value="lockedCurrency" readonly mono :class="lockedInput" :title="tq('currencyLocked')" data-f="currency" data-goods-currency-locked>
          <template #suffix><PhLock :size="14" aria-hidden="true" /></template>
        </ZInput>
      </ZField>
      <ZField v-else graph="42" :label="tq('currency')" data-graph="42" data-goods-field="currency" :data-goods-index="index">
        <ZSelect :value="item.currency || null" :options="currency.options" show-search allow-clear :disabled="readonly" placeholder="USD" popup-width="280px" class="max-sm:h-11" data-f="currency" @update:value="model.setField(item, 'currency', str($event) as Goods['currency'])" />
      </ZField>
      <ZField graph="34" :label="tq('country')" data-graph="34" data-goods-field="countryOfOrigin" :data-goods-index="index">
        <ZSelect :value="item.countryOfOrigin || null" :options="country.options" show-search allow-clear :disabled="readonly" :placeholder="tq('countryPlaceholder')" popup-width="320px" class="max-sm:h-11" data-f="countryOfOrigin" @update:value="model.setField(item, 'countryOfOrigin', str($event))" />
      </ZField>

      <!-- гр. 45 без «авто»: ручное значение от расчётного не отличить (в данных нет признака). -->
      <ZField graph="45" :label="tq('customsValue')" data-graph="45" data-goods-field="customsValueKzt" :data-goods-index="index" :extra="tq('customsValueHint')">
        <ZNumber :value="item.customsValueKzt ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="customsValueKzt" @update:value="onCustomsKzt" />
      </ZField>
      <ZField graph="46" :label="tq('statValue')" data-graph="46" data-goods-field="statisticValueUsd" :data-goods-index="index">
        <div class="relative">
          <ZNumber :value="item.statisticValueUsd ?? null" :min="0" :disabled="readonly" :class="['max-sm:h-11', statAuto && 'pr-14']" data-f="statisticValueUsd" @update:value="onStatUsd" />
          <ZTag v-if="statAuto" tone="info" size="sm" :class="autoTag" :title="tq('statAuto')" data-goods-auto="46">{{ tq('auto') }}</ZTag>
        </div>
      </ZField>
      <ZField graph="41" :label="tq('quantityType')" data-graph="41" data-goods-field="quantityTypeCode" :data-goods-index="index">
        <ZSelect :value="item.quantityTypeCode || null" :options="quantityTypes" show-search allow-clear :disabled="readonly" :placeholder="tq('quantityTypePlaceholder')" popup-width="320px" class="max-sm:h-11" data-f="quantityTypeCode" @update:value="model.setField(item, 'quantityTypeCode', str($event))" />
      </ZField>
    </div>

    <GoodsTariffHint :item="item" :index="index" :model="model" :readonly="readonly" :ctx="ctx" />
  </div>
</template>
