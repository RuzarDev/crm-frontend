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
    <p class="ant-upload-text">Click or drag Excel file to this area to upload</p>
    <p class="ant-upload-hint">
      Support for .xlsx and .xls files. The first row should contain field names.
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
    message.error('You can only upload Excel files (.xlsx, .xls)')
    return false
  }

  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    message.error('File must be smaller than 10MB')
    return false
  }

  return true
}

const handleUpload: UploadProps['customRequest'] = ({ file }) => {
  emit('upload', file as File)
}
</script>
