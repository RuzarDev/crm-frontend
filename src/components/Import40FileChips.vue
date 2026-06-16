<template>
  <div v-if="items.length" class="file-chips">
    <button
      v-for="file in items"
      :key="file.id"
      type="button"
      class="file-chip"
      @click="emit('download', file)"
    >
      <PaperClipOutlined />
      <span class="file-chip-name">{{ file.originalFileName }}</span>
      <DownloadOutlined class="file-chip-download" />
    </button>
  </div>
  <p v-else-if="empty" class="file-chips-empty">{{ empty }}</p>
</template>

<script setup lang="ts" generic="T extends { id: string; originalFileName: string }">
import { DownloadOutlined, PaperClipOutlined } from '@ant-design/icons-vue'

defineProps<{
  items: T[]
  empty?: string
}>()

const emit = defineEmits<{
  (e: 'download', file: T): void
}>()
</script>

<style scoped>
.file-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--atg-line);
  border-radius: 999px;
  background: var(--atg-surface, #fff);
  color: var(--atg-ink);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.file-chip:hover {
  border-color: var(--atg-accent);
  background: rgba(43, 188, 212, 0.06);
}

.file-chip-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-chip :deep(.anticon) {
  color: var(--atg-accent-strong);
}

.file-chips-empty {
  margin: 0;
  color: var(--atg-muted);
  font-size: 12.5px;
}
</style>
