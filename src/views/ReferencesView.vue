<template>
  <div class="crm-page">
    <PageHeader :kicker="t('admin.nastroykiSistemy')" :title="t('admin.spravochniki')" />

    <!-- Список справочников слева, выбранный — справа (аудит дизайна 01.10): раньше четыре вкладки
         с россыпью карточек, у каждой свои кнопки. -->
    <div class="refs-layout">
      <nav class="refs-nav crm-shell-card">
        <template v-for="g in navGroups" :key="g.title">
          <div class="refs-nav-group">{{ g.title }}</div>
          <a
            v-for="it in g.items" :key="it.key" class="refs-nav-item" :class="{ active: active === it.key }"
            @click.prevent="selectRef(it.key)"
          >
            <span class="refs-nav-title">{{ it.title }}</span>
            <span v-if="it.count != null" class="refs-nav-count">{{ it.count }}</span>
          </a>
        </template>
      </nav>

      <section class="refs-main crm-shell-card">
        <header class="refs-head">
          <div class="refs-head-text">
            <h2 class="refs-title">{{ activeTitle }}</h2>
            <p v-if="activeHint" class="refs-hint">{{ activeHint }}</p>
          </div>
          <div class="refs-actions">
            <template v-if="isList">
              <a-input v-model:value="q" allow-clear :placeholder="t('admin.refsPoisk')" class="refs-search">
                <template #prefix><SearchOutlined /></template>
              </a-input>
              <a-popconfirm v-if="active.startsWith('cls:')" :title="t('admin.eekSyncConfirm')" :ok-text="t('admin.sveritSEek')" @confirm="runEecSync">
                <a-button :loading="eecBusy">{{ t('admin.sveritSEek') }}</a-button>
              </a-popconfirm>
              <a-button type="primary" @click="addCurrent">{{ active.startsWith('cls:') ? t('admin.dobavitKod') : t('admin.dobavit') }}</a-button>
            </template>
            <a-input v-else-if="active === 'gr33'" v-model:value="q" allow-clear :placeholder="t('admin.refsPoisk')" class="refs-search">
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <template v-else-if="active === 'kato'">
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="onKatoFile">
                <a-button :loading="katoBusy">{{ t('admin.zagruzitXlsx') }}</a-button>
              </a-upload>
              <a-button type="primary" :loading="katoBusy" @click="syncKato">{{ t('admin.obnovitSStatGov') }}</a-button>
            </template>
            <template v-else-if="active === 'warehouses'">
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onWarehouseFile('svh', f)">
                <a-button :loading="whBusy">{{ t('admin.svhTsNsiUploadSvh') }}</a-button>
              </a-upload>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onWarehouseFile('customs_warehouse', f)">
                <a-button :loading="whBusy">{{ t('admin.svhTsNsiUploadTs') }}</a-button>
              </a-upload>
              <a-button type="primary" :loading="whBusy" @click="refreshFromKeden">{{ t('admin.kedenRefresh') }}</a-button>
            </template>
            <template v-else-if="active === 'trois'">
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="onTroisFile">
                <a-button :loading="troisBusy">{{ t('admin.troisUpload') }}</a-button>
              </a-upload>
            </template>
            <template v-else-if="active === 'nsi'">
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onNsiFile('svh', f)">
                <a-button :loading="nsiBusy">{{ t('admin.svhTsNsiUploadSvh') }}</a-button>
              </a-upload>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="(f: File) => onNsiFile('customs_warehouse', f)">
                <a-button :loading="nsiBusy">{{ t('admin.svhTsNsiUploadTs') }}</a-button>
              </a-upload>
              <a-button type="primary" :loading="nsiBusy" @click="importNsi">{{ t('admin.svhTsNsiImport') }}</a-button>
            </template>
          </div>
        </header>

        <!-- Станции, посты, классификаторы ЕЭК — таблица с поиском -->
        <a-table
          v-if="isList"
          class="crm-table-cards"
          :data-source="listRows"
          :columns="active.startsWith('cls:') ? classifierColumns : columns"
          row-key="id"
          size="small"
          :pagination="listRows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false"
        />

        <template v-else-if="active === 'kato'">
          <a-descriptions size="small" :column="1" bordered class="refs-desc">
            <a-descriptions-item :label="t('admin.kodovVBaze')">{{ katoStatus?.total ?? '—' }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ katoStatus?.updatedAtUtc ? new Date(katoStatus.updatedAtUtc).toLocaleString('ru-RU') : '—' }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.istochnik')">
              <a :href="katoStatus?.sourceUrl" target="_blank" rel="noopener">{{ katoStatus?.sourceUrl }}</a>
              <div class="muted">{{ t('admin.byuroNacionalnoyStatistikiFayl') }}</div>
            </a-descriptions-item>
          </a-descriptions>
          <div class="kato-try">
            <div class="muted">{{ t('admin.proverkaPoiskaKakV') }}</div>
            <KatoSelect v-model:value="katoProbe" :placeholder="t('admin.nachniteVvoditNazvanieIli')" class="refs-probe" />
          </div>
        </template>

        <template v-else-if="active === 'warehouses'">
          <a-descriptions size="small" :column="1" bordered class="refs-desc">
            <a-descriptions-item :label="t('admin.svhTsKindSvh')">{{ whCount('svh') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.svhTsKindTs')">{{ whCount('customs_warehouse') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ whUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted refs-note">{{ t('admin.svhTsHint') }}</div>
        </template>

        <!-- ТРОИС: реестр ОИС из КЕДЕН — сверка торгового знака в ДТ (гр.31) -->
        <template v-else-if="active === 'trois'">
          <a-descriptions size="small" :column="1" bordered class="refs-desc">
            <a-descriptions-item :label="t('admin.troisTotal')">{{ troisStatus?.total ?? 0 }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.troisActive')">{{ troisStatus?.active ?? 0 }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ troisUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted refs-note">{{ t('admin.troisHint') }}</div>
          <a-input-search v-model:value="troisQuery" allow-clear :placeholder="t('admin.troisSearchPlaceholder')"
            class="refs-probe" :loading="troisSearching" @search="searchTrois" @input="onTroisQuery" />
          <a-table v-if="troisQuery.trim()" :data-source="troisRows" :columns="troisColumns" :pagination="false" size="small"
            row-key="id" class="refs-trois crm-table-cards" :locale="{ emptyText: t('admin.troisNothing') }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'validUntil'">{{ troisDate(record.validUntil) }}</template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? t('admin.troisTagActive') : t('admin.troisTagInactive') }}</a-tag>
              </template>
              <template v-else-if="column.key === 'objectName'">{{ record.objectName || '—' }}</template>
            </template>
          </a-table>
        </template>

        <!-- Гр.33: коды запретов и ограничений. В КЕДЕН у каждого ТН ВЭД свой набор кодов (в ДТ подсказываются
             сами), общего списка с названиями КЕДЕН не публикует — поэтому показываем и коды без названия. -->
        <template v-else-if="active === 'gr33'">
          <a-alert v-if="gr33Missing.length" type="warning" show-icon class="refs-note">
            <template #message>{{ t('admin.gr33MissingTitle', { n: gr33Missing.length }) }}</template>
            <template #description>
              <span v-for="u in gr33Missing" :key="u.code" class="gr33-missing">
                <b>{{ u.code }}</b> — {{ t('admin.gr33TnvedCount', { n: u.tnvedCount }) }}<template v-if="u.sampleTnved">, {{ t('admin.gr33Example', { code: u.sampleTnved }) }}</template>
              </span>
            </template>
          </a-alert>
          <a-table class="crm-table-cards" :data-source="gr33Rows" :columns="gr33Columns" row-key="code" size="small"
            :loading="gr33Loading" :pagination="{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span v-if="record.name">{{ record.name }}</span>
                <a-tag v-else color="orange">{{ t('admin.gr33NoName') }}</a-tag>
              </template>
              <template v-else-if="column.key === 'keden'">
                <span v-if="record.tnvedCount">{{ record.tnvedCount }}</span>
                <span v-else class="muted">—</span>
              </template>
            </template>
          </a-table>
          <div class="muted refs-note">{{ t('admin.gr33Hint') }}</div>
        </template>

        <!-- НСИ КГД: БИН → код таможенного органа (подсказка «Таможенный орган (местонахождение)» гр.30) -->
        <template v-else-if="active === 'nsi'">
          <a-descriptions size="small" :column="1" bordered class="refs-desc">
            <a-descriptions-item :label="t('admin.svhTsKindSvh')">{{ nsiCount('svh') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.svhTsKindTs')">{{ nsiCount('customs_warehouse') }}</a-descriptions-item>
            <a-descriptions-item :label="t('admin.obnovleno')">{{ nsiUpdated }}</a-descriptions-item>
          </a-descriptions>
          <div class="muted refs-note">{{ t('admin.svhTsNsiHint') }}</div>
        </template>
      </section>
    </div>

    <a-modal v-model:open="eecOpen" :title="t('admin.eekSyncTitle')" width="760px" :footer="null">
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
import { Button, Popconfirm } from 'ant-design-vue'
import { message } from '@/ui/message'
import { SearchOutlined } from '@ant-design/icons-vue'
import { referencesApi, type EecSyncResult } from '@/api/references'
import type { RefItem, ClassifierItem, ClassifierGroup } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import PageHeader from '@/components/PageHeader.vue'
import KatoSelect from '@/components/KatoSelect.vue'
import { katoApi, type KatoStatus } from '@/api/kato'
import { prohibitionCodesApi, type ProhibitionCodeItem, type ProhibitionCodeUsage } from '@/api/prohibitionCodes'
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
    title: t('admin.deystviya'), key: 'actions', width: 180,
    customRender: ({ record }: { record: RefItem }) =>
      h(Popconfirm, { title: t('admin.refsDeactivateConfirm'), okText: t('admin.deaktivirovat'), okButtonProps: { danger: true }, onConfirm: () => remove(record) },
        () => h(Button, { size: 'small', type: 'link', danger: true }, () => t('admin.deaktivirovat'))),
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

// Выбранный справочник: station | post | cls:<код классификатора> | kato | warehouses | trois | nsi
const active = ref('station')
const q = ref('')
const isList = computed(() => active.value === 'station' || active.value === 'post' || active.value.startsWith('cls:'))
const selectRef = async (key: string) => {
  active.value = key
  q.value = ''
  if (key === 'gr33') await loadGr33()
  if (key.startsWith('cls:')) await onSelectClassifier({ key: key.slice(4) })
}
const listRows = computed((): Array<RefItem | ClassifierItem> => {
  const rows: Array<RefItem | ClassifierItem> = active.value === 'station' ? stations.value
    : active.value === 'post' ? posts.value : classifierItems.value
  const term = q.value.trim().toLowerCase()
  if (!term) return rows
  return rows.filter((r) => [('name' in r ? r.name : ''), ('code' in r ? r.code : ''), ('nameRu' in r ? r.nameRu : '')]
    .some((v) => (v ?? '').toString().toLowerCase().includes(term)))
})
const addCurrent = () => {
  if (active.value === 'station' || active.value === 'post') openAdd(active.value)
  else openAddClassifier()
}
const navGroups = computed(() => [
  { title: t('admin.refsGroupBase'), items: [
    { key: 'station', title: t('admin.stanciiNaznacheniya'), count: stations.value.length },
    { key: 'post', title: t('admin.tamozhennyePosty'), count: posts.value.length },
  ] },
  { title: t('admin.refsGroupEec'), items: classifierGroups.value.map((g) => ({
    key: `cls:${g.classifierCode}`, title: classifierTitle(g.classifierCode), count: g.count as number | null,
  })) },
  { title: t('admin.refsGroupRegistries'), items: [
    { key: 'gr33', title: t('admin.gr33Title'), count: gr33Ref.value.length || null },
    { key: 'kato', title: t('admin.kato'), count: katoStatus.value?.total ?? null },
    { key: 'warehouses', title: t('admin.svhTsTitle'), count: whCount('svh') + whCount('customs_warehouse') || null },
    { key: 'trois', title: t('admin.troisTitle'), count: troisStatus.value?.active ?? null },
    { key: 'nsi', title: t('admin.svhTsNsiTitle'), count: (nsiCount('svh') + nsiCount('customs_warehouse')) || null },
  ] },
])
const activeTitle = computed(() => navGroups.value.flatMap((g) => g.items).find((i) => i.key === active.value)?.title ?? '')
const activeHint = computed(() => active.value.startsWith('cls:') ? t('admin.eekBarHint')
  : active.value === 'kato' ? t('admin.katoKlassifikatorAdministrativnoTerritorialnyh')
  : active.value === 'gr33' ? t('admin.gr33Sub') : '')

// Гр.33: справочник + какие коды КЕДЕН присылает по ТН ВЭД (кэш подсказок).
const gr33Ref = ref<ProhibitionCodeItem[]>([])
const gr33Usage = ref<ProhibitionCodeUsage[]>([])
const gr33Loading = ref(false)
const loadGr33 = async () => {
  gr33Loading.value = true
  try {
    const [refs, usage] = await Promise.all([prohibitionCodesApi.list(), prohibitionCodesApi.kedenUsage().catch(() => [])])
    gr33Ref.value = refs; gr33Usage.value = usage
  } catch { message.error(t('admin.oshibka')) } finally { gr33Loading.value = false }
}
const gr33Missing = computed(() => gr33Usage.value.filter((u) => !u.inReference))
const gr33Rows = computed(() => {
  const usage = new Map(gr33Usage.value.map((u) => [u.code, u.tnvedCount]))
  const rows = [
    ...gr33Ref.value.map((c) => ({ code: c.code, name: c.name, category: `${c.categoryCode} — ${c.categoryName}`, tnvedCount: usage.get(c.code) ?? 0 })),
    ...gr33Missing.value.map((u) => ({ code: u.code, name: '', category: '', tnvedCount: u.tnvedCount })),
  ].sort((a, b) => a.code.localeCompare(b.code))
  const term = q.value.trim().toLowerCase()
  return term ? rows.filter((r) => `${r.code} ${r.name} ${r.category}`.toLowerCase().includes(term)) : rows
})
const gr33Columns = computed(() => [
  { title: t('admin.kod'), dataIndex: 'code', key: 'code', width: 90 },
  { title: t('admin.naimenovanie'), dataIndex: 'name', key: 'name' },
  { title: t('admin.gr33ColCategory'), dataIndex: 'category', key: 'category', width: 260 },
  { title: t('admin.gr33ColKeden'), key: 'keden', width: 120, align: 'right' as const },
])
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
  'certification-kinds': t('admin.cls_certification_kinds'),
  'declaration-types': t('admin.cls_declaration_types'),
  'entry-method': t('admin.cls_entry_method'),
  'id-doc-types': t('admin.cls_id_doc_types'),
  'identification-means': t('admin.cls_identification_means'),
  'itn-categories': t('admin.cls_itn_categories'),
  'movement-direction': t('admin.cls_movement_direction'),
  'ois-indicators': t('admin.cls_ois_indicators'),
  'packaging-availability': t('admin.cls_packaging_availability'),
  'packaging-info': t('admin.cls_packaging_info'),
  'packaging-info-kind': t('admin.cls_packaging_info_kind'),
  'presentation-purpose': t('admin.cls_presentation_purpose'),
  'prev-doc-types': t('admin.cls_prev_doc_types'),
  'restriction-marks': t('admin.cls_restriction_marks'),
  'settlement-terms': t('admin.cls_settlement_terms'),
  'transport-mode': t('admin.cls_transport_mode'),
  'transport-purpose': t('admin.cls_transport_purpose'),
  'used-as-declaration': t('admin.cls_used_as_declaration'),
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
      h(Popconfirm, { title: t('admin.refsDeactivateConfirm'), okText: t('admin.deaktivirovat'), okButtonProps: { danger: true }, onConfirm: () => removeClassifier(record) },
        () => h(Button, { size: 'small', type: 'link', danger: true }, () => t('admin.deaktivirovat'))),
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
  // Счётчик в меню; таблица и данные КЕДЕН догружаются при открытии раздела.
  try { gr33Ref.value = await prohibitionCodesApi.list() } catch { /* раздел покажет ошибку при открытии */ }
})
</script>

<style scoped>
.muted { color: var(--z-muted); font-size: 12px; }
.kato-try { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.refs-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
.refs-nav { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 2px; padding: 10px; max-height: calc(100vh - 100px); overflow-y: auto; }
.refs-nav-group { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--z-muted); padding: 10px 10px 4px; }
.gr33-missing { display: inline-block; margin-right: 14px; }
.refs-nav-group:first-child { padding-top: 2px; }
.refs-nav-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; font-size: 13px; color: var(--z-ink); cursor: pointer; }
.refs-nav-item:hover { background: var(--z-surface-2); }
.refs-nav-item.active { background: var(--z-teal-soft); color: var(--z-teal-d); font-weight: 600; }
.refs-nav-title { flex: 1; min-width: 0; }
.refs-nav-count { flex: none; font-size: 12px; color: var(--z-muted); font-variant-numeric: tabular-nums; }
.refs-main { padding: 18px 20px; min-width: 0; }
.refs-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; margin-bottom: 14px; }
.refs-head-text { min-width: 0; flex: 1 1 280px; }
.refs-title { margin: 0; font-size: 18px; line-height: 1.3; color: var(--z-ink); }
.refs-hint { margin: 4px 0 0; font-size: 13px; color: var(--z-muted); max-width: 70ch; }
.refs-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.refs-search { width: 260px; max-width: 100%; }
.refs-desc { max-width: 640px; }
.refs-note { margin: 10px 0; }
.refs-probe { max-width: 520px; }
.refs-trois { margin-top: 10px; }
@media (max-width: 900px) {
  .refs-layout { grid-template-columns: 1fr; }
  .refs-nav { position: static; max-height: 260px; }
}
</style>
