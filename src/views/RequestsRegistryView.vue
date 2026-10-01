<!-- crm-frontend/src/views/RequestsRegistryView.vue -->
<template>
  <div class="registry-page crm-page">
    <PageHeader
      :kicker="t('admin.zayavki')"
      :title="t('admin.reestrZayavok')"
      :subtitle="t('admin.svodnyySpisokZayavokPo')"
    />

    <a-card class="crm-shell-card" :bordered="false">
    <div class="filters crm-filter-bar">
      <a-select
        v-model:value="filters.type" allow-clear :placeholder="t('admin.tipUslugi')"
        :options="[
          { value: 'import40', label: t('admin.import40') },
          { value: 'transit', label: t('admin.tranzit') },
        ]"
        @change="onTypeChange"
      />
      <a-select
        v-if="statusOptions.length" v-model:value="filters.status" allow-clear
        :placeholder="t('admin.status')" :options="statusOptions" @change="reload"
      />
      <a-input-search
        v-model:value="filters.search" :placeholder="t('admin.poiskKlientGruzKonteyner')" allow-clear @search="reload"
      />
      <!-- Аудит 2026-09-28, п.10: текстовые поля дат слали запрос на каждое нажатие клавиши —
           заменено на a-range-picker, запрос уходит только когда выбран полный диапазон (или он сброшен). -->
      <a-range-picker v-model:value="dateRange" :placeholder="[t('admin.sDatyGgggMm'), t('admin.poDatuGgggMm')]" @change="onDateRangeChange" />
      <a-button :disabled="!rows.length" @click="exportXlsx"><DownloadOutlined /> Excel</a-button>
    </div>

    <a-table class="crm-table-cards"
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
            {{ record.serviceType === 'import40' ? t('admin.import40') : t('admin.tranzit') }}
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
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'
import * as XLSX from 'xlsx'
import { DownloadOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { registryApi, type RegistryRowDto } from '@/api/registry'
import { IMPORT40_STATUSES } from '@/api/import40'
import { useImport40Status } from '@/composables/useImport40Status'

const { t } = useI18n()

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

// Диапазон дат для a-range-picker (аудит 2026-09-28, п.10) — filters.from/to остаются
// строками YYYY-MM-DD, как и ожидает registryApi.list/бэкенд (DateTime? биндинг).
const dateRange = ref<[Dayjs, Dayjs] | null>(null)
const onDateRangeChange = (values: [Dayjs, Dayjs] | null) => {
  filters.from = values?.[0] ? values[0].format('YYYY-MM-DD') : ''
  filters.to = values?.[1] ? values[1].format('YYYY-MM-DD') : ''
  reload()
}

// Статусы транзита — зеркало меток бэкенда (TransitStatusLabel)
const TRANSIT_STATUSES = computed(() => ([

  { value: 0, label: t('admin.vRabote') },
  { value: 1, label: t('admin.podana') },
  { value: 2, label: t('admin.vypuschena') },
  { value: 3, label: t('admin.uslovnyyVypusk') },
  { value: 4, label: t('admin.problemnaya') },
  { value: 5, label: t('admin.otklonena') },
  { value: 6, label: t('admin.otozvana') },
  { value: 7, label: t('admin.arhiv') },
]))
const { statusLabel } = useImport40Status()
const statusOptions = computed(() => {
  if (filters.type === 'import40')
    return IMPORT40_STATUSES.map((s) => ({ value: `import40:${s.id}`, label: statusLabel(s.id) }))
  if (filters.type === 'transit')
    return TRANSIT_STATUSES.value.map((s) => ({ value: `transit:${s.value}`, label: s.label }))
  return []
})

const columns = computed(() => ([

  { title: t('admin.tip'), key: 'serviceType', width: 110 },
  { title: '№', dataIndex: 'number', key: 'number', width: 160 },
  { title: t('admin.gruzOpisanie'), dataIndex: 'title', key: 'title' },
  { title: t('admin.klient'), dataIndex: 'clientName', key: 'clientName', width: 180 },
  { title: t('admin.status'), key: 'statusLabel', width: 150 },
  { title: t('admin.sozdana'), key: 'createdAtUtc', width: 110 },
]))
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
    message.error(t('admin.neUdalosZagruzitReestr'))
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

// Выгрузка текущей страницы реестра (фильтры применяются на сервере).
const exportXlsx = () => {
  const data = rows.value.map((r) => ({
    [t('admin.tip')]: r.serviceType === 'import40' ? t('admin.import40') : t('admin.tranzit'),
    '№': r.number,
    [t('admin.gruzOpisanie')]: r.title,
    [t('admin.klient')]: r.clientName,
    [t('admin.status')]: r.statusLabel,
    [t('admin.sozdana')]: new Date(r.createdAtUtc).toLocaleDateString('ru-RU'),
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('admin.reestrZayavok'))
  XLSX.writeFile(wb, `requests_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const open = (r: Row) => {
  if (r.serviceType === 'import40') router.push(`/import-40/${r.id}`)
  else router.push('/reestr') // у транзита нет карточки-страницы — открываем реестр модуля
}

onMounted(() => void load())
</script>

<style scoped>
.registry-page { display: flex; flex-direction: column; gap: 16px; }
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
</style>
