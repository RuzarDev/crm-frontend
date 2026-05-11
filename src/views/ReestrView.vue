<template>
  <div class="reestr-view">
    <a-card title="Реестр" :bordered="false">
      <template #extra>
        <a-space>
          <a-button v-if="canWrite" type="primary" @click="showCreateModal">
            <PlusOutlined />
            Добавить запись
          </a-button>
          <a-button v-if="canWrite" @click="showUploadModal">
            <UploadOutlined />
            Загрузить Excel
          </a-button>
          <a-button v-if="canDelete" @click="selectAllCurrentPage">
            Выбрать все
          </a-button>
          <a-button v-if="canDelete" @click="clearSelection">
            Снять выбор
          </a-button>
          <a-popconfirm
            v-if="canDelete"
            title="Удалить выбранные записи?"
            ok-text="Да"
            cancel-text="Нет"
            @confirm="handleDeleteSelected"
          >
            <a-button danger :disabled="selectedRowKeys.length === 0">
              Удалить выбранные
            </a-button>
          </a-popconfirm>
        </a-space>
      </template>

      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-input-search
          v-model:value="searchValue"
          placeholder="Поиск по текстовым полям строки…"
          enter-button="Найти"
          @search="handleSearch"
          style="max-width: 400px"
        />

        <a-table
          :columns="columns"
          :data-source="reestrStore.entries"
          :loading="reestrStore.loading"
          :pagination="pagination"
          :row-selection="rowSelection"
          :row-key="(record: ReestrEntry) => record.id"
          @change="handleTableChange"
          :scroll="{ x: 1000 }"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'rowNumber'">
              {{ getRowNumber(index) }}
            </template>

            <template v-else-if="String(column.key).startsWith('field:')">
              {{
                formatReestrCellForDisplay(
                  String(column.key).slice(6),
                  record.data[String(column.key).slice(6)] ?? null,
                )
              }}
            </template>

            <template v-else-if="column.key === 'reestrStatus'">
              {{ formatReestrStatus(record.status) }}
            </template>

            <template v-else-if="column.key === 'actions'">
              <a-space v-if="canWrite || canDelete">
                <a-button v-if="canWrite" type="link" size="small" @click="handleEdit(record)">
                  <EditOutlined />
                  Изменить
                </a-button>
                <a-popconfirm
                  v-if="canDelete"
                  title="Удалить эту запись?"
                  ok-text="Да"
                  cancel-text="Нет"
                  @confirm="handleDelete(record.id)"
                >
                  <a-button type="link" danger size="small">
                    <DeleteOutlined />
                    Удалить
                  </a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <ReestrForm
      :open="formModalOpen"
      :loading="formLoading"
      :entry="currentEntry"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
    />

    <a-modal
      v-model:open="uploadModalOpen"
      title="Загрузка Excel файла"
      :footer="null"
      width="600px"
    >
      <ExcelUpload @upload="handleFileUpload" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useReestrStore } from '@/stores/reestr'
