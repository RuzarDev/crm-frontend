<template>
  <div class="dt-page">
    <a-breadcrumb class="dt-crumbs">
      <a-breadcrumb-item><router-link to="/import-40">Импорт 40</router-link></a-breadcrumb-item>
      <a-breadcrumb-item><router-link :to="`/import-40/${caseId}`">{{ caseTitle || 'Заявка' }}</router-link></a-breadcrumb-item>
      <a-breadcrumb-item>{{ dtForm.declarationNumber || 'Декларация' }}</a-breadcrumb-item>
    </a-breadcrumb>

    <PageHeader kicker="Импорт 40" :title="dtForm.declarationNumber || 'Декларация'" :subtitle="caseTitle">
      <template #meta>
        <a-tag :color="blankPct === 100 ? 'green' : 'orange'">
          Бланк: {{ readiness?.blankFilled ?? 0 }} из {{ readiness?.blankTotal ?? 46 }} граф
        </a-tag>
        <a-tag :color="kedenMissing.length ? 'orange' : 'green'">
          {{ kedenMissing.length ? `КЕДЕН-XML: не хватает ${kedenMissing.length}` : 'КЕДЕН-XML: готово' }}
        </a-tag>
      </template>
      <template v-if="!readOnly" #actions>
        <a-tooltip :title="canSplit ? '' : 'Нужно минимум 2 товара в ДТ для разделения на ЕТТ/ВТО'">
          <a-button :disabled="!canSplit" @click="openSplitModal">Разделить на ЕТТ/ВТО</a-button>
        </a-tooltip>
        <a-button :loading="saving" @click="saveDt()">Сохранить</a-button>
        <a-button type="primary" :loading="xmlLoading" @click="exportXml">Сформировать XML</a-button>
      </template>
    </PageHeader>

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
          <DtSectionGeneral v-show="activeSection === 'general'" :model-value="dtForm" :readonly="readOnly" :totals="totals" @update:model-value="onDtUpdate" />
          <DtSectionParties v-show="activeSection === 'parties'" :model-value="dtForm" :readonly="readOnly" :country-options="countryOptions" @update:model-value="onDtUpdate" />
          <DtSectionCountries v-show="activeSection === 'countries'" :model-value="dtForm" :readonly="readOnly" :country-options="countryOptions" @update:model-value="onDtUpdate" />
          <DtSectionTransport v-show="activeSection === 'transport'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
          <DtSectionFinance
            v-show="activeSection === 'finance'" :model-value="dtForm" :readonly="readOnly" :totals="totals"
            :expense-type-options="expenseTypeOptions" :currency-options="currencyOptions" :currency-rates="currencyRates"
            @update:model-value="onDtUpdate" @calc-customs-value="calcCustomsValue"
          />
          <DtSectionCustoms v-show="activeSection === 'customs'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
          <DtSectionGoods v-show="activeSection === 'goods'" v-model="dtForm.goodsItems" :readonly="readOnly" @calc-tpin="calcTpin" />
          <DtSectionDocs v-show="activeSection === 'docs'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
          <DtSectionClosing v-show="activeSection === 'closing'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
        </a-form>

        <section v-show="activeSection === 'closing'" class="dt-fact-payments">
          <div class="dt-section-bar"><span class="dt-section-label">ФАКТИЧЕСКИЕ ПЛАТЕЖИ</span></div>
          <Import40FactPaymentsSection v-model="dtForm.factPayments" :readonly="readOnly" />
        </section>
      </div>
    </div>

    <a-modal
      v-model:open="splitModalOpen"
      title="Разделить на ЕТТ/ВТО"
      :confirm-loading="splitting"
      ok-text="Разделить"
      cancel-text="Отмена"
      width="720px"
      @ok="doSplit"
    >
      <a-spin :spinning="splitLoading">
        <p class="muted">Отметьте товары, которые должны войти в декларацию ВТО. Остальные останутся в ЕТТ.</p>
        <a-table
          :data-source="splitRows"
          :columns="splitColumns"
          :pagination="false"
          row-key="sortOrder"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'vto'">
              <a-checkbox v-model:checked="record.vto" />
            </template>
            <template v-else-if="column.key === 'vtoStatus'">
              <a-tooltip :title="record.vtoStatus || ''">
                <span class="dt-split-status">{{ record.vtoStatus || '—' }}</span>
              </a-tooltip>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>
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
  type Import40DtFormState,
  type Import40Party,
  type Import40PrevDocItem,
  type KedenReadinessDto,
  type Import40SplitSuggestionRow,
} from '@/api/import40'
import type { Import40FactPayment, Import40GoodsItemInput, Import40DeclarationExpense } from '@/types/api'
import { CURRENCY_NUMERIC } from '@/types/api'
import { referencesApi } from '@/api/references'
import { salesApi, type SalesCalcGoodsResult } from '@/api/sales'
import { tnvedApi } from '@/api/tnved'
import { useAuthStore } from '@/stores/auth'
import { useClassifiersStore } from '@/stores/classifiers'
import DtSectionGeneral from '@/components/import40/dt/DtSectionGeneral.vue'
import DtSectionParties from '@/components/import40/dt/DtSectionParties.vue'
import DtSectionCountries from '@/components/import40/dt/DtSectionCountries.vue'
import DtSectionTransport from '@/components/import40/dt/DtSectionTransport.vue'
import DtSectionFinance from '@/components/import40/dt/DtSectionFinance.vue'
import DtSectionCustoms from '@/components/import40/dt/DtSectionCustoms.vue'
import DtSectionGoods from '@/components/import40/dt/DtSectionGoods.vue'
import DtSectionDocs from '@/components/import40/dt/DtSectionDocs.vue'
import DtSectionClosing from '@/components/import40/dt/DtSectionClosing.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'
import PageHeader from '@/components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const classifiers = useClassifiersStore()

