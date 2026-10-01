<template>
  <div class="dt-page">
    <a-breadcrumb class="dt-crumbs">
      <a-breadcrumb-item><router-link to="/import-40">{{ t('dt.import40') }}</router-link></a-breadcrumb-item>
      <a-breadcrumb-item><router-link :to="`/import-40/${caseId}`">{{ caseTitle || t('dt.zayavka') }}</router-link></a-breadcrumb-item>
      <a-breadcrumb-item>{{ dtForm.declarationNumber || t('dt.deklaraciya') }}</a-breadcrumb-item>
    </a-breadcrumb>

    <!-- Липкая панель ДТ (аудит дизайна 01.10): номер и готовность слева, три главных действия справа,
         редкие — в «Ещё». Раньше заголовок, шесть кнопок, регистрация номера и курсы занимали полэкрана,
         а при прокрутке «Сохранить» уезжало наверх. -->
    <div class="dt-bar">
      <div class="dt-bar-title">
        <div class="dt-bar-kicker">{{ t('dt.import40') }}<template v-if="caseTitle"> · {{ caseTitle }}</template></div>
        <h1 class="dt-bar-h">{{ dtForm.declarationNumber || t('dt.deklaraciya') }}</h1>
      </div>
      <div class="dt-bar-status">
        <a-tooltip :title="readiness?.blankEmptyGraphs?.length ? t('dt.pustyeGrafy', { list: readiness.blankEmptyGraphs.join(', ') }) : undefined">
          <a-tag :color="blankPct === 100 ? 'green' : 'orange'">
            {{ t('dt.blankProgress', { filled: readiness?.blankFilled ?? 0, total: readiness?.blankTotal ?? 46 }) }}
          </a-tag>
        </a-tooltip>
        <a-popover v-if="missingList.length" v-model:open="missingOpen" trigger="click" placement="bottomLeft" :overlay-style="{ maxWidth: '520px' }">
          <template #title>{{ t('dt.neHvataetDannyhKlik') }}</template>
          <template #content>
            <ul class="dt-missing-list">
              <li v-for="m in missingList" :key="m"><a @click.prevent="goToMissing(m)">{{ m }}</a></li>
            </ul>
          </template>
          <a-tag color="orange" class="dt-missing-tag">{{ t('dt.kedenMissing', { n: missingList.length }) }} <DownOutlined /></a-tag>
        </a-popover>
        <a-tag v-else color="green">{{ t('dt.kedenReady') }}</a-tag>
        <span v-if="!readOnly" class="dt-saved">
          <template v-if="saving">{{ t('dt.sohranyaetsya') }}</template>
          <template v-else-if="lastSavedAt">{{ t('dt.sohranenoV', { time: lastSavedAt }) }}</template>
        </span>
      </div>
      <div class="dt-bar-actions">
        <template v-if="!readOnly">
          <a-button :loading="saving" @click="saveDt()">{{ t('dt.sohranit') }}</a-button>
          <a-button :loading="paymentsLoading" @click="openPaymentsModal">{{ t('dt.rasschitatPlatezhi') }}</a-button>
          <a-button type="primary" :loading="xmlLoading" @click="exportXml">{{ t('dt.sformirovatXml') }}</a-button>
        </template>
        <a-dropdown :trigger="['click']" placement="bottomRight">
          <a-button :loading="docsDownloading || pdfLoading">{{ t('dt.esche') }} <DownOutlined /></a-button>
          <template #overlay>
            <a-menu>
              <!-- Печать бланка доступна и в режиме просмотра (readOnly) — не считается редактированием. -->
              <a-menu-item key="print" @click="printBlank">{{ t('dt.printer') }}</a-menu-item>
              <a-menu-item key="docs" @click="downloadAllDocuments">{{ t('dt.skachatVseDokumenty') }}</a-menu-item>
              <a-menu-item v-if="showSplitButton" key="split" :disabled="!canSplit" :title="splitBlockedReason" @click="openSplitModal">
                {{ t('dt.razdelitNaEttVto') }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <DtCurrencyRatesBox :rates="currencyRates" :codes="currencyBoxCodes" :as-of-date="dtForm.submissionDate ?? null" :official="ratesOfficial" />

    <div class="dt-layout">
      <nav class="dt-nav">
        <a
          v-for="s in sections" :key="s.key" class="dt-nav-item"
          :class="{ active: activeSection === s.key }" @click.prevent="activeSection = s.key"
        >
          <span class="dt-nav-mark" :class="{ done: sectionDone(s.key) }">
            <CheckCircleFilled v-if="sectionDone(s.key)" />
            <span v-else class="dt-nav-mark-empty" />
          </span>
          <span class="dt-nav-title">{{ s.title }}</span>
          <!-- Сколько не хватает для КЕДЕН в этом разделе — видно, куда идти. -->
          <span v-if="missingBySection[s.key]" class="dt-nav-count" :title="t('dt.neHvataetDannyhKlik')">{{ missingBySection[s.key] }}</span>
        </a>
      </nav>

      <div class="dt-content">
        <a-form layout="vertical" :disabled="readOnly">
          <!-- Регистрация номера и дата гр.А — в разделе общих сведений, а не над всеми разделами. -->
          <DtDeclarationNumberBar
            v-show="activeSection === 'general'"
            :model-value="dtForm"
            :readonly="readOnly"
            :post-options="customsPostOptions"
            @update:model-value="onDtUpdate"
            @register="saveDt()"
          />
          <DtSectionGeneral v-show="activeSection === 'general'" :model-value="dtForm" :readonly="readOnly" :totals="totals" @update:model-value="onDtUpdate" />
          <DtSectionParties v-show="activeSection === 'parties'" :model-value="dtForm" :readonly="readOnly" :country-options="countryOptions" :client-profile="clientProfile" @update:model-value="onDtUpdate" />
          <DtSectionCountries v-show="activeSection === 'countries'" :model-value="dtForm" :readonly="readOnly" :country-options="countryOptions" @update:model-value="onDtUpdate" />
          <DtSectionTransport v-show="activeSection === 'transport'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
          <DtSectionFinance
            v-show="activeSection === 'finance'" :model-value="dtForm" :readonly="readOnly" :totals="totals"
            :expense-type-options="expenseTypeOptions" :currency-options="currencyOptions" :currency-rates="currencyRates"
            :expense-distribution-by-code="expenseDistributionByCode" :expense-deduction-by-code="expenseDeductionByCode"
            @update:model-value="onDtUpdate" @calc-customs-value="calcCustomsValue"
          />
          <DtSectionCustoms v-show="activeSection === 'customs'" :model-value="dtForm" :readonly="readOnly" :post-options="customsPostOptions" @update:model-value="onDtUpdate" />
          <DtSectionGoods v-show="activeSection === 'goods'" v-model="dtForm.goodsItems" :readonly="readOnly" :container-indicator="!!dtForm.containerIndicator" :usd-rate="usdRate" :deal-currency="dtForm.currency" @calc-tpin="calcTpin" />
          <DtSectionDocs v-show="activeSection === 'docs'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
          <!-- GET .../dts — staff-only на бэке (CanManageDeclarations → 404 клиенту),
               поэтому раздел не рендерим вовсе для клиента (не просто прячем таб). -->
          <template v-if="showDtsSection">
            <DtSectionDts
              v-show="activeSection === 'dts'" :model-value="dtForm" :readonly="readOnly" :case-id="caseId"
              :declaration-id="dtId" :reload-key="savedCounter" :active="activeSection === 'dts'" :save="saveDt"
              @update:model-value="onDtUpdate" @ready="onDtsReady"
            />
          </template>
          <DtSectionClosing v-show="activeSection === 'closing'" :model-value="dtForm" :readonly="readOnly" @update:model-value="onDtUpdate" />
        </a-form>

        <section v-show="activeSection === 'closing'" class="dt-fact-payments">
          <div class="dt-section-bar"><span class="dt-section-label">{{ t('dt.fakticheskiePlatezhi') }}</span></div>
          <Import40FactPaymentsSection v-model="dtForm.factPayments" :readonly="readOnly" />
        </section>
      </div>
    </div>

    <a-modal
      v-model:open="splitModalOpen"
      :title="t('dt.razdelitNaEttVto')"
      :confirm-loading="splitting"
      :ok-text="splitVtoOnly ? t('dt.sozdatDtVto') : t('dt.razdelit')"
      :cancel-text="t('dt.otmena')"
      width="760px"
      @ok="doSplit"
    >
      <a-spin :spinning="splitLoading">
        <p class="muted">{{ t('dt.pokazanyTolkoTovaryPod') }}</p>
        <a-alert v-if="splitVtoOnly" type="info" show-icon :message="t('dt.vseTovaryVVto')" style="margin-bottom: 8px" />
        <a-checkbox
          :checked="allVtoSelected"
          :indeterminate="someVtoSelected"
          style="margin-bottom: 8px"
          @change="toggleAllVto"
        > {{ t('dt.vybratVse') }} </a-checkbox>
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
            <template v-else-if="column.key === 'ettRate'">{{ record.ettRate || '—' }}</template>
            <template v-else-if="column.key === 'vtoRate'">{{ record.vtoRate || '—' }}</template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <DtPaymentsCalcModal
      v-model:open="paymentsModalOpen"
      :loading="paymentsLoading"
      :applying="paymentsApplying"
      :readonly="readOnly"
      :result="paymentsResult"
      :goods="dtForm.goodsItems"
      @toggle-medical="onToggleMedical"
      @apply="onApplyPayments"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, h, onMounted, ref, reactive, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { message, Modal } from 'ant-design-vue'
import { CheckCircleFilled, DownOutlined } from '@ant-design/icons-vue'
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
  type Import40CalculatePaymentsResponse,
  type Import40TpinGoodsInput,
} from '@/api/import40'
import { import40ContractApi, type ClientCompanyProfileDto } from '@/api/import40Contract'
import type { Import40FactPayment, Import40GoodsItemInput, Import40DeclarationExpense } from '@/types/api'
import { CURRENCY_NUMERIC } from '@/types/api'
import { referencesApi } from '@/api/references'
import { tnvedApi } from '@/api/tnved'
import { useAuthStore } from '@/stores/auth'
import { useClassifiersStore } from '@/stores/classifiers'
import { useDtTotals } from '@/composables/useDtTotals'
import DtSectionGeneral from '@/components/import40/dt/DtSectionGeneral.vue'
import DtSectionParties from '@/components/import40/dt/DtSectionParties.vue'
import DtSectionCountries from '@/components/import40/dt/DtSectionCountries.vue'
import DtSectionTransport from '@/components/import40/dt/DtSectionTransport.vue'
import DtSectionFinance from '@/components/import40/dt/DtSectionFinance.vue'
import DtSectionCustoms from '@/components/import40/dt/DtSectionCustoms.vue'
import DtSectionGoods from '@/components/import40/dt/DtSectionGoods.vue'
import DtSectionDocs from '@/components/import40/dt/DtSectionDocs.vue'
import DtSectionDts from '@/components/import40/dt/DtSectionDts.vue'
import DtSectionClosing from '@/components/import40/dt/DtSectionClosing.vue'
import DtDeclarationNumberBar from '@/components/import40/dt/DtDeclarationNumberBar.vue'
import DtCurrencyRatesBox from '@/components/import40/dt/DtCurrencyRatesBox.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'
import DtPaymentsCalcModal from '@/components/import40/dt/DtPaymentsCalcModal.vue'
import { placesOfGoods } from '@/utils/goodsPlaces'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const classifiers = useClassifiersStore()

