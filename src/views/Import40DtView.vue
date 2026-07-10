<template>
  <div class="dt-page">
    <div class="dt-topbar">
      <a-button type="link" @click="$router.push(`/import-40/${caseId}`)">← Заявка</a-button>
      <div class="dt-title">
        <strong>{{ dtForm.declarationNumber || 'Декларация' }}</strong>
        <span class="muted">{{ caseTitle }}</span>
      </div>
      <div class="dt-top-actions">
        <a-tag v-if="readiness" :color="readiness.missing.length ? 'warning' : 'success'">
          заполнено {{ readiness.filled }} из {{ readiness.total }}
        </a-tag>
        <template v-if="!readOnly">
          <a-button :loading="saving" @click="saveDt()">Сохранить</a-button>
          <a-button type="primary" :loading="xmlLoading" @click="exportXml">Сформировать XML</a-button>
        </template>
      </div>
    </div>

    <a-alert v-if="kedenMissing.length" type="warning" show-icon class="dt-missing">
      <template #message>Не хватает данных — клик ведёт к секции:</template>
      <template #description>
        <ul><li v-for="m in kedenMissing" :key="m"><a @click.prevent="goToMissing(m)">{{ m }}</a></li></ul>
      </template>
    </a-alert>

    <div class="dt-layout">
      <nav class="dt-nav">
        <a
          v-for="s in sections" :key="s.key" class="dt-nav-item"
          :class="{ active: activeSection === s.key }" @click.prevent="activeSection = s.key"
        >
          <span class="dt-nav-mark" :class="{ done: sectionDone(s.key) }">{{ sectionDone(s.key) ? '✔' : '○' }}</span>
          {{ s.title }}
        </a>
      </nav>

      <div class="dt-content">
        <a-form layout="vertical" :disabled="readOnly">
          <section v-show="activeSection === 'header'">
            <div class="dt-grid-2">
              <a-form-item label="Процедура (гр.1)">
                <a-input v-model:value="dtForm.procedureCode" placeholder="40" />
              </a-form-item>
            </div>
            <div class="dt-grid-3">
              <a-form-item label="Условия поставки">
                <a-input v-model:value="dtForm.incoterms" placeholder="FOB / CIF" />
              </a-form-item>
              <a-form-item label="Валюта">
                <a-input v-model:value="dtForm.currency" placeholder="USD" />
              </a-form-item>
              <a-form-item label="Курс">
                <a-input-number v-model:value="dtForm.exchangeRate" style="width: 100%" :min="0" />
              </a-form-item>
              <a-form-item label="Общая фактурная стоимость (гр.22)">
                <a-input-number v-model:value="dtForm.totalInvoiceValue" style="width: 100%" :min="0" />
              </a-form-item>
              <a-form-item label="Место Инкотермс">
                <a-input v-model:value="dtForm.incotermsPlace" placeholder="Алматы" />
              </a-form-item>
            </div>
            <div class="dt-grid-3">
              <a-form-item label="Характер сделки">
                <a-auto-complete v-model:value="dtForm.transactionNatureCode" :options="transactionNatureOptions" placeholder="021" style="width: 100%" />
              </a-form-item>
              <a-form-item label="Особенность сделки">
                <a-input v-model:value="dtForm.transactionFeatureCode" placeholder="000" />
              </a-form-item>
              <a-form-item label="Тип ставок">
                <a-auto-complete v-model:value="dtForm.rateType" :options="rateTypeOptions" placeholder="ETT" style="width: 100%" />
              </a-form-item>
            </div>
          </section>

          <section v-show="activeSection === 'parties'">
            <div class="dt-grid-2">
              <a-form-item label="Страна отправления (ОКСМ)">
                <a-select v-model:value="dtForm.departureCountryCode" show-search allow-clear
                  :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" />
              </a-form-item>
              <a-form-item label="Страна назначения (ОКСМ)">
                <a-select v-model:value="dtForm.destinationCountryCode" show-search allow-clear
                  :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" />
              </a-form-item>
              <a-form-item label="Торгующая страна (ОКСМ)">
                <a-select v-model:value="dtForm.tradeCountryCode" show-search allow-clear
                  :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" />
              </a-form-item>
              <a-form-item label="Страна происхождения (шапка)">
                <a-select v-model:value="dtForm.originCountryCode" show-search allow-clear
                  :options="countryOptions" :filter-option="filterCountry" placeholder="Выберите страну по коду" />
              </a-form-item>
            </div>
            <div class="dt-grid-2 dt-checkboxes">
              <a-checkbox v-model:checked="dtForm.consigneeEqualsDeclarant" :disabled="readOnly">Получатель = декларант</a-checkbox>
              <a-checkbox v-model:checked="dtForm.financialSubjectEqualsDeclarant" :disabled="readOnly">Лицо, ответственное за фин. урегулирование = декларант</a-checkbox>
            </div>
            <PartyAddressFields v-model="dtForm.sender" title="Отправитель" :country-options="countryOptions" />
            <PartyAddressFields v-model="dtForm.receiver" title="Получатель" :country-options="countryOptions" />
          </section>

          <section v-show="activeSection === 'transport'">
            <div class="dt-section-bar">
              <span class="dt-section-label">ТРАНСПОРТ И ОРГАНЫ</span>
              <a-button v-if="!readOnly" size="small" @click="fillTransportFromCase">Заполнить из заявки</a-button>
            </div>
            <div class="dt-grid-2">
              <a-form-item label="Вид транспорта на границе">
                <a-auto-complete v-model:value="dtForm.borderTransportModeCode" :options="transportModeOptions" placeholder="30" style="width: 100%" />
              </a-form-item>
              <a-form-item label="Страна регистрации ТС (граница)">
                <a-input v-model:value="dtForm.borderTransportNationality" placeholder="KZ" />
              </a-form-item>
            </div>
            <div class="transport-list">
              <div v-for="(m, i) in dtForm.borderTransportNumbers" :key="i" class="transport-list-row">
                <a-input v-model:value="m.number" placeholder="Номер ТС" style="max-width: 220px" />
                <a-input v-model:value="m.typeCode" placeholder="Код типа (319)" style="max-width: 160px" />
                <a-button v-if="!readOnly" type="text" danger size="small" @click="removeBorderTransport(i)">✕</a-button>
              </div>
              <a-button v-if="!readOnly" type="dashed" size="small" @click="addBorderTransport">+ Номер ТС (граница)</a-button>
            </div>
            <div class="dt-grid-2">
              <a-form-item label="Вид транспорта прибытия">
                <a-auto-complete v-model:value="dtForm.arrivalTransportModeCode" :options="transportModeOptions" placeholder="30" style="width: 100%" />
              </a-form-item>
              <a-form-item label="Страна регистрации ТС (прибытие)">
                <a-input v-model:value="dtForm.arrivalTransportNationality" placeholder="KZ" />
              </a-form-item>
            </div>
            <div class="transport-list">
              <div v-for="(m, i) in dtForm.arrivalTransportNumbers" :key="i" class="transport-list-row">
                <a-input v-model:value="m.number" placeholder="Номер ТС" style="max-width: 220px" />
                <a-input v-model:value="m.typeCode" placeholder="Код типа (319)" style="max-width: 160px" />
                <a-button v-if="!readOnly" type="text" danger size="small" @click="removeArrivalTransport(i)">✕</a-button>
              </div>
              <a-button v-if="!readOnly" type="dashed" size="small" @click="addArrivalTransport">+ Номер ТС (прибытие)</a-button>
            </div>
            <div class="dt-grid-2">
              <a-form-item label="Пост на границе (код)">
                <a-input v-model:value="dtForm.borderCustomsOfficeCode" placeholder="код поста" />
              </a-form-item>
              <a-form-item label="Пост на границе (название)">
                <a-input v-model:value="dtForm.borderCustomsOfficeName" placeholder="название" />
              </a-form-item>
            </div>
            <a-form-item label="Орган подачи (код)">
              <a-input v-model:value="dtForm.submissionCustomsOfficeCode" placeholder="код органа подачи" style="max-width: 260px" />
            </a-form-item>
            <div class="dt-grid-3">
              <a-form-item label="Место нахождения товаров">
                <a-auto-complete v-model:value="dtForm.goodsLocationCode" :options="goodsLocationOptions" placeholder="11" style="width: 100%" />
              </a-form-item>
              <a-form-item label="Номер СВХ">
                <a-input v-model:value="dtForm.goodsLocationRegisterNumber" placeholder="Рег. номер СВХ" />
              </a-form-item>
              <a-form-item label="Страна места товаров">
                <a-input v-model:value="dtForm.goodsLocationCountryCode" placeholder="KZ" />
              </a-form-item>
            </div>
          </section>

          <section v-show="activeSection === 'goods'">
            <ReestrGoodsSection v-model="dtForm.goodsItems" :readonly="readOnly" />
            <a-divider />
            <Import40GoodsKedenPanel v-model="dtForm.goodsItems" :readonly="readOnly" @calc-tpin="calcTpin" />
          </section>

          <section v-show="activeSection === 'doc44'">
            <ReestrDoc44Section
              v-model="dtForm.doc44Items" :readonly="readOnly" extended
              :goods-options="dtForm.goodsItems.map((g, i) => ({ value: i, label: `Товар ${i + 1}: ${g.tnvedCode || g.description || ''}` }))"
            />
          </section>

          <section v-show="activeSection === 'factPayments'">
            <Import40FactPaymentsSection v-model="dtForm.factPayments" :readonly="readOnly" />
          </section>
        </a-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  import40Api,
  type Import40CaseDto,
  type Import40DeclarationDto,
  type Import40DeclarationUpsert,
  type Import40Party,
  type KedenReadinessDto,
} from '@/api/import40'
import type {
  Import40Doc44ItemInput,
  Import40FactPayment,
  Import40GoodsItemInput,
  Import40TransportMeans,
} from '@/types/api'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import {
  KEDEN_GOODS_LOCATIONS,
  KEDEN_RATE_TYPES,
  KEDEN_TRANSACTION_NATURES,
  KEDEN_TRANSPORT_MODES_2004,
  kedenOptions,
} from '@/constants/keden'
import PartyAddressFields from '@/components/PartyAddressFields.vue'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import ReestrDoc44Section from '@/components/ReestrDoc44Section.vue'
import Import40GoodsKedenPanel from '@/components/Import40GoodsKedenPanel.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const caseId = String(route.params.caseId)
const dtId = String(route.params.dtId)

