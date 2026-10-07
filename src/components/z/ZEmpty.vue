<script setup lang="ts">
defineProps<{ title: string; hint?: string }>()
</script>

<template>
  <div class="mx-auto flex max-w-[360px] flex-col items-center px-6 py-10 text-center">
    <div v-if="$slots.icon" class="mb-3 flex size-10 items-center justify-center rounded-row bg-sunken text-ink-3">
      <slot name="icon" />
    </div>
    <p class="text-base font-semibold text-ink text-balance">{{ title }}</p>
    <p v-if="hint" class="mt-1 text-sm text-ink-3 text-pretty">{{ hint }}</p>
    <div v-if="$slots.action" class="mt-4"><slot name="action" /></div>
  </div>
</template>