// Классификаторы КЕДЕН, которые использует форма ДТ (коды на сервере).
const DT_CLASSIFIERS = [
  '2004',                // виды транспорта (гр.25, 26)
  '2024',                // типы ТС
  '2005',                // методы определения таможенной стоимости (гр.43)
  '2008',                // преференции (гр.36) — прежний общий список (ОО, Z)
  'pref-fee',            // гр.36: льготы по таможенным сборам (ЕЭК 2008, раздел РК 3.1)
  'pref-duty',           // гр.36: льготы и тарифные преференции по пошлине (1.1 + 3.2)
  'pref-excise',         // гр.36: льготы по акцизу (1.2 + 3.3) и «Z — не облагается»
  'pref-vat',            // гр.36: льготы по НДС (1.3 + 3.4)
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
  'itn-categories',       // категория лица (гр.8, 9, 14)
  // 'kato' — полный классификатор (~15,6 тыс.), в селект не грузится: KatoSelect ищет на сервере.
  'vehicle-marks',        // марки ТС (гр.18, 21)
  'ois-indicators',       // ОИС: I/N/S (гр.33 «О», товарное поле) — Task 2 (бэк)/Task 9 (фронт)
  'restriction-marks',    // признаки соблюдения запретов: С/М/П (товарное поле) — Task 2/Task 9
  'certification-kinds',  // сертификация/экспортный контроль (товарное поле, гр.33) — выбор декларанта
  'packaging-availability', // наличие упаковки: 0/1/2 (гр.31, товарное поле) — Task 2/Task 9
  'id-doc-types',          // вид документа подписанта (гр.54) — Task 11
]

const caseId = String(route.params.caseId)
const dtId = String(route.params.dtId)

const activeCase = ref<Import40CaseDto | null>(null)
const clientProfile = ref<ClientCompanyProfileDto | null>(null)

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
  activeCase.value ? `${activeCase.value.number} · ${activeCase.value.clientName} · ${activeCase.value.cargo}` : '',
)

// Spec 4b Task 3: кнопка «Разделить на ЕТТ/ВТО» видна тому, кто может править
// декларацию (инверсия readOnly). Хватает одного товара: декларант (2026-09-25) —
// «ЕТТ/ВТО даже если 1 товар в ДТ», тогда создаётся одна ДТ по пониженной ставке ВТО.
const canSplit = computed(() => !readOnly.value && dtForm.goodsItems.length >= 1)

// Task 12 (фидбек №17): раньше кнопка сплита пряталась вместе со всем блоком
// #actions (v-if="!readOnly") — декларант, попавший на чужую/ещё не
// закреплённую за ним ДТ, не видел кнопку вообще и не понимал, в чём дело.
// Теперь кнопка рендерится всегда для не-клиента (просто disabled), а тултип
// объясняет точную причину — это тот самый "чёткий хинт вместо молчаливого
// скрытия" из задания. Сервер (splitDeclaration) всё равно остаётся финальным
// гейтом, тут только UX.
const showSplitButton = computed(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  return sys !== 'client' && biz !== 'client'
})
// GET .../dts пускает только Import40Endpoints.CanManageDeclarations — админ или
// право import40.declarant (иначе 404). Раздел «ДТС» показываем ровно тем же
// (hasPermission уже true для админа): КПП/бухгалтер/продажи и клиент его не видят
// и не ловят тосты ошибок на каждом открытии ДТ. Декларанту раздел виден и в
// readonly (readOnly — это «нельзя править», не «нельзя видеть»).
const showDtsSection = computed(() => authStore.hasPermission('import40.declarant'))
const splitBlockedReason = computed(() => {
  if (dtForm.goodsItems.length < 1) return t('dt.dobavteTovarDlyaVto')
  if (!readOnly.value) return ''
  const c = activeCase.value
  if (c?.assignedDeclarantId && c.assignedDeclarantId !== authStore.userId) {
    return t('dt.deklaraciyaZakreplenaZaDrugim')
  }
  return t('dt.redaktirovanieEtoyDeklaraciiSeychas')
})

const saving = ref(false)
// Время последнего успешного сохранения (ручного или автосейва) — для «Сохранено в 15:32» в панели.
const lastSavedAt = ref<string | null>(null)
const xmlLoading = ref(false)
const pdfLoading = ref(false)
const docsDownloading = ref(false)

