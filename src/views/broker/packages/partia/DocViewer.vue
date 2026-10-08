<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhFile, PhFileDashed } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import type { DocumentPackageFileDto } from '@/types/api'
import { cn } from '@/ui/cn'
import { fileKind, useFileBlob } from '../workspace/filePreview'

// Документ рядом с формой партии (доска PartiaEditor): вкладки — файлы партии, затем файлы её контейнера
// (ЖД накладная и т. п.); PDF — во фрейме, картинка — как есть, остальное — «Скачать»; кнопка скачивания в шапке.
// Файл берётся, пока просмотр виден (active) — ссылка на объект освобождается при смене файла и уходе.
// Нет файлов — подсказка привязать их на странице разбора.
const props = withDefaults(defineProps<{
  pkgId: string
  partiaFiles: DocumentPackageFileDto[]
  containerFiles: DocumentPackageFileDto[]
  /** id выбранного файла (v-model:selected); нет в списке — первый. */
  selected?: string | null
  active?: boolean
}>(), { selected: null, active: true })
const emit = defineEmits<{ 'update:selected': [id: string] }>()
const { t } = useI18n()

const tabs = computed(() => [
  ...props.partiaFiles.map((file) => ({ file, container: false })),
  ...props.containerFiles.map((file) => ({ file, container: true })),
])
const current = computed<DocumentPackageFileDto | null>(() =>
  tabs.value.find((x) => x.file.id === props.selected)?.file ?? tabs.value[0]?.file ?? null)
const kind = computed(() => (current.value ? fileKind(current.value) : 'other'))
const { url, loading, failed, load, download } = useFileBlob(() => props.pkgId, () => current.value, () => props.active)

const tabId = (id: string) => `partia-doc-tab-${id}`
const onKey = (e: KeyboardEvent, index: number) => {
  const n = tabs.value.length
  let next = -1
  if (e.key === 'ArrowRight') next = (index + 1) % n
  else if (e.key === 'ArrowLeft') next = (index - 1 + n) % n
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  if (next < 0) return
  e.preventDefault()
  emit('update:selected', tabs.value[next].file.id)
  document.getElementById(tabId(tabs.value[next].file.id))?.focus()
}
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col bg-sunken" :aria-label="t('broker.partia.viewer.label')" data-doc-viewer>
    <div v-if="!tabs.length" class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center" data-doc-empty>
      <span class="flex size-10 items-center justify-center rounded-row bg-surface text-ink-3"><PhFileDashed :size="20" aria-hidden="true" /></span>
      <p class="m-0 max-w-[340px] text-sm text-ink-2">{{ t('broker.partia.viewer.empty') }}</p>
    </div>

    <template v-else>
      <div class="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div class="min-w-0 flex-1 overflow-x-clip">
          <div
            role="tablist"
            :aria-label="t('broker.partia.viewer.label')"
            class="flex gap-0.5 overflow-x-auto rounded-row bg-sunken p-0.5 [scrollbar-width:thin]"
            data-doc-tabs
          >
            <button
              v-for="(tab, index) in tabs"
              :id="tabId(tab.file.id)"
              :key="tab.file.id"
              type="button"
              role="tab"
              :aria-selected="current?.id === tab.file.id ? 'true' : 'false'"
              :tabindex="current?.id === tab.file.id ? 0 : -1"
              :title="tab.file.originalFileName"
              :class="cn(
                'flex min-h-8 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-3 font-sans text-[13px] text-ink-2 outline-hidden',
                'transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none max-sm:min-h-11',
                current?.id === tab.file.id && 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(60_48_30/0.12)]',
              )"
              :data-doc-tab="tab.file.id"
              @click="emit('update:selected', tab.file.id)"
              @keydown="onKey($event, index)"
            >
              <span class="min-w-0 truncate">{{ tab.file.originalFileName }}</span>
              <span v-if="tab.container" class="shrink-0 text-[11px] text-muted" data-doc-tab-container>· {{ t('broker.partia.viewer.container') }}</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
          :aria-label="t('broker.partia.viewer.download')"
          :title="t('broker.partia.viewer.download')"
          data-doc-download
          @click="download"
        ><PhDownloadSimple :size="18" aria-hidden="true" /></button>
      </div>

      <div
        role="tabpanel"
        :aria-labelledby="current ? tabId(current.id) : undefined"
        class="flex min-h-0 flex-1 flex-col p-4"
        data-doc-panel
      >
        <div v-if="loading" class="flex flex-1 items-center justify-center" data-doc-loading><ZSpin /></div>
        <div v-else-if="failed" class="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-doc-failed>
          <p class="m-0 text-sm text-ink-2">{{ t('broker.packageWorkspace.preview.failed') }}</p>
          <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t('broker.packageWorkspace.preview.retry') }}</ZButton>
        </div>
        <iframe
          v-else-if="kind === 'pdf' && url"
          :src="url"
          :title="t('broker.packageWorkspace.preview.frame', { name: current?.originalFileName ?? '' })"
          class="min-h-[60vh] w-full flex-1 rounded-row border border-line bg-surface"
          data-doc-pdf
        />
        <div v-else-if="kind === 'image' && url" class="flex flex-1 items-start justify-center overflow-auto">
          <img :src="url" :alt="current?.originalFileName ?? ''" class="max-w-full shadow-[0_2px_10px_rgb(60_48_30/0.12)]" data-doc-image>
        </div>
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-doc-other>
          <span class="flex size-10 items-center justify-center rounded-row bg-surface text-ink-3"><PhFile :size="20" aria-hidden="true" /></span>
          <p class="m-0 text-base font-semibold text-ink">{{ t('broker.packageWorkspace.preview.unavailable') }}</p>
          <p class="m-0 text-sm text-ink-3">{{ t('broker.packageWorkspace.preview.unavailableHint') }}</p>
          <ZButton class="max-sm:h-11" @click="download">
            <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
            {{ t('broker.partia.viewer.download') }}
          </ZButton>
        </div>
      </div>
    </template>
  </section>
</template>
