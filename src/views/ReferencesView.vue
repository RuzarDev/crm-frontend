<template>
  <div class="crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Настройки системы</div>
        <h1 class="crm-page-title">Справочники</h1>
      </div>
    </div>

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
              <template #extra><a-button type="primary" size="small" @click="openAdd('post')">Добавить</a-button></template>
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
    </a-tabs>

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
  { title: 'Наименование', dataIndex: 'nameRu', key: 'nameRu' },
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

onMounted(async () => {
  await load()
  // Классификаторы — вторая вкладка: их падение не должно ронять станции и посты.
  try {
    await loadClassifierGroups()
  } catch { message.error('Не удалось загрузить классификаторы') }
})
</script>
