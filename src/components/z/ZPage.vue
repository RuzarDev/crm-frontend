<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div class="min-w-0 flex-1">
        <nav v-if="$slots.breadcrumbs" class="mb-1 text-sm text-muted"><slot name="breadcrumbs" /></nav>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="m-0 text-xl font-semibold tracking-[-0.015em] text-ink text-balance">{{ title }}</h1>
          <slot name="meta" />
        </div>
        <p v-if="subtitle" class="mt-1 text-sm text-ink-3">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2"><slot name="actions" /></div>
    </div>
    <slot />
  </div>
</template>