const readOnly = computed(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  return sys === 'client' || biz === 'client'
}).value

const activeCase = ref<Import40CaseDto | null>(null)
const caseTitle = computed(() =>
  activeCase.value ? `${activeCase.value.clientName} · ${activeCase.value.cargo}` : '',
)

const saving = ref(false)
const xmlLoading = ref(false)
const kedenMissing = ref<string[]>([])
const readiness = ref<KedenReadinessDto | null>(null)

const transactionNatureOptions = kedenOptions(KEDEN_TRANSACTION_NATURES)
const transportModeOptions = kedenOptions(KEDEN_TRANSPORT_MODES_2004)
const goodsLocationOptions = kedenOptions(KEDEN_GOODS_LOCATIONS)
const rateTypeOptions = kedenOptions(KEDEN_RATE_TYPES)

const countryOptions = ref<{ value: string; label: string }[]>([])
function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

const emptyParty = (): Import40Party => ({
  name: null,
  countryCode: null,
  region: null,
  city: null,
  street: null,
})

const dtForm = reactive<{
  id: string
  declarationNumber: string
  corridor: string
  procedureCode: string
  departureCountryCode: string | null
  destinationCountryCode: string | null
  incoterms: string
  currency: string
  exchangeRate: number | null
  totalInvoiceValue: number | null
  sender: Import40Party
  receiver: Import40Party
  goodsItems: Import40GoodsItemInput[]
  doc44Items: Import40Doc44ItemInput[]
  transactionNatureCode: string
  transactionFeatureCode: string
  tradeCountryCode: string
  originCountryCode: string
  incotermsPlace: string
  consigneeEqualsDeclarant: boolean
  financialSubjectEqualsDeclarant: boolean
  goodsLocationCode: string
  goodsLocationRegisterNumber: string
  goodsLocationCountryCode: string
  borderCustomsOfficeCode: string
  borderCustomsOfficeName: string
  submissionCustomsOfficeCode: string
  borderTransportModeCode: string
  borderTransportNationality: string
  borderTransportNumbers: Import40TransportMeans[]
  arrivalTransportModeCode: string
  arrivalTransportNationality: string
  arrivalTransportNumbers: Import40TransportMeans[]
  rateType: string
  factPayments: Import40FactPayment[]
}>({
  id: '',
  declarationNumber: '',
  corridor: 'green',
  procedureCode: '',
  departureCountryCode: null,
  destinationCountryCode: null,
  incoterms: '',
  currency: '',
  exchangeRate: null,
  totalInvoiceValue: null,
  sender: emptyParty(),
  receiver: emptyParty(),
  goodsItems: [],
  doc44Items: [],
  transactionNatureCode: '',
  transactionFeatureCode: '',
  tradeCountryCode: '',
  originCountryCode: '',
  incotermsPlace: '',
  consigneeEqualsDeclarant: true,
  financialSubjectEqualsDeclarant: true,
  goodsLocationCode: '',
  goodsLocationRegisterNumber: '',
  goodsLocationCountryCode: 'KZ',
  borderCustomsOfficeCode: '',
  borderCustomsOfficeName: '',
  submissionCustomsOfficeCode: '',
  borderTransportModeCode: '',
  borderTransportNationality: 'KZ',
  borderTransportNumbers: [],
  arrivalTransportModeCode: '',
  arrivalTransportNationality: 'KZ',
  arrivalTransportNumbers: [],
  rateType: 'ETT',
  factPayments: [],
})

