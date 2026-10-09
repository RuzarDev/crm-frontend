<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretRight, PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { vUppercase } from '@/directives/uppercase'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import type { Import40GoodsExciseStamp, Import40GoodsExtras, Import40GoodsVehicle } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import type { GoodsSectionProps } from './types'

// «Доп. сведения» (гр. 31 по структуре ДТ R.055, Решение Коллегии ЕЭК № 75): 31.1 характеристики, 31.4 акцизные марки,
// сведения об автомобиле, 31.7 период поставки, 31.12 инвестпроект, 31.15 прослеживаемость. Поля и длины — как в старом
// Import40GoodsExtras; в XML уходят только заполненные блоки, правила формата — на сервере (KedenXmlReadiness), здесь —
// те же подсказки у полей. Блок раскрыт, если в нём что-то есть (автомобили — ещё и для 8701–8705, 8711), иначе свёрнут
// и не монтирует поля — открытие товара лёгкое.
// Открытие товара НИЧЕГО не пишет (раньше ensureExtras при открытии создавал extras — форма становилась «грязной»):
// доп. сведения создаются при первой правке. Не поля платежей.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.extras.${key}`, p ?? {})

type Extras = Import40GoodsExtras
const x = computed<Partial<Extras>>(() => props.item.extras ?? {})
const ensure = (): Extras => {
  const g = props.item
  g.extras ??= { traceable: false, exciseStamps: [], vehicles: [] }
  g.extras.exciseStamps ??= []
  g.extras.vehicles ??= []
  return g.extras
}
const set = <K extends keyof Extras>(key: K, v: Extras[K]) => {
  // Пустое значение в ещё не созданные доп. сведения не пишем: очистка пустого поля — не правка.
  if (!props.item.extras && (v == null || v === '' || v === false)) return
  ensure()[key] = v
}
const text = (v: string) => (v.trim() ? v : null)
const digits = (v: string) => v.replace(/\D/g, '')
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))

type BlockKey = 'chars' | 'stamps' | 'vehicles' | 'period' | 'invest' | 'trace'
// data-goods-field блока — ключи переходов «До подачи» (goodsFieldTarget.ts).
const FIELD: Record<BlockKey, string> = {
  chars: 'chars', stamps: 'exciseStamps', vehicles: 'vehicles', period: 'period', invest: 'invest', trace: 'traceable',
}
const filled = computed<Record<BlockKey, boolean>>(() => {
  const e = x.value
  return {
    chars: !!(e.productionPlaceName || e.productSortName || e.standardName || e.manufactureDate),
    stamps: !!e.exciseStamps?.length,
    vehicles: !!e.vehicles?.length,
    period: !!(e.periodStartDate || e.periodEndDate),
    invest: !!(e.investCountryCode || e.investProjectSeqId || e.investProjectYear != null || e.investGoodsListKindCode || e.investProjectGoodsSeqId != null),
    trace: !!e.traceable,
  }
})
// Транспортные средства (8701–8705, 8711): блок автомобилей раскрыт и подсказка выделена.
const isVehicleCode = computed(() => /^(870[1-5]|8711)/.test((props.item.tnvedCode ?? '').replace(/\s/g, '')))
// Начальное состояние — при открытии товара (секция монтируется заново для каждого товара).
const open = reactive<Record<BlockKey, boolean>>({
  chars: filled.value.chars,
  stamps: filled.value.stamps,
  vehicles: filled.value.vehicles || isVehicleCode.value,
  period: filled.value.period,
  invest: filled.value.invest,
  trace: filled.value.trace,
})
const BLOCKS: readonly BlockKey[] = ['chars', 'stamps', 'vehicles', 'period', 'invest', 'trace']
const filledCount = computed(() => BLOCKS.filter((b) => filled.value[b]).length)

// 31.4 акцизные марки
const stamps = computed(() => x.value.exciseStamps ?? [])
const addStamp = () => { ensure().exciseStamps.push({ quantity: null, seriesId: null }) }
const removeStamp = (i: number) => { props.item.extras?.exciseStamps?.splice(i, 1) }
const setStamp = <K extends keyof Import40GoodsExciseStamp>(s: Import40GoodsExciseStamp, key: K, value: Import40GoodsExciseStamp[K]) => { s[key] = value }

