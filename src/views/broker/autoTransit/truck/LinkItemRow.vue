<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { LinkPurpose, Party, RecipientLink } from '@/api/autoTransit'
import type { LinkState } from './truckView'

/** Одна ссылка в окне «Ссылки»: назначение, состояние, адрес и действия. */
export interface LinkItem {
  key: string
  purpose: LinkPurpose
  party: Party | null
  link: RecipientLink | null
  state: LinkState
  url: string
  mailto: string
  label: string
  stateText: string
  opened: string
}

defineProps<{ item: LinkItem; busyKey: string | null }>()
const emit = defineEmits<{ copy: []; renew: []; revoke: []; create: [] }>()
const { t } = useI18n()
const L = 'broker.autoTransit.links'
const tone = (s: LinkState) => (s === 'active' ? 'done' : s === 'none' ? 'neutral' : 'wait') as 'done' | 'neutral' | 'wait'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2 rounded-row bg-sunken px-3 py-2" :data-link-purpose="item.purpose">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span class="min-w-0 text-[13px] font-medium text-ink-2">{{ item.label }}</span>
      <ZTag :tone="tone(item.state)" size="sm" :data-link-state="item.state">{{ item.stateText }}</ZTag>
      <span v-if="item.opened" class="text-xs text-muted">{{ item.opened }}</span>
    </div>
    <p v-if="item.url" class="m-0 min-w-0 truncate font-mono text-xs text-ink-2" data-link-url>{{ item.url }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="item.state === 'active' && item.link">
        <ZButton size="sm" variant="primary" class="max-sm:h-11 max-sm:px-4" data-link-copy @click="emit('copy')">{{ t(`${L}.copy`) }}</ZButton>
        <a
          v-if="item.mailto"
          :href="item.mailto"
          class="inline-flex h-7 items-center rounded-field px-2.5 text-xs font-semibold text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:h-11"
          data-link-mail
        >{{ t(`${L}.mail`) }}</a>
        <ZButton size="sm" variant="ghost" class="max-sm:h-11" :loading="busyKey === item.key" :disabled="!!busyKey" data-link-renew @click="emit('renew')">{{ t(`${L}.renew`) }}</ZButton>
        <ZButton size="sm" variant="danger-ghost" class="max-sm:h-11" :disabled="!!busyKey" data-link-revoke @click="emit('revoke')">{{ t(`${L}.revoke`) }}</ZButton>
      </template>
      <ZButton v-else size="sm" variant="primary" class="max-sm:h-11 max-sm:px-4" :loading="busyKey === item.key" :disabled="!!busyKey" data-link-create @click="emit('create')">{{ t(`${L}.create`) }}</ZButton>
    </div>
  </div>
</template>
