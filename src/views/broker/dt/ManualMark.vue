<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZTag from '@/components/z/ZTag.vue'

// Отметка ручного значения ДТ (решение 16.10.2026): тег «вручную», «расчёт: X» (что дал последний расчёт; нет — не
// показывается) и «Сбросить к расчёту» (только при праве править). Гр. 45/46 товара и строки гр. 47.
defineProps<{
  /** Расчётное значение уже в формате для показа; null — расчёта ещё не было. */
  calc?: string | null
  /** Показать «Сбросить к расчёту». */
  canReset?: boolean
  /** Подсказка к кнопке сброса (по умолчанию — общая). */
  resetTitle?: string
}>()
const emit = defineEmits<{ reset: [] }>()
const { t } = useI18n()
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs" data-manual-mark>
    <ZTag tone="accent" size="sm" :title="t('broker.dt.manual.badgeTitle')" data-manual-badge>{{ t('broker.dt.manual.badge') }}</ZTag>
    <span v-if="calc" class="whitespace-nowrap text-muted tabular-nums" data-manual-calc>{{ t('broker.dt.manual.calc', { value: calc }) }}</span>
    <button
      v-if="canReset"
      type="button"
      class="inline-flex min-h-6 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-xs font-semibold text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
      :title="resetTitle"
      data-manual-reset
      @click="emit('reset')"
    >{{ t('broker.dt.manual.reset') }}</button>
  </span>
</template>
