<template>
  <div class="tnved-tree-view crm-page">
    <PageHeader
      :kicker="t('sales.tnVedEaes')"
      :title="t('sales.klassifikatorImport')"
      :subtitle="t('sales.edinayaTovarnayaNomenklaturaVneshneekonomicheskoy')"
    >
      <template #actions>
        <a-button @click="classifyModalOpen = true">
          <template #icon><RobotOutlined /></template> {{ t('sales.iiKlassifikaciya') }} </a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <!-- Search bar -->
      <div class="search-row">
        <a-input-search
          v-model:value="searchQuery"
          :placeholder="t('sales.poiskPoKoduIli')"
          :enter-button="t('misc.nayti')"
          allow-clear
          style="max-width: 480px"
          :loading="searchLoading"
          @search="handleSearch"
          @change="onSearchChange"
        />
        <a-checkbox v-model:checked="leafOnly" style="margin-left:12px">{{ t('sales.tolko10Znachnye') }}</a-checkbox>
      </div>

      <a-row :gutter="16" style="margin-top:16px">
        <!-- Left: tree -->
        <a-col :xs="24" :md="10" :lg="9">
          <a-card size="small" class="tree-card" :bordered="true">
            <!-- Search results -->
            <template v-if="searchResults !== null">
              <div v-if="searchResults.length === 0" class="empty-hint">{{ t('sales.nichegoNeNaydeno') }}</div>
              <a-list v-else size="small" :data-source="searchResults" :bordered="false">
                <template #renderItem="{ item }">
                  <a-list-item
                    class="search-result-item"
                    :class="{ active: selected?.id === item.id }"
                    @click="selectNode(item)"
                  >
                    <a-typography-text code style="font-size:12px;flex-shrink:0">{{ item.code }}</a-typography-text>
                    <span class="node-name">{{ item.treeName }}</span>
                  </a-list-item>
                </template>
              </a-list>
            </template>

            <!-- Tree navigation -->
            <template v-else>
              <a-spin :spinning="treeLoading">
                <div v-if="breadcrumb.length > 0" class="breadcrumb-bar">
                  <a-breadcrumb separator=">">
                    <a-breadcrumb-item>
                      <a @click="resetToRoot">{{ t('sales.razdely') }}</a>
                    </a-breadcrumb-item>
                    <a-breadcrumb-item v-for="(crumb, i) in breadcrumb" :key="crumb.id">
                      <a v-if="i < breadcrumb.length - 1" @click="navigateToBreadcrumb(i)">{{ crumb.code }}</a>
                      <span v-else>{{ crumb.code }}</span>
                    </a-breadcrumb-item>
                  </a-breadcrumb>
                </div>

                <div v-if="currentNodes.length === 0 && !treeLoading" class="empty-hint">{{ t('sales.netDochernihElementov') }}</div>

                <div
                  v-for="node in currentNodes"
                  :key="node.id"
                  class="tree-node"
                  :class="{ active: selected?.id === node.id, leaf: node.isLast }"
                  @click="handleNodeClick(node)"
                >
                  <span class="node-code">{{ node.code }}</span>
                  <span class="node-label">{{ node.treeName }}</span>
                  <RightOutlined v-if="!node.isLast" class="node-arrow" />
                  <a-tag v-if="node.is10" color="blue" style="font-size:10px;padding:0 4px;margin:0">10</a-tag>
                </div>
              </a-spin>
            </template>
          </a-card>
        </a-col>

        <!-- Right: detail -->
        <a-col :xs="24" :md="14" :lg="15">
          <a-card size="small" class="detail-card" :bordered="true">
            <template v-if="!selected">
              <div class="empty-hint" style="padding-top:80px">
                <GlobalOutlined style="font-size:40px;opacity:0.18;display:block;text-align:center;margin-bottom:12px" /> {{ t('sales.vyberitePoziciyuVDereve') }} </div>
            </template>

            <template v-else>
              <a-spin :spinning="detailLoading">
                <!-- Header -->
                <div class="detail-header">
                  <a-typography-text code style="font-size:16px">{{ selected.code }}</a-typography-text>
                  <a-tag v-if="selected.is10" color="blue">{{ t('sales.n10Zn') }}</a-tag>
                  <a-tag v-if="selected.isLast" color="green">{{ t('sales.konechnyy') }}</a-tag>
                  <a-tag v-if="selected.unitShort" color="default">{{ selected.unitShort }}</a-tag>
                </div>
                <div class="detail-name">{{ selected.name || selected.treeName }}</div>

                <!-- Deprecation warning -->
                <TnvedDeprecationAlert v-if="deprecationWarning" :warning="deprecationWarning" style="margin:12px 0" />

                <!-- Tabs: rates, notes, calculator -->
                <a-tabs v-model:activeKey="detailTab" style="margin-top:12px" size="small">

                  <!-- Rates tab -->
                  <a-tab-pane key="rates" :tab="t('sales.stavki')">
                    <div v-if="rates.length === 0 && !detailLoading" class="empty-hint">{{ t('sales.stavkiNeNaydeny') }}</div>
                    <a-table
                      v-else
                      :data-source="rates"
                      :columns="ratesColumns"
                      :pagination="false"
                      size="small"
                      row-key="code"
                    >
                      <template #bodyCell="{ column, record }">
                        <template v-if="column.key === 'rateStr'">
                          <a-tag color="orange" v-if="record.rateStr">{{ record.rateStr }}</a-tag>
                          <span v-else class="muted">—</span>
                        </template>
                        <template v-if="column.key === 'vtoStatus'">
                          <a-tag color="purple" v-if="record.vtoStatus">{{ record.vtoStatus }}</a-tag>
                          <span v-else class="muted">—</span>
                        </template>
                        <template v-if="column.key === 'source'">
                          <a v-if="record.rateSourceUrl" :href="record.rateSourceUrl" target="_blank" rel="noopener">
                            {{ record.rateSourceName || t('sales.istochnik') }}
                          </a>
                          <span v-else class="muted">{{ record.rateSourceName || '—' }}</span>
                        </template>
                      </template>
                    </a-table>
                  </a-tab-pane>

                  <!-- Calculator tab -->
                  <a-tab-pane key="calc" :tab="t('sales.kalkulyator')" :disabled="!selected.is10">
                    <a-form layout="vertical" style="max-width:420px" :model="calcForm" @finish="runCalculate">
                      <a-row :gutter="12">
                        <a-col :span="14">
                          <a-form-item :label="t('sales.tamozhennayaStoimost')" name="customsValue">
                            <a-input-number v-model:value="calcForm.customsValue" :min="0" style="width:100%" />
                          </a-form-item>
                        </a-col>
                        <a-col :span="10">
                          <a-form-item :label="t('sales.valyuta')" name="currencyCode">
                            <a-select v-model:value="calcForm.currencyCode" style="width:100%">
                              <a-select-option v-for="c in currencies" :key="c.codeLat" :value="c.codeLat">
                                {{ c.codeLat }} ({{ c.rate.toFixed(2) }})
                              </a-select-option>
                            </a-select>
                          </a-form-item>
                        </a-col>
                      </a-row>
                      <a-row :gutter="12">
                        <a-col :span="12">
                          <a-form-item :label="t('sales.vesKg')">
                            <a-input-number v-model:value="calcForm.weightKg" :min="0" style="width:100%" :placeholder="t('sales.neobyaz')" />
                          </a-form-item>
                        </a-col>
                        <a-col :span="12">
                          <a-form-item :label="t('sales.kolVoObemL')">
                            <a-input-number v-model:value="calcForm.quantity" :min="0" style="width:100%" :placeholder="t('sales.neobyaz')" />
                          </a-form-item>
                        </a-col>
                      </a-row>
                      <a-form-item :label="t('sales.calcOriginCountry')">
                        <a-select v-model:value="calcForm.originCountry" show-search allow-clear style="width:100%"
                          :options="countryOptions" :filter-option="filterOption" :placeholder="t('sales.neobyaz')" />
                      </a-form-item>
                      <a-row :gutter="12">
                        <a-col v-if="rates[0]?.rateStr?.toLowerCase().includes('см3')" :span="12">
                          <a-form-item :label="t('sales.obemDvigatelyaSm')">
                            <a-input-number v-model:value="calcForm.engineVolumeCm3" :min="0" style="width:100%" :placeholder="t('sales.dlyaAvto')" />
                          </a-form-item>
                        </a-col>
                        <a-col :span="rates[0]?.rateStr?.toLowerCase().includes('см3') ? 12 : 24">
                          <a-form-item :label="t('sales.naDatu')">
                            <a-date-picker v-model:value="calcForm.onDate" style="width:100%" format="DD.MM.YYYY" :placeholder="t('sales.neobyaz')" />
                          </a-form-item>
                        </a-col>
                      </a-row>
                      <a-button type="primary" html-type="submit" :loading="calcLoading" block>{{ t('sales.rasschitat') }}</a-button>
                    </a-form>

                    <div v-if="calcResult" class="calc-result">
                      <a-descriptions bordered size="small" :column="1" style="margin-top:16px">
                        <a-descriptions-item :label="t('sales.stavkaPoshliny')">
                          <a-tag color="orange">{{ calcResult.rateStr || '—' }}</a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item :label="t('sales.tamozhennayaStoimostKzt')">{{ fmtKzt(calcResult.customsValueKzt) }}</a-descriptions-item>
                        <a-descriptions-item :label="t('sales.vvoznayaPoshlina')">{{ fmtKzt(calcResult.importDutyKzt) }}</a-descriptions-item>
                        <a-descriptions-item :label="t('sales.tamozhennyySbor')">{{ fmtKzt(calcResult.customsFeeKzt) }}</a-descriptions-item>
                        <a-descriptions-item v-if="calcResult.antiDumpingKzt" :label="t('sales.calcAntiDumping')">
                          {{ fmtKzt(calcResult.antiDumpingKzt) }}
                        </a-descriptions-item>
                        <a-descriptions-item v-if="calcResult.exciseKzt > 0" :label="t('sales.akciz')">
                          {{ fmtKzt(calcResult.exciseKzt) }}
                        </a-descriptions-item>
                        <a-descriptions-item :label="t('sales.nds16')">{{ fmtKzt(calcResult.vatKzt) }}</a-descriptions-item>
                        <a-descriptions-item :label="t('sales.itogo')">
                          <strong>{{ fmtKzt(calcResult.totalKzt) }}</strong>
                        </a-descriptions-item>
                      </a-descriptions>
                      <div v-if="(calcResult.exciseOptions?.length ?? 0) > 1" class="calc-choice">
                        <div class="calc-choice-label">{{ t('dt.tariffExciseKind') }}</div>
                        <a-select :value="calcResult.exciseKind" size="small" style="width:100%"
                          :options="calcResult.exciseOptions!.map((o) => ({ value: o.key, label: `${o.rate} — ${o.condition ?? ''}` }))"
                          @change="(v: string) => { calcForm.exciseKind = v; runCalculate() }" />
                      </div>
                      <div v-if="calcResult.antiDumpingOptions?.length" class="calc-choice">
                        <div class="calc-choice-label">{{ t('dt.tariffAntiDumping') }}</div>
                        <a-select :value="calcForm.antiDumpingKind ?? ''" size="small" style="width:100%"
                          :options="[{ value: '', label: t('dt.tariffAntiDumpingNone') },
                                     ...calcResult.antiDumpingOptions!.map((o) => ({ value: o.key, label: `${o.rate} (${o.country ?? ''}) — ${o.condition ?? ''}` }))]"
                          @change="(v: string) => { calcForm.antiDumpingKind = v || null; runCalculate() }" />
                      </div>
                      <p v-if="calcResult.notes" class="calc-notes">{{ calcResult.notes }}</p>
                      <p v-if="calcResult.explanation" class="calc-notes">{{ calcResult.explanation }}</p>

                      <NonTariffMeasureGroups :groups="calcMeasureGroups" />
                    </div>
                  </a-tab-pane>

                  <!-- Notes/explanations tab -->
                  <a-tab-pane key="notes" :tab="t('sales.poyasneniya')">
                    <div class="eec-links">
                      <a href="https://eec.eaeunion.org/comission/department/catr/ett/" target="_blank" rel="noopener">{{ t('sales.eecExplanations') }}</a>
                      <a href="https://eec.eaeunion.org/comission/department/dep_tamoj_zak/klassifikatsiya-tovarov-v-sootvetstvii-s-tn-ved-eaes/resheniya-o-klassifikatsii-tovarov.php" target="_blank" rel="noopener">{{ t('sales.eecClassificationDecisions') }}</a>
                      <a href="https://portal.eaeunion.org/sites/odata/_layouts/15/Portal.EEC.Registry.Ui/DirectoryForm.aspx?ViewId=01d0337c-71f3-455b-950d-d882bf9547d9&ListId=0e3ead06-5475-466a-a340-6f69c01b5687&ItemId=219" target="_blank" rel="noopener">{{ t('sales.eecPreliminaryDecisions') }}</a>
                    </div>
                    <div v-if="!notes?.htmlContent && !detailLoading" class="empty-hint">{{ t('sales.poyasneniyaOtsutstvuyut') }}</div>
                    <div v-else-if="notes?.htmlContent" class="notes-html" v-html="notes.htmlContent" />
                  </a-tab-pane>

                  <!-- Reference / non-tariff measures tab -->
                  <a-tab-pane key="reference" :tab="t('sales.netarifka')" :disabled="!selected.is10">
                    <div v-if="referenceNotFound && !detailLoading" class="empty-hint"> {{ t('sales.dannyeEscheNeZagruzheny') }} </div>
                    <template v-else-if="reference">
                      <div v-if="!reference.success" class="empty-hint">
                        {{ reference.errorMessage || t('sales.netDannyhPoKodu') }}
                      </div>
                      <template v-else>
                        <NonTariffMeasureGroups v-if="referenceMeasureGroups.length" :groups="referenceMeasureGroups" />
                        <div v-else class="empty-hint">{{ t('sales.netarifnyeMeryOtsutstvuyut') }}</div>
                      </template>
                    </template>
                  </a-tab-pane>

                  <!-- Export (вывоз) tab -->
                  <a-tab-pane key="export" :tab="t('sales.eksport')" :disabled="!selected.is10">
                    <div v-if="exportReferenceNotFound && !detailLoading" class="empty-hint"> {{ t('sales.dannyeEscheNeZagruzheny') }} </div>
                    <template v-else-if="exportReference">
                      <div v-if="!exportReference.success" class="empty-hint">
                        {{ exportReference.errorMessage || t('sales.netDannyhPoKodu') }}
                      </div>
                      <template v-else>
                        <a-descriptions v-if="exportReference.rateValue" bordered size="small" :column="1" style="margin-bottom:12px">
                          <a-descriptions-item :label="t('sales.stavkaVyvoznoyPoshliny')">
                            <a-tag color="orange">{{ exportReference.rateValue }}</a-tag>
                          </a-descriptions-item>
                        </a-descriptions>
                        <NonTariffMeasureGroups v-if="exportMeasureGroups.length" :groups="exportMeasureGroups" />
                        <div v-if="!exportReference.rateValue && !exportMeasureGroups.length" class="empty-hint"> {{ t('sales.dannyePoVyvozuOtsutstvuyut') }} </div>
                      </template>
                    </template>
                  </a-tab-pane>

                </a-tabs>
              </a-spin>
            </template>
          </a-card>
        </a-col>
      </a-row>
    </a-card>

    <!-- AI Classify modal -->
    <a-modal
      v-model:open="classifyModalOpen"
      :title="t('sales.iiKlassifikaciyaTovara')"
      :footer="null"
      width="640px"
    >
      <a-form layout="vertical" @finish="runClassify">
        <a-form-item :label="t('sales.opisanieTovara')" name="description" :rules="[{ required: true, message: t('misc.vvediteOpisanie') }]">
          <a-textarea
            v-model:value="classifyDesc"
            :rows="3"
            placeholder="Например: мужская хлопковая рубашка с длинным рукавом"
            allow-clear
          />
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="classifyLoading" block>{{ t('sales.klassificirovat') }}</a-button>
      </a-form>

      <div v-if="classifyResult" style="margin-top:16px">
        <a-divider>{{ t('sales.rezultaty') }}</a-divider>
        <a-list size="small" :data-source="classifyResult.matches" bordered>
          <template #renderItem="{ item }">
            <a-list-item style="cursor:pointer" @click="navigateToCode(item.code)">
              <a-list-item-meta>
                <template #title>
                  <a-typography-text code>{{ item.code }}</a-typography-text>
                  <span style="margin-left:8px;font-size:13px">{{ item.description }}</span>
                </template>
                <template #description>
                  <span v-if="item.rateStr">{{ t('sales.stavka') }} <a-tag color="orange" style="font-size:11px">{{ item.rateStr }}</a-tag></span>
                  <span v-if="item.unitName" style="margin-left:8px">{{ t('sales.edUnit', { u: item.unitName }) }}</span>
                </template>
              </a-list-item-meta>
              <template #extra>
                <a-progress
                  type="circle"
                  :percent="Math.round(item.probability * 100)"
                  :width="40"
                  :stroke-color="item.probability > 0.7 ? '#52c41a' : item.probability > 0.4 ? '#faad14' : '#ff4d4f'"
                />
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, computed, watch, onMounted } from 'vue'
import { GlobalOutlined, RightOutlined, RobotOutlined } from '@ant-design/icons-vue'
import type { Dayjs } from 'dayjs'
import TnvedDeprecationAlert from '@/components/TnvedDeprecationAlert.vue'
import NonTariffMeasureGroups, { type NonTariffMeasureGroup } from '@/components/NonTariffMeasureGroups.vue'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import type {
  TnvedNodeDto,
  TnvedRateDto,
  TnvedExplanationDto,
  TnvedCurrencyDto,
  TnvedDeprecationWarningDto,
  TnvedCalculateResult,
  TnvedClassifyResponse,
  TnvedReferenceDto,
  TnvedExportReferenceDto,
  TnvedNonTariffMeasureDto,
} from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