// Автомобили
const vehicles = computed(() => x.value.vehicles ?? [])
const addCar = () => { ensure().vehicles.push({ costCurrency: props.item.currency ?? null }) }
const removeCar = (i: number) => { props.item.extras?.vehicles?.splice(i, 1) }
const setCar = <K extends keyof Import40GoodsVehicle>(v: Import40GoodsVehicle, key: K, value: Import40GoodsVehicle[K]) => { v[key] = value }

// 31.7 период: нужны обе даты, начальная не позже конечной (как проверка сервера).
const periodWarn = computed(() => {
  const a = x.value.periodStartDate
  const b = x.value.periodEndDate
  if (!a !== !b) return tx('periodBoth')
  if (a && b && a.slice(0, 10) > b.slice(0, 10)) return tx('periodOrder')
  return ''
})

// 31.12 инвестпроект: все пять реквизитов или ни одного.
const investIncomplete = computed(() => {
  const e = x.value
  return filled.value.invest && !(e.investCountryCode && e.investProjectSeqId && e.investProjectYear != null && e.investGoodsListKindCode && e.investProjectGoodsSeqId != null)
})
const investKindOptions = computed<ZOption[]>(() => [
  { value: 'Т', label: tx('investKindT') },
  { value: 'С', label: tx('investKindC') },
])
const countryOptions = useCountryAlpha2Options()
const investCountryOptions = computed<ZOption[]>(() => {
  const opts = countryOptions.value.map((o) => ({ value: o.value, label: o.label }))
  const v = x.value.investCountryCode
  return !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v }, ...opts]
})

// 31.15 прослеживаемость: единица по умолчанию — ДЕИ товара (гр. 41).
const onTraceable = (on: boolean) => {
  if (!on && !props.item.extras) return
  const e = ensure()
  e.traceable = on
  if (on && !e.traceUnitCode && props.item.unitCode) e.traceUnitCode = props.item.unitCode
}
const traceWarn = computed(() => !!x.value.traceable && (x.value.traceQuantity == null || !x.value.traceUnitCode))

const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2 @xl:grid-cols-4'
const tall = 'max-sm:h-11'
const toggle = cn(
  'group flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent px-0 py-1.5 text-left text-sm font-medium text-ink',
  'outline-hidden focus-visible:shadow-focus max-sm:min-h-11',
)
const removeBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11',
)
const warnText = 'm-0 rounded-field bg-gold-soft px-3 py-2 text-[13px] text-gold-ink'
</script>

