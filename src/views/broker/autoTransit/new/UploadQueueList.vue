<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCheckCircle, PhFileText, PhImage, PhWarningCircle, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZProgress from '@/components/z/ZProgress.vue'
import type { QueueItem } from './useUploadQueue'

// Строки очереди загрузки: имя, размер, состояние (в очереди / идёт N % / загружен / ошибка). Упавший — «Повторить»;
// ещё не начатый или упавший можно убрать. Общий для «Новой машины» и карточки машины.
defineProps<{ items: QueueItem[]; canRemove?: boolean }>()
const emit = defineEmits<{ retry: [index: number]; remove: [index: number] }>()
const { t } = useI18n()
const U = 'broker.autoTransit.upload'

const isImage = (name: string) => /\.(jpe?g|png|webp|heic|heif)$/i.test(name)
const sizeText = (bytes: number) => (bytes >= 1024 * 1024
  ? t(`${U}.sizeMb`, { n: (bytes / 1024 / 1024).toFixed(1) })
  : t(`${U}.sizeKb`, { n: Math.max(1, Math.round(bytes / 1024)) }))
const errorOf = (it: QueueItem) => it.errorText ?? (it.errorKey ? t(it.errorKey) : '')
</script>

<template>
  <ul v-if="items.length" role="list" class="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0" data-upload-queue>
    <li
      v-for="(it, i) in items"
      :key="it.key"
      class="flex min-w-0 items-center gap-2.5 rounded-row border px-3 py-2"
      :class="it.state === 'failed' ? 'border-danger bg-tone-danger-bg' : 'border-line bg-surface'"
      :data-upload-row="it.state"
    >
      <PhCheckCircle v-if="it.state === 'done'" :size="20" weight="fill" aria-hidden="true" class="shrink-0 text-tone-done-fg" />
      <PhWarningCircle v-else-if="it.state === 'failed'" :size="20" aria-hidden="true" class="shrink-0 text-danger" />
      <PhImage v-else-if="isImage(it.name)" :size="20" aria-hidden="true" class="shrink-0 text-muted" />
      <PhFileText v-else :size="20" aria-hidden="true" class="shrink-0 text-muted" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex min-w-0 items-baseline gap-2">
          <span class="min-w-0 truncate text-sm text-ink" :title="it.name" data-upload-name>{{ it.name }}</span>
          <span class="shrink-0 text-xs text-muted tabular-nums">{{ sizeText(it.size) }}</span>
        </div>
        <ZProgress v-if="it.state === 'uploading'" size="sm" :percent="it.progress" :aria-label="t(`${U}.progress`, { name: it.name })" />
        <span
          class="min-w-0 text-xs break-words"
          :class="it.state === 'failed' ? 'text-tone-danger-fg' : 'text-ink-3'"
          :role="it.state === 'failed' ? 'alert' : undefined"
          data-upload-state
        >
          <template v-if="it.state === 'queued'">{{ t(`${U}.queued`) }}</template>
          <template v-else-if="it.state === 'uploading'">{{ t(`${U}.uploadingPct`, { n: it.progress }) }}</template>
          <template v-else-if="it.state === 'done'">{{ t(`${U}.done`) }}</template>
          <template v-else>{{ errorOf(it) }}</template>
        </span>
      </div>
      <ZButton
        v-if="it.state === 'failed'"
        size="sm"
        class="shrink-0 max-sm:h-11"
        data-upload-retry
        @click="emit('retry', i)"
      >
        <PhArrowClockwise :size="14" aria-hidden="true" />{{ t(`${U}.retry`) }}
      </ZButton>
      <ZButton
        v-if="canRemove && (it.state === 'queued' || it.state === 'failed')"
        size="sm"
        variant="ghost"
        class="shrink-0 px-2 max-sm:h-11 max-sm:w-11"
        :aria-label="t(`${U}.remove`, { name: it.name })"
        data-upload-remove
        @click="emit('remove', i)"
      >
        <PhX :size="16" aria-hidden="true" />
      </ZButton>
    </li>
  </ul>
</template>
