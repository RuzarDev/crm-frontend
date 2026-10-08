<script setup lang="ts">
import ZAvatar from '@/components/z/ZAvatar.vue'

defineProps<{ name: string }>()
</script>

<template>
  <span class="flex min-w-0 items-center gap-2">
    <ZAvatar :name="name" size="sm" />
    <span class="min-w-0 truncate text-sm text-ink" :title="name">{{ name }}</span>
  </span>
</template>