import { useAuthStore } from '@/stores/auth'
import ReestrForm from '@/components/ReestrForm.vue'
import ExcelUpload from '@/components/ExcelUpload.vue'
import {
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import type { ReestrEntry, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS } from '@/types/api'
import { formatReestrCellForDisplay } from '@/utils/reestrFormat'
import { reestrDataToUpsertBody } from '@/utils/reestrDtoMap'
import { formatReestrStatus } from '@/utils/reestrDtoMap'
import type { TableProps } from 'ant-design-vue'

const reestrStore = useReestrStore()
const authStore = useAuthStore()

const searchValue = ref('')
const selectedRowKeys = ref<string[]>([])
const formModalOpen = ref(false)
const uploadModalOpen = ref(false)
const formLoading = ref(false)
const currentEntry = ref<ReestrEntry | null>(null)

const orderedFieldColumns: string[] = [...REESTR_COLUMN_KEYS]

const dynamicFieldColumns = computed(() => {
  const keysFromData = new Set<string>()
  for (const entry of reestrStore.entries) {
    Object.keys(entry.data).forEach((key) => keysFromData.add(key))
  }
  const ordered = orderedFieldColumns.filter((key) => keysFromData.has(key))
  const extra = [...keysFromData].filter((key) => !orderedFieldColumns.includes(key))
  return [...ordered, ...extra].map((key) => ({
    title: key,
    key: `field:${key}`,
    width: 180,
    ellipsis: true,
  }))
})

const canWrite = computed(() => authStore.hasPermission('reestr.write'))
const canDelete = computed(() => authStore.hasPermission('reestr.delete'))
const canShowActions = computed(() => canWrite.value || canDelete.value)

const columns = computed(() => {
  const baseColumns = [
    {
      title: '№',
      key: 'rowNumber',
      width: 70,
      fixed: 'left',
    },
    ...dynamicFieldColumns.value,
    {
      title: 'Статус',
      key: 'reestrStatus',
      width: 150,
      ellipsis: true,
    },
  ]

  if (!canShowActions.value) {
    return baseColumns
  }

  return [
    ...baseColumns,
    {
      title: 'Действия',
      key: 'actions',
      width: 180,
      fixed: 'right',
    },
  ]
})

const rowSelection = computed(() => {
  if (!canDelete.value) {
    return undefined
  }
  return {
    selectedRowKeys: selectedRowKeys.value,
    onChange: (keys: (string | number)[]) => {
      selectedRowKeys.value = keys.map((key) => String(key))
    },
  }
})

const pagination = computed(() => ({
  current: reestrStore.currentPage,
  pageSize: reestrStore.pageSize,
  total: reestrStore.totalCount,
  showSizeChanger: true,
  showTotal: (total: number) => `Всего записей: ${total}`,
  pageSizeOptions: ['10', '20', '50', '100'],
}))

onMounted(() => {
  reestrStore.fetchList()
})

const getRowNumber = (index: number) => {
  return (reestrStore.currentPage - 1) * reestrStore.pageSize + index + 1
}

const handleSearch = () => {
  reestrStore.setSearch(searchValue.value)
  reestrStore.fetchList()
}

const handleTableChange: TableProps['onChange'] = (pagination) => {
  if (pagination.current) {
    reestrStore.setPage(pagination.current)
  }
  if (pagination.pageSize) {
    reestrStore.setPageSize(pagination.pageSize)
  }
  selectedRowKeys.value = []
  reestrStore.fetchList()
}

const showCreateModal = () => {
  currentEntry.value = null
  formModalOpen.value = true
}

const showUploadModal = () => {
  uploadModalOpen.value = true
}

const handleEdit = (record: ReestrEntry) => {
  currentEntry.value = record
  formModalOpen.value = true
}

const handleFormSubmit = async (payload: {
  data: Record<string, string | null>
  status: ReestrEntryStatus
}) => {
  formLoading.value = true
  try {
    const body = reestrDataToUpsertBody(payload.data, payload.status)
    let success = false
    if (currentEntry.value) {
      success = await reestrStore.update(currentEntry.value.id, body)
    } else {
      success = await reestrStore.create(body)
    }

    if (success) {
      formModalOpen.value = false
      currentEntry.value = null
    }
  } finally {
    formLoading.value = false
  }
}

const handleFormCancel = () => {
  formModalOpen.value = false
  currentEntry.value = null
}

const handleDelete = async (id: string) => {
  await reestrStore.deleteEntry(id)
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => key !== id)
}

const selectAllCurrentPage = () => {
  selectedRowKeys.value = reestrStore.entries.map((entry) => entry.id)
}

const clearSelection = () => {
  selectedRowKeys.value = []
}

const handleDeleteSelected = async () => {
  const ids = [...selectedRowKeys.value]
  const success = await reestrStore.deleteEntries(ids)
  if (success) {
    selectedRowKeys.value = []
  }
}

const handleFileUpload = async (file: File) => {
  const success = await reestrStore.uploadFile(file)
  if (success) {
    uploadModalOpen.value = false
  }
}
</script>

<style scoped>
.reestr-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
