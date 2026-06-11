<template>
  <div class="crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Справочники</div>
        <h1 class="crm-page-title">Станции и таможенные посты</h1>
      </div>
    </div>
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
    <a-modal v-model:open="modalOpen" :title="'Добавить'" @ok="save">
      <a-input v-model:value="nameInput" placeholder="Название" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { message, Button } from 'ant-design-vue'
import { referencesApi } from '@/api/references'
import type { RefItem } from '@/types/api'

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
onMounted(load)
</script>