// «Скачать все документы» заявки одним ZIP (у кнопки «Разделить ЕТТ/ВТО»).
const downloadAllDocuments = async () => {
  docsDownloading.value = true
  try {
    const res = await import40Api.downloadAllDocuments(caseId)
    if ('error' in res) {
      message.info(res.error)
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    message.error(t('dt.neUdalosSkachatDokumenty'))
  } finally {
    docsDownloading.value = false
  }
}
const kedenMissing = ref<string[]>([])
const readiness = ref<KedenReadinessDto | null>(null)

const blankPct = computed(() => {
  const t = readiness.value?.blankTotal ?? 0
  return t ? Math.round(((readiness.value?.blankFilled ?? 0) / t) * 100) : 0
})

const countryOptions = ref<{ value: string; label: string }[]>([])

// Task 5: коды таможенных постов для DtDeclarationNumberBar (гр.А «Орган подачи ДТ»)
const customsPostOptions = ref<{ value: string; label: string }[]>([])

// Spec 4a: справочник статей расходов и валюты НБ РК для таблицы расходов
// ДТ и кнопки расчёта таможенной стоимости (DtSectionFinance). Как и
// countryOptions, грузятся отдельно от decl/classifiers — один упавший
// запрос не должен блокировать саму форму.
const expenseTypeOptions = ref<{ value: string; label: string }[]>([])
// Task 11 (package 3, №5): алгоритм распределения по статье расхода — приходит
// с сервером (RefExpenseType.DistributionBase, тот же признак, которым
// ExpenseDistribution.Distribute на бэке реально распределяет расходы по
// товарам), поэтому подпись в таблице расходов не гадает по коду, а берёт
// источник истины напрямую из справочника.
const expenseDistributionByCode = ref<Record<string, 'GrossWeight' | 'CustomsValue'>>({})
// Task 10: статьи-вычеты (гр.21–23 ДТС: монтаж, перевозка и платежи после ввоза) — RefExpenseType.IsDeduction,
// в таблице расходов подписываются тегом «вычет» рядом с базой распределения.
const expenseDeductionByCode = ref<Record<string, boolean>>({})
const currencyOptions = ref<{ value: string; label: string }[]>([])
// Курсы НБ РК по коду валюты (на момент заполнения) — для автоподстановки гр.23.
// Курсы для экрана ДТ (гр.23, гр.46, блок курсов, итоги) — НА ДАТУ гр.А по НБ РК
// (/import40/rates-on-date), поверх текущих из справочника валют. Раньше здесь были текущие
// курсы с подписью «на дату гр.А»: гр.23 брала курс дня заполнения, а не дня ДТ.
const currencyRates = ref<Record<string, { rate: number; date: string }>>({})
const currentRates = ref<Record<string, { rate: number; date: string }>>({})
const ratesOfficial = ref(true)

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
  senderDistrict: null,
  senderHouse: null,
  senderApt: null,
  senderShortName: null,
  receiver: emptyParty(),
  receiverDistrict: null,
  receiverHouse: null,
  receiverApt: null,
  receiverBin: null,
  receiverCategoryCode: null,
  receiverKatoCode: null,
  receiverShortName: null,
  goodsItems: [],
  doc44Items: [],
  prevDocItems: [],
  expenses: [],
  transactionNatureCode: '',
  transactionFeatureCode: '',
  tradeCountryCode: '',
  originCountryCode: '',
  incotermsPlace: '',
  consigneeEqualsDeclarant: false,
  financialSubjectEqualsDeclarant: false,
  goodsLocationCode: '',
  goodsLocationRegisterNumber: '',
  goodsLocationCountryCode: 'KZ',
  goodsLocationStation: '',
  goodsLocationAddress: '',
  goodsLocationCustomsOfficeCode: '',
  borderCustomsOfficeCode: '',
  borderCustomsOfficeName: '',
  submissionCustomsOfficeCode: '',
  submissionDate: null,
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
  financialSubjectDistrict: null,
  financialSubjectHouse: null,
  financialSubjectApt: null,
  financialSubjectCategoryCode: null,
  financialSubjectKatoCode: null,
  financialSubjectShortName: null,
  declarantName: null,
  declarantBin: null,
  declarantCountryCode: null,
  declarantRegion: null,
  declarantCity: null,
  declarantStreet: null,
  declarantDistrict: null,
  declarantHouse: null,
  declarantApt: null,
  declarantCategoryCode: null,
  declarantKatoCode: null,
  declarantShortName: null,
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
  signatoryDocTypeCode: null,
  signatoryDocNumber: null,
  signatoryDocIssueDate: null,
  signatoryDocIssuedBy: null,
  signatoryDocCountryCode: null,
  powerOfAttorney: null,
  powerOfAttorneyDate: null,
  powerOfAttorneyValidUntil: null,
  brokerContractNumber: null,
  signatoryPhone: null,
  signedDate: null,
  dtsFreeOfCharge: false,
  dtsPlaceName: null,
  dtsRelation: false,
  dtsRelationPriceInfluence: false,
  dtsRelationApproxValue: false,
  dtsRestriction: false,
  dtsValueCondition: false,
  dtsRoyaltyContract: false,
  dtsRoyaltyFee: false,
  dtsSubsequentResale: false,
  dtsMethodReason: null,
})

// Task 12 (item M): коды валют для панели курсов у гр.А — USD/EUR всегда плюс
// валюта гр.22 и валюты расходов (транспорт/страховка могут быть в других валютах).
// Дедуп, в верхнем регистре, без KZT.
const currencyBoxCodes = computed(() => {
  const raw = ['USD', 'EUR', dtForm.currency, ...(dtForm.expenses ?? []).map((e) => e.currencyCode)]
  const set = new Set<string>()
  for (const c of raw) {
    if (!c) continue
    const up = c.toUpperCase()
    if (up === 'KZT') continue
    set.add(up)
  }
  return Array.from(set)
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

// Чек-лист секций
interface SectionDef {
  key: string
  title: string
}
const sections = computed((): SectionDef[] => ([

  { key: 'general', title: t('dt.tipIObschieSvedeniya') },
  { key: 'parties', title: t('dt.storony') },
  { key: 'countries', title: t('dt.strany') },
  { key: 'transport', title: t('dt.transport') },
  { key: 'finance', title: t('dt.usloviyaPostavkiIFinansy') },
  { key: 'customs', title: t('dt.tamozhennyeOrgany') },
  { key: 'goods', title: t('dt.tovary') },
  { key: 'docs', title: t('dt.dokumenty') },
  ...(showDtsSection.value ? [{ key: 'dts', title: t('dt.dts') }] : []),
  { key: 'closing', title: t('dt.zavershenie') },
]))
const activeSection = ref('general')

// Task 11: готовность раздела ДТС определяется последним ответом dtsApi.get
// (missing.length === 0) — компонент сам решает и эмитит через @ready.
const dtsReady = ref(false)
const onDtsReady = (v: boolean) => { dtsReady.value = v }
// Счётчик успешных saveDt() — секция ДТС перечитывает расчёт при каждом
// изменении (watch внутри компонента на этот проп).
const savedCounter = ref(0)

// Дата гр.А как "YYYY-MM-DD" (date-only). Префикс ISO-строки берём как есть, без
// dayjs(): "2026-09-23T00:00:00Z" в часовом поясе с минусом дал бы 22-е.
const toIsoDate = (v: string | null | undefined): string | null => {
  if (!v) return null
  const m = /^\d{4}-\d{2}-\d{2}/.exec(v)
  return m ? m[0] : dayjs(v).format('YYYY-MM-DD')
}

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
    case 'dts':
      return dtsReady.value
    case 'closing':
      return !!(dtForm.signatoryFullName && dtForm.signedDate)
    default:
      return false
  }
}

// Клик по недостающему полю → секция (по подстрокам серверных сообщений)
const sectionForMessage = (m: string) => {
  if (m.startsWith('ДТС:')) return 'dts'
  if (m.includes('гр.22') || m.includes('гр.20') || m.includes('гр.23') || m.includes('гр.24')) return 'finance'
  if (m.includes('гр.15') || m.includes('гр.17') || m.includes('гр.11') || m.includes('гр.16')) return 'countries'
  if (m.includes('гр.2)') || m.includes('гр.8') || m.includes('гр.14') || m.includes('гр.9')) return 'parties'
  if (m.includes('гр.21') || m.includes('гр.18') || m.includes('гр.25') || m.includes('гр.26')) return 'transport'
  if (m.includes('Орган подачи') || m.includes('гр.29') || m.includes('гр.30')) return 'customs'
  if (m.includes('графы 44') || m.includes('гр.40')) return 'docs'
  if (m.includes('Товар') || m.includes('гр.31')) return 'goods'
  return 'general'
}

const missingOpen = ref(false)
const goToMissing = (m: string) => {
  activeSection.value = sectionForMessage(m)
  missingOpen.value = false
}

