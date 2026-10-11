<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import ZButton from '@/components/z/ZButton.vue'
import ZPage from '@/components/z/ZPage.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTable from '@/components/z/ZTable.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { reestrApi } from '@/api/reestr'
import type { MyReestrDocumentListItem, ReestrDocumentSection } from '@/types/api'
import { dtoStatusToEntryStatus } from '@/utils/reestrDtoMap'
import { statusKey, statusTone } from '@/views/broker/transit/transit'
import { saveBlob } from '@/ui/download'
import type { ZColumn } from '@/ui/table'

// «Мои документы» клиента транзита (/my-documents, редизайн, волна 7): файлы по записям клиента, страницы — серверные.
// Поиск — с задержкой, раздел — выбор; смена любого из них начинает с первой страницы.
const { t } = useI18n()
const router = useRouter()

const PAGE_SIZE = 25

const loading = ref(false)
const items = ref<MyReestrDocumentListItem[]>([])
const totalCount = ref(0)
const currentPage = ref(1)
const search = ref('')
const sectionFilter = ref<ReestrDocumentSection | null>(null)
// Ответы приходят не по порядку (поиск набирается быстрее сервера): применяем только последний запрос.
let requestSeq = 0

const sectionOptions = computed(() => [
  { value: 'client', label: t('transit.dokumentyKlienta') },
  { value: 'broker', label: t('transit.dokumentyBrokera') },
])
const columns = computed<ZColumn<MyReestrDocumentListItem>[]>(() => [
  { key: 'container', title: t('transit.konteyner'), dataIndex: 'container', width: 150, ellipsis: true },
  { key: 'reestrStatus', title: t('transit.status'), width: 160 },
  { key: 'section', title: t('transit.sekciya'), width: 120 },
  { key: 'originalFileName', title: t('transit.fayl'), dataIndex: 'originalFileName', ellipsis: true },
  { key: 'sizeBytes', title: t('transit.razmer'), width: 100 },
  { key: 'createdAtUtc', title: t('transit.zagruzhen'), width: 150 },
  { key: 'actions', title: t('transit.deystviya'), width: 190 },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 220), 0))
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: PAGE_SIZE,
  total: totalCount.value,
  onChange: (p: number) => { currentPage.value = p; void fetchList() },
  showTotal: (total: number) => t('transit.vsego', { n: total }),
}))

const formatDate = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm')

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} ${t('transit.b')}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t('transit.kb')}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('transit.mb')}`
}

const fetchList = async () => {
  const seq = ++requestSeq
  loading.value = true
  try {
    const response = await reestrApi.listMyDocuments({
      page: currentPage.value,
      pageSize: PAGE_SIZE,
      section: sectionFilter.value,
      search: search.value || undefined,
    })
    if (seq !== requestSeq) return
    items.value = response.items
    totalCount.value = response.totalCount
    currentPage.value = response.page
  } catch {
    if (seq !== requestSeq) return
    items.value = []
    totalCount.value = 0
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

onMounted(() => { void fetchList() })

const handleSearch = () => {
  currentPage.value = 1
  void fetchList()
}

const handleFilterChange = () => {
  currentPage.value = 1
  void fetchList()
}

const handleDownload = async (record: MyReestrDocumentListItem) => {
  try {
    saveBlob(await reestrApi.downloadDocument(record.reestrEntryId, record.id), record.originalFileName)
  } catch {
    //
  }
}

// «Декларация» — страница записи транзита (редизайн, волна 4б); крошки страницы ведут обратно сюда.
const openDeclaration = (record: MyReestrDocumentListItem) => {
  void router.push({ path: `/reestr/${encodeURIComponent(record.reestrEntryId)}`, query: { from: 'my-documents' } })
}

const LINK = 'max-sm:min-h-11'
</script>

<template>
  <ZPage :title="t('transit.moiDokumenty')" :subtitle="t('transit.faylyPoKonteyneramDeklaraciyam')" data-my-documents>
    <div class="flex flex-wrap items-center gap-2">
      <ListSearch
        :value="search"
        :placeholder="t('transit.poiskPoFayluIli')"
        :debounce="300"
        data-my-docs-search
        @update:value="search = $event"
        @search="handleSearch"
      />
      <ZSelect
        v-model:value="sectionFilter"
        allow-clear
        :placeholder="t('transit.vseSekcii')"
        :options="sectionOptions"
        :aria-label="t('transit.sekciya')"
        class="w-full sm:w-[200px] max-sm:h-11"
        data-my-docs-section
        @change="handleFilterChange"
      />
    </div>

    <ZTable
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: tableWidth }"
      :aria-label="t('transit.moiDokumenty')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-my-docs-table
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'section'">
          {{ record.section === 'client' ? t('transit.klient') : t('transit.broker') }}
        </template>
        <StatusDot
          v-else-if="column.key === 'reestrStatus'"
          :tone="statusTone(dtoStatusToEntryStatus(record.reestrStatus))"
          :label="t(`enum.reestrStatus.${statusKey(dtoStatusToEntryStatus(record.reestrStatus))}`)"
        />
        <template v-else-if="column.key === 'createdAtUtc'">
          {{ formatDate(record.createdAtUtc) }}
        </template>
        <template v-else-if="column.key === 'sizeBytes'">
          {{ formatSize(record.sizeBytes) }}
        </template>
        <span v-else-if="column.key === 'actions'" class="inline-flex items-center gap-4">
          <ZButton variant="link" size="sm" :class="LINK" data-my-doc-download @click="handleDownload(record)">{{ t('transit.skachat') }}</ZButton>
          <ZButton variant="link" size="sm" :class="LINK" data-my-doc-declaration @click="openDeclaration(record)">{{ t('transit.deklaraciya') }}</ZButton>
        </span>
      </template>
    </ZTable>
  </ZPage>
</template>
