<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import type { ZOptionValue } from '@/ui/options'

// Метки выбранных значений ZSelect (multiple/tags) — приватная часть ZSelect, отдельно не используется.
defineProps<{
  values: ZOptionValue[]
  labelOf: (v: ZOptionValue) => string
  disabled?: boolean
}>()
const emit = defineEmits<{ remove: [value: ZOptionValue] }>()
const { t } = useI18n()
</script>

<template>
  <span
    v-for="v in values"
    :key="v"
    class="inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-[6px] bg-sunken pl-2 pr-1 text-xs font-medium text-ink"
  >
    <span class="truncate">{{ labelOf(v) }}</span>
    <button
      v-if="!disabled"
      type="button"
      :aria-label="`${t('z.remove')} ${labelOf(v)}`"
      tabindex="-1"
      class="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted outline-hidden hover:bg-line hover:text-ink focus-visible:shadow-focus"
      @mousedown.prevent
      @click.stop="emit('remove', v)"
    >
      <PhX :size="10" weight="bold" />
    </button>
  </span>
</template>
