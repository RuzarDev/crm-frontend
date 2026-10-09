<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhFileText, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZKbd from '@/components/z/ZKbd.vue'

// Шапка редактора партии (доска PartiaEditor), липкая под шапкой оболочки: крестик (назад к разбору),
// «Поезд n · контейнер …» и «Партия · клиент»; справа «не сохранено», «Документ» (просмотр в шторке на узком
// экране), «Отмена» и «Сохранить партию» (Ctrl/⌘+S). Без права правки — только крестик и «Документ».
// Телефон: «Отмена» скрыта (крестик делает то же), «Документ» и «Сохранить партию» — одной строкой по 44px.
defineProps<{
  title: string
  context: string
  dirty: boolean
  canEdit: boolean
  saving: boolean
  disabled: boolean
  showDocument: boolean
}>()
const emit = defineEmits<{ close: []; cancel: []; save: []; document: [] }>()
const { t } = useI18n()
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
</script>

<template>
  <header
    class="sticky top-(--shell-header-h,64px) z-[6] -mx-4 -mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-3 lg:-mx-7 lg:-mt-6 lg:px-7"
    data-partia-header
  >
    <button
      type="button"
      class="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden transition-colors hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
      :aria-label="t('broker.partia.page.close')"
      :title="t('broker.partia.page.close')"
      data-partia-close
      @click="emit('close')"
    ><PhX :size="18" aria-hidden="true" /></button>
    <div class="min-w-0 flex-1 basis-56">
      <p class="m-0 truncate text-xs leading-4 text-muted" data-partia-context>{{ context }}</p>
      <h1 class="m-0 text-base leading-6 font-semibold text-ink [overflow-wrap:anywhere]" data-partia-title>{{ title }}</h1>
    </div>
    <div class="flex flex-wrap items-center gap-2 max-sm:w-full">
      <span v-if="dirty" class="inline-flex items-center gap-1.5 text-[12.5px] text-gold-ink max-sm:w-full" role="status" data-partia-dirty>
        <span aria-hidden="true" class="size-[7px] rounded-pill bg-gold" />{{ t('broker.partia.page.unsaved') }}
      </span>
      <ZButton
        v-if="showDocument"
        class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11 max-sm:flex-1"
        data-partia-document
        @click="emit('document')"
      >
        <template #icon><PhFileText :size="16" aria-hidden="true" /></template>
        {{ t('broker.partia.page.document') }}
      </ZButton>
      <template v-if="canEdit">
        <ZButton variant="ghost" :disabled="saving" class="max-sm:hidden" data-partia-cancel @click="emit('cancel')">
          {{ t('broker.partia.page.cancel') }}
        </ZButton>
        <ZKbd class="max-lg:hidden" aria-hidden="true">{{ mac ? '⌘S' : 'Ctrl+S' }}</ZKbd>
        <ZButton variant="primary" :loading="saving" :disabled="disabled" class="max-sm:h-11 max-sm:flex-1" data-partia-save @click="emit('save')">
          {{ t('broker.partia.page.save') }}
        </ZButton>
      </template>
    </div>
  </header>
</template>
