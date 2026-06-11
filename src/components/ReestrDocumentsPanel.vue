<template>
  <div class="reestr-documents">
    <a-spin :spinning="loading">
      <a-space direction="vertical" style="width: 100%" :size="12">

        <!-- Client documents section -->
        <div class="doc-section">
          <div class="doc-section-header">
            <div class="doc-section-title-wrap">
              <span class="doc-section-dot doc-section-dot--client"></span>
              <span class="doc-section-title">Документы клиента</span>
            </div>
            <a-upload
              v-if="clientCanUpload"
              :show-upload-list="false"
              :before-upload="beforeUpload('client')"
              :custom-request="() => {}"
            >
              <a-button size="small" class="upload-btn">
                <UploadOutlined />
                Загрузить
              </a-button>
            </a-upload>
          </div>
          <reestr-document-list
            :documents="documentsBySection('client')"
            :can-delete="canDeleteDocument"
            @download="handleDownload"
            @delete="handleDelete"
          />
        </div>

        <!-- Broker documents section -->
        <div class="doc-section doc-section--broker">
          <div class="doc-section-title-wrap broker-root-title">
            <span class="doc-section-dot doc-section-dot--broker"></span>
            <span class="doc-section-title">Документы брокера</span>
          </div>

          <div v-for="slot in brokerSlots" :key="slot.type" class="broker-slot">
            <div class="doc-section-header">
              <div class="doc-section-title-wrap">
                <span class="doc-slot-label">
                  {{ slot.label }}
                  <span v-if="slot.required" class="required-mark">*</span>
                </span>
              </div>
              <a-upload
                v-if="brokerCanUpload"
                :show-upload-list="false"
                :before-upload="beforeUpload('broker', slot.type)"
                :custom-request="() => {}"
              >
                <a-button size="small" class="upload-btn">
                  <UploadOutlined />
                  Загрузить
                </a-button>
              </a-upload>
            </div>
            <reestr-document-list
              :documents="documentsByBrokerType(slot.type)"
              :can-delete="canDeleteDocument"
              @download="handleDownload"
              @delete="handleDelete"
            />
          </div>

          <div v-if="brokerSectionClosed" class="section-closed-notice">
            <LockOutlined />
            Секция закрыта — статус не допускает загрузку
          </div>
        </div>

      </a-space>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { UploadOutlined, LockOutlined } from '@ant-design/icons-vue'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import type {
  ReestrDocumentDto,
  ReestrDocumentSection,
  ReestrBrokerDocumentType,
  ReestrEntryStatus,
} from '@/types/api'
import { ReestrBrokerDocumentType as BrokerDocTypes, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import ReestrDocumentList from '@/components/ReestrDocumentList.vue'

interface Props {
  reestrId: string
  entryStatus?: ReestrEntryStatus
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
})
const authStore = useAuthStore()

const loading = ref(false)
const documents = ref<ReestrDocumentDto[]>([])

const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']

const role = computed(() => (authStore.role || '').trim().toLowerCase())

const brokerSectionClosed = computed(
  () =>
    props.entryStatus === ReestrEntryStatusValues.Archived ||
    props.entryStatus === ReestrEntryStatusValues.Released,
)

const brokerSlots = [
  {
    type: BrokerDocTypes.CustomsDeclaration,
    label: 'Таможенная декларация',
    required: true,
  },
  {
    type: BrokerDocTypes.ConformityCertificates,
    label: 'Сертификаты соответствия',
    required: false,
  },
  {
    type: BrokerDocTypes.PermitsAndLicenses,
    label: 'Разрешения и лицензии',
    required: false,
  },
  {
    type: BrokerDocTypes.Other,
    label: 'Иные документы',
    required: false,
  },
] as const

// Клиент и экспедитор всегда могут грузить свои документы — readonly касается только полей данных
const clientCanUpload = computed(
  () => role.value === 'client' || role.value === 'expeditor' || role.value === 'administrator',
)

// Брокер грузит по роли — readonly касается только полей данных, не документов брокера
const brokerCanUpload = computed(
  () =>
    !brokerSectionClosed.value &&
    (role.value === 'broker' || role.value === 'administrator'),
)

