<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhFile } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageFileDto } from '@/types/api'
import { saveBlob } from '@/ui/download'
import { formatFileSize } from '../packages'

// Просмотр файла пакета в шторке: PDF — во фрейме, картинка — как есть, остальное — «Скачать».
// Файл берётся один раз при открытии (blob → ссылка на объект); ссылка освобождается при закрытии, смене файла
// и уходе со страницы. Ошибку загрузки показывает перехватчик, здесь — «Не удалось загрузить» с «Повторить».
const props = defineProps<{ open: boolean; pkgId: string; file: DocumentPackageFileDto | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

type Kind = 'pdf' | 'image' | 'other'
const kindOf = (f: DocumentPackageFileDto): Kind => {
  const name = f.originalFileName.toLowerCase()
  const type = (f.contentType ?? '').toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf'
  if (/\.(png|jpe?g|gif|webp)$/.test(name) || type.startsWith('image/')) return 'image'
  return 'other'
}
const kind = computed<Kind>(() => (props.file ? kindOf(props.file) : 'other'))

const blob = ref<Blob | null>(null)
const url = ref<string | null>(null)
const loading = ref(false)
const failed = ref(false)
const release = () => {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
  blob.value = null
}

let seq = 0
const load = async () => {
  const f = props.file
  if (!f) return
  const my = ++seq
  release()
  loading.value = true
  failed.value = false
  try {
    const b = await documentPackagesApi.downloadFile(props.pkgId, f.id)
    if (my !== seq) return
    blob.value = b
    // Не PDF и не картинка — во фрейм не кладём: только «Скачать».
    if (kindOf(f) !== 'other') url.value = URL.createObjectURL(b)
  } catch {
    if (my === seq) failed.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => [props.open, props.file?.id] as const, ([open]) => {
  if (open) void load()
  else {
    seq++
    release()
    loading.value = false
  }
}, { immediate: true })
onBeforeUnmount(release)

const download = async () => {
  const f = props.file
  if (!f) return
  if (blob.value) {
    saveBlob(blob.value, f.originalFileName)
    return
  }
  try {
    saveBlob(await documentPackagesApi.downloadFile(props.pkgId, f.id), f.originalFileName)
  } catch {
    // тост показал перехватчик
  }
}
</script>

<template>
  <ZDrawer :open="open" :width="760" data-ws-preview @update:open="emit('update:open', $event)">
    <template #title>
      <span class="block truncate pr-2" :title="file?.originalFileName">{{ file?.originalFileName }}</span>
      <span v-if="file" class="block text-xs font-normal tabular-nums text-muted">{{ formatFileSize(file.sizeBytes, t) }}</span>
    </template>

    <div class="flex h-full min-h-[50vh] flex-col">
      <div v-if="loading" class="flex flex-1 items-center justify-center" data-ws-preview-loading><ZSpin /></div>
      <div v-else-if="failed" class="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-ws-preview-failed>
        <p class="m-0 text-sm text-ink-2">{{ t('broker.packageWorkspace.preview.failed') }}</p>
        <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t('broker.packageWorkspace.preview.retry') }}</ZButton>
      </div>
      <iframe
        v-else-if="kind === 'pdf' && url"
        :src="url"
        :title="t('broker.packageWorkspace.preview.frame', { name: file?.originalFileName ?? '' })"
        class="min-h-[70vh] w-full flex-1 rounded-row border border-line"
        data-ws-preview-pdf
      />
      <div v-else-if="kind === 'image' && url" class="flex flex-1 items-start justify-center overflow-auto rounded-row bg-sunken p-4">
        <img :src="url" :alt="file?.originalFileName ?? ''" class="max-w-full" data-ws-preview-image>
      </div>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-ws-preview-other>
        <span class="flex size-10 items-center justify-center rounded-row bg-sunken text-ink-3"><PhFile :size="20" aria-hidden="true" /></span>
        <p class="m-0 text-base font-semibold text-ink">{{ t('broker.packageWorkspace.preview.unavailable') }}</p>
        <p class="m-0 text-sm text-ink-3">{{ t('broker.packageWorkspace.preview.unavailableHint') }}</p>
      </div>
    </div>

    <template #footer>
      <ZButton class="max-sm:h-11" :disabled="!file" data-ws-preview-download @click="download">
        <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
        {{ t('broker.packageWorkspace.preview.download') }}
      </ZButton>
    </template>
  </ZDrawer>
</template>
