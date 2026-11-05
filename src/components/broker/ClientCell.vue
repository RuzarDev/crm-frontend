<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import ZAvatar from '@/components/z/ZAvatar.vue'

// to — ссылка на карточку клиента; экран передаёт его только тем, кому карточка доступна.
defineProps<{ name: string; to?: RouteLocationRaw | null }>()
</script>

<template>
  <span class="flex min-w-0 items-center gap-2">
    <ZAvatar :name="name" size="sm" />
    <RouterLink
      v-if="to"
      :to="to"
      class="min-w-0 truncate rounded-field text-sm text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:py-3.5"
      :title="name"
    >{{ name }}</RouterLink>
    <span v-else class="min-w-0 truncate text-sm text-ink" :title="name">{{ name }}</span>
  </span>
</template>