// ── Tree state ───────────────────────────────────────────────────────────────
const currentNodes = ref<TnvedNodeDto[]>([])
const breadcrumb = ref<TnvedNodeDto[]>([])
const selected = ref<TnvedNodeDto | null>(null)
const treeLoading = ref(false)
const searchQuery = ref('')
const searchResults = ref<TnvedNodeDto[] | null>(null)
const searchLoading = ref(false)
const leafOnly = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

// ── Detail state ─────────────────────────────────────────────────────────────
const detailTab = ref('rates')
const detailLoading = ref(false)
const rates = ref<TnvedRateDto[]>([])
const notes = ref<TnvedExplanationDto | null>(null)
const deprecationWarning = ref<TnvedDeprecationWarningDto | null | undefined>(undefined)
const reference = ref<TnvedReferenceDto | null>(null)
const referenceNotFound = ref(false)
const exportReference = ref<TnvedExportReferenceDto | null>(null)
const exportReferenceNotFound = ref(false)

// ── Calculator state ─────────────────────────────────────────────────────────
const currencies = ref<TnvedCurrencyDto[]>([])
const calcLoading = ref(false)
const calcResult = ref<TnvedCalculateResult | null>(null)
const calcForm = ref<{
  customsValue: number
  currencyCode: string
  weightKg: number | null
  quantity: number | null
  engineVolumeCm3: number | null
  onDate: Dayjs | null
  originCountry: string | null
  exciseKind: string | null
  antiDumpingKind: string | null
}>({ customsValue: 0, currencyCode: 'USD', weightKg: null, quantity: null, engineVolumeCm3: null, onDate: null,
     originCountry: null, exciseKind: null, antiDumpingKind: null })

