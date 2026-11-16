<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCamera, PhInfo } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import type { Primary } from './truckView'

// Главная кнопка следующего этапа (макет 3: одна большая кнопка). На компьютере — в шапке; на телефоне страница
// ставит её последней и липкой снизу (с отступом безопасной зоны), рядом — «Сфотографировать» под большой палец.
// Действия нет — вместо кнопки текст причины («Ждёт декларанта: подано 1 из 3»).
defineProps<{ primary: Primary; busy?: boolean; loading?: boolean; canUpload?: boolean }>()
const emit = defineEmits<{ act: []; photos: [files: File[]] }>()
const { t } = useI18n()

const camera = ref<HTMLInputElement | null>(null)
const onCamera = (e: Event) => {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  if (files.length) emit('photos', files)
}
</script>

<template>
  <div
    class="flex min-w-0 items-center gap-2 max-lg:sticky max-lg:bottom-0 max-lg:z-[5] max-lg:-mx-4 max-lg:border-t max-lg:border-line max-lg:bg-surface max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(12px,env(safe-area-inset-bottom))]"
    data-primary-bar
  >
    <ZButton
      v-if="primary.kind !== 'none'"
      variant="primary"
      size="lg"
      class="min-w-0 max-lg:h-12 max-lg:flex-1 max-lg:text-base"
      :loading="loading"
      :disabled="busy && !loading"
      data-primary-action
      @click="emit('act')"
    >
      <span class="min-w-0 truncate">{{ primary.label }}</span>
    </ZButton>
    <p
      v-else
      class="m-0 flex min-w-0 flex-1 items-center gap-2 rounded-row bg-sunken px-3 py-2.5 text-sm text-ink-2 lg:max-w-80"
      role="status"
      data-primary-reason
    >
      <PhInfo :size="16" aria-hidden="true" class="shrink-0 text-muted" />
      <span class="min-w-0">{{ primary.reason }}</span>
    </p>
    <template v-if="canUpload">
      <input ref="camera" type="file" class="hidden" tabindex="-1" aria-hidden="true" accept="image/*" capture="environment" multiple @change="onCamera">
      <ZButton
        size="lg"
        class="shrink-0 lg:hidden max-lg:h-12 max-lg:w-12 max-lg:px-0"
        :disabled="busy"
        :aria-label="t('broker.autoTransit.file.takePhoto')"
        data-primary-camera
        @click="camera?.click()"
      >
        <PhCamera :size="22" aria-hidden="true" />
      </ZButton>
    </template>
  </div>
</template>