const documentsBySection = (section: ReestrDocumentSection) =>
  documents.value.filter((d) => d.section === section)

const documentsByBrokerType = (type: ReestrBrokerDocumentType) =>
  documents.value.filter(
    (d) => d.section === 'broker' && (d.brokerDocumentType ?? BrokerDocTypes.Other) === type,
  )

const canDeleteDocument = (doc: ReestrDocumentDto) => {
  if (!authStore.hasPermission('reestr.write')) return false
  if (role.value === 'client') return false
  if (doc.section === 'broker' && brokerSectionClosed.value) return false
  if (role.value === 'broker') {
    return doc.section === 'broker' && doc.uploadedByUserId === authStore.userId
  }
  return role.value === 'administrator'
}

const fetchDocuments = async () => {
  if (!props.reestrId) return
  loading.value = true
  try {
    documents.value = await reestrApi.listDocuments(props.reestrId)
  } catch {
    documents.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.reestrId, () => { fetchDocuments() }, { immediate: true })

const beforeUpload =
  (
    section: ReestrDocumentSection,
    brokerDocumentType?: ReestrBrokerDocumentType,
  ): UploadProps['beforeUpload'] =>
  (file) => {
    const name = file.name.toLowerCase()
    const ok = allowedExtensions.some((ext) => name.endsWith(ext))
    if (!ok) {
      message.error('Допустимы: PDF, JPG, PNG, DOCX, XLSX')
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error('Размер файла не должен превышать 10 МБ')
      return false
    }
    void uploadFile(file as File, section, brokerDocumentType)
    return false
  }

const uploadFile = async (
  file: File,
  section: ReestrDocumentSection,
  brokerDocumentType?: ReestrBrokerDocumentType,
) => {
  loading.value = true
  try {
    await reestrApi.uploadDocument(props.reestrId, section, file, brokerDocumentType)
    message.success('Документ загружен')
    await fetchDocuments()
  } catch {
    //
  } finally {
    loading.value = false
  }
}

const handleDownload = async (doc: ReestrDocumentDto) => {
  try {
    const blob = await reestrApi.downloadDocument(props.reestrId, doc.id)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = doc.originalFileName
    link.click()
    window.URL.revokeObjectURL(url)
  } catch {
    //
  }
}

const handleDelete = async (doc: ReestrDocumentDto) => {
  loading.value = true
  try {
    await reestrApi.deleteDocument(props.reestrId, doc.id)
    message.success('Документ удалён')
    await fetchDocuments()
  } catch {
    //
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.doc-section {
  padding: 14px 16px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
}

.doc-section--broker {
  background: #fdfbf7;
}

.doc-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.doc-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-section-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.doc-section-dot--client {
  background: var(--atg-blue);
}

.doc-section-dot--broker {
  background: var(--atg-accent);
}

.doc-section-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--atg-ink);
}

.broker-root-title {
  margin-bottom: 14px;
}

.broker-slot {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--atg-line);
  border-radius: 7px;
  background: var(--atg-surface);
}

.broker-slot:last-child {
  margin-bottom: 0;
}

.doc-slot-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--atg-charcoal);
}

.required-mark {
  color: #ff4d4f;
  margin-left: 2px;
}

.upload-btn {
  color: var(--atg-accent-strong);
  border-color: rgba(200, 149, 53, 0.35);
  background: var(--atg-accent-soft);
  font-size: 12px;
  font-weight: 600;
}

.upload-btn:hover {
  color: var(--atg-ink) !important;
  border-color: var(--atg-accent) !important;
  background: var(--atg-accent-soft) !important;
}

.section-closed-notice {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--atg-surface-muted);
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
}

.doc-section :deep(.ant-list) {
  border-color: var(--atg-line);
  border-radius: var(--atg-radius-sm);
}

.doc-section :deep(.ant-list-item-meta-title) {
  margin-bottom: 0;
}

.doc-section :deep(.ant-empty) {
  margin: 12px 0 4px;
}
</style>
