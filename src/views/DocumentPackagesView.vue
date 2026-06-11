<template>
  <div class="document-packages-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Документы экспедитора</div>
        <h1 class="crm-page-title">Пакеты документов</h1>
        <p class="crm-page-subtitle">
          Входящие файлы по поездам и составам до разбора брокером в строки реестра.
        </p>
      </div>
      <div class="crm-page-actions">
        <a-button v-if="canCreate" type="primary" @click="openCreateModal">
          <PlusOutlined />
          Создать пакет
        </a-button>
      </div>
    </div>

    <a-alert
      v-if="isClient"
      type="warning"
      show-icon
      message="Этот раздел доступен экспедиторам, брокерам и администраторам."
    />

    <template v-else>
      <a-card v-if="isExpeditor" class="crm-shell-card clients-card" :bordered="false">
        <template #title>
          <span class="card-title">
            <TeamOutlined />
            Ваши клиенты
          </span>
        </template>
        <a-spin :spinning="clientsLoading">
          <div v-if="clients.length" class="client-chips">
            <span v-for="client in clients" :key="client.id" class="client-chip">
              {{ client.username }}
              <small>{{ client.declarationCount }}</small>
            </span>
          </div>
          <a-empty v-else description="Клиенты пока не привязаны" />
        </a-spin>
      </a-card>

      <a-card class="crm-shell-card" :bordered="false">
        <div class="toolbar">
          <a-input
            v-model:value="search"
            allow-clear
            placeholder="Найти по номеру поезда"
            class="search-input"
            @pressEnter="fetchPackages"
            @change="fetchPackages"
          >
            <template #prefix>
              <SearchOutlined style="color: var(--atg-muted)" />
            </template>
          </a-input>
          <div class="toolbar-sep"></div>
          <a-select
            v-model:value="statusFilter"
            allow-clear
            placeholder="Фильтр: статус"
            class="status-filter"
            :options="statusOptions"
            @change="fetchPackages"
          />
          <a-button class="refresh-btn" title="Обновить" @click="fetchPackages">
            <ReloadOutlined />
          </a-button>
        </div>

        <a-table
          :columns="columns"
          :data-source="packages"
          :loading="loading"
          :pagination="{ pageSize: 10 }"
          row-key="id"
          class="packages-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'trainNumber'">
              <button class="link-button" @click="openDetails(record)">
                {{ record.trainNumber }}
              </button>
              <div v-if="record.comment" class="muted">{{ record.comment }}</div>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">
                {{ statusLabel(record.status) }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'files'">
              {{ record.files.length }}
            </template>
            <template v-else-if="column.key === 'createdAtUtc'">
              {{ formatDate(record.createdAtUtc) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openDetails(record)">Открыть</a-button>
                <a-dropdown v-if="canReview">
                  <a-button size="small">
                    Статус
                    <DownOutlined />
                  </a-button>
                  <template #overlay>
                    <a-menu @click="handleStatusMenu(record, $event)">
                      <a-menu-item key="accepted">Принять</a-menu-item>
                      <a-menu-item key="needsFix">Нужно исправить</a-menu-item>
                      <a-menu-item key="processed">Обработан</a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </a-space>
            </template>
          </template>
          <template #emptyText>
            <a-empty
              description="Пакеты документов не найдены"
              :image-size="64"
            />
          </template>
        </a-table>
      </a-card>
    </template>

    <a-modal
      v-model:open="createOpen"
      title="Новый пакет документов"
      :confirm-loading="creating"
      ok-text="Создать"
      cancel-text="Отмена"
      @ok="createPackage"
    >
      <a-form layout="vertical">
        <a-form-item label="Номер поезда / состава" required>
          <a-input v-model:value="createForm.trainNumber" placeholder="Например: 2457 / ATG-12" />
        </a-form-item>
        <a-form-item label="Комментарий">
          <a-textarea
            v-model:value="createForm.comment"
            :rows="2"
            placeholder="Необязательно"
          />
        </a-form-item>
        <a-form-item label="Номера контейнеров (черновик)">
          <a-textarea
            v-model:value="createForm.containersInput"
            :rows="3"
            placeholder="Введите номера контейнеров, каждый с новой строки (необязательно)"
          />
        </a-form-item>
        <a-form-item label="Файлы">
          <input class="native-file" type="file" multiple @change="handleCreateFiles" />
          <div v-if="createFiles.length" class="selected-files">
            <span v-for="file in createFiles" :key="file.name + file.size">{{ file.name }}</span>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailsOpen"
      :width="560"
      title="Пакет документов"
      class="package-drawer"
    >
      <template v-if="selectedPackage">
        <a-button v-if="canReview" type="primary" block @click="goToWorkspace(selectedPackage.id)" style="margin-bottom: 20px;">
          Открыть рабочую область разбора (Broker Workspace)
        </a-button>
        <div class="details-head">
          <div>
            <p class="eyebrow">Поезд / состав</p>
            <h2>{{ selectedPackage.trainNumber }}</h2>
            <p class="muted">{{ selectedPackage.createdByExpeditorUsername }}</p>
          </div>
          <a-tag :color="statusColor(selectedPackage.status)">
            {{ statusLabel(selectedPackage.status) }}
          </a-tag>
        </div>

        <p v-if="selectedPackage.comment" class="comment">{{ selectedPackage.comment }}</p>
        <p v-if="selectedPackage.reviewComment" class="review-comment">
          {{ selectedPackage.reviewComment }}
        </p>

        <div v-if="canUploadToSelected" class="detail-upload">
          <input class="native-file" type="file" multiple @change="handleDetailFiles" />
        </div>

        <a-list :data-source="selectedPackage.files" bordered>
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #title>{{ item.originalFileName }}</template>
                <template #description>
                  {{ formatFileSize(item.sizeBytes) }} · {{ formatDate(item.uploadedAtUtc) }}
                </template>
              </a-list-item-meta>
              <a-space>
                <a-button size="small" @click="downloadFile(item)">
                  <DownloadOutlined />
                </a-button>
                <a-button
                  v-if="canUploadToSelected"
                  size="small"
                  danger
                  @click="deleteFile(item)"
                >
                  <DeleteOutlined />
                </a-button>
              </a-space>
            </a-list-item>
          </template>
        </a-list>

        <a-empty v-if="!selectedPackage.files.length" description="Файлы еще не загружены" />
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
import { documentPackagesApi } from '@/api/documentPackages'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import type {
  DocumentPackageDto,
  DocumentPackageFileDto,
  DocumentPackageStatus,
  ReestrClientOption,
} from '@/types/api'

const router = useRouter()
const authStore = useAuthStore()

const goToWorkspace = (id: string) => {
  detailsOpen.value = false
  router.push(`/document-packages/${id}/workspace`)
}

const role = computed(() => (authStore.role || '').trim().toLowerCase())
const isExpeditor = computed(() => role.value === 'expeditor')
const isClient = computed(() => role.value === 'client')
const canCreate = computed(() => role.value === 'expeditor' || role.value === 'administrator')
const canReview = computed(() => role.value === 'broker' || role.value === 'administrator')

const loading = ref(false)
const clientsLoading = ref(false)
const creating = ref(false)
const packages = ref<DocumentPackageDto[]>([])
const clients = ref<ReestrClientOption[]>([])
const search = ref('')
const statusFilter = ref<DocumentPackageStatus | undefined>()
const createOpen = ref(false)
const detailsOpen = ref(false)
const selectedPackage = ref<DocumentPackageDto | null>(null)
const createFiles = ref<File[]>([])

const createForm = reactive({
  trainNumber: '',
  comment: '',
  containersInput: '',
})

const statusOptions = [
  { value: 'uploaded', label: 'Загружен' },
  { value: 'accepted', label: 'Принят брокером' },
  { value: 'needsFix', label: 'Нужно исправить' },
  { value: 'processed', label: 'Обработан' },
]

const columns = computed(() => [
  { title: 'Поезд / состав', key: 'trainNumber', dataIndex: 'trainNumber' },
  ...(canReview.value
    ? [{ title: 'Экспедитор', key: 'createdByExpeditorUsername', dataIndex: 'createdByExpeditorUsername' }]
    : []),
  { title: 'Статус', key: 'status', dataIndex: 'status', width: 170 },
  { title: 'Файлы', key: 'files', width: 90 },
  { title: 'Создан', key: 'createdAtUtc', dataIndex: 'createdAtUtc', width: 160 },
  { title: 'Действия', key: 'actions', width: 220 },
])

const canUploadToSelected = computed(() => {
  if (!selectedPackage.value) return false
  if (role.value === 'administrator') return true
  return (
    role.value === 'expeditor' &&
    ['uploaded', 'needsFix'].includes(selectedPackage.value.status)
  )
})

onMounted(async () => {
  await Promise.all([fetchPackages(), fetchClients()])
})

const fetchPackages = async () => {
  if (isClient.value) return
  loading.value = true
  try {
    const response = await documentPackagesApi.list({
      search: search.value,
      status: statusFilter.value ?? null,
    })
    packages.value = response.items
  } finally {
    loading.value = false
  }
}

const fetchClients = async () => {
  if (!isExpeditor.value) return
  clientsLoading.value = true
  try {
    clients.value = await reestrApi.listPortfolioClients()
  } finally {
    clientsLoading.value = false
  }
}

const openCreateModal = () => {
  createForm.trainNumber = ''
  createForm.comment = ''
  createForm.containersInput = ''
  createFiles.value = []
  createOpen.value = true
}

const handleCreateFiles = (event: Event) => {
  const input = event.target as HTMLInputElement
  createFiles.value = Array.from(input.files ?? [])
}

const handleDetailFiles = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!selectedPackage.value || !files.length) return
  await uploadFiles(selectedPackage.value.id, files)
  input.value = ''
}

const createPackage = async () => {
  if (!createForm.trainNumber.trim()) {
    message.error('Укажите номер поезда / состава')
    return
  }

  creating.value = true
  try {
    const containerNumbers = (createForm.containersInput || '')
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    const created = await documentPackagesApi.create({
      trainNumber: createForm.trainNumber.trim(),
      comment: createForm.comment.trim() || null,
      containerNumbers,
    })
    if (createFiles.value.length) {
      await uploadFiles(created.id, createFiles.value, false)
    }
    createOpen.value = false
    message.success('Пакет создан')
    await fetchPackages()
  } finally {
    creating.value = false
  }
}

const uploadFiles = async (packageId: string, files: File[], refresh = true) => {
  for (const file of files) {
    await documentPackagesApi.uploadFile(packageId, file)
  }
  message.success('Файлы загружены')
  if (refresh) {
    await refreshSelected(packageId)
    await fetchPackages()
  }
}

const openDetails = async (record: DocumentPackageDto) => {
  selectedPackage.value = record
  detailsOpen.value = true
  await refreshSelected(record.id)
}

const refreshSelected = async (id: string) => {
  selectedPackage.value = await documentPackagesApi.getById(id)
}

const updateStatus = async (record: DocumentPackageDto, status: DocumentPackageStatus) => {
  const updated = await documentPackagesApi.changeStatus(record.id, { status })
  message.success('Статус обновлен')
  if (selectedPackage.value?.id === updated.id) {
    selectedPackage.value = updated
  }
  await fetchPackages()
}

const handleStatusMenu = (
  record: DocumentPackageDto,
  event: { key: string | number },
) => {
  updateStatus(record, event.key as DocumentPackageStatus)
}

const downloadFile = async (file: DocumentPackageFileDto) => {
  if (!selectedPackage.value) return
  const blob = await documentPackagesApi.downloadFile(selectedPackage.value.id, file.id)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.originalFileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const deleteFile = async (file: DocumentPackageFileDto) => {
  if (!selectedPackage.value) return
  await documentPackagesApi.deleteFile(selectedPackage.value.id, file.id)
  message.success('Файл удален')
  await refreshSelected(selectedPackage.value.id)
  await fetchPackages()
}

const statusLabel = (status: DocumentPackageStatus) =>
  statusOptions.find((x) => x.value === status)?.label ?? status

const statusColor = (status: DocumentPackageStatus) => {
  const map: Record<DocumentPackageStatus, string> = {
    uploaded: 'blue',
    accepted: 'green',
    needsFix: 'orange',
    processed: 'purple',
  }
  return map[status]
}

const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU')

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
</script>

<style scoped>
.document-packages-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Remove any left-border artifact — crm-shell-card should only have top teal border */
.document-packages-view :deep(.crm-shell-card),
.document-packages-view :deep(.ant-card) {
  border-left: 1px solid var(--atg-line) !important;
  border-right: 1px solid var(--atg-line) !important;
  border-bottom: 1px solid var(--atg-line) !important;
}

/* Make packages-table fill card without extra wrapper border */
.document-packages-view :deep(.ant-table-wrapper) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

.muted {
  margin: 4px 0 0;
  color: var(--atg-muted);
  font-size: 12.5px;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--atg-ink);
}

.client-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.client-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid rgba(43, 188, 212, 0.28);
  border-radius: 8px;
  color: var(--atg-text);
  background: rgba(43, 188, 212, 0.06);
  font-size: 13px;
  font-weight: 600;
}

