<template>
  <div class="crm-page">
    <PageHeader kicker="Настройки системы" title="Справочники" />

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="base" tab="Станции и посты">
        <a-row :gutter="24">
          <a-col :span="12">
            <a-card title="Станции назначения">
              <template #extra><a-button type="primary" size="small" @click="openAdd('station')">Добавить</a-button></template>
              <a-table :data-source="stations" :columns="columns" row-key="id" size="small" :pagination="false" />
            </a-card>
          </a-col>
          <a-col :span="12">
            <a-card title="Таможенные посты">
              <template #extra>
                <a-space>
                  <a-button size="small" :loading="kgdLoading" @click="openKgdCompare">Сверить с КГД</a-button>
                  <a-button type="primary" size="small" @click="openAdd('post')">Добавить</a-button>
                </a-space>
              </template>
              <a-table :data-source="posts" :columns="columns" row-key="id" size="small" :pagination="false" />
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="classifiers" tab="Классификаторы">
        <a-row :gutter="24">
          <a-col :span="7">
            <a-card title="Классификаторы" size="small">
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
                <a-button type="primary" size="small" :disabled="!selectedClassifier.length" @click="openAddClassifier">
                  Добавить код
                </a-button>
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

      <a-tab-pane key="kato" tab="КАТО">
        <a-card title="КАТО — классификатор административно-территориальных объектов" size="small">
          <template #extra>
            <a-space>
              <a-upload :show-upload-list="false" accept=".xlsx" :before-upload="onKatoFile">
                <a-button size="small" :loading="katoBusy">Загрузить xlsx</a-button>
              </a-upload>
              <a-button type="primary" size="small" :loading="katoBusy" @click="syncKato">Обновить с stat.gov.kz</a-button>
            </a-space>
          </template>
          <a-descriptions size="small" :column="1" bordered>
            <a-descriptions-item label="Кодов в базе">{{ katoStatus?.total ?? '—' }}</a-descriptions-item>
            <a-descriptions-item label="Обновлено">{{ katoStatus?.updatedAtUtc ? new Date(katoStatus.updatedAtUtc).toLocaleString('ru-RU') : '—' }}</a-descriptions-item>
            <a-descriptions-item label="Источник">
              <a :href="katoStatus?.sourceUrl" target="_blank" rel="noopener">{{ katoStatus?.sourceUrl }}</a>
              <div class="muted">Бюро национальной статистики, файл «КАТО НК РК 11-2025» (xlsx). Ссылка на файл меняется с каждой редакцией — ищется на странице автоматически; если сайт недоступен, скачайте xlsx вручную и загрузите его здесь.</div>
            </a-descriptions-item>
          </a-descriptions>
          <div class="kato-try">
            <div class="muted">Проверка поиска (как в ДТ, гр. 8/9/14):</div>
            <KatoSelect v-model:value="katoProbe" placeholder="Начните вводить название или код" style="max-width: 520px" />
          </div>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <a-modal v-model:open="kgdOpen" title="Сверка с каталогом КГД" width="820px" :ok-text="`Добавить выбранные (${kgdSelected.length})`" :ok-button-props="{ disabled: !kgdSelected.length }" :confirm-loading="kgdLoading" @ok="applyKgd">
      <template v-if="kgd">
        <p class="muted">В каталоге КГД (kgd.gov.kz/ru/nsi/ktam) актуальных постов: {{ kgd.kgdTotal }}, в нашем справочнике: {{ kgd.ourTotal }}.
          Каталог КГД ведётся неаккуратно (закрытые посты не помечены, есть устаревшие коды упразднённых областей) — добавляйте только те, что действительно нужны.</p>
        <h4>Есть в КГД, нет у нас ({{ kgd.newInKgd.length }})</h4>
        <a-table :data-source="kgd.newInKgd" :columns="kgdColumns" row-key="code" size="small" :pagination="false" :scroll="{ y: 280 }"
          :row-selection="{ selectedRowKeys: kgdSelected, onChange: (keys: (string | number)[]) => (kgdSelected = keys.map(String)) }" />
        <h4 style="margin-top: 16px">Есть у нас, нет в КГД ({{ kgd.missingInKgd.length }})</h4>
        <p class="muted">Возможно, закрыты или переименованы — проверьте и при необходимости деактивируйте вручную.</p>
        <ul class="kgd-missing"><li v-for="n in kgd.missingInKgd" :key="n">{{ n }}</li></ul>
      </template>
      <a-spin v-else />
    </a-modal>

    <a-modal v-model:open="modalOpen" :title="'Добавить'" @ok="save">
      <a-input v-model:value="nameInput" placeholder="Название" />
    </a-modal>

    <a-modal v-model:open="classifierModalOpen" title="Добавить код" @ok="saveClassifier">
      <a-form layout="vertical">
        <a-form-item label="Код"><a-input v-model:value="classifierCodeInput" /></a-form-item>
        <a-form-item label="Наименование"><a-input v-model:value="classifierNameInput" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { message, Button } from 'ant-design-vue'