// Чек-лист секций
interface SectionDef {
  key: string
  title: string
}
const sections: SectionDef[] = [
  { key: 'header', title: 'Шапка' },
  { key: 'parties', title: 'Стороны и страны' },
  { key: 'transport', title: 'Транспорт и органы' },
  { key: 'goods', title: 'Товары и платежи' },
  { key: 'doc44', title: 'Документы (гр.44)' },
  { key: 'factPayments', title: 'Фактические платежи' },
]
const activeSection = ref('header')

// Индикатор секции — по локальным данным формы (обязательные поля секции)
const sectionDone = (key: string): boolean => {
  switch (key) {
    case 'header':
      return !!(dtForm.currency && dtForm.totalInvoiceValue != null && dtForm.incoterms && dtForm.incotermsPlace)
    case 'parties':
      return !!(dtForm.sender.name && dtForm.departureCountryCode && dtForm.destinationCountryCode)
    case 'transport':
      return !!(dtForm.borderTransportModeCode && dtForm.borderTransportNumbers.length && dtForm.submissionCustomsOfficeCode)
    case 'goods':
      return (
        dtForm.goodsItems.length > 0 &&
        dtForm.goodsItems.every(
          (g) =>
            g.tnvedCode &&
            (g.description || g.tnvedDescription) &&
            g.grossWeightKg != null &&
            g.netWeightKg != null &&
            g.quantity != null &&
            g.unitCode &&
            g.customsValue != null &&
            g.customsValueKzt != null &&
            g.valuationMethodCode &&
            (g.payments?.length ?? 0) > 0,
        )
      )
    case 'doc44':
      return dtForm.doc44Items.some((d) => d.docTypeCode && d.docNumber)
    case 'factPayments':
      return true // опциональная секция
    default:
      return false
  }
}

