<template>
  <div class="pending-invoice-picker">
    <div class="section-bar">
      <span class="section-label">{{ t('transit.invoysLabel') }}</span>
      <a-upload
        :show-upload-list="false"
        :before-upload="beforeUpload"
        :custom-request="() => {}"
        accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
      >
        <a-button size="small">
          <UploadOutlined />
          {{ t('transit.zagruzitInvoys') }}
        </a-button>
      </a-upload>
    </div>

    <div v-if="!modelValue.length" class="empty-state">
      {{ t('transit.invoysBudetPrikreplenPosle') }}
    </div>

    <div v-for="(file, idx) in modelValue" :key="idx" class="invoice-file-chip">
      <PaperClipOutlined />
      <span class="file-name">{{ file.name }}</span>
      <a-button type="text" size="small" danger class="del-btn" @click="removeFile(idx)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { CloseOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

// Аудит 2026-09-28, п.10: строки компонента были захардкожены на русском.
const { t } = useI18n()

const props = defineProps<{
  modelValue: File[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: File[]): void
}>()

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    message.error(t('transit.razmerFaylaNeDolzhen'))
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
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--z-ink);
}

.empty-state {
  font-size: 12px;
  color: var(--z-muted);
  font-style: italic;
}

.invoice-file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--z-line);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--z-surface);
}

.file-name {
  flex: 1;
}

:not(#z) .del-btn {
  padding: 0 4px;
  height: 20px;
  font-size: 13px;
}
</style>
