<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

export interface ZBreadcrumbItem { label: string; to?: string | Record<string, unknown> }

defineProps<{ items: ZBreadcrumbItem[] }>()
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="t('z.breadcrumbs')">
    <ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-ink-3">
      <li v-for="(item, i) in items" :key="i" class="inline-flex items-center gap-1.5">
        <span v-if="i === items.length - 1" aria-current="page" class="font-medium text-ink">{{ item.label }}</span>
        <RouterLink
          v-else-if="item.to !== undefined"
          :to="item.to"
          class="rounded-field text-ink-3 no-underline outline-hidden transition-colors duration-150 hover:text-ink hover:underline focus-visible:shadow-focus motion-reduce:transition-none"
        >{{ item.label }}</RouterLink>
        <span v-else>{{ item.label }}</span>
        <span v-if="i < items.length - 1" aria-hidden="true" class="text-faint">/</span>
      </li>
    </ol>
  </nav>
</template>
