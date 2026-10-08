<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBookOpen, PhCalculator, PhPlus, PhX } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTable from '@/components/z/ZTable.vue'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import { salesApi, type SalesCalcGoodsResult, type SalesCalcResponse, type SalesServiceItem } from '@/api/sales'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import type { TnvedCurrencyDto } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { formatAmount, formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import { formatDay } from '@/views/broker/list'
import {
  activeServices, antiDumpingChoices, buildPayload, exciseChoices, formatRate, goodsErrorText, hasAntiDumping,
  hasKedenBlock, isStale, payloadKey, serviceLineTotal, tpinBreakdown, type GoodsRow, type ServiceRow,
} from './sales'

// Расчёт услуг и таможенных платежей (редизайн, волна 3б, доска Sales). Слева форма, справа «Итог».
// Сервер считает всё сам (/sales/calculate); после правки строк результат помечается устаревшим.
// «Сохранить как КП» пересчитывает на сервере по текущим строкам — сохранить можно и устаревший результат.
// Инкотермс и доставка в расчёте не участвуют — только сохраняются в КП, как раньше.
// «Итог» закреплён ниже липкой шапки оболочки (≈63px) — отсюда top-20, а не top-4 из брифа.
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const classifiers = useClassifiersStore()

// ---- Клиент и условия ----
const clientName = ref('')
const clientContact = ref('')
const comment = ref('')
const incoterms = ref<string | null>(null)
const transportCost = ref<number | null>(null)
const transportCurrency = ref('USD')

// ---- Справочники: что загрузилось, то и применяем (как раньше) ----
const services = ref<SalesServiceItem[]>([])
const currencies = ref<TnvedCurrencyDto[]>([])
const countryOptions = ref<{ value: string; label: string }[]>([])
onMounted(async () => {
  const [svc, cur, , countries] = await Promise.allSettled([
    salesApi.listServices(),
    tnvedApi.currencies({ silent: true }),
    classifiers.load('incoterms'),
    referencesApi.listCountries({ silent: true }),
  ])
  if (svc.status === 'fulfilled') services.value = svc.value
  if (cur.status === 'fulfilled') currencies.value = cur.value.data
  if (countries.status === 'fulfilled') countryOptions.value = countries.value.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
})

const incotermsOptions = computed(() => classifiers.options('incoterms'))
const currencyOptions = computed(() => currencies.value.map((c) => ({ value: c.codeLat, label: c.codeLat, rate: formatRate(c.rate) })))
const rateFor = (code: string | null | undefined): string | null => {
  const c = currencies.value.find((x) => x.codeLat === code)
  return c ? formatRate(c.rate) : null
}
const usd = computed(() => currencies.value.find((c) => c.codeLat === 'USD') ?? null)
// «курс НБ РК на 08.10: …»; без даты обновления (или она не разобралась) — подпись без даты, а не «на —».
const usdLabel = computed(() => {
  const c = usd.value
  if (!c) return ''
  const day = formatDay(c.updatedAtUtc)
  return day === '—'
    ? t('broker.sales.usdRateNoDate', { rate: formatRate(c.rate) })
    : t('broker.sales.usdRate', { date: day.slice(0, 5), rate: formatRate(c.rate) })
})

// ---- Услуги ----
// «Из прайса» — выбор без своего значения: выбранная услуга сразу становится строкой, поле остаётся пустым.
let lineKey = 0
const serviceLines = ref<ServiceRow[]>([])
const priceOptions = computed(() => activeServices(services.value).map((s) => ({ value: s.id, label: `${s.name} — ${formatMoney(s.price)} / ${s.unit}` })))
const addFromPrice = (id: unknown) => {
  const s = services.value.find((x) => x.id === id)
  if (!s) return
  serviceLines.value.push({ _k: lineKey++, name: s.name, unit: s.unit, unitPrice: s.price, quantity: 1, discountPercent: 0 })
}
const addCustomService = () => {
  serviceLines.value.push({ _k: lineKey++, name: '', unit: t('sales.usluga'), unitPrice: 0, quantity: 1, discountPercent: 0 })
}

// ---- Товары ----
const goodsLines = ref<GoodsRow[]>([])
const addGoods = () => {
  goodsLines.value.push({ _k: lineKey++, description: '', code: '', customsValue: 0, currencyCode: 'USD', weightKg: null, unit: '' })
}

// Автоединица по коду ТН ВЭД (ручной ввод не перезаписывает); код не найден — оставляем пустым.
const fillUnit = async (row: GoodsRow) => {
  const code = row.code?.trim()
  if (!code || row.unit) return
  try {
    const { data } = await tnvedApi.node(code)
    if (data?.unitShort && !row.unit) row.unit = data.unitShort
  } catch { /* кода нет в справочнике */ }
}

// Справочник ТН ВЭД для строки: поиск предзаполнен текущим кодом (и неполным — пикер покажет подходящие).
const pickerOpen = ref(false)
const pickerQuery = ref('')
const pickerRow = ref<GoodsRow | null>(null)
const openPicker = (row: GoodsRow) => {
  pickerRow.value = row
  pickerQuery.value = (row.code || '').trim()
  pickerOpen.value = true
}
const onPick = (p: { code: string; name: string }) => {
  const row = pickerRow.value
  if (!row || !goodsLines.value.includes(row)) return
  row.code = p.code
  if (!row.description) row.description = p.name
  void fillUnit(row)
}

// ---- Расчёт ----
const calculating = ref(false)
const result = ref<SalesCalcResponse | null>(null)
const calculatedKey = ref<string | null>(null)
const currentKey = computed(() => payloadKey(buildPayload(serviceLines.value, goodsLines.value)))
const stale = computed(() => !!result.value && isStale(calculatedKey.value, currentKey.value))

const calculate = async () => {
  if (calculating.value) return
  const payload = buildPayload(serviceLines.value, goodsLines.value)
  calculating.value = true
  try {
    result.value = await salesApi.calculate(payload)
    calculatedKey.value = payloadKey(payload)
  } catch {
    message.error(t('sales.oshibkaRascheta'))
  } finally {
    calculating.value = false
  }
}

// Выбор КЕДЕН у товара пересчитывает всё (строки результата и формы — по индексу, как раньше). Пока идёт расчёт
// или результат устарел (строки товаров могли сдвинуться), выбор закрыт: сначала «Пересчитать».
const kedenLocked = computed(() => calculating.value || stale.value)
const setExcise = (gi: number, v: unknown) => {
  const row = goodsLines.value[gi]
  if (!row) return
  row.exciseKind = (v as string | null) ?? null
  void calculate()
}
const setAntiDumping = (gi: number, v: unknown) => {
  const row = goodsLines.value[gi]
  if (!row) return
  row.antiDumpingKind = (v as string | null) || null
  void calculate()
}

const breakdown = computed(() => tpinBreakdown(result.value?.goods ?? []))
const goodsErrors = computed(() => (result.value?.goods ?? []).filter((g) => g.error))
const kedenGoods = computed(() => (result.value?.goods ?? []).map((g, gi) => ({ g, gi })).filter(({ g }) => hasKedenBlock(g)))

// ---- Сохранение ----
const saving = ref(false)
const canSave = computed(() => !!clientName.value.trim() && !!result.value)
const save = async () => {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    await salesApi.createQuote({
      clientName: clientName.value.trim(),
      clientContact: clientContact.value.trim(),
      comment: comment.value.trim(),
      incoterms: incoterms.value ?? null,
      transportCost: transportCost.value,
      transportCurrency: transportCurrency.value,
      ...buildPayload(serviceLines.value, goodsLines.value),
    })
    message.success(t('sales.kpSohraneno'))
    emit('saved')
  } catch {
    message.error(t('sales.neUdalosSohranitKp'))
  } finally {
    saving.value = false
  }
}