// Клик по недостающему полю → секция (по подстрокам серверных сообщений)
const goToMissing = (m: string) => {
  if (m.includes('гр.22') || m.includes('гр.20')) activeSection.value = 'header'
  else if (m.includes('гр.15') || m.includes('гр.17') || m.includes('гр.2)') || m.includes('гр.14')) activeSection.value = 'parties'
  else if (m.includes('гр.21') || m.includes('Орган подачи')) activeSection.value = 'transport'
  else if (m.includes('Товар') || m.includes('гр.31')) activeSection.value = 'goods'
  else if (m.includes('графы 44')) activeSection.value = 'doc44'
}

const refreshReadiness = async () => {
  if (readOnly) return
  try {
    readiness.value = await import40Api.kedenReadiness(caseId, dtId)
  } catch {
    readiness.value = null
  }
}

// Транспортные списки
const addBorderTransport = () => dtForm.borderTransportNumbers.push({ number: '', typeCode: null })
const removeBorderTransport = (idx: number) => dtForm.borderTransportNumbers.splice(idx, 1)
const addArrivalTransport = () => dtForm.arrivalTransportNumbers.push({ number: '', typeCode: null })
const removeArrivalTransport = (idx: number) => dtForm.arrivalTransportNumbers.splice(idx, 1)

