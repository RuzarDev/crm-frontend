<template>
  <a-upload-dragger
    :before-upload="beforeUpload"
    :custom-request="handleUpload"
    :show-upload-list="false"
    accept=".xlsx,.xls"
  >
    <p class="ant-upload-drag-icon">
      <InboxOutlined />
    </p>
    <p class="ant-upload-text">{{ t('transit.nazhmiteIliPeretaschiteFayl') }}</p>
    <p class="ant-upload-hint">
      {{ t('transit.formatyXlsxIXlsPervaya') }}
    </p>
  </a-upload-dragger>
</template>

<script setup lang="ts">
import { InboxOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

// Аудит 2026-09-28, п.10: строки компонента были захардкожены на русском.
const { t } = useI18n()

interface Emits {
  (e: 'upload', file: File): void
}

const emit = defineEmits<Emits>()

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  const isExcel =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls')

  if (!isExcel) {
    message.error(t('transit.dopustimyTolkoFaylyExcel'))
    return false
  }

  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    message.error(t('transit.razmerFaylaNeDolzhen'))
    return false
  }

  return true
}

const handleUpload: UploadProps['customRequest'] = ({ file }) => {
  emit('upload', file as File)
}
</script>
