<script setup lang="ts">
import ZButton from '@/components/z/ZButton.vue'

// Липкая плашка снизу страницы с несохранёнными правками: текст, «Отменить» и «Сохранить» (загрузка на кнопке).
// Во всю ширину области страницы (отрицательные поля под отступы оболочки) — поэтому её нельзя класть внутрь
// предка с overflow-x-clip. На телефоне кнопки на всю ширину, 44px. Стиль — как у RecordSaveBar записи транзита.
defineProps<{ label: string; text: string; cancelText: string; saveText: string; saving?: boolean; canSave?: boolean }>()
const emit = defineEmits<{ cancel: []; save: [] }>()
</script>

<template>
  <div
    class="sticky bottom-0 z-[6] -mx-4 -mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-3 shadow-[0_-12px_24px_-18px_rgb(60_48_30/0.25)] lg:-mx-7 lg:-mb-6 lg:px-7"
    role="region"
    :aria-label="label"
    data-savebar
  >
    <span aria-hidden="true" class="size-2 shrink-0 rounded-pill bg-gold" />
    <span class="min-w-0 flex-1 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]" aria-live="polite" data-savebar-text>{{ text }}</span>
    <div class="flex items-center gap-2 max-sm:w-full">
      <ZButton variant="ghost" :disabled="saving" class="max-sm:h-11 max-sm:flex-1" data-savebar-cancel @click="emit('cancel')">{{ cancelText }}</ZButton>
      <ZButton variant="primary" :loading="saving" :disabled="!canSave" class="max-sm:h-11 max-sm:flex-1" data-savebar-save @click="emit('save')">{{ saveText }}</ZButton>
    </div>
  </div>
</template>
