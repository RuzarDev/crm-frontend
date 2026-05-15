<template>
  <div class="reestr-documents">
    <a-spin :spinning="loading">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <div v-for="section in sections" :key="section.key" class="doc-section">
          <div class="doc-section-header">
            <span class="doc-section-title">{{ section.title }}</span>
            <a-upload
              v-if="section.canUpload"
              :show-upload-list="false"
              :before-upload="beforeUpload(section.key)"
              :custom-request="() => {}"
            >
              <a-button size="small" type="primary" ghost>
                <UploadOutlined />
                Загрузить
              </a-button>
            </a-upload>
          </div>
          <a-list
            v-if="documentsBySection(section.key).length"
            size="small"
            :data-source="documentsBySection(section.key)"
            bordered
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>
                    <a-button type="link" size="small" @click="handleDownload(item)">
                      {{ item.originalFileName }}
                    </a-button>
                  </template>
                  <template #description>
                    {{ formatRole(item.uploadedByRole) }} · {{ formatDate(item.createdAtUtc) }} ·
                    {{ formatSize(item.sizeBytes) }}
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-popconfirm
                    v-if="canDeleteDocument(item)"
                    title="Удалить документ?"
                    ok-text="Да"
                    cancel-text="Нет"
                    @confirm="handleDelete(item)"
                  >
                    <a-button type="link" danger size="small">Удалить</a-button>
                  </a-popconfirm>
                </template>
              </a-list-item>
            </template>
          </a-list>
          <a-empty v-else :image="simpleImage" description="Нет документов" />
        </div>
      </a-space>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Empty, message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { UploadOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import type { ReestrDocumentDto, ReestrDocumentSection } from '@/types/api'
import { formatRole } from '@/utils/labels'

interface Props {
  reestrId: string
}

const props = defineProps<Props>()
const authStore = useAuthStore()
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE

const loading = ref(false)
const documents = ref<ReestrDocumentDto[]>([])

const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']

const role = computed(() => (authStore.role || '').trim().toLowerCase())

const sections = computed(() => [
  {
    key: 'client' as ReestrDocumentSection,
    title: 'Документы клиента',
    canUpload: role.value === 'client' || role.value === 'administrator',
  },
  {
    key: 'broker' as ReestrDocumentSection,
    title: 'Документы брокера',
    canUpload:
      (role.value === 'broker' && authStore.hasPermission('reestr.write')) ||
      role.value === 'administrator',
  },
])

const documentsBySection = (section: ReestrDocumentSection) =>
  documents.value.filter((d) => d.section === section)

const formatDate = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm')

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} Б`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

const canDeleteDocument = (doc: ReestrDocumentDto) => {
  if (!authStore.hasPermission('reestr.write')) {
    return false
  }
  if (role.value === 'client') {
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
  (section: ReestrDocumentSection): UploadProps['beforeUpload'] =>
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
    void uploadFile(file as File, section)
    return false
  }

const uploadFile = async (file: File, section: ReestrDocumentSection) => {
  loading.value = true
  try {
    await reestrApi.uploadDocument(props.reestrId, section, file)
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
</style>