// Страны происхождения для калькулятора (цифровой ОКСМ) — ставки по ЗСТ и антидемпинг из КЕДЕН.
const countryOptions = ref<{ value: string; label: string }[]>([])
const filterOption = (input: string, option: { label: string }) => option.label.toLowerCase().includes(input.toLowerCase())
referencesApi.listCountries()
  .then((list) => { countryOptions.value = list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })) })
  .catch(() => {})

// ── Classify state ───────────────────────────────────────────────────────────
const classifyModalOpen = ref(false)
const classifyDesc = ref('')
const classifyLoading = ref(false)
const classifyResult = ref<TnvedClassifyResponse | null>(null)

// ── Non-tariff measures grouping ─────────────────────────────────────────────
const DOC_TYPE_GROUPS = computed((): { key: string; docTypes: string[]; label: string; color: string }[] => ([

  { key: 'restrictions', docTypes: ['RESTRICTION'], label: t('sales.ogranicheniya'), color: 'red' },
  { key: 'preferences', docTypes: ['PREFERENCE'], label: t('sales.lgoty'), color: 'green' },
  { key: 'others', docTypes: ['OTHER'], label: t('sales.prochieMery'), color: 'blue' },
  { key: 'notices', docTypes: ['NOTICE'], label: t('sales.uvedomleniya'), color: 'gold' },
]))
function groupMeasuresByDocType(measures: TnvedNonTariffMeasureDto[]): NonTariffMeasureGroup[] {
  return DOC_TYPE_GROUPS.value
    .map(g => ({ key: g.key, label: g.label, color: g.color, items: measures.filter(m => g.docTypes.includes(m.docType)) }))
    .filter(g => g.items.length > 0)
}

