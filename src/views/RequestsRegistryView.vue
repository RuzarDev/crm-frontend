<!-- crm-frontend/src/views/RequestsRegistryView.vue -->
<template>
  <div class="registry-page">
    <div class="page-header">
      <h2>Реестр заявок</h2>
    </div>

    <div class="filters">
      <a-select
        v-model:value="filters.type" allow-clear placeholder="Тип услуги" style="width: 160px"
        :options="[
          { value: 'import40', label: 'Импорт 40' },
          { value: 'transit', label: 'Транзит' },
        ]"
        @change="onTypeChange"
      />
      <a-select
        v-if="statusOptions.length" v-model:value="filters.status" allow-clear
        placeholder="Статус" style="width: 200px" :options="statusOptions" @change="reload"
      />
      <a-input-search
        v-model:value="filters.search" placeholder="Поиск: клиент, груз, контейнер, № ДТ"
        style="width: 280px" allow-clear @search="reload"
      />
      <a-input v-model:value="filters.from" placeholder="С даты ГГГГ-ММ-ДД" style="width: 150px" allow-clear @change="reload" />
      <a-input v-model:value="filters.to" placeholder="По дату ГГГГ-ММ-ДД" style="width: 150px" allow-clear @change="reload" />
    </div>

    <a-table
      :data-source="rows"
      :columns="columns"
      :loading="loading"
      row-key="rowKey"
      :pagination="{
        current: page, pageSize, total, showSizeChanger: true,
        onChange: (p: number, ps: number) => { page = p; pageSize = ps; void load() },
      }"
      :custom-row="(record: Row) => ({ onClick: () => open(record), style: 'cursor: pointer' })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'serviceType'">
          <a-tag :color="record.serviceType === 'import40' ? 'geekblue' : 'green'">
            {{ record.serviceType === 'import40' ? 'Импорт 40' : 'Транзит' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'statusLabel'">
          <a-tag :color="record.isProblem ? 'error' : 'default'">{{ record.statusLabel }}</a-tag>
        </template>
        <template v-else-if="column.key === 'createdAtUtc'">
          {{ new Date(record.createdAtUtc).toLocaleDateString('ru-RU') }}
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { registryApi, type RegistryRowDto } from '@/api/registry'
import { IMPORT40_STATUSES } from '@/api/import40'

type Row = RegistryRowDto & { rowKey: string }

const router = useRouter()
const rows = ref<Row[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(25)
const total = ref(0)

const filters = reactive({
  type: undefined as string | undefined,
  status: undefined as string | undefined,
  search: '',
  from: '',
  to: '',
})

// Статусы транзита — зеркало меток бэкенда (TransitStatusLabel)
const TRANSIT_STATUSES = [
  { value: 0, label: 'В работе' },
  { value: 1, label: 'Подана' },
  { value: 2, label: 'Выпущена' },
  { value: 3, label: 'Условный выпуск' },
  { value: 4, label: 'Проблемная' },
  { value: 5, label: 'Отклонена' },
  { value: 6, label: 'Отозвана' },
  { value: 7, label: 'Архив' },
]

const statusOptions = computed(() => {
  if (filters.type === 'import40')
    return IMPORT40_STATUSES.map((s) => ({ value: `import40:${s.id}`, label: s.short }))
  if (filters.type === 'transit')
    return TRANSIT_STATUSES.map((s) => ({ value: `transit:${s.value}`, label: s.label }))
  return []
})

const columns = [
  { title: 'Тип', key: 'serviceType', width: 110 },
  { title: '№', dataIndex: 'number', key: 'number', width: 160 },
  { title: 'Груз / описание', dataIndex: 'title', key: 'title' },
  { title: 'Клиент', dataIndex: 'clientName', key: 'clientName', width: 180 },
  { title: 'Статус', key: 'statusLabel', width: 150 },
  { title: 'Создана', key: 'createdAtUtc', width: 110 },
]

const load = async () => {
  loading.value = true
  try {
    const res = await registryApi.list({
      type: filters.type,
      status: filters.status,
      search: filters.search.trim() || undefined,
      from: filters.from.trim() || undefined,
      to: filters.to.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    rows.value = res.items.map((r) => ({ ...r, rowKey: `${r.serviceType}:${r.id}` }))
    total.value = res.totalCount
  } catch {
    message.error('Не удалось загрузить реестр')
  } finally {
    loading.value = false
  }
}

const reload = () => {
  page.value = 1
  void load()
}

const onTypeChange = () => {
  filters.status = undefined
  reload()
}

const open = (r: Row) => {
  if (r.serviceType === 'import40') router.push(`/import-40/${r.id}`)
  else router.push('/reestr') // у транзита нет карточки-страницы — открываем реестр модуля
}

onMounted(() => void load())
</script>

<style scoped>
.registry-page { display: flex; flex-direction: column; gap: 16px; }
.filters { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