// Чего не хватает для КЕДЕН-XML: ответ последней выгрузки, а до неё — проверка готовности после
// каждого сохранения. Раньше бейдж «готово» смотрел только на выгрузку и до неё всегда был зелёным.
const missingList = computed(() => (kedenMissing.value.length ? kedenMissing.value : readiness.value?.missing ?? []))
const missingBySection = computed(() => {
  const out: Record<string, number> = {}
  for (const m of missingList.value) {
    const key = sectionForMessage(m)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
})

const refreshReadiness = async () => {
  if (readOnly.value) return
  try {
    readiness.value = await import40Api.kedenReadiness(caseId, dtId)
  } catch {
    readiness.value = null
  }
}

// Task 8a: пока true — watch авто-гр.16 (см. ниже) не трогает originCountryCode.
// Нужен только на время applyDeclaration(): без него watch на goodsOriginKey
// среагировал бы на массовую подстановку dtForm.goodsItems при загрузке ДТ
// и тут же перезаписал бы originCountryCode, только что взятый из decl,
// авто-подсчитанным значением — даже если декларант раньше сохранил другое.
const applyingDeclaration = ref(false)

// Task 11 (package 3): автозаполнение гр.22/листов из товаров + клиентский
// предпросмотр гр.5/гр.6/гр.12 — см. комментарий в useDtTotals.ts. Приостанавливается
// тем же applyingDeclaration, что и авто-гр.16 выше (объявлен строкой выше).
const dtTotals = useDtTotals(() => dtForm.goodsItems, dtForm, currencyRates, applyingDeclaration)

// Item I (гр.46): курс доллара (₸ за 1 USD) на дату гр.А из справочника валют НБ РК.
// Пробрасывается в DtSectionGoods → Import40GoodsKedenPanel для авторасчёта
// статистической стоимости = таможенная стоимость (гр.45) / курс USD.
const usdRate = computed(() => currencyRates.value['USD']?.rate ?? null)

// Валюты, чьи курсы нужны ДТ: сделка (гр.22), товары, расходы, плюс USD (гр.46) и EUR
// (специфические ставки).
const rateCodes = computed(() => {
  const set = new Set<string>(['USD', 'EUR'])
  const add = (c: string | null | undefined) => { if (c && c.toUpperCase() !== 'KZT') set.add(c.toUpperCase()) }
  add(dtForm.currency)
  for (const g of dtForm.goodsItems) add(g.currency)
  for (const e of dtForm.expenses ?? []) add(e.currencyCode)
  return Array.from(set).sort()
})

// Смена даты гр.А пользователем → гр.23 следует за курсом НБ РК на новую дату. При загрузке
// ДТ гр.23 не трогаем молча: расхождение подсвечивается в «Условиях поставки» (Подставить).
let syncExchangeRateAfterRates = false
const loadRatesOnDate = async () => {
  const date = toIsoDate(dtForm.submissionDate)
  if (!date) {
    currencyRates.value = { ...currentRates.value }
    ratesOfficial.value = true
    syncExchangeRateAfterRates = false
    return
  }
  try {
    const res = await import40Api.ratesOnDate(date, rateCodes.value)
    const merged = { ...currentRates.value }
    for (const [code, rate] of Object.entries(res.rates)) merged[code] = { rate, date }
    currencyRates.value = merged
    ratesOfficial.value = res.official
    const deal = dtForm.currency?.toUpperCase()
    if (syncExchangeRateAfterRates && deal && merged[deal]) dtForm.exchangeRate = merged[deal].rate
  } catch {
    /* курсы на дату не загрузились — остаются текущие; расчёты на сервере всё равно по дате гр.А */
  } finally {
    syncExchangeRateAfterRates = false
  }
}
watch(
  () => [toIsoDate(dtForm.submissionDate), rateCodes.value.join(',')] as const,
  (next, prev) => {
    if (!applyingDeclaration.value && prev && next[0] !== prev[0]) syncExchangeRateAfterRates = true
    void loadRatesOnDate()
  },
)

const totals = computed(() => ({
  goods: dtTotals.goodsCount.value,
  places: dtTotals.packagesCount.value,
  customsValue: dtTotals.customsValueKzt.value,
}))

const applyDeclaration = (decl: Import40DeclarationDto) => {
  applyingDeclaration.value = true
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
  dtForm.senderDistrict = decl.senderDistrict ?? null
  dtForm.senderHouse = decl.senderHouse ?? null
  dtForm.senderApt = decl.senderApt ?? null
  dtForm.senderShortName = decl.senderShortName ?? null
  dtForm.receiver = decl.receiver ? { ...emptyParty(), ...decl.receiver } : emptyParty()
  dtForm.receiverDistrict = decl.receiverDistrict ?? null
  dtForm.receiverHouse = decl.receiverHouse ?? null
  dtForm.receiverApt = decl.receiverApt ?? null
  dtForm.receiverBin = decl.receiverBin ?? null
  dtForm.receiverCategoryCode = decl.receiverCategoryCode ?? null
  dtForm.receiverKatoCode = decl.receiverKatoCode ?? null
  dtForm.receiverShortName = decl.receiverShortName ?? null
  dtForm.transactionNatureCode = decl.transactionNatureCode ?? ''
  dtForm.transactionFeatureCode = decl.transactionFeatureCode ?? ''
  dtForm.tradeCountryCode = decl.tradeCountryCode ?? ''
  dtForm.originCountryCode = decl.originCountryCode ?? ''
  dtForm.incotermsPlace = decl.incotermsPlace ?? ''
  dtForm.consigneeEqualsDeclarant = decl.consigneeEqualsDeclarant ?? false
  dtForm.financialSubjectEqualsDeclarant = decl.financialSubjectEqualsDeclarant ?? false
  dtForm.goodsLocationCode = decl.goodsLocationCode ?? ''
  dtForm.goodsLocationRegisterNumber = decl.goodsLocationRegisterNumber ?? ''
  dtForm.goodsLocationCountryCode = decl.goodsLocationCountryCode ?? 'KZ'
  dtForm.goodsLocationStation = decl.goodsLocationStation ?? ''
  dtForm.goodsLocationAddress = decl.goodsLocationAddress ?? ''
  dtForm.goodsLocationCustomsOfficeCode = decl.goodsLocationCustomsOfficeCode ?? ''
  dtForm.borderCustomsOfficeCode = decl.borderCustomsOfficeCode ?? ''
  dtForm.borderCustomsOfficeName = decl.borderCustomsOfficeName ?? ''
  dtForm.submissionCustomsOfficeCode = decl.submissionCustomsOfficeCode ?? ''
  // decl.submissionDate === null для свежей ДТ (ещё не сохранялась) — в этом
  // случае подставляем сегодняшнюю дату по умолчанию, т.к. DtDeclarationNumberBar
  // выставляет её в своём onMounted, который отрабатывает РАНЬШЕ applyDeclaration
  // (родительский onMounted → loadDt → applyDeclaration) и потому перезаписывается.
  // Сервер отдаёт SubmissionDate меткой времени ("2026-09-23T00:00:00Z"), а
  // date-picker (value-format) и calculate-customs-value (onDate) ждут "YYYY-MM-DD".
  dtForm.submissionDate = toIsoDate(decl.submissionDate) ?? dayjs().format('YYYY-MM-DD')
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
  dtForm.financialSubjectDistrict = decl.financialSubjectDistrict ?? null
  dtForm.financialSubjectHouse = decl.financialSubjectHouse ?? null
  dtForm.financialSubjectApt = decl.financialSubjectApt ?? null
  dtForm.financialSubjectCategoryCode = decl.financialSubjectCategoryCode ?? null
  dtForm.financialSubjectKatoCode = decl.financialSubjectKatoCode ?? null
  dtForm.financialSubjectShortName = decl.financialSubjectShortName ?? null
  dtForm.declarantName = decl.declarantName ?? null
  dtForm.declarantBin = decl.declarantBin ?? null
  dtForm.declarantCountryCode = decl.declarantCountryCode ?? null
  dtForm.declarantRegion = decl.declarantRegion ?? null
  dtForm.declarantCity = decl.declarantCity ?? null
  dtForm.declarantStreet = decl.declarantStreet ?? null
  dtForm.declarantDistrict = decl.declarantDistrict ?? null
  dtForm.declarantHouse = decl.declarantHouse ?? null
  dtForm.declarantApt = decl.declarantApt ?? null
  dtForm.declarantCategoryCode = decl.declarantCategoryCode ?? null
  dtForm.declarantKatoCode = decl.declarantKatoCode ?? null
  dtForm.declarantShortName = decl.declarantShortName ?? null
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
  dtForm.signatoryDocTypeCode = decl.signatoryDocTypeCode ?? null
  dtForm.signatoryDocNumber = decl.signatoryDocNumber ?? null
  dtForm.signatoryDocIssueDate = decl.signatoryDocIssueDate ?? null
  dtForm.signatoryDocIssuedBy = decl.signatoryDocIssuedBy ?? null
  dtForm.signatoryDocCountryCode = decl.signatoryDocCountryCode ?? null
  dtForm.powerOfAttorney = decl.powerOfAttorney ?? null
  dtForm.powerOfAttorneyDate = decl.powerOfAttorneyDate ?? null
  dtForm.powerOfAttorneyValidUntil = decl.powerOfAttorneyValidUntil ?? null
  dtForm.brokerContractNumber = decl.brokerContractNumber ?? null
  dtForm.signatoryPhone = decl.signatoryPhone ?? null
  dtForm.signedDate = decl.signedDate ?? null
  dtForm.dtsFreeOfCharge = decl.dtsFreeOfCharge ?? false
  dtForm.dtsPlaceName = decl.dtsPlaceName ?? null
  dtForm.dtsRelation = decl.dtsRelation ?? false
  dtForm.dtsRelationPriceInfluence = decl.dtsRelationPriceInfluence ?? false
  dtForm.dtsRelationApproxValue = decl.dtsRelationApproxValue ?? false
  dtForm.dtsRestriction = decl.dtsRestriction ?? false
  dtForm.dtsValueCondition = decl.dtsValueCondition ?? false
  dtForm.dtsRoyaltyContract = decl.dtsRoyaltyContract ?? false
  dtForm.dtsRoyaltyFee = decl.dtsRoyaltyFee ?? false
  dtForm.dtsSubsequentResale = decl.dtsSubsequentResale ?? false
  dtForm.dtsMethodReason = decl.dtsMethodReason ?? null
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
    // одно видимое поле мест (packagesCount) ← приоритетное значение бэка (см. utils/goodsPlaces)
    packagesCount: placesOfGoods(g),
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
    cargoPlacesQuantity: placesOfGoods(g),
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
    containerNumber: g.containerNumber ?? null,
    tempImportMonths: g.tempImportMonths ?? null,
    vatRatePreferential: g.vatRatePreferential ?? null,
    certificationNote: g.certificationNote ?? null,
    oisIndicatorCode: g.oisIndicatorCode ?? null,
    restrictionMarks: g.restrictionMarks ?? null,
    oisRegNumber: g.oisRegNumber ?? null,
    oisCountryCode: g.oisCountryCode ?? null,
    markings: (g.markings ?? []).map((m) => ({ ...m })),
    // Выбор по КЕДЕН (вид акциза, антидемпинг) и количества в единицах ставок. Без них при загрузке
    // ДТ выбор терялся, а автосейв затирал его в базе — расчёт снова брал первый вид акциза.
    exciseKind: g.exciseKind ?? null,
    antiDumpingKind: g.antiDumpingKind ?? null,
    taxVolumeL: g.taxVolumeL ?? null,
    taxAlcoholL: g.taxAlcoholL ?? null,
    taxPieces: g.taxPieces ?? null,
    engineVolumeCm3: g.engineVolumeCm3 ?? null,
  }))
  dtForm.doc44Items = (decl.doc44Items ?? []).map((d) => ({
    docTypeCode: d.docTypeCode ?? null,
    docTypeName: d.docTypeName ?? null,
    docNumber: d.docNumber ?? null,
    docDate: d.docDate ?? null,
    goodsItemIndex: d.goodsItemIndex ?? null,
    appliesToAll: d.appliesToAll ?? false,
    goodsItemIndexes: d.goodsItemIndexes ?? null,
    docStartDate: d.docStartDate ?? null,
    docValidityDate: d.docValidityDate ?? null,
    issueCountryCode: d.issueCountryCode ?? null,
  }))
  prefillFromClientCase()
  // watch на goodsOriginKey срабатывает асинхронно (после этого синхронного
  // присвоения всех полей формы) — снимаем guard через nextTick, чтобы он
  // успел увидеть true во время своего срабатывания и пропустить его.
  void nextTick(() => {
    applyingDeclaration.value = false
  })
}

