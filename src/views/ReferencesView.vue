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
                <a-space>
                  <a-button size="small" :loading="kgdLoading" @click="openKgdCompare">{{ t('admin.sveritSKgd') }}</a-button>
                  <a-button type="primary" size="small" @click="openAdd('post')">{{ t('admin.dobavit') }}</a-button>
                </a-space>
              </template>
              <a-table :data-source="posts" :columns="columns" row-key="id" size="small" :pagination="false" />
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="classifiers" :tab="t('admin.klassifikatory')">
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
    </a-tabs>

    <a-modal v-model:open="kgdOpen" :title="t('admin.sverkaSKatalogomKgd')" width="820px" :ok-text="t('admin.dobavitVybrannye', { n: kgdSelected.length })" :ok-button-props="{ disabled: !kgdSelected.length }" :confirm-loading="kgdLoading" @ok="applyKgd">
      <template v-if="kgd">
        <p class="muted">{{ t('admin.kgdCompareSummary', { kgd: kgd.kgdTotal, ours: kgd.ourTotal }) }}
          {{ t('admin.kgdCatalogHint') }}</p>
        <h4>{{ t('admin.estVKgdNetUNas', { n: kgd.newInKgd.length }) }}</h4>
        <a-table :data-source="kgd.newInKgd" :columns="kgdColumns" row-key="code" size="small" :pagination="false" :scroll="{ y: 280 }"
          :row-selection="{ selectedRowKeys: kgdSelected, onChange: (keys: (string | number)[]) => (kgdSelected = keys.map(String)) }" />
        <h4 style="margin-top: 16px">{{ t('admin.estUNasNetVKgd', { n: kgd.missingInKgd.length }) }}</h4>
        <p class="muted">{{ t('admin.vozmozhnoZakrytyIliPereimenovany') }}</p>
        <ul class="kgd-missing"><li v-for="n in kgd.missingInKgd" :key="n">{{ n }}</li></ul>
      </template>
      <a-spin v-else />
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
import { ref, onMounted, h, computed } from 'vue'
import { message, Button } from 'ant-design-vue'
import { referencesApi } from '@/api/references'
import type { RefItem, ClassifierItem, ClassifierGroup } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import PageHeader from '@/components/PageHeader.vue'
import KatoSelect from '@/components/KatoSelect.vue'
import { katoApi, type KatoStatus } from '@/api/kato'
import type { KgdCompareResult } from '@/api/references'

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
      h(Button, { size: 'small', danger: true, onClick: () => remove(record) }, () => t('admin.deaktivirovat')),
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
  '2013': t('admin.n2013VidyUpakovki'),
  '2024': t('admin.n2024TipyTransportnyhSredstv'),
  'tax-modes': t('admin.vidyPlatezhaGr47'),
  'rate-kinds': t('admin.tipStavkiGr47'),
  'payment-features': t('admin.osobennostPlatezha'),
  'payment-methods': t('admin.sposobUplaty'),
  'transaction-natures': t('admin.harakterSdelkiGr24'),
  'goods-locations': t('admin.mestoNahozhdeniyaTovarovGr30'),
  'rate-types': t('admin.tipStavok'),
}))
const classifierTitle = (code: string) => CLASSIFIER_TITLES.value[code] ?? code

const classifierColumns = computed(() => ([

  { title: t('admin.kod'), dataIndex: 'code', key: 'code', width: 120 },
  { title: t('admin.naimenovanie'), dataIndex: 'nameRu', key: 'nameRu', width: 420 },
  {
    title: t('admin.deystviya'), key: 'actions', width: 140,
    customRender: ({ record }: { record: ClassifierItem }) =>
      h(Button, { size: 'small', danger: true, onClick: () => removeClassifier(record) }, () => t('admin.deaktivirovat')),
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
  catch (e: unknown) { message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('admin.neUdalosObnovitKato')) }
  finally { katoBusy.value = false }
}
const onKatoFile = async (file: File) => {
  katoBusy.value = true
  try { reportKato(await katoApi.import(file)); await loadKatoStatus() }
  catch (e: unknown) { message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('admin.neUdalosZagruzitFayl')) }
  finally { katoBusy.value = false }
  return false
}

// ── Сверка постов с КГД ──
const kgdOpen = ref(false)
const kgdLoading = ref(false)
const kgd = ref<KgdCompareResult | null>(null)
const kgdSelected = ref<string[]>([])
const kgdColumns = computed(() => ([

  { title: t('admin.kod'), dataIndex: 'code', key: 'code', width: 80 },
  { title: t('admin.nazvanie'), dataIndex: 'name', key: 'name' },
  { title: t('admin.adres'), dataIndex: 'address', key: 'address', width: 260 },
]))
const openKgdCompare = async () => {
  kgdOpen.value = true; kgd.value = null; kgdSelected.value = []; kgdLoading.value = true
  try { kgd.value = await referencesApi.kgdComparePosts() }
  catch (e: unknown) { kgdOpen.value = false; message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('admin.neUdalosPoluchitKatalog')) }
  finally { kgdLoading.value = false }
}
const applyKgd = async () => {
  kgdLoading.value = true
  try {
    const r = await referencesApi.kgdAddPosts(kgdSelected.value)
    message.success(t('admin.dobavlenoPostov', { n: r.added }))
    kgdOpen.value = false
    await load()
  } catch { message.error(t('admin.neUdalosDobavit')) }
  finally { kgdLoading.value = false }
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
})
</script>

<style scoped>
.muted { color: var(--atg-muted, #95a1b7); font-size: 12px; }
.kato-try { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.kgd-missing { margin: 0; padding-left: 18px; max-height: 160px; overflow: auto; font-size: 12.5px; }
</style>