// ── Reference (нетарифка) tab ────────────────────────────────────────────────
const referenceMeasureGroups = computed(() => groupMeasuresByDocType(reference.value?.nonTariffMeasures ?? []))

// ── Export reference (вывоз) tab ─────────────────────────────────────────────
const exportMeasureGroups = computed(() => groupMeasuresByDocType(exportReference.value?.nonTariffMeasures ?? []))

// ── Calculator: required documents / non-tariff measures ────────────────────
const calcMeasureGroups = computed(() => {
  const measures = calcResult.value?.nonTariffMeasures ?? []
  const restrictions: TnvedNonTariffMeasureDto[] = []
  const preferences: TnvedNonTariffMeasureDto[] = []
  for (const m of measures) {
    if (m.docType === 'PREFERENCE') preferences.push(m)
    else restrictions.push(m)
  }
  return [
    { key: 'restrictions', label: t('sales.trebuemyeDokumenty'), color: 'red', items: restrictions },
    { key: 'preferences', label: t('sales.lgoty'), color: 'green', items: preferences },
  ].filter(g => g.items.length > 0)
})

// ── Table columns ────────────────────────────────────────────────────────────
const ratesColumns = computed(() => ([

  { title: t('sales.stavka2'), key: 'rateStr', dataIndex: 'rateStr', width: 100 },
  { title: t('sales.statusVto'), key: 'vtoStatus', dataIndex: 'vtoStatus', width: 110 },
  { title: t('sales.edIzm'), dataIndex: 'unitName', key: 'unitName', width: 90 },
  { title: t('sales.istochnik'), key: 'source', width: 110 },
]))
// ── Tree navigation ───────────────────────────────────────────────────────────
async function loadChildren(parentId = 0) {
  treeLoading.value = true
  try {
    const { data } = await tnvedApi.children(parentId)
    currentNodes.value = data
  } finally {
    treeLoading.value = false
  }
}

