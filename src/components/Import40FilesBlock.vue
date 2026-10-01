<template>
  <div class="files-block">
    <input
      ref="inputRef"
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
      style="display: none"
      @change="onPicked"
    />
    <div v-if="!files.length" class="files-empty">{{ emptyText || 'Файлов нет' }}</div>
    <div v-else class="files-list">
      <div v-for="f in files" :key="f.id" class="file-chip">
        <a class="file-name" @click.prevent="emit('download', f)">
          <PaperClipOutlined /> {{ f.originalFileName }}
        </a>
        <span class="file-meta">{{ formatSize(f.sizeBytes) }} · {{ roleLabel(f.uploadedByBusinessRole) }}<template v-if="f.uploadedByStaffName && !clientView"> ({{ t('import40Case.uploadedByStaff', { name: f.uploadedByStaffName }) }})</template></span>
        <a-popconfirm v-if="canRemove" :title="t('import40Case.deleteFileConfirm', { name: f.originalFileName })" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" @confirm="emit('remove', f)">
          <a-button type="text" danger size="small" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
        </a-popconfirm>
      </div>
    </div>
    <a-button v-if="canUpload" size="small" :loading="uploading" @click="inputRef?.click()">
      <UploadOutlined /> {{ uploadLabel || 'Загрузить файл' }}
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloseOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons-vue'
import type { Import40FileDto } from '@/api/import40'

const { t } = useI18n()

const props = defineProps<{
  files: Import40FileDto[]
  canUpload?: boolean
  canRemove?: boolean
  uploading?: boolean
  emptyText?: string
  uploadLabel?: string
  // Клиентский вид (аудит 5.19): вместо кода бизнес-роли — «вы»/«AQNIET», имя сотрудника,
  // загрузившего файл за клиента, не показываем (это уже «AQNIET», без ФИО).
  clientView?: boolean
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

// Метка роли — через общий словарь ролей (аудит M18): раньше был свой мини-словарь с «РОП»/«МПП»
// без перевода и без accountant/sales, роль kpp тоже отображается как есть (KPP снова роль — 2.1).
// Клиенту — только «вы»/«AQNIET» (аудит 5.19): роли и коды сотрудников ему ни о чём не говорят.
const roleLabel = (r: string) => {
  const role = (r ?? '').toLowerCase()
  if (props.clientView) return role === 'client' ? t('enum.role.you') : t('enum.role.us')
  return t('enum.businessRole.' + role, r)
}
</script>

<style scoped>
.files-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.files-empty {
  color: var(--z-muted);
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
  color: var(--z-muted);
  font-size: 12px;
}
</style>
