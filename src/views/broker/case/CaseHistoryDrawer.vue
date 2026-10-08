<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZDrawer from '@/components/z/ZDrawer.vue'
import type { Import40LogDto } from '@/api/import40'
import { formatStamp } from '@/views/broker/packages/packages'
import { authorLine } from './caseFormat'

// Вся история заявки (новые сверху — так отдаёт сервер): текст, «ФИО · роль», дата и время.
defineProps<{ open: boolean; logs: Import40LogDto[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <ZDrawer :open="open" :width="460" :title="t('broker.case.history.drawerTitle')" data-case-history-drawer @update:open="emit('update:open', $event)">
    <p v-if="!logs.length" class="m-0 text-sm text-muted">{{ t('broker.case.history.empty') }}</p>
    <ol v-else class="m-0 list-none p-0">
      <li v-for="l in logs" :key="l.id" class="grid grid-cols-[12px_minmax(0,1fr)] gap-2.5 border-t border-line py-2.5 first:border-t-0" data-history-row>
        <span class="mt-1.5 size-[7px] rounded-pill bg-line-strong" aria-hidden="true" />
        <div class="min-w-0">
          <div class="text-sm text-ink [overflow-wrap:anywhere]">{{ l.text }}</div>
          <div class="mt-px text-xs text-muted">{{ [authorLine(l.changedByName, l.changedByBusinessRole, t), formatStamp(l.createdAtUtc)].filter(Boolean).join(' · ') }}</div>
        </div>
      </li>
    </ol>
  </ZDrawer>
</template>