async function handleNodeClick(node: TnvedNodeDto) {
  selectNode(node)
  if (!node.isLast) {
    breadcrumb.value.push(node)
    await loadChildren(node.id)
  }
}

function selectNode(node: TnvedNodeDto) {
  selected.value = node
  deprecationWarning.value = undefined
  calcResult.value = null
  // Виды акциза и антидемпинга — у каждого кода свои.
  calcForm.value.exciseKind = null
  calcForm.value.antiDumpingKind = null
  detailTab.value = 'rates'
  loadDetail(node)
}

async function loadDetail(node: TnvedNodeDto) {
  detailLoading.value = true
  rates.value = []
  notes.value = null
  reference.value = null
  referenceNotFound.value = false
  exportReference.value = null
  exportReferenceNotFound.value = false
  try {
    const tasks: Promise<void>[] = []

    if (node.is10 || node.isLast) {
      tasks.push(
        tnvedApi.rates(node.code).then(r => { rates.value = r.data ? [r.data] : [] }).catch(() => {}),
        tnvedApi.getTransition(node.code).then(r => {
          deprecationWarning.value = r.data.isDeprecated
            ? { deprecatedCode: r.data.oldCode, replacementCodes: r.data.newCodes, sourceVersion: r.data.sourceVersion }
            : null
        }).catch(() => { deprecationWarning.value = null }),
      )
    } else {
      deprecationWarning.value = null
    }

    if (node.is10) {
      tasks.push(
        tnvedApi.reference(node.code)
          .then(r => { reference.value = r.data })
          .catch(() => { referenceNotFound.value = true }),
        tnvedApi.exportReference(node.code)
          .then(r => { exportReference.value = r.data })
          .catch(() => { exportReferenceNotFound.value = true }),
      )
    }

    if (node.code) {
      tasks.push(
        tnvedApi.notes(node.code).then(r => { notes.value = r.data }).catch(() => {}),
      )
    }

    await Promise.all(tasks)
  } finally {
    detailLoading.value = false
  }
}