// Классификаторы КЕДЕН, которые использует форма ДТ (коды на сервере).
const DT_CLASSIFIERS = [
  '2004',                // виды транспорта (гр.25, 26)
  '2024',                // типы ТС
  '2005',                // методы определения таможенной стоимости (гр.43)
  '2008',                // преференции (гр.36)
  '2013',                // виды упаковки (гр.31)
  'tax-modes',           // виды платежа (гр.47)
  'rate-kinds',          // тип ставки (гр.47)
  'payment-features',    // особенность платежа (гр.47)
  'payment-methods',     // способ уплаты
  'transaction-natures', // характер сделки (гр.24)
  'incoterms',           // условия поставки Инкотермс (гр.20)
  'goods-locations',     // место нахождения товаров (гр.30)
  'rate-types',          // тип ставок
  'declaration-types',   // тип декларации (гр.1)
  'prev-doc-types',      // виды предшествующих документов (гр.40)
  'customs-procedures',  // виды таможенных процедур (гр.1, 37)
  'movement-features',   // особенности перемещения товаров (товарное поле)
  'declaring-features',   // особенности таможенного декларирования (гр.7)
  'settlement-terms',    // формы расчётов / условия оплаты (гр.24)
]

const caseId = String(route.params.caseId)
const dtId = String(route.params.dtId)

const activeCase = ref<Import40CaseDto | null>(null)

// Зеркалит серверный гейт CanEditCaseData: до «Декларирования» (status < 2) редактирует клиент,
// с «Декларирования» — только админ или назначенный декларант (assignedDeclarantId).
// assignedDeclarantId + authStore.userId доступны на фронте, поэтому используем точный сигнал,
// а не упрощение can('declarant') — сервер всё равно финальный гейт.
const readOnly = computed(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  if (sys === 'client' || biz === 'client') return true
  if (sys === 'administrator') return false
  const c = activeCase.value
  if (!c || c.status < 2) return false
  const isDeclarant = biz === 'declarant' || biz === 'rop'
  const uid = authStore.userId
  return !(isDeclarant && (!c.assignedDeclarantId || c.assignedDeclarantId === uid))
})
const caseTitle = computed(() =>
  activeCase.value ? `${activeCase.value.clientName} · ${activeCase.value.cargo}` : '',
)

// Spec 4b Task 3: кнопка «Разделить на ЕТТ/ВТО» видна тому, кто может править
// декларацию (инверсия readOnly), и только при ≥ 2 товарах — разделять нечего
// иначе.
const canSplit = computed(() => !readOnly.value && dtForm.goodsItems.length >= 2)

const saving = ref(false)
const xmlLoading = ref(false)
const kedenMissing = ref<string[]>([])
const readiness = ref<KedenReadinessDto | null>(null)

const blankPct = computed(() => {
  const t = readiness.value?.blankTotal ?? 0
  return t ? Math.round(((readiness.value?.blankFilled ?? 0) / t) * 100) : 0
})