// ---- Таблицы ----
const sumWidth = (cols: { width?: number | string }[]) => cols.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0)
const serviceCols = computed<ZColumn<ServiceRow>[]>(() => [
  { key: 'name', title: t('sales.usluga2'), width: 172 },
  { key: 'unit', title: t('sales.ed'), width: 92 },
  { key: 'price', title: t('broker.sales.col.price'), width: 104, align: 'right' },
  { key: 'qty', title: t('sales.kolVo'), width: 72, align: 'right' },
  { key: 'disc', title: t('broker.sales.col.discount'), width: 88, align: 'right' },
  { key: 'sum', title: t('broker.sales.col.amount'), width: 100, align: 'right' },
  { key: 'del', title: '', width: 44, align: 'right' },
])
const goodsCols = computed<ZColumn<GoodsRow>[]>(() => [
  { key: 'desc', title: t('sales.naimenovanie'), width: 180 },
  { key: 'code', title: t('sales.tnved'), width: 172 },
  { key: 'val', title: t('sales.stoimost'), width: 108, align: 'right' },
  { key: 'cur', title: t('sales.valyuta'), width: 96 },
  { key: 'weight', title: t('sales.vesKg'), width: 84, align: 'right' },
  { key: 'country', title: t('sales.calcOriginCountry'), width: 160 },
  { key: 'unit', title: t('sales.ed'), width: 72 },
  { key: 'del', title: '', width: 44, align: 'right' },
])
const RESULT_FIELD = {
  val: 'customsValueKzt', duty: 'importDutyKzt', ad: 'antiDumpingKzt', excise: 'exciseKzt', fee: 'customsFeeKzt', vat: 'vatKzt', tpin: 'tpinTotalKzt',
} as const
type ResultKey = keyof typeof RESULT_FIELD
const resultCols = computed<ZColumn<SalesCalcGoodsResult>[]>(() => [
  { key: 'descr', title: t('sales.tovar'), width: 200 },
  { key: 'codec', title: t('sales.tnved'), width: 130 },
  { key: 'val', title: t('sales.stoimost2'), width: 120, align: 'right' },
  { key: 'duty', title: t('sales.poshlina'), width: 110, align: 'right' },
  ...(hasAntiDumping(result.value?.goods ?? []) ? [{ key: 'ad', title: t('sales.calcAntiDumping'), width: 130, align: 'right' as const }] : []),
  { key: 'excise', title: t('sales.akciz'), width: 100, align: 'right' },
  { key: 'fee', title: t('sales.sbor'), width: 100, align: 'right' },
  { key: 'vat', title: t('sales.nds'), width: 110, align: 'right' },
  { key: 'tpin', title: t('sales.tpin'), width: 120, align: 'right' },
])
const resultCell = (g: SalesCalcGoodsResult, key: string) => formatAmount(g[RESULT_FIELD[key as ResultKey]] as number | undefined)
const isResultNum = (key: string | undefined) => !!key && key in RESULT_FIELD