import { referencesApi } from '@/api/references'
import type { RefItem, ClassifierItem, ClassifierGroup } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import PageHeader from '@/components/PageHeader.vue'
import KatoSelect from '@/components/KatoSelect.vue'
import { katoApi, type KatoStatus } from '@/api/kato'
import type { KgdCompareResult } from '@/api/references'

const stations = ref<RefItem[]>([])
const posts = ref<RefItem[]>([])
const modalOpen = ref(false)
const currentKind = ref<'station' | 'post'>('station')
const nameInput = ref('')

const columns = [
  { title: 'Название', dataIndex: 'name', key: 'name' },
  {
    title: 'Действия', key: 'actions',
    customRender: ({ record }: { record: RefItem }) =>
      h(Button, { size: 'small', danger: true, onClick: () => remove(record) }, () => 'Деактивировать'),
  },
]

const load = async () => {
  stations.value = await referencesApi.listStations()
  posts.value = await referencesApi.listCustomsPosts()
}
const openAdd = (kind: 'station' | 'post') => { currentKind.value = kind; nameInput.value = ''; modalOpen.value = true }
const save = async () => {
  if (!nameInput.value.trim()) { message.error('Введите название'); return }
  try {
    if (currentKind.value === 'station') await referencesApi.createStation(nameInput.value.trim())
    else await referencesApi.createCustomsPost(nameInput.value.trim())
    modalOpen.value = false
    await load(); message.success('Сохранено')
  } catch { message.error('Ошибка сохранения') }
}
const remove = async (record: RefItem) => {
  try {
    if (stations.value.some((s) => s.id === record.id)) await referencesApi.deleteStation(record.id)
    else await referencesApi.deleteCustomsPost(record.id)
    await load()
  } catch { message.error('Ошибка') }
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
const CLASSIFIER_TITLES: Record<string, string> = {
  '2004': '2004 — виды транспорта',
  '2005': '2005 — методы определения таможенной стоимости',
  '2008': '2008 — преференции',
  '2013': '2013 — виды упаковки',
  '2024': '2024 — типы транспортных средств',
  'tax-modes': 'Виды платежа (гр.47)',
  'rate-kinds': 'Тип ставки (гр.47)',
  'payment-features': 'Особенность платежа',
  'payment-methods': 'Способ уплаты',
  'transaction-natures': 'Характер сделки (гр.24)',
  'goods-locations': 'Место нахождения товаров (гр.30)',
  'rate-types': 'Тип ставок',
}
const classifierTitle = (code: string) => CLASSIFIER_TITLES[code] ?? code

const classifierColumns = [
  { title: 'Код', dataIndex: 'code', key: 'code', width: 120 },
  { title: 'Наименование', dataIndex: 'nameRu', key: 'nameRu', width: 420 },
  {
    title: 'Действия', key: 'actions', width: 140,
    customRender: ({ record }: { record: ClassifierItem }) =>
      h(Button, { size: 'small', danger: true, onClick: () => removeClassifier(record) }, () => 'Деактивировать'),
  },
]

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
  } catch { message.error('Не удалось загрузить коды классификатора') }
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
  if (!code || !name) { message.error('Заполните код и наименование'); return }
  try {
    await referencesApi.createClassifier(classifier, code, name)
    classifierModalOpen.value = false
    classifiersStore.invalidate(classifier)
    await loadClassifierItems()
    await loadClassifierGroups()
    message.success('Код добавлен')
  } catch {
    message.error('Не удалось добавить код')
  }
}

