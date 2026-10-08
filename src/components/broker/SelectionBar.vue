<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Плашка выбора строк: «Выбрано: N», кнопки действий (слот), «Снять выбор». При 0 не рисуется.
// В слот отдаётся actionClass — вид кнопки действия (полупрозрачно-белая на navy).
// Живая область (sr-only) смонтирована всегда: иначе первое появление плашки не озвучивается.
defineOptions({ inheritAttrs: false })
defineProps<{ count: number }>()
defineEmits<{ clear: [] }>()
const { t } = useI18n()
const actionClass =
  'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] border-0 bg-white/10 px-2.5 font-sans text-[13px] font-semibold text-white outline-hidden hover:bg-white/20 focus-visible:shadow-focus max-sm:h-11 max-sm:px-3.5 disabled:cursor-not-allowed disabled:opacity-60'
</script>

<template>
  <span class="sr-only" role="status" aria-live="polite">{{ count > 0 ? t('broker.list.selected', { n: count }) : '' }}</span>
  <div
    v-if="count > 0"
    v-bind="$attrs"
    role="group"
    :aria-label="t('broker.list.selected', { n: count })"
    class="inline-flex min-h-10 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-row bg-navy py-1 pr-1.5 pl-3.5 text-[13px] text-white"
  >
    <span class="whitespace-nowrap">{{ t('broker.list.selected', { n: count }) }}</span>
    <slot :action-class="actionClass" />
    <button
      type="button"
      class="inline-flex h-[30px] cursor-pointer items-center rounded-[7px] border-0 bg-transparent px-2.5 font-sans text-[13px] text-on-navy-2 outline-hidden hover:text-white focus-visible:shadow-focus max-sm:h-11 max-sm:px-3.5"
      @click="$emit('clear')"
    >{{ t('broker.list.clearSelection') }}</button>
  </div>
</template>
