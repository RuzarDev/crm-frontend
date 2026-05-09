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
    <p class="ant-upload-text">Нажмите или перетащите файл Excel сюда</p>
    <p class="ant-upload-hint">
      Форматы .xlsx и .xls. Первая строка — названия полей.
    </p>
  </a-upload-dragger>
</template>

<script setup lang="ts">
import { InboxOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'

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
    message.error('Допустимы только файлы Excel (.xlsx, .xls)')
    return false
  }

  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    message.error('Размер файла не должен превышать 10 МБ')
    return false
  }

  return true
}

const handleUpload: UploadProps['customRequest'] = ({ file }) => {
  emit('upload', file as File)
}
</script>