function resetToRoot() {
  breadcrumb.value = []
  selected.value = null
  searchResults.value = null
  searchQuery.value = ''
  loadChildren(0)
}

function navigateToBreadcrumb(index: number) {
  const crumb = breadcrumb.value[index]
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
  selected.value = null
  loadChildren(crumb.id)
}

// ── Search ────────────────────────────────────────────────────────────────────
async function handleSearch(q: string) {
  if (!q.trim()) { searchResults.value = null; return }
  searchLoading.value = true
  try {
    const { data } = await tnvedApi.search(q.trim(), leafOnly.value)
    searchResults.value = data
  } finally {
    searchLoading.value = false
  }
}

function onSearchChange() {
  if (!searchQuery.value.trim()) { searchResults.value = null; return }
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => handleSearch(searchQuery.value), 400)
}

watch(searchQuery, val => { if (!val) searchResults.value = null })
watch(leafOnly, () => { if (searchQuery.value.trim()) handleSearch(searchQuery.value) })

// ── Calculator ────────────────────────────────────────────────────────────────
async function runCalculate() {
  if (!selected.value) return
  calcLoading.value = true
  calcResult.value = null
  try {
    const { data } = await tnvedApi.calculate({
      code: selected.value.code,
      customsValue: calcForm.value.customsValue,
      currencyCode: calcForm.value.currencyCode,
      weightKg: calcForm.value.weightKg,
      quantity: calcForm.value.quantity,
      engineVolumeCm3: calcForm.value.engineVolumeCm3,
      onDate: calcForm.value.onDate?.format('YYYY-MM-DD') ?? null,
      originCountry: calcForm.value.originCountry,
      exciseKind: calcForm.value.exciseKind,
      antiDumpingKind: calcForm.value.antiDumpingKind,
    })
    calcResult.value = data
  } finally {
    calcLoading.value = false
  }
}