// Заполнение вида/номеров транспорта из данных заявки
const fillTransportFromCase = () => {
  const c = activeCase.value
  if (!c) return
  const modeCodeByMode: Record<number, string> = { 0: '20', 1: '31', 2: '40', 3: '10' }
  const modeCode = modeCodeByMode[c.transportMode] ?? ''
  const numbers: Import40TransportMeans[] = []
  if (c.transportMode === 0) {
    if (c.wagonNumber) numbers.push({ number: c.wagonNumber, typeCode: null })
  } else if (c.transportMode === 1) {
    if (c.vehicleNumber) numbers.push({ number: c.vehicleNumber, typeCode: null })
    if (c.trailerNumber) numbers.push({ number: c.trailerNumber, typeCode: '319' })
  } else if (c.transportMode === 2) {
    if (c.flightNumber) numbers.push({ number: c.flightNumber, typeCode: null })
  } else if (c.transportMode === 3) {
    if (c.vesselName) numbers.push({ number: c.vesselName, typeCode: null })
  }
  dtForm.borderTransportModeCode = modeCode
  dtForm.borderTransportNumbers = numbers.map((n) => ({ ...n }))
  dtForm.arrivalTransportModeCode = modeCode
  dtForm.arrivalTransportNumbers = numbers.map((n) => ({ ...n }))
}

// Расчёт ТПиН по товарам (структурированные строки гр.47)
const calcTpin = async () => {
  for (const g of dtForm.goodsItems) {
    const code = (g.tnvedCode || '').trim()
    if (!code || g.customsValue == null) continue
    try {
      const { data: r } = await tnvedApi.calculate({
        code,
        customsValue: g.customsValue,
        currencyCode: (g.currency || dtForm.currency || 'USD').trim(),
        weightKg: g.grossWeightKg ?? undefined,
        quantity: g.quantity ?? undefined,
      })
      g.customsValueKzt = g.customsValueKzt ?? r.customsValueKzt
      const today = new Date().toISOString().slice(0, 10)
      g.payments = [
        { taxModeCode: '1010', taxBase: null, rateKindCode: 'S', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.customsFeeKzt },
        { taxModeCode: '2010', taxBase: r.customsValueKzt, rateKindCode: '%', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.importDutyKzt },
        ...(r.exciseKzt > 0 ? [{ taxModeCode: '4010', taxBase: null, rateKindCode: 'S' as const, rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.exciseKzt }] : []),
        { taxModeCode: '5060', taxBase: r.customsValueKzt + r.importDutyKzt + r.exciseKzt, rateKindCode: '%', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.vatKzt },
      ]
    } catch {
      // товар не посчитался — пропускаем
    }
  }
  message.success('ТПиН рассчитан по товарам — проверьте ставки и суммы')
}

