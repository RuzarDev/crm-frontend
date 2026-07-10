<template>
  <div class="files-block">
    <input ref="inputRef" type="file" style="display: none" @change="onPicked" />
    <div v-if="!files.length" class="files-empty">{{ emptyText || 'Файлов нет' }}</div>
    <div v-else class="files-list">
      <div v-for="f in files" :key="f.id" class="file-chip">
        <a class="file-name" @click.prevent="emit('download', f)">
          <PaperClipOutlined /> {{ f.originalFileName }}
        </a>
        <span class="file-meta">{{ formatSize(f.sizeBytes) }} · {{ roleLabel(f.uploadedByBusinessRole) }}</span>
        <a-button v-if="canRemove" type="text" danger size="small" @click="emit('remove', f)">✕</a-button>
      </div>
    </div>
    <a-button v-if="canUpload" size="small" :loading="uploading" @click="inputRef?.click()">
      <UploadOutlined /> {{ uploadLabel || 'Загрузить файл' }}
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons-vue'
import type { Import40FileDto } from '@/api/import40'

defineProps<{
  files: Import40FileDto[]
  canUpload?: boolean
  canRemove?: boolean
  uploading?: boolean
  emptyText?: string
  uploadLabel?: string
}>()

const emit = defineEmits<{
  (e: 'upload', file: File): void
  (e: 'download', file: Import40FileDto): void
  (e: 'remove', file: Import40FileDto): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const onPicked = (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload', file)
  input.value = ''
}

const formatSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`

const roleLabel = (r: string) =>
  ({ client: 'клиент', kpp: 'КПП', declarant: 'декларант', rop: 'РОП', mpp: 'МПП' })[r?.toLowerCase()] ?? r
</script>

<style scoped>
.files-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.files-empty {
  color: var(--atg-muted);
  font-size: 12px;
}
.files-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
.file-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.file-name {
  cursor: pointer;
}
.file-meta {
  color: var(--atg-muted);
  font-size: 12px;
}
</style>