// ── AI Classify ───────────────────────────────────────────────────────────────
async function runClassify() {
  if (!classifyDesc.value.trim()) return
  classifyLoading.value = true
  classifyResult.value = null
  try {
    const { data } = await tnvedApi.classify(classifyDesc.value.trim())
    classifyResult.value = data
  } finally {
    classifyLoading.value = false
  }
}

async function navigateToCode(code: string) {
  classifyModalOpen.value = false
  // Load the path for this code and navigate the tree
  try {
    const { data: path } = await tnvedApi.path(code)
    if (!path.length) return
    breadcrumb.value = []
    searchResults.value = null
    searchQuery.value = ''
    // Navigate to parent node
    const parentPath = path.slice(0, -1)
    const lastPath = path[path.length - 1]
    const parentId = parentPath.length ? parentPath[parentPath.length - 1].id : 0
    const { data: children } = await tnvedApi.children(parentId)
    currentNodes.value = children
    // Reconstruct breadcrumb as TnvedNodeDto stubs
    breadcrumb.value = parentPath.map(p => ({ id: p.id, code: p.code, treeName: p.treeName, name: p.treeName, parentId: null, is10: false, isLast: false, unitShort: null, nodeLevel: p.nodeLevel }))
    const found = children.find(n => n.code === lastPath.code)
    if (found) selectNode(found)
  } catch {
    // ignore
  }
}

