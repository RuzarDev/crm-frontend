<template>
  <div class="invoice-file-section">
    <div class="section-bar">
      <span class="section-label">ИНВОЙС</span>
      <a-upload
        :show-upload-list="false"
        :before-upload="beforeUpload"
        :custom-request="() => {}"
        accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
      >
        <a-button size="small" :loading="uploading">
          <UploadOutlined />
          Загрузить инвойс
        </a-button>
      </a-upload>
    </div>

    <div v-if="!files.length" class="empty-state">
      Инвойс еще не прикреплен
    </div>

    <div v-for="file in files" :key="file.id" class="invoice-file-chip">
      <PaperClipOutlined />
      <span class="file-name" @click="download(file)">{{ file.originalFileName }}</span>
      <a-popconfirm title="Удалить файл инвойса?" ok-text="Да" cancel-text="Нет" @confirm="remove(file)">
        <a-button type="text" size="small" danger class="del-btn">✕</a-button>
      </a-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageFileDto } from '@/types/api'

const props = defineProps<{
  packageId: string
  consolidationId: string
  files: DocumentPackageFileDto[]
}>()

const emit = defineEmits<{
  (e: 'uploaded'): void
  (e: 'deleted'): void
}>()

const uploading = ref(false)

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    message.error('Размер файла не должен превышать 10 МБ')
    return false
  }
  void upload(file as File)
  return false
}

const upload = async (file: File) => {
  uploading.value = true
  try {
    const uploaded = await documentPackagesApi.uploadFile(props.packageId, file)
    await documentPackagesApi.linkFile(props.packageId, uploaded.id, {
      containerId: null,
      clientConsolidationId: props.consolidationId,
      documentType: 'invoice',
    })
    message.success('Инвойс прикреплен')
    emit('uploaded')
  } catch {
    message.error('Не удалось загрузить инвойс')
  } finally {
    uploading.value = false
  }
}

const download = async (file: DocumentPackageFileDto) => {
  try {
    const blob = await documentPackagesApi.downloadFile(props.packageId, file.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.originalFileName
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    message.error('Не удалось скачать файл')
  }
}

const remove = async (file: DocumentPackageFileDto) => {
  try {
    await documentPackagesApi.deleteFile(props.packageId, file.id)
    message.success('Файл удален')
    emit('deleted')
  } catch {
    message.error('Не удалось удалить файл')
  }
}
</script>

<style scoped>
.invoice-file-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  letter-spacing: 0.06em;
}

.empty-state {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
}

.invoice-file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--atg-surface, var(--atg-bg));
}

.file-name {
  flex: 1;
  cursor: pointer;
  color: var(--atg-accent-strong);
}

.file-name:hover {
  text-decoration: underline;
}

.del-btn {
  padding: 0 4px !important;
  height: 20px !important;
  font-size: 13px !important;
}
</style>