const delBtn = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11'
const iconBtn = 'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-surface p-0 text-ink-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11'
const panel = 'rounded-panel border border-line bg-surface'
const panelHead = 'flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 pb-3'
const h2 = 'm-0 text-[15px] leading-6 font-semibold text-ink'
</script>

<template>
  <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-sales-calc>
    <div class="flex min-w-0 flex-col gap-4">
      <!-- Клиент и условия -->
      <section :class="panel" aria-labelledby="sales-client" data-sales-client-panel>
        <div :class="panelHead"><h2 id="sales-client" :class="h2">{{ t('broker.sales.panel.client') }}</h2></div>
        <div class="flex flex-col gap-4 px-5 pb-5">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ZField :label="t('sales.klient3')" required>
              <ZInput :value="clientName" :placeholder="t('sales.nazvanieKompanii')" data-sales-client @update:value="clientName = $event" />
            </ZField>
            <ZField :label="t('sales.kontakt')">
              <ZInput :value="clientContact" :placeholder="t('sales.telefonEMail')" data-sales-contact @update:value="clientContact = $event" />
            </ZField>
          </div>
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,2fr)]">
            <ZField :label="t('sales.inkoterms')" class="max-lg:col-span-2">
              <ZSelect
                :value="incoterms"
                :options="incotermsOptions"
                allow-clear
                show-search
                :popup-width="320"
                :placeholder="t('sales.inkoterms')"
                data-sales-incoterms
                @update:value="incoterms = ($event as string | null)"
              />
            </ZField>
            <ZField :label="t('broker.sales.field.delivery')">
              <ZNumber :value="transportCost" :min="0" data-sales-delivery @update:value="transportCost = $event" />
            </ZField>
            <ZField :label="t('sales.valyuta')">
              <ZSelect
                :value="transportCurrency"
                :options="currencyOptions"
                show-search
                :popup-width="200"
                data-sales-delivery-currency
                @update:value="transportCurrency = String($event ?? 'USD')"
              >
                <template #option="{ option }">
                  <span class="flex items-baseline justify-between gap-3">
                    <span>{{ option.label }}</span><span class="text-xs text-muted tabular-nums">{{ option.rate }} ₸</span>
                  </span>
                </template>
              </ZSelect>
            </ZField>
            <ZField :label="t('sales.kommentariy')" class="max-lg:col-span-2">
              <ZInput :value="comment" :placeholder="t('sales.primechanieKRaschetu')" data-sales-comment @update:value="comment = $event" />
            </ZField>
          </div>
        </div>
      </section>

      <!-- Услуги -->
      <section :class="panel" aria-labelledby="sales-services" data-sales-services-panel>
        <div :class="panelHead">
          <h2 id="sales-services" :class="h2">{{ t('sales.uslugi') }}</h2>
          <div class="ml-auto flex min-w-0 flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full">
            <ZSelect
              :value="null"
              :options="priceOptions"
              show-search
              :popup-width="380"
              :placeholder="t('broker.sales.fromPrice')"
              :aria-label="t('broker.sales.fromPrice')"
              class="w-56 max-sm:h-11 max-sm:w-full"
              data-sales-price
              @update:value="addFromPrice"
            />
            <ZButton variant="ghost" class="max-sm:h-11 max-sm:flex-1" data-sales-custom-service @click="addCustomService">
              <template #icon><PhPlus :size="14" weight="bold" aria-hidden="true" /></template>
              {{ t('sales.svoyaUsluga') }}
            </ZButton>
          </div>
        </div>
        <p v-if="!serviceLines.length" class="m-0 border-t border-line px-5 py-4 text-sm text-muted" data-sales-services-empty>{{ t('broker.sales.servicesEmpty') }}</p>
        <ZTable
          v-else
          :columns="serviceCols"
          :data-source="serviceLines"
          row-key="_k"
          size="small"
          :pagination="false"
          :scroll="{ x: sumWidth(serviceCols) }"
          :aria-label="t('sales.uslugi')"
          class="border-t border-line max-sm:border-0 max-sm:px-3 max-sm:pb-3"
          data-sales-services
        >
          <template #bodyCell="{ column, record, index }">
            <ZInput v-if="column.key === 'name'" :value="record.name" size="sm" :aria-label="t('sales.usluga2')" data-service-name @update:value="record.name = $event" />
            <ZInput v-else-if="column.key === 'unit'" :value="record.unit" size="sm" :aria-label="t('sales.ed')" @update:value="record.unit = $event" />
            <ZNumber v-else-if="column.key === 'price'" :value="record.unitPrice" :min="0" size="sm" :aria-label="t('sales.cena')" data-service-price @update:value="record.unitPrice = $event ?? 0" />
            <ZNumber v-else-if="column.key === 'qty'" :value="record.quantity" :min="0" size="sm" :aria-label="t('sales.kolVo')" data-service-qty @update:value="record.quantity = $event ?? 0" />
            <ZNumber v-else-if="column.key === 'disc'" :value="record.discountPercent" :min="0" :max="100" size="sm" :aria-label="t('sales.skidka')" data-service-disc @update:value="record.discountPercent = $event ?? 0" />
            <span v-else-if="column.key === 'sum'" class="block text-sm font-semibold whitespace-nowrap text-ink tabular-nums" data-service-sum>{{ formatAmount(serviceLineTotal(record)) }}</span>
            <button
              v-else-if="column.key === 'del'"
              type="button"
              :class="delBtn"
              :aria-label="t('broker.sales.removeService')"
              :title="t('broker.sales.removeService')"
              data-service-remove
              @click="serviceLines.splice(index, 1)"
            >
              <PhX :size="14" aria-hidden="true" />
            </button>
          </template>
        </ZTable>
      </section>

      <!-- Товары и платежи -->
      <section :class="panel" aria-labelledby="sales-goods" data-sales-goods-panel>
        <div :class="panelHead">
          <h2 id="sales-goods" :class="h2">{{ t('broker.sales.panel.goods') }}</h2>
          <ZButton class="ml-auto max-sm:ml-0 max-sm:h-11 max-sm:w-full" data-sales-add-goods @click="addGoods">
            <template #icon><PhPlus :size="14" weight="bold" aria-hidden="true" /></template>
            {{ t('sales.dobavitTovar') }}
          </ZButton>
        </div>
        <ZTable
          v-if="goodsLines.length"
          :columns="goodsCols"
          :data-source="goodsLines"
          row-key="_k"
          size="small"
          :pagination="false"
          :scroll="{ x: sumWidth(goodsCols) }"
          :aria-label="t('broker.sales.panel.goods')"
          class="border-t border-line max-sm:border-0 max-sm:px-3"
          data-sales-goods
        >
          <template #bodyCell="{ column, record, index }">
            <ZInput v-if="column.key === 'desc'" :value="record.description" size="sm" :placeholder="t('sales.naimenovanie')" :aria-label="t('sales.naimenovanie')" data-goods-desc @update:value="record.description = $event" />
            <span v-else-if="column.key === 'code'" class="flex items-center gap-1">
              <ZInput
                :value="record.code"
                mono
                size="sm"
                :placeholder="t('broker.sales.tnvedPh')"
                :aria-label="t('sales.tnved')"
                class="min-w-0 flex-1"
                data-goods-code
                @update:value="record.code = $event"
                @blur="fillUnit(record)"
              />
              <button
                type="button"
                :class="iconBtn"
                :aria-label="t('sales.spravochnikTnVedPoisk')"
                :title="t('sales.spravochnikTnVedPoisk')"
                data-goods-picker
                @click="openPicker(record)"
              >
                <PhBookOpen :size="15" aria-hidden="true" />
              </button>
            </span>
            <ZNumber v-else-if="column.key === 'val'" :value="record.customsValue" :min="0" size="sm" :aria-label="t('sales.stoimost')" data-goods-value @update:value="record.customsValue = $event ?? 0" />
            <span v-else-if="column.key === 'cur'" class="flex flex-col gap-0.5">
              <ZSelect
                :value="record.currencyCode"
                :options="currencyOptions"
                show-search
                size="sm"
                :popup-width="200"
                :aria-label="t('sales.valyuta')"
                data-goods-currency
                @update:value="record.currencyCode = String($event ?? 'USD')"
              >
                <template #option="{ option }">
                  <span class="flex items-baseline justify-between gap-3">
                    <span>{{ option.label }}</span><span class="text-xs text-muted tabular-nums">{{ option.rate }} ₸</span>
                  </span>
                </template>
              </ZSelect>
              <span v-if="rateFor(record.currencyCode)" class="text-xs text-muted tabular-nums" data-goods-rate>{{ rateFor(record.currencyCode) }} ₸</span>
            </span>
            <ZNumber v-else-if="column.key === 'weight'" :value="record.weightKg" :min="0" size="sm" :aria-label="t('sales.vesKg')" @update:value="record.weightKg = $event" />
            <ZSelect
              v-else-if="column.key === 'country'"
              :value="record.originCountry ?? null"
              :options="countryOptions"
              show-search
              allow-clear
              size="sm"
              :popup-width="300"
              :placeholder="t('sales.calcOriginCountry')"
              :aria-label="t('sales.calcOriginCountry')"
              data-goods-country
              @update:value="record.originCountry = ($event as string | null) ?? undefined"
            />
            <ZInput v-else-if="column.key === 'unit'" :value="record.unit" size="sm" :placeholder="t('sales.sht')" :aria-label="t('sales.ed')" data-goods-unit @update:value="record.unit = $event" />
            <button
              v-else-if="column.key === 'del'"
              type="button"
              :class="delBtn"
              :aria-label="t('broker.sales.removeGoods')"
              :title="t('broker.sales.removeGoods')"
              data-goods-remove
              @click="goodsLines.splice(index, 1)"
            >
              <PhX :size="14" aria-hidden="true" />
            </button>
          </template>
        </ZTable>
        <p :class="['m-0 px-5 py-3 text-sm text-muted', goodsLines.length ? '' : 'border-t border-line']">{{ t('sales.poshlinaNdsISbory') }}</p>
      </section>

      <!-- Расчёт по товарам -->
      <section v-if="result && result.goods.length" :class="panel" aria-labelledby="sales-results" data-sales-results>
        <div :class="panelHead"><h2 id="sales-results" :class="h2">{{ t('broker.sales.panel.results') }}</h2></div>
        <div v-if="goodsErrors.length" class="flex flex-col gap-2 px-5 pb-3">
          <ZAlert v-for="(g, i) in goodsErrors" :key="i" type="warning" show-icon :message="goodsErrorText(g, t)" data-sales-goods-error />
        </div>
        <ZTable
          :columns="resultCols"
          :data-source="result.goods"
          :row-key="(_r: SalesCalcGoodsResult, i: number) => i"
          size="small"
          :pagination="false"
          :scroll="{ x: sumWidth(resultCols) }"
          :aria-label="t('broker.sales.panel.results')"
          class="border-t border-line max-sm:border-0 max-sm:px-3"
          data-sales-results-table
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'descr'" class="block min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{{ record.description }}</span>
            <span v-else-if="column.key === 'codec'" class="font-mono text-sm text-ink-2">{{ record.code }}</span>
            <span v-else-if="isResultNum(column.key)" :class="['text-sm whitespace-nowrap tabular-nums', column.key === 'tpin' ? 'font-semibold text-ink' : 'text-ink-2']" :data-result-cell="column.key">{{ resultCell(record, column.key!) }}</span>
          </template>
        </ZTable>
        <div v-if="kedenGoods.length" class="flex flex-col gap-4 border-t border-line px-5 py-4" data-sales-keden>
          <p v-if="stale" class="m-0 text-sm text-gold-ink" data-keden-stale>{{ t('broker.sales.kedenStale') }}</p>
          <div v-for="{ g, gi } in kedenGoods" :key="gi" class="flex flex-col gap-2" :data-keden-goods="gi">
            <div class="text-sm font-semibold text-ink [overflow-wrap:anywhere]"><span class="font-mono">{{ g.code }}</span> — {{ g.description }}</div>
            <p v-if="g.notes" class="m-0 text-sm text-muted">{{ g.notes }}</p>
            <ZField v-if="(g.exciseOptions?.length ?? 0) > 1" :label="t('dt.tariffExciseKind')">
              <ZSelect
                :value="g.exciseKind ?? null"
                :options="exciseChoices(g.exciseOptions)"
                :disabled="kedenLocked"
                class="max-w-[480px]"
                data-keden-excise
                @update:value="setExcise(gi, $event)"
              />
            </ZField>
            <ZField v-if="g.antiDumpingOptions?.length" :label="t('dt.tariffAntiDumping')">
              <ZSelect
                :value="goodsLines[gi]?.antiDumpingKind ?? ''"
                :options="antiDumpingChoices(g.antiDumpingOptions, t)"
                :disabled="kedenLocked"
                class="max-w-[480px]"
                data-keden-antidumping
                @update:value="setAntiDumping(gi, $event)"
              />
            </ZField>
          </div>
        </div>
      </section>
    </div>

    <!-- Итог -->
    <aside :class="[panel, 'flex flex-col gap-3.5 p-5 xl:sticky xl:top-20']" aria-labelledby="sales-summary" data-sales-summary>
      <div>
        <h2 id="sales-summary" :class="h2">{{ t('sales.itog') }}</h2>
        <p v-if="usd" class="m-0 mt-0.5 text-xs text-muted tabular-nums" data-sales-usd>
          {{ usdLabel }}
        </p>
      </div>

      <template v-if="result">
        <div v-if="stale" class="rounded-row bg-gold-soft px-3 py-2 text-sm text-gold-ink shadow-[inset_0_0_0_1px_var(--color-gold-line)]" role="status" data-sales-stale>
          {{ t('broker.sales.stale') }}
        </div>
        <dl class="m-0 flex flex-col gap-2 text-sm">
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-ink-2">{{ t('broker.sales.servicesTotal') }}</dt>
            <dd class="m-0 font-semibold whitespace-nowrap text-ink tabular-nums" data-sum-services>{{ formatMoney(result.servicesTotal) }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-ink-2">{{ t('broker.sales.customsTotal') }}</dt>
            <dd class="m-0 font-semibold whitespace-nowrap text-ink tabular-nums" data-sum-customs>{{ formatMoney(result.tpinTotal) }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <dt class="text-muted">{{ t('broker.sales.breakdown.duty') }}</dt>
            <dd class="m-0 whitespace-nowrap text-ink-3 tabular-nums" data-sum-duty>{{ formatMoney(breakdown.duty) }}</dd>
          </div>
          <div v-if="breakdown.antiDumping > 0" class="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <dt class="text-muted">{{ t('broker.sales.breakdown.antiDumping') }}</dt>
            <dd class="m-0 whitespace-nowrap text-ink-3 tabular-nums" data-sum-antidumping>{{ formatMoney(breakdown.antiDumping) }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <dt class="text-muted">{{ t('broker.sales.breakdown.excise') }}</dt>
            <dd class="m-0 whitespace-nowrap text-ink-3 tabular-nums" data-sum-excise>{{ formatMoney(breakdown.excise) }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <dt class="text-muted">{{ t('broker.sales.breakdown.vat') }}</dt>
            <dd class="m-0 whitespace-nowrap text-ink-3 tabular-nums" data-sum-vat>{{ formatMoney(breakdown.vat) }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 pl-3 text-xs">
            <dt class="text-muted">{{ t('broker.sales.breakdown.fee') }}</dt>
            <dd class="m-0 whitespace-nowrap text-ink-3 tabular-nums" data-sum-fee>{{ formatMoney(breakdown.fee) }}</dd>
          </div>
        </dl>
        <div class="border-t border-line pt-3">
          <div class="text-sm text-ink-3">{{ t('broker.sales.grandTotal') }}</div>
          <div class="text-[28px] leading-[34px] font-semibold tracking-[-0.015em] whitespace-nowrap text-ink tabular-nums" data-sum-grand>{{ formatMoney(result.grandTotal) }}</div>
        </div>
      </template>
      <p v-else class="m-0 text-sm text-muted" data-sales-calc-hint>{{ t('broker.sales.calcHint') }}</p>

      <div class="flex flex-col gap-2">
        <ZButton v-if="!result" variant="primary" block :loading="calculating" class="max-sm:h-11" data-sales-calculate @click="calculate">
          <template #icon><PhCalculator :size="16" aria-hidden="true" /></template>
          {{ t('sales.rasschitat') }}
        </ZButton>
        <ZButton
          :variant="result ? 'primary' : 'secondary'"
          block
          :disabled="!canSave"
          :loading="saving"
          class="max-sm:h-11"
          data-sales-save
          @click="save"
        >{{ t('sales.sohranitKakKp') }}</ZButton>
        <p v-if="result && !clientName.trim()" class="m-0 text-xs text-muted" data-sales-need-client>{{ t('broker.sales.needClient') }}</p>
        <ZButton v-if="result" variant="ghost" block :loading="calculating" class="max-sm:h-11" data-sales-recalc @click="calculate">{{ t('broker.sales.recalc') }}</ZButton>
      </div>
    </aside>

    <TnvedPickerModal v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPick" />
  </div>
</template>
