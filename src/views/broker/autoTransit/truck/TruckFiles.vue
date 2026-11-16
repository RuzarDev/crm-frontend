<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import type { FilePatch, Party, TruckFile } from '@/api/autoTransit'
import UploadQueueList from '../new/UploadQueueList.vue'
import type { QueueItem } from '../new/useUploadQueue'
import FileChip from './FileChip.vue'
import UploadButtons from './UploadButtons.vue'
import type { UploadProgress } from './useTruck'
import type { TruckRights } from './truckView'

// Общие документы машины (без партии), «Добавить фото / файл», «Скачать всё» (только когда у машины есть файлы:
// пустой архив сервер отдаёт 400) и строки очереди загрузки (ход каждого файла, «Повторить» у упавших).
const props = defineProps<{
  files: TruckFile[]
  parties: Party[]
  hasAnyFiles: boolean
  rights: TruckRights
  busy?: boolean
  uploading: UploadProgress | null
  queue: QueueItem[]
  zipping?: boolean
}>()
const emit = defineEmits<{
  upload: [files: File[]]
  zip: []
  download: [file: TruckFile]
  patch: [file: TruckFile, patch: FilePatch]
  remove: [file: TruckFile]
  retry: [index: number]
  retryAll: []
  dropUpload: [index: number]
}>()
const { t } = useI18n()
const retryableCount = computed(() => props.queue.filter((i) => i.state === 'failed' && i.retryable).length)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-2.5" aria-labelledby="truck-files-title" data-truck-files>
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="truck-files-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.autoTransit.file.truckTitle') }}</h2>
      <ZButton v-if="hasAnyFiles" size="sm" variant="ghost" class="ml-auto max-sm:h-11" :loading="zipping" data-truck-zip @click="emit('zip')">
        <PhDownloadSimple :size="15" aria-hidden="true" />{{ t('broker.autoTransit.file.downloadAll') }}
      </ZButton>
    </div>
    <UploadButtons v-if="rights.upload" :disabled="busy && !uploading" :loading="!!uploading" @files="emit('upload', $event)" />
    <p v-if="uploading" class="m-0 min-w-0 truncate text-xs text-ink-2" role="status" data-upload-progress>
      {{ t('broker.autoTransit.file.uploading', { i: uploading.index, n: uploading.total, name: uploading.name }) }}
    </p>
    <UploadQueueList :items="queue" can-remove :can-retry="rights.upload" @retry="emit('retry', $event)" @remove="emit('dropUpload', $event)" />
    <ZButton v-if="rights.upload && retryableCount > 1 && !uploading" size="sm" class="self-start max-sm:h-11" data-upload-retry-all @click="emit('retryAll')">
      {{ t('broker.autoTransit.upload.retryAll', { n: retryableCount }) }}
    </ZButton>
    <ul v-if="files.length" role="list" class="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0">
      <li v-for="f in files" :key="f.id" class="min-w-0 max-w-full">
        <FileChip
          :file="f"
          :parties="parties"
          :can-patch="rights.patchFile"
          :can-delete="rights.deleteFile"
          :busy="busy"
          @download="emit('download', $event)"
          @patch="(file, patch) => emit('patch', file, patch)"
          @remove="emit('remove', $event)"
        />
      </li>
    </ul>
    <p v-else class="m-0 text-xs text-ink-3" data-truck-files-empty>{{ t('broker.autoTransit.file.noTruckFiles') }}</p>
  </section>
</template>