const countryOptions = ref<{ value: string; label: string }[]>([])

// Spec 4a: справочник статей расходов и валюты НБ РК для таблицы расходов
// ДТ и кнопки расчёта таможенной стоимости (DtSectionFinance). Как и
// countryOptions, грузятся отдельно от decl/classifiers — один упавший
// запрос не должен блокировать саму форму.
const expenseTypeOptions = ref<{ value: string; label: string }[]>([])
const currencyOptions = ref<{ value: string; label: string }[]>([])
// Курсы НБ РК по коду валюты (на момент заполнения) — для автоподстановки гр.23.
const currencyRates = ref<Record<string, { rate: number; date: string }>>({})

const emptyParty = (): Import40Party => ({
  name: null,
  countryCode: null,
  region: null,
  city: null,
  street: null,
})

// Состояние редактора ДТ = общий тип секций (Task 4) с двумя точечными
// уточнениями: DtSectionGoods/Import40FactPaymentsSection (Task 5-7, готовы,
// используем как есть) типизируют свои v-model как конкретные непустые
// массивы (Import40GoodsItemInput[]/Import40FactPayment[]), тогда как
// Import40DeclarationUpsert объявляет их опциональными, а товар вдобавок
// на бэкенд-контракте называет фактурную стоимость invoiceValue, а не
// customsValue, которым оперирует общий компонент товаров. Поэтому здесь —
// override на эти два поля; перевод customsValue → invoiceValue остаётся
// в saveDt(), как и раньше.
type DtFormState = Omit<Import40DtFormState, 'goodsItems' | 'factPayments'> & {
  goodsItems: Import40GoodsItemInput[]
  factPayments: Import40FactPayment[]
}

const dtForm = reactive<DtFormState>({
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
  prevDocItems: [],
  expenses: [],
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
  // Фаза 2 — новые графы бланка (Task 4)
  declarationTypeCode: 'ИМ',
  declarationFeatureCode: null,
  sheetNumber: null,
  totalSheets: null,
  shippingSpecSheets: null,
  referenceNumber: null,
  financialSubjectName: null,
  financialSubjectBin: null,
  financialSubjectCountryCode: null,
  financialSubjectRegion: null,
  financialSubjectCity: null,
  financialSubjectStreet: null,
  declarantName: null,
  declarantBin: null,
  declarantCountryCode: null,
  declarantRegion: null,
  declarantCity: null,
  declarantStreet: null,
  containerIndicator: false,
  inlandTransportModeCode: null,
  deferralDocType: null,
  deferralNumber: null,
  deferralDate: null,
  deferralDueDate: null,
  guaranteeInvalidFor: null,
  signatoryFullName: null,
  signatoryPosition: null,
  signatoryDocument: null,
  signatoryPhone: null,
  signedDate: null,
})

// Секции эмитят полный объект формы (см. emitChange в каждой DtSection*).
// dtForm — const reactive(), поэтому мёржим свойства на месте, а не
// переприсваиваем идентификатор (переприсваивание топ-уровневого reactive()
// через v-model превращает const в let и роняет реактивность после первого
// же события — Vue предупреждает об этом в консоли компиляции).
const onDtUpdate = (v: Import40DtFormState) => Object.assign(dtForm, v)

// Графы 5, 6, 12 не хранятся в БД — сервер считает их на чтении,
// поэтому держим последний ответ отдельно от редактируемой формы.
const loadedDto = ref<Import40DeclarationDto | null>(null)

const totals = computed(() => ({
  goods: loadedDto.value?.totalGoodsCount ?? 0,
  places: loadedDto.value?.totalPackagesCount ?? 0,
  customsValue: loadedDto.value?.totalCustomsValue ?? 0,
}))

// Чек-лист секций
interface SectionDef {
  key: string
  title: string
}
const sections: SectionDef[] = [
  { key: 'general', title: 'Тип и общие сведения' },
  { key: 'parties', title: 'Стороны' },
  { key: 'countries', title: 'Страны' },
  { key: 'transport', title: 'Транспорт' },
  { key: 'finance', title: 'Условия поставки и финансы' },
  { key: 'customs', title: 'Таможенные органы' },
  { key: 'goods', title: 'Товары' },
  { key: 'docs', title: 'Документы' },
  { key: 'closing', title: 'Завершение' },
]
const activeSection = ref('general')