// Пакет 6 №1 (хвост): преднастройка гр.2/8/22 из данных, которые клиент дал при
// подаче заявки (Import40Case.client*). Заполняем ТОЛЬКО пустые поля — уже
// заполненную ДТ не трогаем. Вызывается внутри applyDeclaration (под guard'ом
// applyingDeclaration), поэтому автосейв не срабатывает — значения сохранятся
// при первом обычном сохранении ДТ брокером.
const prefillFromClientCase = () => {
  const c = activeCase.value
  if (!c) return
  const s = dtForm.sender
  if (s) {
    if (!s.name && c.clientSenderName) s.name = c.clientSenderName
    if (!s.countryCode && c.clientSenderCountryCode) s.countryCode = c.clientSenderCountryCode
  }
  // гр.8 не преднастраиваем, если получатель = декларант (гр.14) — там своё копирование.
  const r = dtForm.receiver
  if (!dtForm.consigneeEqualsDeclarant && r) {
    if (!r.name && c.clientReceiverName) r.name = c.clientReceiverName
    if (!dtForm.receiverBin && c.clientReceiverBin) dtForm.receiverBin = c.clientReceiverBin
    if (!r.countryCode && c.clientReceiverCountryCode) r.countryCode = c.clientReceiverCountryCode
  }
  if (!dtForm.currency && c.clientCurrencyCode) dtForm.currency = c.clientCurrencyCode
  if (dtForm.totalInvoiceValue == null && c.clientEstimatedValue != null) dtForm.totalInvoiceValue = c.clientEstimatedValue
}

// Task 8a: авто гр.16 (страна происхождения, шапка) из товаров.
// Ключ — отсортированный список уникальных непустых countryOfOrigin, склеенный
// в строку: watch реагирует только на изменение этого набора (значение, а не
// ссылка на массив), поэтому не перетирает originCountryCode на не связанных
// с товарами ре-рендерах формы. Поле остаётся редактируемым (DtSectionCountries) —
// после ручной правки гр.16 watch снова сработает, только если сам набор стран
// у товаров изменится.
const goodsOriginKey = computed(() =>
  Array.from(
    new Set(dtForm.goodsItems.map((g) => (g.countryOfOrigin ?? '').trim()).filter(Boolean)),
  )
    .sort()
    .join('|'),
)

watch(goodsOriginKey, (key) => {
  if (applyingDeclaration.value) return
  if (!key) return
  const codes = key.split('|')
  // Разные страны происхождения у товаров ДТ — гр.16 заполняется кодом «000»
  // (условность бланка для «страна происхождения не определена/разные»).
  dtForm.originCountryCode = codes.length === 1 ? codes[0] : '000'
})

// Строки гр.47 товаров из серверного расчёта (calculate-payments / calculate-tpin — один движок,
// Import40PaymentCalculator): обновляем строку по коду вида платежа или добавляем новую. Расчётные
// виды (сбор, пошлина, антидемпинг, акциз, НДС), которых в новом расчёте нет, удаляем — иначе после
// смены вида акциза или отказа от антидемпинга оставалась старая сумма.
const CALCULATED_TAX_MODES = ['1010', '2010', '2050', '4010', '5060']
const applyGoodsPaymentRows = (res: Import40CalculatePaymentsResponse) => {
  res.goodsRows.forEach((row) => {
    const g = dtForm.goodsItems[row.index]
    if (!g || row.error) return
    const fresh = new Set(row.rows.map((r) => r.taxModeCode))
    const rows = (g.payments ?? []).filter(
      (p) => !p.taxModeCode || !CALCULATED_TAX_MODES.includes(p.taxModeCode) || fresh.has(p.taxModeCode),
    )
    row.rows.forEach((pr) => {
      const existing = rows.find((p) => p.taxModeCode === pr.taxModeCode)
      if (existing) {
        existing.taxBase = pr.base ?? null
        existing.rateValue = pr.rate ?? null
        existing.amountKzt = pr.amount
        // Task 10: не требуем от декларанта вручную выбирать вид ставки/дату —
        // расчёт сам всё посчитал; трогаем rateKindCode, только если он ещё не задан
        // (не затираем то, что декларант уже выбрал вручную, например '*' с весовым коэфф.).
        // Вид ставки «%» ставим только строкам с числовой ставкой (пошлина/НДС).
        if (!existing.rateKindCode && pr.rate != null) existing.rateKindCode = '%'
        // Сервер знает, какая часть ставки сработала («%» или «*» за кг/шт/см³) — тогда пишем как в КЕДЕН.
        if (pr.rateKind) {
          existing.rateKindCode = pr.rateKind
          existing.rateUnitCode = pr.rateUnitCode ?? null
          existing.rateCurrencyCode = pr.rateCurrencyCode ?? null
          existing.weightRatio = pr.rateKind === '*' ? existing.weightRatio ?? 1 : null
        }
        existing.paymentFeatureCode = pr.featureCode ?? existing.paymentFeatureCode ?? 'ИУ'
        existing.basisLabel = pr.basisLabel ?? null
        existing.rateLabel = pr.rateLabel ?? null
        existing.bLine = pr.bLine ?? null
      } else {
        rows.push({
          taxModeCode: pr.taxModeCode,
          taxBase: pr.base ?? null,
          rateKindCode: pr.rateKind ?? (pr.rate != null ? '%' : null),
          rateValue: pr.rate ?? null,
          rateUnitCode: pr.rateUnitCode ?? null,
          rateCurrencyCode: pr.rateCurrencyCode ?? null,
          weightRatio: pr.rateKind === '*' ? 1 : null,
          rateDate: null,
          paymentFeatureCode: pr.featureCode ?? 'ИУ',
          amountKzt: pr.amount,
          basisLabel: pr.basisLabel ?? null,
          rateLabel: pr.rateLabel ?? null,
          bLine: pr.bLine ?? null,
        })
      }
    })
    g.payments = rows
  })
  // Карточки товаров держат свои копии строк и обновляются по смене самого списка —
  // без новой ссылки рассчитанные строки гр.47 не появлялись в карточке до перезагрузки.
  dtForm.goodsItems = [...dtForm.goodsItems]
}