const removeClassifier = async (record: ClassifierItem) => {
  try {
    await referencesApi.deleteClassifier(record.id)
    classifiersStore.invalidate(record.classifierCode)
    await loadClassifierItems()
    await loadClassifierGroups()
    message.success('Код деактивирован')
  } catch {
    message.error('Не удалось деактивировать код')
  }
}

// ── КАТО (официальный классификатор, ref_kato) ──
const katoStatus = ref<KatoStatus | null>(null)
const katoBusy = ref(false)
const katoProbe = ref<string | null>(null)
const loadKatoStatus = async () => { try { katoStatus.value = await katoApi.status() } catch { /* вкладка необязательная */ } }
const reportKato = (r: { total: number; added: number; updated: number; removed: number }) =>
  message.success(`КАТО: ${r.total} кодов (добавлено ${r.added}, обновлено ${r.updated}, удалено ${r.removed})`)
const syncKato = async () => {
  katoBusy.value = true
  try { reportKato(await katoApi.sync()); await loadKatoStatus() }
  catch (e: unknown) { message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Не удалось обновить КАТО') }
  finally { katoBusy.value = false }
}
const onKatoFile = async (file: File) => {
  katoBusy.value = true
  try { reportKato(await katoApi.import(file)); await loadKatoStatus() }
  catch (e: unknown) { message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Не удалось загрузить файл') }
  finally { katoBusy.value = false }
  return false
}

// ── Сверка постов с КГД ──
const kgdOpen = ref(false)
const kgdLoading = ref(false)
const kgd = ref<KgdCompareResult | null>(null)
const kgdSelected = ref<string[]>([])
const kgdColumns = [
  { title: 'Код', dataIndex: 'code', key: 'code', width: 80 },
  { title: 'Название', dataIndex: 'name', key: 'name' },
  { title: 'Адрес', dataIndex: 'address', key: 'address', width: 260 },
]
const openKgdCompare = async () => {
  kgdOpen.value = true; kgd.value = null; kgdSelected.value = []; kgdLoading.value = true
  try { kgd.value = await referencesApi.kgdComparePosts() }
  catch (e: unknown) { kgdOpen.value = false; message.error((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Не удалось получить каталог КГД') }
  finally { kgdLoading.value = false }
}
const applyKgd = async () => {
  kgdLoading.value = true
  try {
    const r = await referencesApi.kgdAddPosts(kgdSelected.value)
    message.success(`Добавлено постов: ${r.added}`)
    kgdOpen.value = false
    await load()
  } catch { message.error('Не удалось добавить') }
  finally { kgdLoading.value = false }
}

// Вкладки грузятся независимо: падение одной не должно оставлять другую пустой без объяснения.
onMounted(async () => {
  try {
    await load()
  } catch { message.error('Не удалось загрузить станции и посты') }
  try {
    await loadClassifierGroups()
  } catch { message.error('Не удалось загрузить классификаторы') }
  await loadKatoStatus()
})
</script>

<style scoped>
.muted { color: var(--atg-muted, #95a1b7); font-size: 12px; }
.kato-try { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.kgd-missing { margin: 0; padding-left: 18px; max-height: 160px; overflow: auto; font-size: 12.5px; }
</style>
