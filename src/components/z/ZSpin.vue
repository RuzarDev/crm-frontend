<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Замена a-spin: содержимое остаётся в DOM (состояние не теряется), при spinning приглушается и не кликается
// (pointer-events-none, aria-busy на корне — как у AntD; без inert: он отнимал бы фокус у поля, в котором
// пользователь печатает, когда начинается загрузка). Поверх — кольцо и подпись tip (или скрытый текст
// «Загрузка…» для скринридера). Без слота — строчный индикатор (inline-flex span), ставится рядом с текстом.
// size: sm/md/lg и псевдонимы AntD small/default/large.
type Size = 'sm' | 'md' | 'lg' | 'small' | 'default' | 'large'
const props = withDefaults(defineProps<{ spinning?: boolean; tip?: string; size?: Size }>(), { spinning: true, size: 'md' })
const { t } = useI18n()

const ringSize: Record<Size, string> = {
  sm: 'size-3.5', small: 'size-3.5',
  md: 'size-5', default: 'size-5',
  lg: 'size-7', large: 'size-7',
}
const ringClass = computed(() => [
  'shrink-0 rounded-pill border-2 border-zircon-ink border-r-transparent animate-spin motion-reduce:animate-none',
  ringSize[props.size] ?? ringSize.md,
])
</script>

<template>
  <div v-if="$slots.default" class="relative" :aria-busy="spinning ? 'true' : undefined">
    <div :class="spinning && 'pointer-events-none opacity-50 select-none'">
      <slot />
    </div>
    <div v-if="spinning" role="status" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <span data-z-spin aria-hidden="true" :class="ringClass" />
      <span v-if="tip" class="text-sm text-ink-2">{{ tip }}</span>
      <span v-else class="sr-only">{{ t('common.loading') }}</span>
    </div>
  </div>
  <span v-else class="inline-flex items-center gap-2 align-middle" :aria-busy="spinning ? 'true' : undefined">
    <span v-if="spinning" role="status" class="inline-flex items-center gap-2">
      <span data-z-spin aria-hidden="true" :class="ringClass" />
      <span v-if="tip" class="text-sm text-ink-2">{{ tip }}</span>
      <span v-else class="sr-only">{{ t('common.loading') }}</span>
    </span>
  </span>
</template>
