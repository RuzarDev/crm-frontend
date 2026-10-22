<script setup lang="ts">
import { computed, watch } from 'vue'
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
import { formatNumberIn } from '@/ui/number'
import { resetCustomsValue, resetStatValue, setManualCustomsValue, setManualStatValue, statUsdFrom } from '../../dtGoodsRules'
import ManualMark from '../../ManualMark.vue'
import { withCurrent } from '../../dtOptions'
import GoodsTariffHint from './GoodsTariffHint.vue'
import SurStatsHint from '@/components/sur/SurStatsHint.vue'
import { netOverGross as isNetOverGross } from '../goodsStatus'
import { blankCharacteristic, characteristicTotals, isBlankCharacteristic } from './characteristics'
import { ensureOkeiUnits, okeiCode, okeiLabel } from './okei'
import ZButton from '@/components/z/ZButton.vue'
import { deiOf, loadDei } from './tnvedDei'
import type { GoodsSectionProps } from './types'

// «Количество и стоимость» (доска DtGoodsEditor): гр. 41 количество, ДЕИ (заблокирована — по коду ТН ВЭД) и тип
// количества; гр. 35 брутто, гр. 38 нетто (нетто > брутто — ошибка, XML не сформируется); места (гр. 6/31: одно поле, КЕДЕН-поле
// cargoPlacesQuantity = ему); гр. 42 фактурная (в форме customsValue, на сервере invoiceValue) и валюта (= гр. 22, когда
// задана — заблокирована); гр. 34 страна; гр. 45 / гр. 46; подсказка ставок. Числа пишутся сразу при вводе, с запятой.
// гр. 46 = гр. 45 / курс USD на дату гр. А (0,01) при правке гр. 45, пока гр. 46 не ручная. Правка гр. 45 или гр. 46 делает
// значение ручным (решение 16.10.2026): «вручную», «расчёт: X» и «Сбросить к расчёту»; «Рассчитать» его не перезаписывает.
const props = defineProps<GoodsSectionProps>()
const { t, locale } = useI18n()
const tq = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.qty.${key}`, p ?? {})
void ensureOkeiUnits()

type Goods = Import40GoodsItemInput
type NumKey = 'quantity' | 'grossWeightKg' | 'netWeightKg' | 'customsValue'
const setNum = (key: NumKey, v: number | null) => { props.model.setField(props.item, key, v) }
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))

// ДЕИ — «055 — М2»: код и краткое наименование ОКЕИ; только чтение, по коду ТН ВЭД (tnved/node/{code}/rates).
// Редактируемая ДТ: ответ справочника по коду известен — показывается он (с пометкой «по ТН ВЭД»), иначе сохранённая
// единица товара. Только просмотр (выпущенная ДТ) — всегда сохранённая единица: она ушла в XML, справочник мог
// измениться. У кода нет ДЕИ — «нет доп. единицы».
watch(() => [props.item.tnvedCode, props.readonly] as const, ([c, ro]) => { if (!ro) void loadDei(c) }, { immediate: true })
const dei = computed(() => (props.readonly ? undefined : deiOf(props.item.tnvedCode)))
const unitText = computed(() => {
  const d = dei.value
  if (d === null) return tq('unitNone')
  if (d) return okeiLabel(d.code, d.shortName || d.name)
  return okeiLabel(props.item.unitCode, props.item.unit)
})
const unitHint = computed(() => (dei.value === undefined ? undefined : tq('unitByTnved')))
const quantityTypes = OKEI_QUANTITY_TYPE_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

// Сумма строк характеристик гр. 31 против гр. 41 / гр. 42 — предупреждение (не блок), как под таблицей строк.
const totals = computed(() => characteristicTotals(props.item))
const fmt = (v: number | null | undefined) => (v == null ? '' : formatNumberIn(locale.value, v, 6))
const rowsQtyHelp = computed(() => (totals.value.quantityMismatch
  ? t('broker.dt.goods.editor.chars.qtyMismatchShort', { rows: fmt(totals.value.quantity) })
  : undefined))
const rowsValueHelp = computed(() => (totals.value.valueMismatch
  ? t('broker.dt.goods.editor.chars.valueMismatchShort', { rows: fmt(totals.value.value) })
  : undefined))

// №1 (пакет импорта 21.10.2026): гр. 41 заполняется только при ДЕИ кода. У кода без ДЕИ количество в гр. 41 не уходит в
// XML — предупреждение и «Перенести в гр. 31» (В1: для уже импортированных ДТ — по кнопке, без массового переноса).
// Обратно: ДЕИ есть, гр. 41 пуста, у единственной строки количество в единице ДЕИ — «Взять из гр. 31».
const filledRows = computed(() => (props.item.characteristics ?? []).filter((r) => !isBlankCharacteristic(r)))
const quantityNoDei = computed(() => dei.value === null && props.item.quantity != null)
const canMoveToRow = computed(() => quantityNoDei.value && filledRows.value.length <= 1)
const moveToRow = () => {
  if (props.readonly || !canMoveToRow.value) return
  const rows = (props.item.characteristics ??= [])
  let row = filledRows.value[0] ?? rows[0]
  if (!row) {
    rows.push(blankCharacteristic())
    row = rows[rows.length - 1]
  }
  row.quantity = props.item.quantity ?? null
  row.unitCode = props.item.unitCode ?? null
  props.model.setField(props.item, 'quantity', null)
  props.model.setField(props.item, 'unitCode', null)
  props.item.unit = null
}
const rowInDei = computed(() => {
  const d = dei.value
  if (!d || props.item.quantity != null || filledRows.value.length !== 1) return null
  const r = filledRows.value[0]
  return r.quantity != null && okeiCode(r.unitCode) === d.code ? r : null
})
const takeFromRow = () => {
  const r = rowInDei.value
  const d = dei.value
  if (props.readonly || !r || !d) return
  props.model.setField(props.item, 'quantity', r.quantity ?? null)
  props.model.setField(props.item, 'unitCode', d.code)
  props.item.unit = d.shortName || d.name
  // Строка дальше следует за гр. 41 (своё количество — копия не нужна).
  r.quantity = null
  r.unitCode = null
}
// «Тип количества» гр. 41 нужен только при ДЕИ (в XML и печать не уходит, В19): у кода без ДЕИ скрыт, если пуст.
const showQuantityType = computed(() => dei.value !== null || !!props.item.quantityTypeCode)

// Одно правило со списком, итогами и статусом (goodsStatus.netOverGross).
const netOverGross = computed(() => isNetOverGross(props.item))

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

// гр. 45 — поле платежей (setField ставит «Пересчитать»); гр. 46 пересчитывается по ней, пока сама не ручная.
const setCustomsField = (key: 'customsValueKzt', v: number | null) => props.model.setField(props.item, key, v)
const onCustomsKzt = (v: number | null) => { setManualCustomsValue(props.item, v, props.ctx.usdRate, setCustomsField) }
const onStatUsd = (v: number | null) => { setManualStatValue(props.item, v) }
const resetCustoms = () => { resetCustomsValue(props.item, props.ctx.usdRate, setCustomsField) }
const resetStat = () => { resetStatValue(props.item, props.ctx.usdRate) }
const statAuto = computed(() => {
  if (props.item.statisticValueUsdManual) return false
  const derived = statUsdFrom(props.item.customsValueKzt, props.ctx.usdRate)
  return derived != null && props.item.statisticValueUsd === derived
})
const kzt = (v: number | null | undefined) => (v == null ? null : `${formatNumberIn(locale.value, v, 2, 2)} ₸`)
const usd = (v: number | null | undefined) => (v == null ? null : `${formatNumberIn(locale.value, v, 2, 2)} $`)

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
      <ZField graph="41" :label="tq('quantity')" data-graph="41" data-goods-field="quantity" :data-goods-index="index" :validate-status="rowsQtyHelp ? 'warning' : ''" :help="rowsQtyHelp">
        <ZNumber :value="item.quantity ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="quantity" @update:value="setNum('quantity', $event)" />
      </ZField>
      <ZField graph="41" :label="tq('unit')" :title="tq('unitLocked')" :extra="unitHint" data-graph="41" data-goods-field="unitCode" :data-goods-index="index">
        <ZInput :value="unitText" readonly mono :placeholder="tq('unitAuto')" :class="lockedInput" :title="tq('unitLocked')" data-f="unitCode" :data-dei="dei === null ? 'none' : dei ? dei.code : undefined">
          <template #suffix><PhLock :size="14" aria-hidden="true" /></template>
        </ZInput>
      </ZField>
      <ZField graph="35" :label="tq('gross')" data-graph="35" data-goods-field="grossWeightKg" :data-goods-index="index" :validate-status="netOverGross ? 'error' : ''">
        <ZNumber :value="item.grossWeightKg ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="grossWeightKg" @update:value="setNum('grossWeightKg', $event)" />
      </ZField>
      <ZField graph="38" :label="tq('net')" data-graph="38" data-goods-field="netWeightKg" :data-goods-index="index" :validate-status="netOverGross ? 'error' : ''" :help="netOverGross ? tq('netOverGross') : undefined">
        <ZNumber :value="item.netWeightKg ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="netWeightKg" @update:value="setNum('netWeightKg', $event)" />
      </ZField>

      <ZField graph="31" :label="tq('places')" data-graph="31" data-goods-field="packagesCount" :data-goods-index="index">
        <ZNumber :value="places" :min="0" :precision="0" :disabled="readonly" class="max-sm:h-11" data-f="packagesCount" @update:value="onPlaces" />
      </ZField>
      <ZField graph="42" :label="tq('invoice')" data-graph="42" data-goods-field="customsValue" :data-goods-index="index" :validate-status="rowsValueHelp ? 'warning' : ''" :help="rowsValueHelp">
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

      <!-- гр. 45 / 46: ручное значение — «вручную», «расчёт: X» и «Сбросить к расчёту» под полем. -->
      <ZField graph="45" :label="tq('customsValue')" data-graph="45" data-goods-field="customsValueKzt" :data-goods-index="index" :data-manual="item.customsValueKztManual || undefined">
        <ZNumber :value="item.customsValueKzt ?? null" :min="0" :disabled="readonly" class="max-sm:h-11" data-f="customsValueKzt" @update:value="onCustomsKzt" />
        <template #extra>
          <ManualMark v-if="item.customsValueKztManual" :calc="kzt(item.customsValueKztCalc)" :can-reset="!readonly" data-manual-of="45" @reset="resetCustoms" />
          <template v-else>{{ tq('customsValueHint') }}</template>
        </template>
      </ZField>
      <ZField graph="46" :label="tq('statValue')" data-graph="46" data-goods-field="statisticValueUsd" :data-goods-index="index" :data-manual="item.statisticValueUsdManual || undefined">
        <div class="relative">
          <ZNumber :value="item.statisticValueUsd ?? null" :min="0" :disabled="readonly" :class="['max-sm:h-11', statAuto && 'pr-14']" data-f="statisticValueUsd" @update:value="onStatUsd" />
          <ZTag v-if="statAuto" tone="info" size="sm" :class="autoTag" :title="tq('statAuto')" data-goods-auto="46">{{ tq('auto') }}</ZTag>
        </div>
        <!-- Слот подписи — всегда (ZField не следит за появлением слота): ручная — отметка, иначе — откуда значение. -->
        <template #extra>
          <ManualMark v-if="item.statisticValueUsdManual" :calc="usd(item.statisticValueUsdCalc)" :can-reset="!readonly" data-manual-of="46" @reset="resetStat" />
          <template v-else>{{ tq('statValueHint') }}</template>
        </template>
      </ZField>
      <ZField v-if="showQuantityType" graph="41" :label="tq('quantityType')" data-graph="41" data-goods-field="quantityTypeCode" :data-goods-index="index">
        <ZSelect :value="item.quantityTypeCode || null" :options="quantityTypes" show-search allow-clear :disabled="readonly" :placeholder="tq('quantityTypePlaceholder')" popup-width="320px" class="max-sm:h-11" data-f="quantityTypeCode" @update:value="model.setField(item, 'quantityTypeCode', str($event))" />
      </ZField>
    </div>

    <div
      v-if="quantityNoDei"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-row bg-gold-soft px-3 py-2 text-[13px] text-gold-ink"
      role="status"
      data-goods-qty-no-dei
    >
      <span class="min-w-0 flex-1">{{ tq('quantityNoDei') }}<template v-if="!canMoveToRow"> {{ tq('moveManyRows') }}</template></span>
      <ZButton v-if="!readonly && canMoveToRow" size="sm" class="max-sm:h-11" data-goods-qty-move-to-row @click="moveToRow">{{ tq('moveToRow') }}</ZButton>
    </div>
    <div v-else-if="rowInDei && !readonly" class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2" data-goods-qty-from-row>
      <span class="min-w-0 flex-1">{{ tq('takeFromRowHint') }}</span>
      <ZButton size="sm" variant="ghost" class="max-sm:h-11" data-goods-qty-take-from-row @click="takeFromRow">{{ tq('takeFromRow') }}</ZButton>
    </div>

    <GoodsTariffHint :item="item" :index="index" :model="model" :readonly="readonly" :ctx="ctx" />
    <!-- Коридоры по нашим ДТ и «цена ниже типичной» (СУР, очередь 4): подсказка, ничего не блокирует. Клиенту сервер
         сравнивает цену по сохранённому товару (ДТ + id товара, без id — позиция), значения полей не берёт. -->
    <SurStatsHint
      :code="item.tnvedCode"
      :country="item.countryOfOrigin"
      :value-kzt="item.customsValueKzt"
      :net-kg="item.netWeightKg"
      :quantity="item.quantity"
      :unit-code="item.unitCode"
      :declaration-id="ctx.declarationId"
      :goods-id="ctx.savedGoodsIds?.[index] ?? null"
      :goods-index="index"
    />
  </div>
</template>
