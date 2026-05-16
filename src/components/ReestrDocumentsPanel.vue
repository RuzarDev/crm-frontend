<template>
  <div class="reestr-documents">
    <a-spin :spinning="loading">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <div class="doc-section">
          <div class="doc-section-header">
            <span class="doc-section-title">Документы клиента</span>
            <a-upload
              v-if="clientCanUpload"
              :show-upload-list="false"
              :before-upload="beforeUpload('client')"
              :custom-request="() => {}"
            >
              <a-button size="small" type="primary" ghost>
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

        <div class="doc-section">
          <div class="doc-section-title broker-root-title">Документы брокера</div>
          <div v-for="slot in brokerSlots" :key="slot.type" class="broker-slot">
            <div class="doc-section-header">
              <span class="doc-section-title">
                {{ slot.label }}
                <span v-if="slot.required" class="required-mark">*</span>
              </span>
              <a-upload
                v-if="brokerCanUpload"
                :show-upload-list="false"
                :before-upload="beforeUpload('broker', slot.type)"
                :custom-request="() => {}"
              >
                <a-button size="small" type="primary" ghost>
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
        </div>
      </a-space>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { UploadOutlined } from '@ant-design/icons-vue'
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

const clientCanUpload = computed(
  () => !props.readonly && (role.value === 'client' || role.value === 'administrator'),
)

const brokerCanUpload = computed(
  () =>
    !props.readonly &&
    !brokerSectionClosed.value &&
    ((role.value === 'broker' && authStore.hasPermission('reestr.write')) ||
      role.value === 'administrator'),
)

const documentsBySection = (section: ReestrDocumentSection) =>
  documents.value.filter((d) => d.section === section)

const documentsByBrokerType = (type: ReestrBrokerDocumentType) =>
  documents.value.filter(
    (d) => d.section === 'broker' && (d.brokerDocumentType ?? BrokerDocTypes.Other) === type,
  )

const canDeleteDocument = (doc: ReestrDocumentDto) => {
  if (!authStore.hasPermission('reestr.write')) {
    return false
  }
  if (role.value === 'client') {
    return false
  }
  if (doc.section === 'broker' && brokerSectionClosed.value) {
    return false
  }
  if (role.value === 'broker') {
    return doc.section === 'broker' && doc.uploadedByUserId === authStore.userId
  }
  return role.value === 'administrator'
}

const fetchDocuments = async () => {
  if (!props.reestrId) {
    return
  }
  loading.value = true
  try {
    documents.value = await reestrApi.listDocuments(props.reestrId)
  } catch {
    documents.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.reestrId,
  () => {
    fetchDocuments()
  },
  { immediate: true },
)

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
.doc-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.doc-section-title {
  font-weight: 600;
  color: #262626;
}

.broker-root-title {
  margin-bottom: 12px;
}

.broker-slot {
  margin-bottom: 16px;
  padding-left: 8px;
  border-left: 2px solid #f0f0f0;
}

.required-mark {
  color: #ff4d4f;
}
</style>
