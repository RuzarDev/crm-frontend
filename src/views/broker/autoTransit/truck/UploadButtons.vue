<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCamera } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES } from '@/api/autoTransit'

// «Добавить фото / файл»: несколько файлов, допустимые типы и лимит — из модуля API. На телефоне — две кнопки:
// «Сфотографировать» (камера, capture) и «Выбрать файлы» (галерея и файлы, без capture).
// sizeCheckOff — размер проверяет сам экран и пишет об отказе строкой рядом (страница «Новая машина»), без тоста.
defineProps<{ disabled?: boolean; loading?: boolean; sizeCheckOff?: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
const { t } = useI18n()
const MAX_MB = Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)

const camera = ref<HTMLInputElement | null>(null)
const onCamera = (e: Event) => {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  if (files.length) emit('files', files)
}
const picker = ref<InstanceType<typeof ZUpload> | null>(null)
defineExpose({ openCamera: () => camera.value?.click(), openFiles: () => picker.value?.open() })
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2" data-upload-buttons>
    <input
      ref="camera"
      type="file"
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      accept="image/*"
      capture="environment"
      multiple
      data-upload-camera-input
      @change="onCamera"
    >
    <ZButton
      class="sm:hidden max-sm:h-12"
      :disabled="disabled || loading"
      data-upload-camera
      @click="camera?.click()"
    >
      <PhCamera :size="18" aria-hidden="true" />{{ t('broker.autoTransit.file.takePhoto') }}
    </ZButton>
    <ZUpload
      ref="picker"
      multiple
      :accept="UPLOAD_ACCEPT"
      :max-size-mb="sizeCheckOff ? undefined : MAX_MB"
      :disabled="disabled"
      :loading="loading"
      class="max-sm:[&_button]:h-12 max-sm:[&_button]:w-full"
      data-upload-files
      @select="emit('files', $event)"
    >
      <span class="max-sm:hidden">{{ t('broker.autoTransit.file.upload') }}</span>
      <span class="sm:hidden">{{ t('broker.autoTransit.file.pickFiles') }}</span>
    </ZUpload>
  </div>
</template>