// Товар ДТ → вход серверного расчёта платежей (то же, что бэк берёт из сохранённой ДТ).
const toPaymentsInput = (g: Import40GoodsItemInput, index: number): Import40TpinGoodsInput => ({
  index,
  description: g.description ?? null,
  tnvedCode: g.tnvedCode ?? null,
  invoiceValue: g.customsValue ?? null,
  currency: g.currency ?? null,
  grossWeightKg: g.grossWeightKg ?? null,
  quantity: g.quantity ?? null,
  vatRatePreferential: g.vatRatePreferential ?? null,
  tempImportMonths: g.tempImportMonths ?? null,
  netWeightKg: g.netWeightKg ?? null,
  customsValueKzt: g.customsValueKzt ?? null,
  originCountry: g.countryOfOrigin ?? null,
  exciseKind: g.exciseKind ?? null,
  antiDumpingKind: g.antiDumpingKind ?? null,
  unitCode: g.unitCode ?? null,
  volumeL: g.taxVolumeL ?? null,
  alcoholL: g.taxAlcoholL ?? null,
  pieces: g.taxPieces ?? null,
  engineVolumeCm3: g.engineVolumeCm3 ?? null,
})

// «Рассчитать ТПиН (авто)»: тот же серверный расчёт, что «Рассчитать платежи», но по товарам
// с экрана (без сохранения). Раньше здесь была своя упрощённая копия — без вида акциза, страны,
// антидемпинга, временного ввоза и льготного НДС, и акциз мог молча обнуляться. Флаг
// needsTpinRecalc снимается только у товаров, которые реально посчитались.
const calcTpin = async () => {
  // Считаем все товары с достаточными данными (код ТНВЭД + стоимость + валюта + вес/кол-во),
  // а не только помеченные needsTpinRecalc — флаг ставится при импорте из КП/сплите.
  const targets = dtForm.goodsItems
    .map((g, index) => ({ g, index }))
    .filter(
      ({ g }) =>
        g.tnvedCode &&
        g.customsValue != null &&
        g.currency &&
        (g.netWeightKg != null || g.quantity != null),
    )
  if (!targets.length) {
    message.info(t('dt.netTovarovSDostatochnymi'))
    return
  }
  // Основа платежей — гр.45 (с транспортом и прочими начислениями, по курсу НБ РК на дату гр.А):
  // сначала пересчитываем её, потом платежи от неё.
  try {
    await recalcCustomsValues()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
    return
  }
  try {
    const res = await import40Api.calculateTpin(
      targets.map(({ g, index }) => toPaymentsInput(g, index)),
      toIsoDate(dtForm.submissionDate),
      (dtForm.rateType ?? '').toUpperCase() === 'EATT',
    )
    applyGoodsPaymentRows(res)
    let recalculated = 0
    const problems: string[] = []
    res.goodsRows.forEach((row) => {
      const g = dtForm.goodsItems[row.index]
      const n = row.index + 1
      if (!g) return
      if (row.error) {
        // Товар не посчитался — причина с номером позиции, иначе непонятно, что править.
        problems.push(`${t('dt.tovarN', { n })}: ${row.error}`)
        return
      }
      g.needsTpinRecalc = false
      recalculated += 1
      // Пояснения движка: акциз/пошлина без нужного количества, вид акциза по умолчанию и т.п.
      if (row.notes) problems.push(`${t('dt.tovarN', { n })}: ${row.notes}`)
    })
    if (recalculated) message.success(t('dt.tpinRasschitanDlyaRecalculated', { n: recalculated }))
    if (problems.length) {
      Modal.warning({
        title: t('dt.tpinProverteTovary'),
        width: 640,
        content: h('div', problems.map((line) => h('div', { style: 'margin-bottom:6px' }, line))),
        okText: t('dt.ponyatno'),
      })
    } else if (!recalculated) {
      message.warning(t('dt.neUdalosRasschitatProverte'))
    }
  } catch {
    message.error(t('dt.neUdalosPereschitatTpin'))
  }
}

// Task 10: «Рассчитать платежи» — светлая модалка гр.47/гр.B (POST
// calculate-payments), которая заменяет прежний нечитаемый попап. Эндпоинт
// не принимает тело — сервер читает товары из уже СОХРАНЁННОЙ декларации
// (см. комментарий у import40Api.calculatePayments), поэтому перед каждым
// вызовом обязателен saveDt().
const paymentsModalOpen = ref(false)
const paymentsLoading = ref(false)
const paymentsApplying = ref(false)
const paymentsResult = ref<Import40CalculatePaymentsResponse | null>(null)

const runPaymentsCalc = async (): Promise<boolean> => {
  const saved = await saveDt(true)
  if (!saved) return false
  paymentsLoading.value = true
  try {
    paymentsResult.value = await import40Api.calculatePayments(caseId, dtId)
    return true
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
    return false
  } finally {
    paymentsLoading.value = false
  }
}

const openPaymentsModal = async () => {
  paymentsResult.value = null
  paymentsModalOpen.value = true
  const ok = await runPaymentsCalc()
  if (!ok) paymentsModalOpen.value = false
}

// Переключатель «Медизделие (НДС 5%)» в модалке: льготная ставка НДС товара
// живёт на самом товаре (vatRatePreferential), поэтому переключение требует
// пересохранить ДТ и пересчитать заново — тот же save→calc, что и открытие
// модалки, только тихо (silent saveDt), чтобы не заваливать тостами.
const onToggleMedical = async (index: number, checked: boolean) => {
  const g = dtForm.goodsItems[index]
  if (!g) return
  g.vatRatePreferential = checked ? 0.05 : null
  await runPaymentsCalc()
}

// Записывает последний расчёт (paymentsResult) в гр.47 товаров и гр.B
// (dtForm.factPayments) — зеркалит upsertGoodsPayment/tpinPaymentRows выше:
// та же логика "обновить существующую строку по taxModeCode или добавить
// новую", только источник сумм — calculate-payments, а не salesApi.calculate,
// и здесь дополнительно пишем base/rate (calc их возвращает), а не только сумму.
const applyPaymentsResult = () => {
  const res = paymentsResult.value
  if (!res) return
  applyGoodsPaymentRows(res)

  const factRows = dtForm.factPayments ?? []
  Object.entries(res.totalsByTaxMode).forEach(([code, amount]) => {
    const existing = factRows.find((p) => p.taxModeCode === code)
    if (existing) {
      existing.amount = amount
    } else {
      factRows.push({
        taxModeCode: code,
        amount,
        exchangeRate: 1,
        paymentDocDate: null,
        payerTaxpayerId: null,
        paymentDate: null,
        paymentMethodCode: 'БН',
      })
    }
  })
  dtForm.factPayments = factRows
}

const onApplyPayments = async () => {
  if (!paymentsResult.value) return
  paymentsApplying.value = true
  try {
    applyPaymentsResult()
    const saved = await saveDt(true)
    if (saved) {
      message.success(t('dt.platezhiZapisanyVGr47'))
      paymentsModalOpen.value = false
    }
  } finally {
    paymentsApplying.value = false
  }
}

// «Рассчитать там. стоимость» (Spec 4a Task 3): распределяет расходы
// dtForm.expenses по товарам dtForm.goodsItems и проставляет гр.45
// (customsValueKzt) каждому — по index = позиции товара в массиве
// goodsItems (см. комментарий у Import40CvGoodsInput в api/import40.ts).
// Пересчёт гр.45 (с расходами, по курсам НБ РК на дату гр.А) и гр.46 по всем товарам. Ошибку
// сервера пробрасывает — вызывающий решает, как её показать.
const recalcCustomsValues = async (): Promise<{ updated: number; total: number }> => {
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
  const res = await import40Api.calculateCustomsValue({ goods, expenses, onDate: toIsoDate(dtForm.submissionDate) })
  let updated = 0
  let total = 0
  res.goods.forEach((r) => {
    const g = dtForm.goodsItems[r.index]
    if (g) {
      g.customsValueKzt = r.customsValueKzt
      // гр.46 — вместе с гр.45 и по тому же курсу: раньше оставалась от прошлого расчёта.
      if (r.statisticValueUsd != null) g.statisticValueUsd = r.statisticValueUsd
      total += r.customsValueKzt ?? 0
      updated += 1
    }
  })
  return { updated, total }
}

