<template>
  <a-list v-if="documents.length" size="small" :data-source="documents" bordered>
    <template #renderItem="{ item }">
      <a-list-item>
        <a-list-item-meta>
          <template #title>
            <a-button type="link" size="small" @click="emit('download', item)">
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
            v-if="canDelete(item)"
            title="Удалить документ?"
            ok-text="Да"
            cancel-text="Нет"
            @confirm="emit('delete', item)"
          >
            <a-button type="link" danger size="small">Удалить</a-button>
          </a-popconfirm>
        </template>
      </a-list-item>
    </template>
  </a-list>
  <a-empty v-else :image="simpleImage" description="Нет документов" />
</template>

<script setup lang="ts">
import { Empty } from 'ant-design-vue'
import dayjs from 'dayjs'
import type { ReestrDocumentDto } from '@/types/api'
import { formatRole } from '@/utils/labels'

defineProps<{
  documents: ReestrDocumentDto[]
  canDelete: (doc: ReestrDocumentDto) => boolean
}>()

const emit = defineEmits<{
  download: [doc: ReestrDocumentDto]
  delete: [doc: ReestrDocumentDto]
}>()

const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE

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
</script>