.client-chip small {
  color: var(--atg-muted);
  font-size: 11.5px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--atg-line);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(27, 42, 74, 0.05);
}

.toolbar-sep {
  width: 1px;
  height: 22px;
  background: var(--atg-line-strong);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 180px;
  max-width: 360px;
}

.status-filter {
  width: 190px;
  flex-shrink: 0;
}

.refresh-btn {
  flex-shrink: 0;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  padding: 0 !important;
  border-radius: 8px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-color: var(--atg-line) !important;
  color: var(--atg-muted) !important;
  transition: color 0.15s, background 0.15s !important;
}

.refresh-btn:hover {
  color: var(--atg-accent-strong) !important;
  background: var(--atg-teal-soft) !important;
  border-color: var(--atg-accent-strong) !important;
}

.status-filter {
  width: 210px;
}

.link-button {
  padding: 0;
  border: 0;
  color: var(--atg-accent-strong);
  font: inherit;
  font-weight: 700;
  background: transparent;
  cursor: pointer;
  transition: color var(--atg-transition);
}

.link-button:hover {
  color: var(--atg-teal-dark);
  text-decoration: underline;
}

.native-file {
  width: 100%;
  padding: 12px;
  border: 1.5px dashed var(--atg-line-strong);
  border-radius: 8px;
  background: var(--atg-bg);
  cursor: pointer;
  transition: border-color var(--atg-transition);
}

.native-file:hover {
  border-color: var(--atg-teal);
}

.selected-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  color: var(--atg-muted);
  font-size: 12px;
}

.details-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--atg-line);
}

.details-head h2 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--atg-ink);
}

.details-head p {
  font-size: 12.5px;
  color: var(--atg-muted);
  margin: 2px 0 0;
}

.details-head .eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--atg-accent-strong);
}

.comment,
.review-comment {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--atg-bg);
  border: 1px solid var(--atg-line);
  margin-bottom: 12px;
  font-size: 13.5px;
  color: var(--atg-charcoal);
}

.review-comment {
  border-left: 3px solid var(--atg-gold);
  background: var(--atg-gold-soft);
}

.detail-upload {
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .search-input,
  .status-filter {
    width: 100%;
    max-width: none;
  }
}
</style>