<template>
  <div class="flex flex-col" data-graph="31" data-goods-field="extras" :data-goods-index="index" data-goods-extras-section>
    <p class="m-0 mb-2 text-xs text-muted">
      {{ tx('hint') }}<template v-if="filledCount"> · {{ tx('filled', { n: filledCount }) }}</template>
    </p>

    <div v-for="b in BLOCKS" :key="b" class="border-t border-line first-of-type:border-t-0" :data-extras-block="b">
      <button
        type="button"
        :class="toggle"
        :aria-expanded="open[b]"
        :data-goods-field="open[b] ? undefined : FIELD[b]"
        :data-goods-index="index"
        :data-extras-toggle="b"
        @click="open[b] = !open[b]"
      >
        <PhCaretRight :size="14" aria-hidden="true" :class="cn('shrink-0 text-ink-3 transition-transform duration-150 ease-out motion-reduce:transition-none', open[b] && 'rotate-90')" />
        <span class="min-w-0 flex-1">{{ tx(`blocks.${b}`) }}</span>
        <span v-if="filled[b]" class="size-[7px] shrink-0 rounded-pill bg-zircon" :title="tx('blockFilled')" aria-hidden="true" />
        <span v-else-if="b === 'vehicles' && isVehicleCode" class="shrink-0 text-xs font-normal text-gold-ink">{{ tx('vehicleCode') }}</span>
      </button>

      <div v-if="open[b]" class="flex flex-col gap-3 pb-4 pt-1" :data-goods-field="FIELD[b]" :data-goods-index="index" :data-extras-body="b">
        <!-- 31.1 характеристики -->
        <div v-if="b === 'chars'" :class="grid">
          <ZField graph="31.1" :label="tx('productionPlace')" data-graph="31" :data-goods-index="index" data-goods-field="productionPlaceName">
            <ZInput v-uppercase :value="x.productionPlaceName ?? ''" :maxlength="250" :disabled="readonly" :class="tall" data-f="productionPlaceName" @update:value="set('productionPlaceName', text($event))" />
          </ZField>
          <ZField graph="31.1" :label="tx('sort')" data-graph="31" :data-goods-index="index" data-goods-field="productSortName">
            <ZInput v-uppercase :value="x.productSortName ?? ''" :maxlength="250" :disabled="readonly" :class="tall" data-f="productSortName" @update:value="set('productSortName', text($event))" />
          </ZField>
          <ZField graph="31.1" :label="tx('standard')" :title="tx('standardHint')" data-graph="31" :data-goods-index="index" data-goods-field="standardName">
            <ZInput v-uppercase :value="x.standardName ?? ''" :maxlength="40" :disabled="readonly" :title="tx('standardHint')" :class="tall" data-f="standardName" @update:value="set('standardName', text($event))" />
          </ZField>
          <ZField graph="31.1" :label="tx('manufactureDate')" data-graph="31" :data-goods-index="index" data-goods-field="manufactureDate">
            <ZDate :value="x.manufactureDate ?? null" :disabled="readonly" allow-clear :class="tall" data-f="manufactureDate" @update:value="set('manufactureDate', $event)" />
          </ZField>
        </div>

        <!-- 31.4 акцизные и специальные марки -->
        <template v-else-if="b === 'stamps'">
          <p class="m-0 text-xs text-muted">{{ tx('stampsHint') }}</p>
          <div v-for="(s, si) in stamps" :key="si" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2" :data-stamp-row="si">
            <ZField graph="31.4" :label="tx('stampQty')" data-graph="31" :data-goods-index="index">
              <ZNumber :value="s.quantity ?? null" :min="1" :max="99999999" :precision="0" :disabled="readonly" :class="tall" :data-f="`stamp-${si}-quantity`" @update:value="setStamp(s, 'quantity', $event)" />
            </ZField>
            <ZField graph="31.4" :label="tx('stampSeries')" data-graph="31" :data-goods-index="index">
              <ZInput v-uppercase :value="s.seriesId ?? ''" :maxlength="8" mono :disabled="readonly" :class="tall" :data-f="`stamp-${si}-series`" @update:value="setStamp(s, 'seriesId', text($event))" />
            </ZField>
            <button v-if="!readonly" type="button" :class="removeBtn" :aria-label="tx('remove')" :title="tx('remove')" :data-stamp-remove="si" @click="removeStamp(si)"><PhX :size="16" aria-hidden="true" /></button>
          </div>
          <div v-if="!readonly"><ZButton variant="ghost" size="sm" class="max-sm:h-11" data-stamp-add @click="addStamp"><PhPlus :size="14" aria-hidden="true" />{{ tx('addStamp') }}</ZButton></div>
        </template>

        <!-- Сведения об автомобиле -->
        <template v-else-if="b === 'vehicles'">
          <p :class="cn('m-0 text-xs', isVehicleCode && !vehicles.length ? 'font-medium text-gold-ink' : 'text-muted')">{{ tx('carsHint') }}</p>
          <div v-for="(v, vi) in vehicles" :key="vi" class="flex flex-col gap-3 rounded-row border border-line p-3" :data-vehicle-row="vi">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-semibold text-ink">{{ tx('carN', { n: vi + 1 }) }}</span>
              <button v-if="!readonly" type="button" :class="removeBtn" :aria-label="tx('removeCar', { n: vi + 1 })" :title="tx('removeCar', { n: vi + 1 })" :data-vehicle-remove="vi" @click="removeCar(vi)"><PhX :size="16" aria-hidden="true" /></button>
            </div>
            <div :class="grid">
              <ZField :label="tx('vin')"><ZInput v-uppercase :value="v.vin ?? ''" :maxlength="17" mono :disabled="readonly" :class="tall" :data-f="`car-${vi}-vin`" @update:value="setCar(v, 'vin', text($event))" /></ZField>
              <ZField :label="tx('chassis')"><ZInput v-uppercase :value="v.chassisId ?? ''" :maxlength="20" mono :disabled="readonly" :class="tall" :data-f="`car-${vi}-chassis`" @update:value="setCar(v, 'chassisId', text($event))" /></ZField>
              <ZField :label="tx('body')"><ZInput v-uppercase :value="v.bodyId ?? ''" :maxlength="20" mono :disabled="readonly" :class="tall" :data-f="`car-${vi}-body`" @update:value="setCar(v, 'bodyId', text($event))" /></ZField>
              <ZField :label="tx('engineId')"><ZInput v-uppercase :value="v.engineId ?? ''" :maxlength="20" mono :disabled="readonly" :class="tall" :data-f="`car-${vi}-engine`" @update:value="setCar(v, 'engineId', text($event))" /></ZField>
              <ZField :label="tx('makeCode')" v-bind="v.makeCode && !/^\d{3}$/.test(v.makeCode) ? { validateStatus: 'warning', help: tx('makeCodeFormat') } : {}">
                <ZInput :value="v.makeCode ?? ''" :maxlength="3" mono inputmode="numeric" placeholder="000" :disabled="readonly" :class="tall" :data-f="`car-${vi}-makeCode`" @update:value="setCar(v, 'makeCode', text(digits($event)))" />
              </ZField>
              <ZField :label="tx('makeName')"><ZInput v-uppercase :value="v.makeName ?? ''" :maxlength="120" :disabled="readonly" :class="tall" :data-f="`car-${vi}-makeName`" @update:value="setCar(v, 'makeName', text($event))" /></ZField>
              <ZField :label="tx('model')" class="@sm:col-span-2" v-bind="!v.modelName?.trim() ? { validateStatus: 'warning', help: tx('modelRequired') } : {}">
                <ZInput v-uppercase :value="v.modelName ?? ''" :maxlength="250" :disabled="readonly" :class="tall" :data-f="`car-${vi}-model`" @update:value="setCar(v, 'modelName', text($event))" />
              </ZField>
              <ZField :label="tx('carDate')"><ZDate :value="v.manufactureDate ?? null" allow-clear :disabled="readonly" :class="tall" :data-f="`car-${vi}-date`" @update:value="setCar(v, 'manufactureDate', $event)" /></ZField>
              <ZField :label="tx('engineVolume')"><ZNumber :value="v.engineVolumeCm3 ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-volume`" @update:value="setCar(v, 'engineVolumeCm3', $event)" /></ZField>
              <ZField :label="tx('powerKw')"><ZNumber :value="v.powerKw ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-kw`" @update:value="setCar(v, 'powerKw', $event)" /></ZField>
              <ZField :label="tx('powerHp')"><ZNumber :value="v.powerHp ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-hp`" @update:value="setCar(v, 'powerHp', $event)" /></ZField>
              <ZField :label="tx('capacity')"><ZNumber :value="v.carryingCapacityKg ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-capacity`" @update:value="setCar(v, 'carryingCapacityKg', $event)" /></ZField>
              <ZField :label="tx('mileage')"><ZNumber :value="v.mileageKm ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-mileage`" @update:value="setCar(v, 'mileageKm', $event)" /></ZField>
              <ZField :label="tx('cost')"><ZNumber :value="v.cost ?? null" :min="0" :disabled="readonly" :class="tall" :data-f="`car-${vi}-cost`" @update:value="setCar(v, 'cost', $event)" /></ZField>
              <ZField :label="tx('currency')" v-bind="v.cost != null && !v.costCurrency ? { validateStatus: 'warning', help: tx('currencyRequired') } : {}">
                <ZInput v-uppercase :value="v.costCurrency ?? ''" :maxlength="3" mono placeholder="USD" :disabled="readonly" :class="tall" :data-f="`car-${vi}-currency`" @update:value="setCar(v, 'costCurrency', text($event))" />
              </ZField>
              <ZField :label="tx('emergency')" class="@sm:col-span-2"><ZInput :value="v.emergencyDeviceId ?? ''" :maxlength="50" mono :disabled="readonly" :class="tall" :data-f="`car-${vi}-emergency`" @update:value="setCar(v, 'emergencyDeviceId', text($event))" /></ZField>
            </div>
          </div>
          <div v-if="!readonly"><ZButton variant="ghost" size="sm" class="max-sm:h-11" data-vehicle-add @click="addCar"><PhPlus :size="14" aria-hidden="true" />{{ tx('addCar') }}</ZButton></div>
        </template>

        <!-- 31.7 период поставки -->
        <template v-else-if="b === 'period'">
          <div :class="grid">
            <ZField graph="31.7" :label="tx('periodStart')" data-graph="31" :data-goods-index="index" data-goods-field="periodStartDate">
              <ZDate :value="x.periodStartDate ?? null" allow-clear :disabled="readonly" :class="tall" data-f="periodStartDate" @update:value="set('periodStartDate', $event)" />
            </ZField>
            <ZField graph="31.7" :label="tx('periodEnd')" data-graph="31" :data-goods-index="index" data-goods-field="periodEndDate">
              <ZDate :value="x.periodEndDate ?? null" allow-clear :disabled="readonly" :class="tall" data-f="periodEndDate" @update:value="set('periodEndDate', $event)" />
            </ZField>
          </div>
          <p v-if="periodWarn" :class="warnText" role="status" data-extras-warn="period">{{ periodWarn }}</p>
        </template>

        <!-- 31.12 инвестпроект -->
        <template v-else-if="b === 'invest'">
          <p :class="investIncomplete ? warnText : 'm-0 text-xs text-muted'" :role="investIncomplete ? 'status' : undefined" data-extras-warn="invest">{{ tx('investHint') }}</p>
          <div :class="grid">
            <ZField graph="31.12" :label="tx('investCountry')" data-graph="31" :data-goods-index="index" data-goods-field="investCountryCode">
              <ZSelect :value="x.investCountryCode || null" :options="investCountryOptions" show-search allow-clear :disabled="readonly" placeholder="KZ" popup-width="320px" :class="tall" data-f="investCountryCode" @update:value="set('investCountryCode', str($event))" />
            </ZField>
            <ZField graph="31.12" :label="tx('investSeq')" data-graph="31" :data-goods-index="index" data-goods-field="investProjectSeqId">
              <ZInput :value="x.investProjectSeqId ?? ''" :maxlength="4" mono inputmode="numeric" placeholder="0001" :disabled="readonly" :class="tall" data-f="investProjectSeqId" @update:value="set('investProjectSeqId', text(digits($event)))" />
            </ZField>
            <ZField graph="31.12" :label="tx('investYear')" data-graph="31" :data-goods-index="index" data-goods-field="investProjectYear">
              <ZNumber :value="x.investProjectYear ?? null" :min="2000" :max="2100" :precision="0" :disabled="readonly" :class="tall" data-f="investProjectYear" @update:value="set('investProjectYear', $event)" />
            </ZField>
            <ZField graph="31.12" :label="tx('investKind')" data-graph="31" :data-goods-index="index" data-goods-field="investGoodsListKindCode">
              <ZSelect :value="x.investGoodsListKindCode || null" :options="investKindOptions" allow-clear :disabled="readonly" popup-width="320px" :class="tall" data-f="investGoodsListKindCode" @update:value="set('investGoodsListKindCode', str($event))" />
            </ZField>
            <ZField graph="31.12" :label="tx('investGoodsSeq')" data-graph="31" :data-goods-index="index" data-goods-field="investProjectGoodsSeqId">
              <ZNumber :value="x.investProjectGoodsSeqId ?? null" :min="1" :max="999999999" :precision="0" :disabled="readonly" :class="tall" data-f="investProjectGoodsSeqId" @update:value="set('investProjectGoodsSeqId', $event)" />
            </ZField>
          </div>
        </template>

        <!-- 31.15 прослеживаемость -->
        <template v-else>
          <ZCheckbox :checked="!!x.traceable" :disabled="readonly" data-f="traceable" @update:checked="onTraceable">{{ tx('traceable') }}</ZCheckbox>
          <div v-if="x.traceable" :class="grid">
            <ZField graph="31.15" :label="tx('traceQty')" data-graph="31" :data-goods-index="index" data-goods-field="traceQuantity">
              <ZNumber :value="x.traceQuantity ?? null" :min="0" :disabled="readonly" :class="tall" data-f="traceQuantity" @update:value="set('traceQuantity', $event)" />
            </ZField>
            <ZField graph="31.15" :label="tx('traceUnit')" data-graph="31" :data-goods-index="index" data-goods-field="traceUnitCode">
              <ZInput :value="x.traceUnitCode ?? ''" :maxlength="4" mono placeholder="796" :disabled="readonly" :class="tall" data-f="traceUnitCode" @update:value="set('traceUnitCode', text($event))" />
            </ZField>
          </div>
          <p v-if="traceWarn" :class="warnText" role="status" data-extras-warn="trace">{{ tx('traceRequired') }}</p>
        </template>
      </div>
    </div>
  </div>
</template>