// Индикатор секции — по локальным данным формы (обязательные поля секции)
const sectionDone = (key: string): boolean => {
  switch (key) {
    case 'general':
      return !!(dtForm.declarationTypeCode && dtForm.procedureCode && dtForm.sheetNumber != null && dtForm.totalSheets != null)
    case 'parties':
      return !!(dtForm.sender?.name && dtForm.receiver?.name && dtForm.declarantName)
    case 'countries':
      return !!(dtForm.departureCountryCode && dtForm.destinationCountryCode)
    case 'transport':
      return !!(dtForm.borderTransportModeCode && (dtForm.borderTransportNumbers?.length ?? 0) > 0)
    case 'finance':
      return !!(dtForm.currency && dtForm.totalInvoiceValue != null && dtForm.incoterms)
    case 'customs':
      return !!(dtForm.submissionCustomsOfficeCode && dtForm.goodsLocationCode)
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
    case 'docs':
      return (dtForm.doc44Items?.some((d) => d.docTypeCode && d.docNumber) ?? false) ||
        (dtForm.prevDocItems?.some((p) => p.docTypeCode && p.docNumber) ?? false)
    case 'closing':
      return !!(dtForm.signatoryFullName && dtForm.signedDate)
    default:
      return false
  }
}

// Клик по недостающему полю → секция (по подстрокам серверных сообщений)
const sectionForMessage = (m: string) => {
  if (m.includes('гр.22') || m.includes('гр.20') || m.includes('гр.23') || m.includes('гр.24')) return 'finance'
  if (m.includes('гр.15') || m.includes('гр.17') || m.includes('гр.11') || m.includes('гр.16')) return 'countries'
  if (m.includes('гр.2)') || m.includes('гр.8') || m.includes('гр.14') || m.includes('гр.9')) return 'parties'
  if (m.includes('гр.21') || m.includes('гр.18') || m.includes('гр.25') || m.includes('гр.26')) return 'transport'
  if (m.includes('Орган подачи') || m.includes('гр.29') || m.includes('гр.30')) return 'customs'
  if (m.includes('графы 44') || m.includes('гр.40')) return 'docs'
  if (m.includes('Товар') || m.includes('гр.31')) return 'goods'
  return 'general'
}

const goToMissing = (m: string) => {
  activeSection.value = sectionForMessage(m)
}

