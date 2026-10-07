<script setup lang="ts">
import { cn } from '@/ui/cn'

withDefaults(defineProps<{ title?: string; padding?: 'none' | 'md' | 'lg' }>(), { padding: 'md' })
const PAD = { none: '', md: 'p-4', lg: 'p-6' }
</script>

<template>
  <section class="rounded-panel border border-line bg-surface">
    <header v-if="title || $slots.actions" class="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2.5">
      <h2 v-if="title" class="m-0 text-sm font-semibold text-ink-2">{{ title }}</h2>
      <div v-if="$slots.actions" class="ml-auto flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <div :class="cn(PAD[padding])"><slot /></div>
  </section>
</template>