function fmtKzt(val: number) {
  return new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(val)
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadChildren(0)
  tnvedApi.currencies().then(r => {
    currencies.value = r.data
    if (!calcForm.value.currencyCode && r.data.length) calcForm.value.currencyCode = 'USD'
  }).catch(() => {})
})
</script>

<style scoped>
.search-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.tree-card,
.detail-card {
  min-height: 520px;
}

.breadcrumb-bar {
  padding: 0 0 10px;
  border-bottom: 1px solid var(--atg-line);
  margin-bottom: 8px;
}

.breadcrumb-bar a {
  color: var(--atg-accent);
  cursor: pointer;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--atg-radius-sm);
  cursor: pointer;
  transition: background var(--atg-transition);
  border-bottom: 1px solid var(--atg-line);
}

.tree-node:last-child { border-bottom: none; }

.tree-node:hover { background: var(--atg-accent-soft); }

.tree-node.active {
  background: var(--atg-accent-soft);
  border-left: 3px solid var(--atg-accent);
}

.node-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--atg-accent-strong);
  min-width: 90px;
  flex-shrink: 0;
}

.node-label {
  font-size: 13px;
  color: var(--atg-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-arrow {
  color: var(--atg-muted);
  flex-shrink: 0;
  font-size: 10px;
}

.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 32px 0;
  font-size: 13px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
  border-radius: var(--atg-radius-sm);
  transition: background var(--atg-transition);
}

.search-result-item:hover,
.search-result-item.active { background: var(--atg-accent-soft); }

.search-result-item .node-name {
  font-size: 12px;
  color: var(--atg-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.detail-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--atg-ink);
  line-height: 1.4;
  margin-bottom: 2px;
}

.muted { color: var(--atg-muted); }

.calc-result { margin-top: 4px; }

.calc-notes {
  margin-top: 10px;
  font-size: 12px;
  color: var(--atg-muted);
  background: var(--atg-accent-soft);
  padding: 8px 12px;
  border-radius: var(--atg-radius-sm);
}

.notes-html {
  font-size: 13px;
  line-height: 1.6;
  color: var(--atg-text);
  max-height: 400px;
  overflow-y: auto;
}

.notes-html :deep(table) { border-collapse: collapse; width: 100%; font-size: 12px; }
.notes-html :deep(td),
.notes-html :deep(th) { border: 1px solid var(--atg-line); padding: 4px 8px; }
.calc-choice { margin-top: 8px; display: grid; gap: 2px; }
.calc-choice-label { font-size: 12px; color: var(--z-muted, #8c95a6); }
.eec-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 10px; font-size: 13px; }
</style>