const refreshReadiness = async () => {
  if (readOnly.value) return
  try {
    readiness.value = await import40Api.kedenReadiness(caseId, dtId)
  } catch {
    readiness.value = null
  }
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
  // Фаза 2 — новые графы бланка
  dtForm.declarationTypeCode = decl.declarationTypeCode ?? 'ИМ'
  dtForm.declarationFeatureCode = decl.declarationFeatureCode ?? null
  dtForm.sheetNumber = decl.sheetNumber ?? null
  dtForm.totalSheets = decl.totalSheets ?? null
  dtForm.shippingSpecSheets = decl.shippingSpecSheets ?? null
  dtForm.referenceNumber = decl.referenceNumber ?? null
  dtForm.financialSubjectName = decl.financialSubjectName ?? null
  dtForm.financialSubjectBin = decl.financialSubjectBin ?? null
  dtForm.financialSubjectCountryCode = decl.financialSubjectCountryCode ?? null
  dtForm.financialSubjectRegion = decl.financialSubjectRegion ?? null
  dtForm.financialSubjectCity = decl.financialSubjectCity ?? null
  dtForm.financialSubjectStreet = decl.financialSubjectStreet ?? null
  dtForm.declarantName = decl.declarantName ?? null
  dtForm.declarantBin = decl.declarantBin ?? null
  dtForm.declarantCountryCode = decl.declarantCountryCode ?? null
  dtForm.declarantRegion = decl.declarantRegion ?? null
  dtForm.declarantCity = decl.declarantCity ?? null
  dtForm.declarantStreet = decl.declarantStreet ?? null
  dtForm.containerIndicator = decl.containerIndicator ?? false
  dtForm.inlandTransportModeCode = decl.inlandTransportModeCode ?? null
  dtForm.deferralDocType = decl.deferralDocType ?? null
  dtForm.deferralNumber = decl.deferralNumber ?? null
  dtForm.deferralDate = decl.deferralDate ?? null
  dtForm.deferralDueDate = decl.deferralDueDate ?? null
  dtForm.guaranteeInvalidFor = decl.guaranteeInvalidFor ?? null
  dtForm.signatoryFullName = decl.signatoryFullName ?? null
  dtForm.signatoryPosition = decl.signatoryPosition ?? null
  dtForm.signatoryDocument = decl.signatoryDocument ?? null
  dtForm.signatoryPhone = decl.signatoryPhone ?? null
  dtForm.signedDate = decl.signedDate ?? null
  dtForm.prevDocItems = (decl.prevDocItems ?? []).map((p: Import40PrevDocItem) => ({ ...p }))
  dtForm.expenses = (decl.expenses ?? []).map((e) => ({
    expenseTypeCode: e.expenseTypeCode ?? null,
    amount: e.amount ?? null,
    currencyCode: e.currencyCode ?? null,
  }))
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
    quotaAmount: g.quotaAmount ?? null,
    prohibitionCode: g.prohibitionCode ?? null,
    ipoCode: g.ipoCode ?? null,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
    needsTpinRecalc: g.needsTpinRecalc ?? false,
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

// Коды видов платежа гр.47, в которые раскладывает суммы КП→ДТ маппер на
// бэкенде (см. KpToDtMapper.AddPayment) — держим тот же порядок/коды здесь,
// чтобы пересчёт на фронте не разошёлся с тем, что уже могло прийти при
// импорте КП.
const TPIN_PAYMENT_CODES: Array<{ code: string; pick: (r: SalesCalcGoodsResult) => number }> = [
  { code: '2010', pick: (r) => r.importDutyKzt },
  { code: '4010', pick: (r) => r.exciseKzt },
  { code: '1010', pick: (r) => r.customsFeeKzt },
  { code: '5060', pick: (r) => r.vatKzt },
]

// Заносит суммы платежа в g.payments: обновляет существующую строку с тем же
// taxModeCode или добавляет новую (paymentFeatureCode: 'ИУ' — как на бэкенде).
// Суммы <= 0 пропускаются целиком, зеркаля AddPayment на бэкенде (там строка
// с нулевой/отрицательной суммой вообще не создаётся) — если для этого кода
// уже была строка с прошлым (устаревшим) значением, она намеренно НЕ трогается
// здесь: это тот же простой, предсказуемый путь, что и на бэкенде, а не
// отдельная логика "обнулить старое" только для фронтового пересчёта.
const upsertGoodsPayment = (g: Import40GoodsItemInput, code: string, amountKzt: number) => {
  if (amountKzt <= 0) return
  const rows = g.payments ?? []
  const existing = rows.find((p) => p.taxModeCode === code)
  if (existing) {
    existing.amountKzt = amountKzt
  } else {
    rows.push({
      taxModeCode: code,
      taxBase: null,
      rateKindCode: null,
      rateValue: null,
      rateUnitCode: null,
      rateCurrencyCode: null,
      weightRatio: null,
      rateDate: null,
      paymentFeatureCode: 'ИУ',
      amountKzt,
    })
  }
  g.payments = rows
}

// Автопересчёт ТПиН для товаров, пришедших из КП без веса/количества
// (см. needsTpinRecalc на Import40GoodsItemInput). Переиспользуем тот же
// расчётный эндпоинт, что и КП (salesApi.calculate/SalesView.vue) — не дублируем
// логику пошлин/акциза/сбора/НДС на фронте. Флаг снимается только для товаров,
// по которым расчёт реально прошёл (есть код ТНВЭД, стоимость, валюта и вес
// или количество); остальные остаются с бейджем до ручного заполнения данных.
const calcTpin = async () => {
  // Считаем все товары с достаточными данными (код ТНВЭД + стоимость + валюта + вес/кол-во),
  // а не только помеченные needsTpinRecalc — флаг ставится при импорте из КП/сплите,
  // при ручном заполнении ДТ его нет, из-за чего у брокеров расчёт «не работал».
  const targets = dtForm.goodsItems.filter(
    (g) =>
      g.tnvedCode &&
      g.customsValue != null &&
      g.currency &&
      (g.netWeightKg != null || g.quantity != null),
  )
  if (!targets.length) {
    message.info('Нет товаров с достаточными данными (нужны код ТНВЭД, стоимость, валюта, вес или кол-во)')
    return
  }
  try {
    const res = await salesApi.calculate({
      services: [],
      goods: targets.map((g) => ({
        description: g.description ?? '',
        code: g.tnvedCode ?? '',
        customsValue: g.customsValue ?? 0,
        currencyCode: g.currency ?? 'USD',
        weightKg: g.netWeightKg ?? null,
        quantity: g.quantity ?? null,
      })),
    })
    let recalculated = 0
    targets.forEach((g, idx) => {
      const r = res.goods[idx]
      if (r && !r.error) {
        g.customsValueKzt = r.customsValueKzt
        TPIN_PAYMENT_CODES.forEach(({ code, pick }) => upsertGoodsPayment(g, code, pick(r)))
        g.needsTpinRecalc = false
        recalculated += 1
      }
    })
    if (recalculated) message.success(`ТПиН пересчитан для товаров: ${recalculated}`)
    else message.warning('Не удалось пересчитать ни один товар — проверьте код ТНВЭД и стоимость')
  } catch {
    message.error('Не удалось пересчитать ТПиН')
  }
}

// «Рассчитать там. стоимость» (Spec 4a Task 3): распределяет расходы
// dtForm.expenses по товарам dtForm.goodsItems и проставляет гр.45
// (customsValueKzt) каждому — по index = позиции товара в массиве
// goodsItems (см. комментарий у Import40CvGoodsInput в api/import40.ts).
// Живёт в родителе, а не в DtSectionFinance, т.к. только здесь dtForm.goodsItems
// корректно типизирован как Import40GoodsItemInput[] (с полем customsValue) —
// в дочерних Dt-секциях modelValue типизирован общим Import40DtFormState,
// где то же поле называется invoiceValue (см. комментарий у DtFormState выше).
const calcCustomsValue = async () => {
  if (!dtForm.goodsItems.length) {
    message.warning('Нет товаров для расчёта')
    return
  }
  const goods = dtForm.goodsItems.map((g, index) => ({
    index,
    grossWeightKg: g.grossWeightKg ?? null,
    invoiceValue: g.customsValue ?? null,
    currency: g.currency ?? null,
  }))
  const expenses = (dtForm.expenses ?? [])
    .filter((e) => e.expenseTypeCode && e.amount != null && e.currencyCode)
    .map((e) => ({
      expenseTypeCode: e.expenseTypeCode as string,
      amount: e.amount as number,
      currencyCode: e.currencyCode as string,
    }))
  try {
    const res = await import40Api.calculateCustomsValue({ goods, expenses })
    let updated = 0
    res.goods.forEach((r) => {
      const g = dtForm.goodsItems[r.index]
      if (g) {
        g.customsValueKzt = r.customsValueKzt
        updated += 1
      }
    })
    message.success(`Таможенная стоимость рассчитана для товаров: ${updated}`)
  } catch (e: any) {
    message.error(
      e?.response?.data?.message ?? e?.response?.data?.error ?? 'Не удалось рассчитать таможенную стоимость',
    )
  }
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
  loadedDto.value = decl
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
      declarationTypeCode: dtForm.declarationTypeCode || null,
      declarationFeatureCode: dtForm.declarationFeatureCode || null,
      sheetNumber: dtForm.sheetNumber,
      totalSheets: dtForm.totalSheets,
      shippingSpecSheets: dtForm.shippingSpecSheets,
      referenceNumber: dtForm.referenceNumber || null,
      financialSubjectName: dtForm.financialSubjectName || null,
      financialSubjectBin: dtForm.financialSubjectBin || null,
      financialSubjectCountryCode: dtForm.financialSubjectCountryCode || null,
      financialSubjectRegion: dtForm.financialSubjectRegion || null,
      financialSubjectCity: dtForm.financialSubjectCity || null,
      financialSubjectStreet: dtForm.financialSubjectStreet || null,
      declarantName: dtForm.declarantName || null,
      declarantBin: dtForm.declarantBin || null,
      declarantCountryCode: dtForm.declarantCountryCode || null,
      declarantRegion: dtForm.declarantRegion || null,
      declarantCity: dtForm.declarantCity || null,
      declarantStreet: dtForm.declarantStreet || null,
      containerIndicator: dtForm.containerIndicator,
      inlandTransportModeCode: dtForm.inlandTransportModeCode || null,
      deferralDocType: dtForm.deferralDocType || null,
      deferralNumber: dtForm.deferralNumber || null,
      deferralDate: dtForm.deferralDate || null,
      deferralDueDate: dtForm.deferralDueDate || null,
      guaranteeInvalidFor: dtForm.guaranteeInvalidFor || null,
      signatoryFullName: dtForm.signatoryFullName || null,
      signatoryPosition: dtForm.signatoryPosition || null,
      signatoryDocument: dtForm.signatoryDocument || null,
      signatoryPhone: dtForm.signatoryPhone || null,
      signedDate: dtForm.signedDate || null,
      goodsItems: dtForm.goodsItems.map((g) => {
        // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
        const { customsValue, ...rest } = g
        return { ...rest, invoiceValue: customsValue, payments: g.payments ?? [] }
      }),
      doc44Items: dtForm.doc44Items,
      prevDocItems: dtForm.prevDocItems,
      expenses: dtForm.expenses,
    }
    const updated = await import40Api.updateDeclaration(caseId, dtForm.id, payload)
    loadedDto.value = updated
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

// Spec 4b Task 3: разделение ДТ на ЕТТ/ВТО
interface SplitRow extends Import40SplitSuggestionRow {
  vto: boolean
}
const splitModalOpen = ref(false)
const splitLoading = ref(false)
const splitting = ref(false)
const splitRows = ref<SplitRow[]>([])
const splitColumns = [
  { title: 'ТНВЭД', dataIndex: 'tnvedCode', key: 'tnvedCode', width: 140 },
  { title: 'Статус ВТО', dataIndex: 'vtoStatus', key: 'vtoStatus', ellipsis: true },
  { title: 'ВТО', key: 'vto', width: 70 },
]

const openSplitModal = async () => {
  splitModalOpen.value = true
  splitLoading.value = true
  try {
    const rows = await import40Api.splitSuggestion(caseId, dtId)
    splitRows.value = rows.map((r) => ({ ...r, vto: r.isVtoCandidate }))
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? 'Не удалось получить рекомендацию по разделению')
    splitModalOpen.value = false
  } finally {
    splitLoading.value = false
  }
}

