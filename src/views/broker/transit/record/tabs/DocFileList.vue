<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhTrash } from '@phosphor-icons/vue'
import { reestrApi } from '@/api/reestr'
import { saveBlob } from '@/ui/download'
import type { ReestrDocumentDto } from '@/types/api'
import { formatRole } from '@/utils/labels'
import { formatFileSize, formatStamp } from '@/views/broker/packages/packages'

// Список файлов вкладки «Документы» (клиентская секция и места брокерской): расширение, имя, «роль · дата и время · размер»,
// скачивание и удаление (если разрешено правами — решает вызывающий через canRemove). Скачивание — здесь:
// reestrApi.downloadDocument + saveBlob; ошибку показал перехватчик. Удаление — событие remove (подтверждение у вызывающего).
const props = defineProps<{
  reestrId: string
  files: ReestrDocumentDto[]
  canRemove: (doc: ReestrDocumentDto) => boolean
  /** Идёт загрузка/удаление в другом месте: кнопки удаления выключены. */
  busy?: boolean
  /** Id удаляемого сейчас документа. */
  removingId?: string | null
}>()
const emit = defineEmits<{ remove: [doc: ReestrDocumentDto] }>()

const { t } = useI18n()
const downloading = ref<string | null>(null)

const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : ''
}
const meta = (d: ReestrDocumentDto) =>
  [formatRole(d.uploadedByRole), formatStamp(d.createdAtUtc), formatFileSize(d.sizeBytes, t)].filter(Boolean).join(' · ')

const download = async (d: ReestrDocumentDto) => {
  if (downloading.value) return
  downloading.value = d.id
  try {
    saveBlob(await reestrApi.downloadDocument(props.reestrId, d.id), d.originalFileName)
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    downloading.value = null
  }
}

const iconBase = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress motion-reduce:transition-none max-sm:size-11'
const iconBtn = `${iconBase} hover:bg-sunken hover:text-ink`
const removeBtn = `${iconBase} hover:bg-tone-danger-bg hover:text-tone-danger-fg`
</script>

<template>
  <ul v-if="files.length" role="list" class="m-0 flex list-none flex-col gap-2 p-0">
    <li
      v-for="d in files"
      :key="d.id"
      class="flex items-center gap-3 rounded-row border border-line bg-canvas px-3 py-2.5"
      data-doc-file
    >
      <span
        class="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-field border border-line bg-surface px-1.5 text-[10px] font-semibold tracking-wide text-ink-3"
        aria-hidden="true"
      >{{ extOf(d.originalFileName) || '—' }}</span>
      <div class="min-w-0 flex-1">
        <button
          type="button"
          class="block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm font-medium text-ink outline-hidden hover:underline focus-visible:shadow-focus"
          :title="d.originalFileName"
          data-doc-name
          @click="download(d)"
        >{{ d.originalFileName }}</button>
        <div class="text-xs tabular-nums text-muted" data-doc-meta>{{ meta(d) }}</div>
      </div>
      <button
        type="button"
        :class="iconBtn"
        :disabled="downloading !== null"
        :aria-busy="downloading === d.id || undefined"
        :aria-label="t('broker.transitRecord.docs.download', { name: d.originalFileName })"
        :title="t('broker.transitRecord.docs.download', { name: d.originalFileName })"
        data-doc-download
        @click="download(d)"
      >
        <PhDownloadSimple :size="17" aria-hidden="true" />
      </button>
      <button
        v-if="canRemove(d)"
        type="button"
        :class="removeBtn"
        :disabled="busy || (removingId != null && removingId !== d.id)"
        :aria-busy="removingId === d.id || undefined"
        :aria-label="t('broker.transitRecord.docs.remove', { name: d.originalFileName })"
        :title="t('broker.transitRecord.docs.remove', { name: d.originalFileName })"
        data-doc-remove
        @click="emit('remove', d)"
      >
        <PhTrash :size="17" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>