// Живёт в родителе, а не в DtSectionFinance, т.к. только здесь dtForm.goodsItems
// корректно типизирован как Import40GoodsItemInput[] (с полем customsValue) —
// в дочерних Dt-секциях modelValue типизирован общим Import40DtFormState,
// где то же поле называется invoiceValue (см. комментарий у DtFormState выше).
const calcCustomsValue = async () => {
  if (!dtForm.goodsItems.length) {
    message.warning(t('dt.netTovarovDlyaRascheta'))
    return
  }
  try {
    const { updated, total } = await recalcCustomsValues()
    // показываем итог в сообщении — результат (гр.45) в свёрнутой панели КЕДЕН, брокер его иначе не видит
    const totalStr = total.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
    message.success(t('dt.tamozhennayaStoimostRasschitanaUpdated', { n: updated, total: totalStr }))
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  }
}

const loadDt = async () => {
  try {
    activeCase.value = await import40Api.get(caseId)
    // №12: профиль клиента для автозаполнения получателя (гр.8) в DtSectionParties.
    if (activeCase.value?.clientId) {
      import40ContractApi
        .getProfile(activeCase.value.clientId)
        .then((p) => { clientProfile.value = p })
        .catch(() => { clientProfile.value = null })
    }
  } catch {
    message.error(t('dt.deklaraciyaNeNaydena'))
    void router.push('/import-40')
    return
  }
  const decl = activeCase.value?.declarations.find((d) => d.id === dtId)
  if (!decl) {
    message.error(t('dt.deklaraciyaNeNaydena'))
    void router.push('/import-40')
    return
  }
  loadedDto.value = decl
  applyDeclaration(decl)
  void refreshReadiness()
}

// silent=true пропускает тост "ДТ сохранена" — нужен для промежуточных
// автосохранений перед расчётом платежей (Task 10: save → calc → save при
// каждом переключении «Медизделие»), чтобы не заваливать декларанта одинаковыми
// уведомлениями об одном и том же действии.
const saveDt = async (silent = false): Promise<boolean> => {
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
      senderDistrict: dtForm.senderDistrict || null,
      senderHouse: dtForm.senderHouse || null,
      senderApt: dtForm.senderApt || null,
      senderShortName: dtForm.senderShortName || null,
      receiver: dtForm.receiver,
      receiverDistrict: dtForm.receiverDistrict || null,
      receiverHouse: dtForm.receiverHouse || null,
      receiverApt: dtForm.receiverApt || null,
      receiverBin: dtForm.receiverBin || null,
      receiverCategoryCode: dtForm.receiverCategoryCode || null,
      receiverKatoCode: dtForm.receiverKatoCode || null,
      receiverShortName: dtForm.receiverShortName || null,
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
      goodsLocationStation: dtForm.goodsLocationStation || null,
      goodsLocationAddress: dtForm.goodsLocationAddress || null,
      goodsLocationCustomsOfficeCode: dtForm.goodsLocationCustomsOfficeCode || null,
      borderCustomsOfficeCode: dtForm.borderCustomsOfficeCode || null,
      borderCustomsOfficeName: dtForm.borderCustomsOfficeName || null,
      submissionCustomsOfficeCode: dtForm.submissionCustomsOfficeCode || null,
      submissionDate: dtForm.submissionDate || null,
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
      financialSubjectDistrict: dtForm.financialSubjectDistrict || null,
      financialSubjectHouse: dtForm.financialSubjectHouse || null,
      financialSubjectApt: dtForm.financialSubjectApt || null,
      financialSubjectCategoryCode: dtForm.financialSubjectCategoryCode || null,
      financialSubjectKatoCode: dtForm.financialSubjectKatoCode || null,
      financialSubjectShortName: dtForm.financialSubjectShortName || null,
      declarantName: dtForm.declarantName || null,
      declarantBin: dtForm.declarantBin || null,
      declarantCountryCode: dtForm.declarantCountryCode || null,
      declarantRegion: dtForm.declarantRegion || null,
      declarantCity: dtForm.declarantCity || null,
      declarantStreet: dtForm.declarantStreet || null,
      declarantDistrict: dtForm.declarantDistrict || null,
      declarantHouse: dtForm.declarantHouse || null,
      declarantApt: dtForm.declarantApt || null,
      declarantCategoryCode: dtForm.declarantCategoryCode || null,
      declarantKatoCode: dtForm.declarantKatoCode || null,
      declarantShortName: dtForm.declarantShortName || null,
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
      signatoryDocTypeCode: dtForm.signatoryDocTypeCode || null,
      signatoryDocNumber: dtForm.signatoryDocNumber || null,
      signatoryDocIssueDate: dtForm.signatoryDocIssueDate || null,
      signatoryDocIssuedBy: dtForm.signatoryDocIssuedBy || null,
      signatoryDocCountryCode: dtForm.signatoryDocCountryCode || null,
      powerOfAttorney: dtForm.powerOfAttorney || null,
      powerOfAttorneyDate: dtForm.powerOfAttorneyDate || null,
      powerOfAttorneyValidUntil: dtForm.powerOfAttorneyValidUntil || null,
      brokerContractNumber: dtForm.brokerContractNumber || null,
      signatoryPhone: dtForm.signatoryPhone || null,
      signedDate: dtForm.signedDate || null,
      dtsFreeOfCharge: !!dtForm.dtsFreeOfCharge,
      dtsPlaceName: dtForm.dtsPlaceName || null,
      dtsRelation: !!dtForm.dtsRelation,
      dtsRelationPriceInfluence: !!dtForm.dtsRelationPriceInfluence,
      dtsRelationApproxValue: !!dtForm.dtsRelationApproxValue,
      dtsRestriction: !!dtForm.dtsRestriction,
      dtsValueCondition: !!dtForm.dtsValueCondition,
      dtsRoyaltyContract: !!dtForm.dtsRoyaltyContract,
      dtsRoyaltyFee: !!dtForm.dtsRoyaltyFee,
      dtsSubsequentResale: !!dtForm.dtsSubsequentResale,
      dtsMethodReason: dtForm.dtsMethodReason || null,
      goodsItems: dtForm.goodsItems.map((g) => {
        // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
        const { customsValue, ...rest } = g
        // места: видимое поле packagesCount, КЕДЕН-поле — его копия (одна цифра на бланке и в XML)
        const places = g.packagesCount ?? g.cargoPlacesQuantity ?? null
        return { ...rest, packagesCount: places, cargoPlacesQuantity: places, invoiceValue: customsValue, payments: g.payments ?? [], markings: g.markings ?? [] }
      }),
      doc44Items: dtForm.doc44Items,
      prevDocItems: dtForm.prevDocItems,
      expenses: dtForm.expenses,
    }
    const updated = await import40Api.updateDeclaration(caseId, dtForm.id, payload)
    loadedDto.value = updated
    if (!silent) message.success(t('dt.dtSohranena'))
    void refreshReadiness()
    savedCounter.value += 1
    lastSavedAt.value = dayjs().format('HH:mm')
    return true
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
    return false
  } finally {
    saving.value = false
  }
}

// №2 Автосейв черновика: любое изменение формы через 2.5с тишины сохраняется
// без тостов (saveDt(true)). Не срабатывает во время загрузки декларации
// (applyingDeclaration), в режиме просмотра (readOnly), до появления id, и не
// стартует новое сохранение поверх идущего (saving) — по тишине сработает снова.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => dtForm,
  () => {
    if (applyingDeclaration.value || readOnly.value || !dtForm.id) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      if (applyingDeclaration.value || readOnly.value || !dtForm.id || saving.value) return
      void saveDt(true)
    }, 2500)
  },
  { deep: true },
)

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
      message.warning(t('dt.xmlNeSformirovanZapolnite'))
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('dt.xmlDlyaKedenSformirovan'))
    void refreshReadiness()
  } catch {
    message.error(t('dt.neUdalosSformirovatXml'))
  } finally {
    xmlLoading.value = false
  }
}

