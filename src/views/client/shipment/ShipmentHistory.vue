<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCaretRight } from '@phosphor-icons/vue'
import type { Import40LogDto } from '@/api/import40'
import { dayMonthTime } from '@/views/client/shipment/util'

// История поставки — свёрнута по умолчанию. Сервер уже отдаёт клиенту только его записи и подписывает
// автора «Вы»/«AQNIET» (аудит 5.5); без имени — по роли.
defineProps<{ logs: Import40LogDto[] }>()
const { t } = useI18n()

const author = (l: Import40LogDto) =>
  l.changedByName || ((l.changedByBusinessRole ?? '').toLowerCase() === 'client' ? t('client.card.history.you') : t('enum.role.us'))
</script>

<template>
  <details class="group border-t border-line pt-2" data-ship-history>
    <summary
      class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-field text-[14.5px] font-semibold text-ink outline-hidden select-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden"
    >
      <PhCaretRight :size="14" weight="bold" aria-hidden="true" class="shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
      {{ t('client.card.history.title', { n: logs.length }) }}
    </summary>
    <p v-if="!logs.length" class="m-0 py-2 text-sm text-ink-3">{{ t('client.card.history.empty') }}</p>
    <ol v-else class="m-0 flex list-none flex-col p-0 pb-2">
      <li
        v-for="l in logs"
        :key="l.id"
        class="flex flex-col gap-0.5 border-b border-line py-2.5 text-sm last:border-b-0 sm:grid sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
        data-history-row
      >
        <span class="text-[13px] tabular-nums text-muted">{{ dayMonthTime(l.createdAtUtc) }}</span>
        <span class="min-w-0 text-ink [overflow-wrap:anywhere]">{{ l.text }}</span>
        <span class="text-[13px] text-ink-3">{{ author(l) }}</span>
      </li>
    </ol>
  </details>
</template>
