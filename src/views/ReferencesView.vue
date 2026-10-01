<template>
  <div class="crm-page">
    <PageHeader :kicker="t('admin.nastroykiSistemy')" :title="t('admin.spravochniki')" />

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="base" :tab="t('admin.stanciiIPosty')">
        <a-row :gutter="24">
          <a-col :span="12">
            <a-card :title="t('admin.stanciiNaznacheniya')">
              <template #extra><a-button type="primary" size="small" @click="openAdd('station')">{{ t('admin.dobavit') }}</a-button></template>
              <a-table :data-source="stations" :columns="columns" row-key="id" size="small" :pagination="false" />
            </a-card>
          </a-col>
          <a-col :span="12">
            <a-card :title="t('admin.tamozhennyePosty')">
              <template #extra>
                <a-button type="primary" size="small" @click="openAdd('post')">{{ t('admin.dobavit') }}</a-button>
              </template>
              <a-table :data-source="posts" :columns="columns" row-key="id" size="small" :pagination="false" />
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="classifiers" :tab="t('admin.klassifikatory')">
        <div class="eec-bar">
          <span class="muted">{{ t('admin.eekBarHint') }}</span>
          <a-popconfirm :title="t('admin.eekSyncConfirm')" :ok-text="t('admin.sveritSEek')" @confirm="runEecSync">
            <a-button :loading="eecBusy">{{ t('admin.sveritSEek') }}</a-button>
          </a-popconfirm>
        </div>
        <a-row :gutter="24">
          <a-col :span="7">
            <a-card :title="t('admin.klassifikatory')" size="small">
              <a-menu v-model:selectedKeys="selectedClassifier" mode="inline" @select="onSelectClassifier">
                <a-menu-item v-for="g in classifierGroups" :key="g.classifierCode">
                  {{ classifierTitle(g.classifierCode) }} ({{ g.count }})
                </a-menu-item>
              </a-menu>
            </a-card>
          </a-col>
          <a-col :span="17">
            <a-card :title="classifierTitle(selectedClassifier[0] ?? '')" size="small">
              <template #extra>
                <a-button type="primary" size="small" :disabled="!selectedClassifier.length" @click="openAddClassifier"> {{ t('admin.dobavitKod') }} </a-button>
              </template>
              <a-table
                class="ref-table"
                :data-source="classifierItems"
                :columns="classifierColumns"
                row-key="id"
                size="small"
                :pagination="false"
              />
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="kato" :tab="t('admin.kato')">
        <a-card :title="t('admin.katoKlassifikatorAdministrativnoTerritorialnyh')" size="small">
          <template #extra>
            <a-space>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="onKatoFile">
                <a-button size="small" :loading="katoBusy">{{ t('admin.zagruzitXlsx') }}</a-button>
              </a-upload>
              <a-button type="primary" size="small" :loading="katoBusy" @click="syncKato">{{ t('admin.obnovitSStatGov') }}</a-button>
            </a-space>
          </template>
          <a-descriptions size="small" :column="1" bordered>
            <a-descriptions-item :label="t('admin.kodovVBaze')">{{ katoStatus?.total ?? '—' }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ katoStatus?.updatedAtUtc ? new Date(katoStatus.updatedAtUtc).toLocaleString('ru-RU') : '—' }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.istochnik')">
              <a :href="katoStatus?.sourceUrl" target="_blank" rel="noopener">{{ katoStatus?.sourceUrl }}</a>
              <div class="muted">{{ t('admin.byuroNacionalnoyStatistikiFayl') }}</div>
            </a-descriptions-item>
          </a-descriptions>
          <div class="kato-try">
            <div class="muted">{{ t('admin.proverkaPoiskaKakV') }}</div>
            <KatoSelect v-model:value="katoProbe" :placeholder="t('admin.nachniteVvoditNazvanieIli')" style="max-width: 520px" />
          </div>
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="warehouses" :tab="t('admin.svhTs')">
        <a-card :title="t('admin.svhTsTitle')" size="small">
          <template #extra>
            <a-space>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onWarehouseFile('svh', f)">
                <a-button size="small" :loading="whBusy">{{ t('admin.svhTsNsiUploadSvh') }}</a-button>
              </a-upload>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onWarehouseFile('customs_warehouse', f)">
                <a-button size="small" :loading="whBusy">{{ t('admin.svhTsNsiUploadTs') }}</a-button>
              </a-upload>
              <a-button type="primary" size="small" :loading="whBusy" @click="refreshFromKeden">{{ t('admin.kedenRefresh') }}</a-button>
            </a-space>
          </template>
          <a-descriptions size="small" :column="1" bordered>
            <a-descriptions-item :label="t('admin.svhTsKindSvh')">{{ whCount('svh') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.svhTsKindTs')">{{ whCount('customs_warehouse') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ whUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted" style="margin-top: 8px">{{ t('admin.svhTsHint') }}</div>
        </a-card>
        <!-- ТРОИС: реестр ОИС из КЕДЕН — сверка торгового знака в ДТ (гр.31) -->
        <a-card :title="t('admin.troisTitle')" size="small" style="margin-top: 12px">
          <template #extra>
            <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="onTroisFile">
              <a-button size="small" :loading="troisBusy">{{ t('admin.troisUpload') }}</a-button>
            </a-upload>
          </template>
          <a-descriptions size="small" :column="1" bordered>
            <a-descriptions-item :label="t('admin.troisTotal')">{{ troisStatus?.total ?? 0 }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.troisActive')">{{ troisStatus?.active ?? 0 }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ troisUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted" style="margin: 8px 0">{{ t('admin.troisHint') }}</div>
          <a-input-search v-model:value="troisQuery" allow-clear :placeholder="t('admin.troisSearchPlaceholder')"
            style="max-width: 520px" :loading="troisSearching" @search="searchTrois" @input="onTroisQuery" />
          <a-table v-if="troisQuery.trim()" :data-source="troisRows" :columns="troisColumns" :pagination="false" size="small"
            row-key="id" style="margin-top: 8px" :locale="{ emptyText: t('admin.troisNothing') }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'validUntil'">{{ troisDate(record.validUntil) }}</template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? t('admin.troisTagActive') : t('admin.troisTagInactive') }}</a-tag>
              </template>
              <template v-else-if="column.key === 'objectName'">{{ record.objectName || '—' }}</template>
            </template>
          </a-table>
        </a-card>
        <!-- НСИ КГД: БИН → код таможенного органа (подсказка «Таможенный орган (местонахождение)» гр.30) -->
        <a-card :title="t('admin.svhTsNsiTitle')" size="small" style="margin-top: 12px">
          <template #extra>
            <a-space>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onNsiFile('svh', f)">
                <a-button size="small" :loading="nsiBusy">{{ t('admin.svhTsNsiUploadSvh') }}</a-button>
              </a-upload>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onNsiFile('customs_warehouse', f)">
                <a-button size="small" :loading="nsiBusy">{{ t('admin.svhTsNsiUploadTs') }}</a-button>
              </a-upload>
              <a-button type="primary" size="small" :loading="nsiBusy" @click="importNsi">{{ t('admin.svhTsNsiImport') }}</a-button>
            </a-space>
          </template>
          <a-descriptions size="small" :column="1" bordered>
            <a-descriptions-item :label="t('admin.svhTsKindSvh')">{{ nsiCount('svh') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.svhTsKindTs')">{{ nsiCount('customs_warehouse') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ nsiUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted" style="margin-top: 8px">{{ t('admin.svhTsNsiHint') }}</div>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <a-modal v-model:open="eecOpen" :title="t('admin.eekSyncTitle')" width="780px" :footer="null">
      <p class="muted">{{ t('admin.eekSyncHint') }}</p>
      <a-table :data-source="eecResults" :columns="eecColumns" row-key="target" size="small" :pagination="false" :scroll="{ x: 690, y: 420 }" />
    </a-modal>

    <a-modal v-model:open="modalOpen" :title="t('admin.dobavit')" @ok="save">
      <a-input v-model:value="nameInput" :placeholder="t('admin.nazvanie')" />
    </a-modal>

    <a-modal v-model:open="classifierModalOpen" :title="t('admin.dobavitKod')" @ok="saveClassifier">
      <a-form layout="vertical">
        <a-form-item :label="t('admin.kod')"><a-input v-model:value="classifierCodeInput" /></a-form-item>
        <a-form-item :label="t('admin.naimenovanie')"><a-input v-model:value="classifierNameInput" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, onBeforeUnmount, h, computed } from 'vue'
import { message, Button } from 'ant-design-vue'
import { referencesApi, type EecSyncResult } from '@/api/references'
import type { RefItem, ClassifierItem, ClassifierGroup } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import PageHeader from '@/components/PageHeader.vue'
import KatoSelect from '@/components/KatoSelect.vue'
import { katoApi, type KatoStatus } from '@/api/kato'
import { troisApi, troisDate, type TroisItem, type TroisStatus } from '@/api/trois'
import { warehouseRegistryApi, warehouseNsiApi, kedenRegistriesApi, type KedenRefreshResult, type WarehouseKindStatus, type WarehouseKind, type WarehouseNsiImportKindResult, type WarehouseImportKindResult } from '@/api/warehouseRegistry'

const { t } = useI18n()

const stations = ref<RefItem[]>([])
const posts = ref<RefItem[]>([])
const modalOpen = ref(false)
const currentKind = ref<'station' | 'post'>('station')
const nameInput = ref('')

const columns = computed(() => ([

  { title: t('admin.nazvanie'), dataIndex: 'name', key: 'name' },
  {
    title: t('admin.deystviya'), key: 'actions',
    customRender: ({ record }: { record: RefItem }) =>
      h(Button, { size: 'small', type: 'link', danger: true, onClick: () => remove(record) }, () => t('admin.deaktivirovat')),
  },
]))
const load = async () => {
  stations.value = await referencesApi.listStations()
  posts.value = await referencesApi.listCustomsPosts()
}
const openAdd = (kind: 'station' | 'post') => { currentKind.value = kind; nameInput.value = ''; modalOpen.value = true }
const save = async () => {
  if (!nameInput.value.trim()) { message.error(t('admin.vvediteNazvanie')); return }
  try {
    if (currentKind.value === 'station') await referencesApi.createStation(nameInput.value.trim())
    else await referencesApi.createCustomsPost(nameInput.value.trim())
    modalOpen.value = false
    await load(); message.success(t('admin.sohraneno'))
  } catch { message.error(t('admin.oshibkaSohraneniya')) }
}
const remove = async (record: RefItem) => {
  try {
    if (stations.value.some((s) => s.id === record.id)) await referencesApi.deleteStation(record.id)
    else await referencesApi.deleteCustomsPost(record.id)
    await load()
  } catch { message.error(t('admin.oshibka')) }
}

const activeTab = ref('base')
const classifierGroups = ref<ClassifierGroup[]>([])
const classifierItems = ref<ClassifierItem[]>([])
const selectedClassifier = ref<string[]>([])
const classifierModalOpen = ref(false)
const classifierCodeInput = ref('')
const classifierNameInput = ref('')
const classifiersStore = useClassifiersStore()

// Человекочитаемые названия. Ключи — те же, что в сидах DatabaseExtensions.
const CLASSIFIER_TITLES = computed((): Record<string, string> => ({

  '2004': t('admin.n2004VidyTransporta'),
  '2005': t('admin.n2005MetodyOpredeleniyaTamozhennoy'),
  '2008': t('admin.n2008Preferencii'),
  'pref-fee': t('admin.prefFee'),
  'pref-duty': t('admin.prefDuty'),
  'pref-excise': t('admin.prefExcise'),
  'pref-vat': t('admin.prefVat'),
  '2013': t('admin.n2013VidyUpakovki'),
  '2024': t('admin.n2024TipyTransportnyhSredstv'),
  'tax-modes': t('admin.vidyPlatezhaGr47'),
  'rate-kinds': t('admin.tipStavkiGr47'),
  'payment-features': t('admin.osobennostPlatezha'),
  'payment-methods': t('admin.sposobUplaty'),
  'transaction-natures': t('admin.harakterSdelkiGr24'),
  'goods-locations': t('admin.mestoNahozhdeniyaTovarovGr30'),
  'rate-types': t('admin.tipStavok'),
  '2009': t('admin.eek2009'),
  'customs-procedures': t('admin.eekProcedures'),
  'movement-features': t('admin.eekMovementFeatures'),
  'declaring-features': t('admin.eekDeclaringFeatures'),
  'incoterms': t('admin.eekIncoterms'),
  'vehicle-marks': t('admin.eekVehicleMarks'),
  'okei-units': t('admin.eekOkeiUnits'),
  'customs-posts': t('admin.eekCustomsPosts'),
}))
const classifierTitle = (code: string) => CLASSIFIER_TITLES.value[code] ?? code

// Сверка с ЕЭК: добавляет недостающие коды, исключённые скрывает; итог — таблицей по справочникам.
const eecBusy = ref(false)
const eecOpen = ref(false)
const eecResults = ref<EecSyncResult[]>([])
const eecColumns = computed(() => ([
  { title: t('admin.eekColTarget'), key: 'target', width: 230, customRender: ({ record }: { record: EecSyncResult }) => classifierTitle(record.target) },
  { title: t('admin.eekColSource'), dataIndex: 'source', key: 'source', width: 90 },
  { title: t('admin.eekColTotal'), dataIndex: 'sourceTotal', key: 'sourceTotal', width: 90, align: 'right' as const },
  { title: t('admin.eekColAdded'), dataIndex: 'added', key: 'added', width: 90, align: 'right' as const },
  { title: t('admin.eekColHidden'), dataIndex: 'deactivated', key: 'deactivated', width: 80, align: 'right' as const },
  { title: t('admin.eekColError'), dataIndex: 'error', key: 'error', width: 110, customRender: ({ record }: { record: EecSyncResult }) => record.error ?? '' },
]))
const runEecSync = async () => {
  eecBusy.value = true
  try {
    eecResults.value = await referencesApi.syncEec()
    const added = eecResults.value.reduce((s, r) => s + r.added, 0)
    const hidden = eecResults.value.reduce((s, r) => s + r.deactivated, 0)
    const failed = eecResults.value.filter((r) => r.error).length
    if (failed) message.warning(t('admin.eekSyncPartial', { added, hidden, failed }))
    else message.success(t('admin.eekSyncDone', { added, hidden }))
    eecOpen.value = true
    classifiersStore.invalidate()
    await loadClassifierGroups()
    await loadClassifierItems()
  } catch { /* текст ошибки показал общий перехватчик */ }
  finally { eecBusy.value = false }
}

const classifierColumns = computed(() => ([

  { title: t('admin.kod'), dataIndex: 'code', key: 'code', width: 120 },
  { title: t('admin.naimenovanie'), dataIndex: 'nameRu', key: 'nameRu', width: 420 },
  {
    title: t('admin.deystviya'), key: 'actions', width: 140,
    customRender: ({ record }: { record: ClassifierItem }) =>
      h(Button, { size: 'small', type: 'link', danger: true, onClick: () => removeClassifier(record) }, () => t('admin.deaktivirovat')),
  },
]))
const loadClassifierGroups = async () => {
  classifierGroups.value = await referencesApi.listClassifierGroups()
  if (!selectedClassifier.value.length && classifierGroups.value.length) {
    selectedClassifier.value = [classifierGroups.value[0].classifierCode]
    await loadClassifierItems()
  }
}

const loadClassifierItems = async () => {
  const code = selectedClassifier.value[0]
  if (!code) return
  classifierItems.value = await referencesApi.listClassifiers(code)
}

// Берём код из события, а не из ref, чтобы не зависеть от порядка обновления v-model.
const onSelectClassifier = async ({ key }: { key: string | number }) => {
  selectedClassifier.value = [String(key)]
  try {
    await loadClassifierItems()
  } catch { message.error(t('admin.neUdalosZagruzitKody')) }
}

const openAddClassifier = () => {
  classifierCodeInput.value = ''
  classifierNameInput.value = ''
  classifierModalOpen.value = true
}

const saveClassifier = async () => {
  const code = classifierCodeInput.value.trim()
  const name = classifierNameInput.value.trim()
  const classifier = selectedClassifier.value[0]
  if (!code || !name) { message.error(t('admin.zapolniteKodINaimenovanie')); return }
  try {
    await referencesApi.createClassifier(classifier, code, name)
    classifierModalOpen.value = false
    classifiersStore.invalidate(classifier)
    await loadClassifierItems()
    await loadClassifierGroups()
    message.success(t('admin.kodDobavlen'))
  } catch {
    message.error(t('admin.neUdalosDobavitKod'))
  }
}

const removeClassifier = async (record: ClassifierItem) => {
  try {
    await referencesApi.deleteClassifier(record.id)
    classifiersStore.invalidate(record.classifierCode)
    await loadClassifierItems()
    await loadClassifierGroups()
    message.success(t('admin.kodDeaktivirovan'))
  } catch {
    message.error(t('admin.neUdalosDeaktivirovatKod'))
  }
}

// ── КАТО (официальный классификатор, ref_kato) ──
const katoStatus = ref<KatoStatus | null>(null)
const katoBusy = ref(false)
const katoProbe = ref<string | null>(null)
const loadKatoStatus = async () => { try { katoStatus.value = await katoApi.status() } catch { /* вкладка необязательная */ } }
const reportKato = (r: { total: number; added: number; updated: number; removed: number }) =>
  message.success(t('admin.katoSyncResult', { total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
const syncKato = async () => {
  katoBusy.value = true
  try { reportKato(await katoApi.sync()); await loadKatoStatus() }
  catch { /* текст ошибки уже показал общий перехватчик — аудит 1.1 */ }
  finally { katoBusy.value = false }
}
const onKatoFile = async (file: File) => {
  katoBusy.value = true
  try { reportKato(await katoApi.import(file)); await loadKatoStatus() }
  catch { /* текст ошибки уже показал общий перехватчик — аудит 1.1 */ }
  finally { katoBusy.value = false }
  return false
}

// ── Реестры СВХ и таможенных складов КГД (ref_warehouse_registry) ──
const whStatus = ref<WarehouseKindStatus[]>([])
const whBusy = ref(false)
const whCount = (kind: WarehouseKind) => whStatus.value.find((k) => k.kind === kind)?.total ?? 0
const whUpdated = computed(() => {
  const times = whStatus.value.map((k) => k.importedAtUtc).filter((x): x is string => !!x).sort()
  return times.length ? new Date(times[times.length - 1]).toLocaleString('ru-RU') : '—'
})
const loadWarehouseStatus = async () => { try { whStatus.value = (await warehouseRegistryApi.status()).kinds } catch { /* вкладка необязательная */ } }
const reportWarehouses = (kinds: WarehouseImportKindResult[]) => {
  for (const k of kinds) {
    const kind = k.kind === 'svh' ? t('admin.svhTsKindSvh') : t('admin.svhTsKindTs')
    if (k.error) message.warning(t('admin.svhTsImportError', { kind }))
    else if (k.removed) message.success(t('admin.kedenRefreshResult', { registry: kind, total: k.total, added: k.added, updated: k.updated, removed: k.removed }))
    else message.success(t('admin.svhTsImportResult', { kind, total: k.total, added: k.added, updated: k.updated }))
  }
}
// Основной путь: сервер сам скачивает публичные xlsx СВХ, ТС и ТРОИС с keden.kgd.gov.kz (доступен только с прод-сервера).
const registryLabel = (r: string) => r === 'svh' ? t('admin.svhTsKindSvh') : r === 'trois' ? t('admin.troisRegistry') : t('admin.svhTsKindTs')
const refreshFromKeden = async () => {
  whBusy.value = true
  try {
    const { registries } = await kedenRegistriesApi.refresh()
    reportKeden(registries)
    await Promise.all([loadWarehouseStatus(), loadTroisStatus()])
  }
  catch { /* текст ошибки уже показал общий перехватчик — аудит 1.1 */ }
  finally { whBusy.value = false }
}
const reportKeden = (list: KedenRefreshResult[]) => {
  for (const r of list) {
    const registry = registryLabel(r.registry)
    if (r.error) message.warning(t('admin.kedenRefreshError', { registry, error: r.error }))
    else message.success(t('admin.kedenRefreshResult', { registry, total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
  }
}
const onWarehouseFile = async (kind: WarehouseKind, file: File) => {
  whBusy.value = true
  try { reportWarehouses((await warehouseRegistryApi.importFile(kind, file)).kinds); await loadWarehouseStatus() }
  catch { /* текст ошибки уже показал общий перехватчик */ }
  finally { whBusy.value = false }
  return false // не даём a-upload слать файл самому
}

// ── ТРОИС (ref_trois): реестр ОИС из КЕДЕН ──
const troisStatus = ref<TroisStatus | null>(null)
const troisBusy = ref(false)
const troisUpdated = computed(() => troisStatus.value?.importedAtUtc ? new Date(troisStatus.value.importedAtUtc).toLocaleString('ru-RU') : '—')
const loadTroisStatus = async () => { try { troisStatus.value = await troisApi.status() } catch { /* вкладка необязательная */ } }
const onTroisFile = async (file: File) => {
  troisBusy.value = true
  try {
    const r = await troisApi.importFile(file)
    message.success(t('admin.troisImportResult', { total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
    await loadTroisStatus()
  }
  catch { /* текст ошибки уже показал общий перехватчик */ }
  finally { troisBusy.value = false }
  return false
}
const troisQuery = ref('')
const troisRows = ref<TroisItem[]>([])
const troisSearching = ref(false)
let troisTimer: number | undefined
let troisSeq = 0
const searchTrois = async () => {
  const q = troisQuery.value.trim()
  if (!q) { troisRows.value = []; return }
  const seq = ++troisSeq
  troisSearching.value = true
  try { const rows = await troisApi.search(q); if (seq === troisSeq) troisRows.value = rows }
  catch { if (seq === troisSeq) troisRows.value = [] }
  finally { if (seq === troisSeq) troisSearching.value = false }
}
const onTroisQuery = () => { window.clearTimeout(troisTimer); troisTimer = window.setTimeout(searchTrois, 350) }
onBeforeUnmount(() => window.clearTimeout(troisTimer))
const troisColumns = computed(() => [
  { title: t('admin.troisColNumber'), dataIndex: 'registrationNumber', key: 'registrationNumber', width: 150 },
  { title: t('admin.troisColName'), dataIndex: 'objectName', key: 'objectName', width: 200 },
  { title: t('admin.troisColHolder'), dataIndex: 'rightHolder', key: 'rightHolder', ellipsis: true },
  { title: t('admin.troisColUntil'), dataIndex: 'validUntil', key: 'validUntil', width: 120 },
  { title: t('admin.troisColStatus'), key: 'status', width: 120 },
])

// ── НСИ КГД по СВХ/ТС: коды таможенных органов (ref_warehouse_nsi) ──
const nsiStatus = ref<WarehouseKindStatus[]>([])
const nsiBusy = ref(false)
const nsiCount = (kind: WarehouseKind) => nsiStatus.value.find((k) => k.kind === kind)?.total ?? 0
const nsiUpdated = computed(() => {
  const times = nsiStatus.value.map((k) => k.importedAtUtc).filter((x): x is string => !!x).sort()
  return times.length ? new Date(times[times.length - 1]).toLocaleString('ru-RU') : '—'
})
const loadNsiStatus = async () => { try { nsiStatus.value = (await warehouseNsiApi.status()).kinds } catch { /* вкладка необязательная */ } }
const reportNsi = (kinds: WarehouseNsiImportKindResult[]) => {
  for (const k of kinds) {
    const kind = k.kind === 'svh' ? t('admin.svhTsKindSvh') : t('admin.svhTsKindTs')
    if (k.error) message.warning(t('admin.svhTsNsiError', { kind }))
    else message.success(t('admin.svhTsNsiResult', { kind, total: k.total }))
  }
}
const importNsi = async () => {
  nsiBusy.value = true
  try { reportNsi((await warehouseNsiApi.importFromKgd()).kinds); await loadNsiStatus() }
  catch { /* текст ошибки уже показал общий перехватчик — аудит 1.1 */ }
  finally { nsiBusy.value = false }
}
const onNsiFile = async (kind: WarehouseKind, file: File) => {
  nsiBusy.value = true
  try { reportNsi((await warehouseNsiApi.importFile(kind, file)).kinds); await loadNsiStatus() }
  catch { /* текст ошибки уже показал общий перехватчик — аудит 1.1 */ }
  finally { nsiBusy.value = false }
  return false
}

// Вкладки грузятся независимо: падение одной не должно оставлять другую пустой без объяснения.
onMounted(async () => {
  try {
    await load()
  } catch { message.error(t('admin.neUdalosZagruzitStancii')) }
  try {
    await loadClassifierGroups()
  } catch { message.error(t('admin.neUdalosZagruzitKlassifikatory')) }
  await loadKatoStatus()
  await loadWarehouseStatus()
  await loadTroisStatus()
  await loadNsiStatus()
})
</script>

<style scoped>
.muted { color: var(--atg-muted, #95a1b7); font-size: 12px; }
.kato-try { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.eec-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 12px; }
</style>
