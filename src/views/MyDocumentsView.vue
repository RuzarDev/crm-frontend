<template>
  <div class="my-documents-view crm-page">
    <PageHeader
      :kicker="t('transit.klientskiyKabinet')"
      :title="t('transit.moiDokumenty')"
      :subtitle="t('transit.faylyPoKonteyneramDeklaraciyam')"
    />

    <a-card class="crm-shell-card" :bordered="false">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <div class="crm-toolbar crm-toolbar-surface">
          <a-input
            v-model:value="search"
            :placeholder="t('transit.poiskPoFayluIli')"
            allow-clear
            style="width: 320px; max-width: 100%"
            @pressEnter="handleSearch"
            @change="handleSearch"
          >
            <template #prefix>
              <SearchOutlined style="color: var(--z-muted)" />
            </template>
          </a-input>
          <a-select
            v-model:value="sectionFilter"
            allow-clear
            :placeholder="t('transit.vseSekcii')"
            style="width: 200px"
            :options="sectionOptions"
            @change="handleFilterChange"
          />
        </div>

        <ZTable
          :columns="columns"
          :data-source="items"
          :loading="loading"
          :pagination="pagination"
          row-key="id"
          @change="handleTableChange"
          :scroll="{ x: 900 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'section'">
              {{ record.section === 'client' ? t('transit.klient') : t('transit.broker') }}
            </template>
            <template v-else-if="column.key === 'reestrStatus'">
              <ReestrStatusCell :status="dtoStatusToEntryStatus(record.reestrStatus)" />
            </template>
            <template v-else-if="column.key === 'createdAtUtc'">
              {{ formatDate(record.createdAtUtc) }}
            </template>
            <template v-else-if="column.key === 'sizeBytes'">
              {{ formatSize(record.sizeBytes) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space size="small">
                <a-button type="link" size="small" @click="handleDownload(record)"> {{ t('transit.skachat') }} </a-button>
                <a-button type="link" size="small" @click="openDeclaration(record)"> {{ t('transit.deklaraciya') }} </a-button>
              </a-space>
            </template>
          </template>
        </ZTable>
      </a-space>
    </a-card>

    <ReestrForm
      :open="declarationModalOpen"
      :loading="false"
      :entry="selectedEntry"
      view-mode="client"
      initial-tab="data"
      @cancel="closeDeclaration"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import type { TableProps } from 'ant-design-vue'
import { reestrApi } from '@/api/reestr'
import type { MyReestrDocumentListItem, ReestrDocumentSection, ReestrEntry } from '@/types/api'
import { dtoStatusToEntryStatus } from '@/utils/reestrDtoMap'
import ReestrStatusCell from '@/components/ReestrStatusCell.vue'
import ReestrForm from '@/components/ReestrForm.vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

const loading = ref(false)
const items = ref<MyReestrDocumentListItem[]>([])
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const search = ref('')
const sectionFilter = ref<ReestrDocumentSection | null>(null)

const declarationModalOpen = ref(false)
const selectedEntry = ref<ReestrEntry | null>(null)

const sectionOptions = computed(() => ([

  { value: 'client', label: t('transit.dokumentyKlienta') },
  { value: 'broker', label: t('transit.dokumentyBrokera') },
]))
const columns = computed(() => ([

  { title: t('transit.konteyner'), dataIndex: 'container', key: 'container', width: 140, ellipsis: true },
  { title: t('transit.status'), key: 'reestrStatus', width: 140 },
  { title: t('transit.sekciya'), key: 'section', width: 120 },
  { title: t('transit.fayl'), dataIndex: 'originalFileName', key: 'originalFileName', ellipsis: true },
  { title: t('transit.razmer'), key: 'sizeBytes', width: 90 },
  { title: t('transit.zagruzhen'), key: 'createdAtUtc', width: 150 },
  { title: t('transit.deystviya'), key: 'actions', width: 180, fixed: 'right' as const },
]))
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: totalCount.value,
  showSizeChanger: true,
  showTotal: (total: number) => t('transit.vsego', { n: total }),
  pageSizeOptions: ['10', '20', '50', '100'],
}))

const formatDate = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm')

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} ${t('transit.b')}`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} ${t('transit.kb')}`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('transit.mb')}`
}

const fetchList = async () => {
  loading.value = true
  try {
    const response = await reestrApi.listMyDocuments({
      page: currentPage.value,
      pageSize: pageSize.value,
      section: sectionFilter.value,
      search: search.value || undefined,
    })
    items.value = response.items
    totalCount.value = response.totalCount
    currentPage.value = response.page
    pageSize.value = response.pageSize
  } catch {
    items.value = []
    totalCount.value = 0
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchList()
})

const handleSearch = () => {
  currentPage.value = 1
  fetchList()
}

const handleFilterChange = () => {
  currentPage.value = 1
  fetchList()
}

const handleTableChange: TableProps['onChange'] = (pag) => {
  if (pag.current) {
    currentPage.value = pag.current
  }
  if (pag.pageSize) {
    pageSize.value = pag.pageSize
  }
  fetchList()
}

const handleDownload = async (record: MyReestrDocumentListItem) => {
  try {
    const blob = await reestrApi.downloadDocument(record.reestrEntryId, record.id)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = record.originalFileName
    link.click()
    window.URL.revokeObjectURL(url)
  } catch {
    //
  }
}

const openDeclaration = async (record: MyReestrDocumentListItem) => {
  try {
    const entry = await reestrApi.getById(record.reestrEntryId)
    selectedEntry.value = entry
    declarationModalOpen.value = true
  } catch {
    //
  }
}

const closeDeclaration = () => {
  declarationModalOpen.value = false
  selectedEntry.value = null
  fetchList()
}
</script>

<style scoped>
.my-documents-view {
  width: 100%;
}
</style>
