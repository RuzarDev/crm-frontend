<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCopy, PhPencilSimple, PhX } from '@phosphor-icons/vue'

// Тёмная панель выбора товаров (доска DtGoods): «Выбрано N · Применить к выбранным… · Дублировать · Удалить ·
// Снять выделение (Esc)». При 0 не рисуется; живая область для чтения с экрана смонтирована всегда.
// На телефоне кнопки переносятся и вырастают до 44px.
defineProps<{ count: number }>()
const emit = defineEmits<{ apply: []; duplicate: []; remove: []; clear: [] }>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.bulk.${key}`, p ?? {})
const action =
  'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-field border-0 bg-white/10 px-2.5 font-sans text-[13px] font-semibold text-white outline-hidden hover:bg-white/20 focus-visible:shadow-focus max-sm:h-11 max-sm:px-3.5'
</script>

<template>
  <span class="sr-only" role="status" aria-live="polite">{{ count > 0 ? tg('selected', { n: count }) : '' }}</span>
  <div
    v-if="count > 0"
    role="toolbar"
    :aria-label="tg('label')"
    class="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-row bg-navy px-3.5 py-2 text-[13px] text-white"
    data-goods-bulk
  >
    <span class="mr-1.5 font-semibold whitespace-nowrap" data-goods-bulk-count>{{ tg('selected', { n: count }) }}</span>
    <button type="button" :class="action" data-goods-bulk-apply @click="emit('apply')">
      <PhPencilSimple :size="15" aria-hidden="true" />{{ tg('apply') }}
    </button>
    <button type="button" :class="action" data-goods-bulk-duplicate @click="emit('duplicate')">
      <PhCopy :size="15" aria-hidden="true" />{{ tg('duplicate') }}
    </button>
    <button type="button" :class="action" data-goods-bulk-remove @click="emit('remove')">
      <PhX :size="15" aria-hidden="true" />{{ tg('remove') }}
    </button>
    <button
      type="button"
      class="ml-auto inline-flex h-[30px] cursor-pointer items-center rounded-field border-0 bg-transparent px-2 font-sans text-[13px] text-on-navy-2 outline-hidden hover:text-white focus-visible:shadow-focus max-sm:ml-0 max-sm:h-11"
      data-goods-bulk-clear
      @click="emit('clear')"
    >{{ tg('clear') }}</button>
  </div>
</template>