// Task 9: факсимиле бланка ДТ (печать) — работает на любой стадии, в т.ч. на пустой ДТ.
const printBlank = async () => {
  // несохранённое не должно теряться при печати
  const saved = await saveDt()
  if (!saved) return
  pdfLoading.value = true
  try {
    const { blob, fileName } = await import40Api.blankPdf(caseId, dtId)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    message.error(t('dt.neUdalosSformirovatBlank'))
  } finally {
    pdfLoading.value = false
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
const splitColumns = computed(() => ([

  { title: t('dt.tnved'), dataIndex: 'tnvedCode', key: 'tnvedCode', width: 140 },
  { title: t('dt.statusVto'), dataIndex: 'vtoStatus', key: 'vtoStatus', ellipsis: true },
  { title: t('dt.poshlinaEtt'), dataIndex: 'ettRate', key: 'ettRate', width: 110 },
  { title: t('dt.poshlinaVto'), dataIndex: 'vtoRate', key: 'vtoRate', width: 110 },
  { title: t('dt.vto'), key: 'vto', width: 70 },
]))
// Task 12 (фидбек №17): «Выбрать все» — тристейт-переключатель над таблицей.
const allVtoSelected = computed(() => splitRows.value.length > 0 && splitRows.value.every((r) => r.vto))
const someVtoSelected = computed(() => splitRows.value.some((r) => r.vto) && !allVtoSelected.value)
// Отмечены все товары ДТ (в т.ч. единственный) — ЕТТ-части не будет, сервер создаст одну ДТ ВТО.
const splitVtoOnly = computed(
  () => splitRows.value.length > 0 && splitRows.value.filter((r) => r.vto).length === dtForm.goodsItems.length,
)
const toggleAllVto = (e: { target: { checked: boolean } }) => {
  const checked = e.target.checked
  splitRows.value = splitRows.value.map((r) => ({ ...r, vto: checked }))
}

const openSplitModal = async () => {
  splitModalOpen.value = true
  splitLoading.value = true
  try {
    const rows = await import40Api.splitSuggestion(caseId, dtId)
    // Item N: показываем только товары под изъятиями ВТО (кандидаты); остальные
    // не рендерим — они по умолчанию остаются в декларации ЕТТ (не попадают в
    // vtoGoodSortOrders). Кандидаты по умолчанию отмечены.
    const candidates = rows.filter((r) => r.isVtoCandidate)
    if (candidates.length === 0) {
      splitModalOpen.value = false
      message.info(t('dt.netTovarovPopadayuschihPod'))
      return
    }
    splitRows.value = candidates.map((r) => ({ ...r, vto: true }))
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
    splitModalOpen.value = false
  } finally {
    splitLoading.value = false
  }
}

const doSplit = async () => {
  const vtoGoodSortOrders = splitRows.value.filter((r) => r.vto).map((r) => r.sortOrder)
  splitting.value = true
  try {
    const res = await import40Api.splitDeclaration(caseId, dtId, { vtoGoodSortOrders })
    splitModalOpen.value = false
    // Сервер пересчитывает платежи новых ДТ по их ставкам (ВТО — пониженная). Если не по всем
    // товарам — просим нажать «Рассчитать платежи» (для одной ДТ ВТО окно расчёта откроется само).
    if (!res.paymentsRecalculated) message.warning(t('dt.platezhiNePereschitany'))
    if (!res.ettDeclarationId) {
      message.success(t('dt.sozdanaDtVto'))
      await router.push({
        path: `/import-40/${caseId}/dt/${res.vtoDeclarationId}`,
        query: res.paymentsRecalculated ? {} : { calc: 'payments' },
      })
      return
    }
    message.success(t('dt.ishodnayaDtSohranenaBez'))
    // Исходная декларация сохраняется как есть (и помечена «Разделена» — задача 2.4), плюс
    // создаются две новые (ЕТТ и ВТО); переходим в новую декларацию ВТО, а не остаёмся на
    // странице уже неактуальной исходной ДТ (аудит 3.3/H5).
    await router.push({
      path: `/import-40/${caseId}/dt/${res.vtoDeclarationId}`,
      query: res.paymentsRecalculated ? {} : { calc: 'payments' },
    })
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    splitting.value = false
  }
}

onMounted(async () => {
  // Не блокируем загрузку самой ДТ: селекты читают классификаторы через computed
  // и дозаполнятся, когда кэш приедет. Иначе один упавший запрос из 12 оставлял бы
  // пользователя перед пустой формой декларации без объяснения.
  classifiers.loadMany(DT_CLASSIFIERS).catch(() => {
    message.warning(t('dt.spravochnikiKodovNeZagruzilis'))
  })
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch {
    /* справочник стран не загрузился — селекты позволят ручной ввод через allow-clear */
  }
  try {
    const posts = await referencesApi.listCustomsPosts()
    // RefCustomsPost.Name — комбинированная строка вида «57505 — ТАМОЖЕННЫЙ
    // ПОСТ «НҰР ЖОЛЫ»» (отдельного поля кода нет). Для declarationNumber
    // (DtDeclarationNumberBar.register()) нужен голый числовой код, поэтому
    // value — распарсенный ведущий код, label — полная строка справочника;
    // без парсинга submissionCustomsOfficeCode хранил бы всю строку целиком.
    customsPostOptions.value = posts.map((p) => ({
      value: p.name.match(/^\d+/)?.[0] ?? p.name,
      label: p.name,
    }))
  } catch {
    /* справочник постов не загрузился — код поста можно ввести вручную */
  }
  try {
    // nameRu уже содержит номер графы («17 Расходы по транспортировке»), поэтому
    // отдельно code в подпись не дублируем; сортируем по sortOrder — порядок граф ДТС.
    const expenseTypes = [...(await referencesApi.listExpenseTypes())].sort((a, b) => a.sortOrder - b.sortOrder)
    expenseTypeOptions.value = expenseTypes.map((t) => ({ value: t.code, label: t.nameRu }))
    expenseDistributionByCode.value = Object.fromEntries(expenseTypes.map((t) => [t.code, t.distributionBase]))
    expenseDeductionByCode.value = Object.fromEntries(expenseTypes.map((t) => [t.code, t.isDeduction]))
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
    currentRates.value = rates
    currencyRates.value = { ...rates }
  } catch {
    /* справочник валют НБ РК не загрузился — таблица расходов не блокирует форму */
  }
  await loadDt()
  // Только что созданная ДТ ВТО (см. doSplit): сразу расчёт платежей по ставкам ВТО.
  if (route.query.calc === 'payments') {
    void router.replace({ path: route.path, query: {} })
    if (!readOnly.value) void openPaymentsModal()
  }
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
/* Липкая панель ДТ — под шапкой приложения (64px). */
.dt-bar {
  position: sticky;
  top: 64px;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 10px 16px;
  margin: 0 -4px;
  background: var(--z-surface);
  border: 1px solid var(--z-line);
  border-radius: 12px;
  box-shadow: var(--sh-2, 0 4px 12px -4px rgba(14, 27, 53, 0.12));
}
.dt-bar-title { min-width: 0; }
.dt-bar-kicker {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--z-teal-d);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-bar-h {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 20px;
  line-height: 1.25;
  color: var(--z-ink);
}
.dt-bar-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.dt-bar-status :deep(.ant-tag) { margin: 0; }
.dt-missing-tag { cursor: pointer; }
.dt-saved { font-size: 12px; color: var(--z-muted); margin-left: 4px; }
.dt-bar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dt-missing-list { margin: 0; padding-left: 18px; max-height: 320px; overflow-y: auto; }
.dt-missing-list li { margin: 3px 0; }
.dt-missing-list a { text-decoration: underline; }
.dt-nav-title { flex: 1; min-width: 0; }
.dt-nav-count {
  flex: none;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--z-warning-soft);
  color: var(--z-warning);
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}
.dt-nav-item.active .dt-nav-count { background: rgba(255, 255, 255, 0.85); }
.dt-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.dt-nav {
  position: sticky;
  top: 150px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--z-line);
  border-radius: var(--atg-radius-lg);
  background: var(--z-surface);
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
  background: var(--z-teal);
  color: #fff;
}
.dt-nav-mark {
  font-size: 12px;
  color: var(--z-muted);
  display: inline-flex;
  align-items: center;
}
.dt-nav-mark.done {
  color: #52c41a;
}
.dt-nav-mark-empty {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid currentColor;
}
.dt-nav-item.active .dt-nav-mark {
  color: #fff;
}
.dt-content {
  border: 1px solid var(--z-line);
  border-radius: var(--atg-radius-lg);
  background: var(--z-surface);
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
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--z-ink);
}
.dt-fact-payments {
  margin-top: 20px;
}
.muted {
  color: var(--z-muted);
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
  /* На телефоне панель не липнет: она в несколько строк и закрыла бы форму. */
  .dt-bar { position: static; }
}
</style>