const applyDeclaration = (decl: Import40DeclarationDto) => {
  dtForm.id = decl.id
  dtForm.declarationNumber = decl.declarationNumber ?? ''
  dtForm.corridor = decl.corridor ?? 'green'
  dtForm.procedureCode = decl.procedureCode ?? ''
  dtForm.departureCountryCode = decl.departureCountryCode ?? null
  dtForm.destinationCountryCode = decl.destinationCountryCode ?? null
  dtForm.incoterms = decl.incoterms ?? ''
  dtForm.currency = decl.currency ?? ''
  dtForm.exchangeRate = decl.exchangeRate ?? null
  dtForm.totalInvoiceValue = decl.totalInvoiceValue ?? null
  dtForm.sender = decl.sender ? { ...emptyParty(), ...decl.sender } : emptyParty()
  dtForm.receiver = decl.receiver ? { ...emptyParty(), ...decl.receiver } : emptyParty()
  dtForm.transactionNatureCode = decl.transactionNatureCode ?? ''
  dtForm.transactionFeatureCode = decl.transactionFeatureCode ?? ''
  dtForm.tradeCountryCode = decl.tradeCountryCode ?? ''
  dtForm.originCountryCode = decl.originCountryCode ?? ''
  dtForm.incotermsPlace = decl.incotermsPlace ?? ''
  dtForm.consigneeEqualsDeclarant = decl.consigneeEqualsDeclarant ?? true
  dtForm.financialSubjectEqualsDeclarant = decl.financialSubjectEqualsDeclarant ?? true
  dtForm.goodsLocationCode = decl.goodsLocationCode ?? ''
  dtForm.goodsLocationRegisterNumber = decl.goodsLocationRegisterNumber ?? ''
  dtForm.goodsLocationCountryCode = decl.goodsLocationCountryCode ?? 'KZ'
  dtForm.borderCustomsOfficeCode = decl.borderCustomsOfficeCode ?? ''
  dtForm.borderCustomsOfficeName = decl.borderCustomsOfficeName ?? ''
  dtForm.submissionCustomsOfficeCode = decl.submissionCustomsOfficeCode ?? ''
  dtForm.borderTransportModeCode = decl.borderTransportModeCode ?? ''
  dtForm.borderTransportNationality = decl.borderTransportNationality ?? 'KZ'
  dtForm.borderTransportNumbers = (decl.borderTransportNumbers ?? []).map((m) => ({ ...m }))
  dtForm.arrivalTransportModeCode = decl.arrivalTransportModeCode ?? ''
  dtForm.arrivalTransportNationality = decl.arrivalTransportNationality ?? 'KZ'
  dtForm.arrivalTransportNumbers = (decl.arrivalTransportNumbers ?? []).map((m) => ({ ...m }))
  dtForm.rateType = decl.rateType ?? 'ETT'
  dtForm.factPayments = (decl.factPayments ?? []).map((p) => ({ ...p }))
  dtForm.goodsItems = (decl.goodsItems ?? []).map((g) => ({
    description: g.description ?? null,
    tnvedCode: g.tnvedCode ?? null,
    tnvedDescription: g.tnvedDescription ?? null,
    countryOfOrigin: g.countryOfOrigin ?? null,
    quantity: g.quantity ?? null,
    unit: g.unit ?? null,
    unitCode: g.unitCode ?? null,
    grossWeightKg: g.grossWeightKg ?? null,
    netWeightKg: g.netWeightKg ?? null,
    packagesCount: g.packagesCount ?? null,
    quantityTypeCode: g.quantityTypeCode ?? null,
    // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
    customsValue: g.invoiceValue ?? null,
    currency: g.currency ?? null,
    procedureCode: g.procedureCode ?? null,
    previousProcedureCode: g.previousProcedureCode ?? null,
    goodsMoveFeatureCode: g.goodsMoveFeatureCode ?? null,
    tradeMarkName: g.tradeMarkName ?? null,
    productMarkName: g.productMarkName ?? null,
    productModelName: g.productModelName ?? null,
    productArticle: g.productArticle ?? null,
    manufacturerName: g.manufacturerName ?? null,
    packageAvailabilityCode: g.packageAvailabilityCode ?? null,
    cargoPlacesQuantity: g.cargoPlacesQuantity ?? null,
    packageKindCode: g.packageKindCode ?? null,
    packageQuantity: g.packageQuantity ?? null,
    prefClearanceCode: g.prefClearanceCode ?? null,
    prefDutyCode: g.prefDutyCode ?? null,
    prefExciseCode: g.prefExciseCode ?? null,
    prefVatCode: g.prefVatCode ?? null,
    customsValueKzt: g.customsValueKzt ?? null,
    statisticValueUsd: g.statisticValueUsd ?? null,
    valuationMethodCode: g.valuationMethodCode ?? null,
    prohibitionCode: g.prohibitionCode ?? null,
    ipoCode: g.ipoCode ?? null,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
  }))
  dtForm.doc44Items = (decl.doc44Items ?? []).map((d) => ({
    docTypeCode: d.docTypeCode ?? null,
    docTypeName: d.docTypeName ?? null,
    docNumber: d.docNumber ?? null,
    docDate: d.docDate ?? null,
    goodsItemIndex: d.goodsItemIndex ?? null,
    docStartDate: d.docStartDate ?? null,
    docValidityDate: d.docValidityDate ?? null,
  }))
}

const loadDt = async () => {
  try {
    activeCase.value = await import40Api.get(caseId)
  } catch {
    message.error('Декларация не найдена')
    void router.push('/import-40')
    return
  }
  const decl = activeCase.value?.declarations.find((d) => d.id === dtId)
  if (!decl) {
    message.error('Декларация не найдена')
    void router.push('/import-40')
    return
  }
  applyDeclaration(decl)
  void refreshReadiness()
}

