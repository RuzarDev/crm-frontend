<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import type { DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import type { ZOption } from '@/ui/options'
import FileRow from './FileRow.vue'
import { useWorkspaceDnd } from './useWorkspace'
import { fileCounts, fileTarget, filterFiles, targetLabel, type FileFilter } from './workspace'

// Панель «Входящие файлы» (доска Workspace): счётчик, «не распределено: n», сегменты «Все / Свободные / Привязаны»
// со счётчиками, строки файлов и зона загрузки (несколько файлов; тип и размер — как на сервере, проверка до отправки).
const props = defineProps<{
  pkg: DocumentPackageDto
  canLink: boolean
  canUpload: boolean
  canDelete: boolean
  uploading: boolean
  isPending: (key: string) => boolean
  /** Подпись клиента партии: компания или логин. */
  clientLabel?: (clientName: string) => string
}>()
const emit = defineEmits<{
  preview: [file: DocumentPackageFileDto]
  link: [file: DocumentPackageFileDto]
  download: [file: DocumentPackageFileDto]
  delete: [file: DocumentPackageFileDto]
  upload: [files: File[]]
}>()
const { t } = useI18n()
const dnd = useWorkspaceDnd()

/** Разрешённые типы и размер — как на сервере (DocumentPackageEndpoints: pdf, jpg, jpeg, png, docx, xlsx; 25 МБ). */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const MAX_MB = 25

const filter = ref<FileFilter>('all')
const counts = computed(() => fileCounts(props.pkg.files))
const shown = computed(() => filterFiles(props.pkg.files, filter.value))
const segments = computed<ZOption[]>(() => (['all', 'free', 'linked'] as const).map((k) => ({
  value: k, label: t(`broker.packageWorkspace.files.segment.${k}`), count: counts.value[k],
})))
const emptyText = computed(() => {
  if (!props.pkg.files.length) return t('broker.packageWorkspace.files.empty')
  return filter.value === 'free' ? t('broker.packageWorkspace.files.emptyFree') : t('broker.packageWorkspace.files.emptyLinked')
})

/** Куда привязан файл: номер контейнера или клиент партии (компания, если известна); null — не распределён. */
const target = (f: DocumentPackageFileDto): string | null => {
  const label = targetLabel(props.pkg, f)
  if (fileTarget(f, props.pkg).kind !== 'partia' || label === null) return label
  return label.trim() ? (props.clientLabel?.(label) ?? label) : t('broker.packageWorkspace.link.noClient')
}

const draggable = computed(() => !!dnd?.enabled.value)
const busy = (f: DocumentPackageFileDto) => props.isPending(`link:${f.id}`) || props.isPending(`file-delete:${f.id}`)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-1.5 rounded-panel border border-line bg-surface px-3 py-3.5" aria-labelledby="ws-files-title" data-ws-files>
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 pb-1.5">
      <h2 id="ws-files-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.packageWorkspace.files.title') }}</h2>
      <span class="rounded-pill bg-sunken px-2 text-xs font-medium tabular-nums text-ink-3" data-ws-files-count>{{ counts.all }}</span>
      <span v-if="counts.free" class="ml-auto text-xs font-medium text-gold-ink" data-ws-files-free>{{ t('broker.packageWorkspace.files.free', { n: counts.free }) }}</span>
    </div>

    <div class="overflow-x-clip">
      <div class="overflow-x-auto">
        <ZSegmented
          :value="filter"
          :options="segments"
          :aria-label="t('broker.packageWorkspace.files.segmentsLabel')"
          class="w-full [&>*]:flex-1 [&>*]:justify-center"
          data-ws-files-filter
          @update:value="filter = $event as FileFilter"
        />
      </div>
    </div>

    <ul
      v-if="shown.length"
      class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0"
      :aria-label="t('broker.packageWorkspace.files.listLabel')"
      data-ws-files-list
    >
      <FileRow
        v-for="f in shown"
        :key="f.id"
        :file="f"
        :target="target(f)"
        :draggable="draggable"
        :can-link="canLink"
        :can-delete="canDelete"
        :busy="busy(f)"
        :dragging="dnd?.dragging.value?.id === f.id"
        @preview="emit('preview', f)"
        @link="emit('link', f)"
        @download="emit('download', f)"
        @delete="emit('delete', f)"
        @dragstart="dnd?.start($event, f)"
        @dragend="dnd?.end()"
      />
    </ul>
    <p v-else class="m-0 px-1.5 py-4 text-sm text-muted" data-ws-files-empty>{{ emptyText }}</p>

    <ZUpload
      v-if="canUpload"
      type="drag"
      multiple
      :accept="ACCEPT"
      :max-size-mb="MAX_MB"
      :loading="uploading"
      class="mt-1.5 [&>[role=button]]:gap-1 [&>[role=button]]:p-4"
      data-ws-upload
      @select="emit('upload', $event)"
    >
      <span class="block text-ink-2">{{ uploading ? t('broker.packageWorkspace.files.uploading') : t('broker.packageWorkspace.files.drop') }}</span>
      <span class="block text-xs text-muted">{{ t('broker.packageWorkspace.files.dropHint') }}</span>
    </ZUpload>
  </section>
</template>
