<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import type { SectionKey } from './recordModel'

// Липкая плашка снизу страницы записи (доска TransitRecord): «Есть несохранённые изменения · товары, организации»,
// «Отменить» и «Сохранить» (загрузка на кнопке). На телефоне — на всю ширину, кнопки 44px.
const props = defineProps<{ changed: SectionKey[]; isNew: boolean; saving: boolean; disabled: boolean }>()
const emit = defineEmits<{ cancel: []; save: [] }>()
const { t, locale } = useI18n()

const text = computed(() => {
  const names = props.changed.map((k) => t(`broker.transitRecord.sections.${k}`).toLocaleLowerCase(locale.value))
  if (!names.length) return t(props.isNew ? 'broker.transitRecord.saveBar.newRecord' : 'broker.transitRecord.saveBar.changes')
  return `${t('broker.transitRecord.saveBar.changes')} · ${names.join(', ')}`
})
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
</script>

<template>
  <div
    class="sticky bottom-0 z-[6] -mx-4 -mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-3 shadow-[0_-12px_24px_-18px_rgb(60_48_30/0.25)] lg:-mx-7 lg:-mb-6 lg:px-7"
    role="region"
    :aria-label="t('broker.transitRecord.saveBar.changes')"
    data-record-savebar
  >
    <span aria-hidden="true" class="size-2 shrink-0 rounded-pill bg-gold" />
    <span class="min-w-0 flex-1 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]" aria-live="polite" data-savebar-text>{{ text }}</span>
    <div class="flex items-center gap-2 max-sm:w-full">
      <ZKbd class="max-lg:hidden" aria-hidden="true">{{ mac ? '⌘S' : 'Ctrl+S' }}</ZKbd>
      <ZButton variant="ghost" :disabled="saving" class="max-sm:h-11 max-sm:flex-1" data-savebar-cancel @click="emit('cancel')">
        {{ t('broker.transitRecord.saveBar.cancel') }}
      </ZButton>
      <ZButton variant="primary" :loading="saving" :disabled="disabled" class="max-sm:h-11 max-sm:flex-1" data-savebar-save @click="emit('save')">
        {{ t('broker.transitRecord.saveBar.save') }}
      </ZButton>
    </div>
  </div>
</template>