const saveDt = async (): Promise<boolean> => {
  if (!dtForm.id) return false
  saving.value = true
  try {
    const payload: Import40DeclarationUpsert = {
      declarationNumber: dtForm.declarationNumber || null,
      corridor: dtForm.corridor || null,
      procedureCode: dtForm.procedureCode || null,
      departureCountryCode: dtForm.departureCountryCode || null,
      destinationCountryCode: dtForm.destinationCountryCode || null,
      incoterms: dtForm.incoterms || null,
      currency: dtForm.currency || null,
      exchangeRate: dtForm.exchangeRate,
      totalInvoiceValue: dtForm.totalInvoiceValue,
      sender: dtForm.sender,
      receiver: dtForm.receiver,
      transactionNatureCode: dtForm.transactionNatureCode || null,
      transactionFeatureCode: dtForm.transactionFeatureCode || null,
      tradeCountryCode: dtForm.tradeCountryCode || null,
      originCountryCode: dtForm.originCountryCode || null,
      incotermsPlace: dtForm.incotermsPlace || null,
      consigneeEqualsDeclarant: dtForm.consigneeEqualsDeclarant,
      financialSubjectEqualsDeclarant: dtForm.financialSubjectEqualsDeclarant,
      goodsLocationCode: dtForm.goodsLocationCode || null,
      goodsLocationRegisterNumber: dtForm.goodsLocationRegisterNumber || null,
      goodsLocationCountryCode: dtForm.goodsLocationCountryCode || null,
      borderCustomsOfficeCode: dtForm.borderCustomsOfficeCode || null,
      borderCustomsOfficeName: dtForm.borderCustomsOfficeName || null,
      submissionCustomsOfficeCode: dtForm.submissionCustomsOfficeCode || null,
      borderTransportModeCode: dtForm.borderTransportModeCode || null,
      borderTransportNationality: dtForm.borderTransportNationality || null,
      borderTransportNumbers: dtForm.borderTransportNumbers,
      arrivalTransportModeCode: dtForm.arrivalTransportModeCode || null,
      arrivalTransportNationality: dtForm.arrivalTransportNationality || null,
      arrivalTransportNumbers: dtForm.arrivalTransportNumbers,
      rateType: dtForm.rateType || null,
      factPayments: dtForm.factPayments,
      goodsItems: dtForm.goodsItems.map((g) => {
        // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
        const { customsValue, ...rest } = g
        return { ...rest, invoiceValue: customsValue, payments: g.payments ?? [] }
      }),
      doc44Items: dtForm.doc44Items,
    }
    await import40Api.updateDeclaration(caseId, dtForm.id, payload)
    message.success('ДТ сохранена')
    void refreshReadiness()
    return true
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось сохранить ДТ')
    return false
  } finally {
    saving.value = false
  }
}

const exportXml = async () => {
  // несохранённое не должно теряться при выгрузке
  const saved = await saveDt()
  if (!saved) return
  xmlLoading.value = true
  kedenMissing.value = []
  try {
    const res = await import40Api.downloadKedenXml(caseId, dtId)
    if ('errors' in res) {
      kedenMissing.value = res.errors
      message.warning('XML не сформирован: заполните обязательные поля')
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success('XML для КЕДЕН сформирован')
    void refreshReadiness()
  } catch {
    message.error('Не удалось сформировать XML')
  } finally {
    xmlLoading.value = false
  }
}

onMounted(async () => {
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch {
    /* справочник стран не загрузился — селекты позволят ручной ввод через allow-clear */
  }
  await loadDt()
})
</script>

<style scoped>
.dt-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dt-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.dt-title {
  display: flex;
  flex-direction: column;
}
.dt-top-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.dt-missing {
  border-radius: var(--atg-radius-lg);
}
.dt-missing a {
  text-decoration: underline;
}
.dt-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.dt-nav {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-lg);
  background: var(--atg-surface);
  padding: 8px;
}
.dt-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: inherit;
  cursor: pointer;
}
.dt-nav-item.active {
  background: var(--atg-teal);
  color: #fff;
}
.dt-nav-mark {
  font-size: 12px;
  color: var(--atg-muted);
}
.dt-nav-mark.done {
  color: #52c41a;
}
.dt-nav-item.active .dt-nav-mark {
  color: #fff;
}
.dt-content {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-lg);
  background: var(--atg-surface);
  padding: 16px 20px;
}
.dt-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.dt-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 14px;
}
.dt-checkboxes {
  margin-bottom: 14px;
}
.dt-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dt-section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-muted);
}
.transport-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.transport-list-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.muted {
  color: var(--atg-muted);
  font-size: 12px;
}
@media (max-width: 900px) {
  .dt-layout {
    grid-template-columns: 1fr;
  }
  .dt-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
