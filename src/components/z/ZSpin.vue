<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Замена a-spin: содержимое остаётся в DOM (состояние не теряется), при spinning приглушается и не кликается;
// поверх — кольцо и подпись tip (или скрытый текст «Загрузка…» для скринридера). Без слота — только индикатор.
withDefaults(defineProps<{ spinning?: boolean; tip?: string }>(), { spinning: true })
const { t } = useI18n()
</script>

<template>
  <div :class="['relative', !$slots.default && 'min-h-10']" :aria-busy="spinning ? 'true' : undefined">
    <div
      v-if="$slots.default"
      :inert="spinning || undefined"
      :class="spinning && 'pointer-events-none opacity-50 select-none'"
    >
      <slot />
    </div>
    <div v-if="spinning" role="status" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <span
        data-z-spin
        aria-hidden="true"
        class="size-5 shrink-0 rounded-pill border-2 border-zircon-ink border-r-transparent animate-spin motion-reduce:animate-none"
      />
      <span v-if="tip" class="text-sm text-ink-2">{{ tip }}</span>
      <span v-else class="sr-only">{{ t('common.loading') }}</span>
    </div>
  </div>
</template>
