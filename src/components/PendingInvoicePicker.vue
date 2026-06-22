<template>
  <div class="pending-invoice-picker">
    <div class="section-bar">
      <span class="section-label">ИНВОЙС</span>
      <a-upload
        :show-upload-list="false"
        :before-upload="beforeUpload"
        :custom-request="() => {}"
        accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
      >
        <a-button size="small">
          <UploadOutlined />
          Загрузить инвойс
        </a-button>
      </a-upload>
    </div>

    <div v-if="!modelValue.length" class="empty-state">
      Инвойс будет прикреплен после сохранения партии
    </div>

    <div v-for="(file, idx) in modelValue" :key="idx" class="invoice-file-chip">
      <PaperClipOutlined />
      <span class="file-name">{{ file.name }}</span>
      <a-button type="text" size="small" danger class="del-btn" @click="removeFile(idx)">✕</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  modelValue: File[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: File[]): void
}>()

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    message.error('Размер файла не должен превышать 10 МБ')
    return false
  }
  emit('update:modelValue', [...props.modelValue, file as File])
  return false
}

const removeFile = (idx: number) => {
  const next = [...props.modelValue]
  next.splice(idx, 1)
  emit('update:modelValue', next)
}
</script>

<style scoped>
.pending-invoice-picker {
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
}

.del-btn {
  padding: 0 4px !important;
  height: 20px !important;
  font-size: 13px !important;
}
</style>
