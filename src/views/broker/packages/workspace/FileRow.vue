<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsSixVertical, PhDotsThree, PhDownloadSimple, PhEye, PhFile, PhLink, PhLinkSimple, PhTrash } from '@phosphor-icons/vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import type { DocumentPackageFileDto } from '@/types/api'
import { formatFileSize } from '../packages'

// Строка входящего файла (доска Workspace): ручка перетаскивания, имя, «размер · куда привязан», глаз (просмотр)
// и «⋯»: «Привязать к…» (reestr.write), «Скачать», «Удалить» (canModifyFiles). Перетаскивание — только когда
// разрешено (правка и не телефон); с клавиатуры — «Привязать к…». busy — идёт привязка или удаление этого файла.
const props = defineProps<{
  file: DocumentPackageFileDto
  /** Куда привязан (номер контейнера или клиент партии); null — не распределён. */
  target: string | null
  draggable: boolean
  canLink: boolean
  canDelete: boolean
  busy: boolean
  /** Этот файл сейчас перетаскивают. */
  dragging: boolean
}>()
const emit = defineEmits<{
  preview: []
  link: []
  download: []
  delete: []
  dragstart: [e: DragEvent]
  dragend: []
}>()
const { t } = useI18n()

const menu = computed<ZDropdownItem[]>(() => [
  ...(props.canLink ? [{ key: 'link', label: t('broker.packageWorkspace.files.linkTo'), icon: PhLinkSimple }] : []),
  { key: 'download', label: t('broker.packageWorkspace.files.download'), icon: PhDownloadSimple },
  ...(props.canDelete ? [{ key: 'delete', label: t('broker.packageWorkspace.files.delete'), icon: PhTrash, danger: true, divider: true }] : []),
])
const onMenu = (key: string) => {
  if (key === 'link') emit('link')
  else if (key === 'download') emit('download')
  else if (key === 'delete') emit('delete')
}

const iconBtn = 'inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:size-11'
</script>

<template>
  <li
    class="group flex items-center gap-2.5 rounded-row px-2.5 py-2 transition-[background-color,box-shadow,opacity] duration-150 motion-reduce:transition-none"
    :class="[
      dragging ? 'bg-zircon-soft shadow-[inset_0_0_0_1px_var(--color-zircon)]' : 'hover:bg-canvas',
      busy && 'opacity-60',
      draggable && 'cursor-grab active:cursor-grabbing',
    ]"
    :draggable="draggable ? 'true' : 'false'"
    :aria-busy="busy || undefined"
    data-ws-file
    :data-file-id="file.id"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <span v-if="draggable" class="inline-flex shrink-0 text-faint" :title="t('broker.packageWorkspace.files.drag')" data-ws-file-handle>
      <PhDotsSixVertical :size="16" weight="bold" aria-hidden="true" />
    </span>
    <PhFile :size="16" class="shrink-0 text-muted" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="truncate text-[13px] font-medium text-ink" :title="file.originalFileName" data-ws-file-name>{{ file.originalFileName }}</div>
      <div class="flex min-w-0 items-center gap-1.5 text-xs">
        <span class="shrink-0 tabular-nums text-muted">{{ formatFileSize(file.sizeBytes, t) }} ·</span>
        <span v-if="target" class="inline-flex min-w-0 items-center gap-1 text-tone-done-fg" data-ws-file-target>
          <PhLink :size="12" weight="bold" class="shrink-0" aria-hidden="true" />
          <span class="sr-only">{{ t('broker.packageWorkspace.files.linkedTo', { target }) }}</span>
          <span class="truncate" aria-hidden="true">{{ target }}</span>
        </span>
        <span v-else class="font-medium text-gold-ink" data-ws-file-target>{{ t('broker.packageWorkspace.files.notLinked') }}</span>
      </div>
    </div>
    <ZTooltip :title="t('broker.packageWorkspace.files.preview', { name: file.originalFileName })">
      <button
        type="button"
        :class="iconBtn"
        :aria-label="t('broker.packageWorkspace.files.preview', { name: file.originalFileName })"
        data-ws-file-preview
        @click="emit('preview')"
      >
        <PhEye :size="16" aria-hidden="true" />
      </button>
    </ZTooltip>
    <ZDropdown :items="menu" @select="onMenu">
      <button
        type="button"
        :class="iconBtn"
        :disabled="busy"
        :aria-label="t('broker.packageWorkspace.files.more', { name: file.originalFileName })"
        data-ws-file-more
      >
        <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
      </button>
    </ZDropdown>
  </li>
</template>