const doSplit = async () => {
  const vtoGoodSortOrders = splitRows.value.filter((r) => r.vto).map((r) => r.sortOrder)
  splitting.value = true
  try {
    await import40Api.splitDeclaration(caseId, dtId, { vtoGoodSortOrders })
    message.success('ДТ разделена на ЕТТ и ВТО')
    splitModalOpen.value = false
    // Обе новые декларации видны в списке ДТ заявки — переходим туда, а не
    // остаёмся на текущей странице (текущий dtId после разделения перестаёт
    // существовать как единая декларация).
    await router.push(`/import-40/${caseId}`)
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? 'Не удалось разделить декларацию')
  } finally {
    splitting.value = false
  }
}

onMounted(async () => {
  // Не блокируем загрузку самой ДТ: селекты читают классификаторы через computed
  // и дозаполнятся, когда кэш приедет. Иначе один упавший запрос из 12 оставлял бы
  // пользователя перед пустой формой декларации без объяснения.
  classifiers.loadMany(DT_CLASSIFIERS).catch(() => {
    message.warning('Справочники кодов не загрузились — коды можно ввести вручную')
  })
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch {
    /* справочник стран не загрузился — селекты позволят ручной ввод через allow-clear */
  }
  try {
    const expenseTypes = await referencesApi.listExpenseTypes()
    expenseTypeOptions.value = expenseTypes.map((t) => ({ value: t.code, label: `${t.code} — ${t.nameRu}` }))
  } catch {
    /* справочник статей расходов не загрузился — таблица расходов не блокирует форму */
  }
  try {
    const currencies = (await tnvedApi.currencies()).data
    currencyOptions.value = currencies.map((c) => {
      const num = CURRENCY_NUMERIC[c.codeLat]
      // В label — и буквенный, и цифровой код: поиск по label находит и «USD», и «840»
      return { value: c.codeLat, label: `${c.codeLat}${num ? ' / ' + num : ''} — ${c.name}` }
    })
    const rates: Record<string, { rate: number; date: string }> = { KZT: { rate: 1, date: '' } }
    for (const c of currencies) rates[c.codeLat] = { rate: c.rate, date: c.updatedAtUtc }
    currencyRates.value = rates
  } catch {
    /* справочник валют НБ РК не загрузился — таблица расходов не блокирует форму */
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
.dt-crumbs {
  margin-bottom: 12px;
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
.dt-fact-payments {
  margin-top: 20px;
}
.muted {
  color: var(--atg-muted);
  font-size: 12px;
}
.dt-split-status {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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
