<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { StageEvent } from '@/api/stages'
import { eventLabel, eventTime, type StageAudience } from '@/utils/import40StageModel'

// История шага (макет 17.10): время, событие, кто и пояснение. Новые сверху. Клиенту — его формулировки, без ФИО.
const props = withDefaults(defineProps<{ title: string; events: StageEvent[]; audience: StageAudience; emptyNote?: string }>(), { emptyNote: '' })
const { t, te } = useI18n()
const second = (e: StageEvent) => [props.audience === 'staff' ? e.userName : null, e.note || null].filter(Boolean).join(' · ')
const accent = (e: StageEvent) =>
  e.kind === 'customsRequest' ? (props.audience === 'client' ? 'text-gold-ink' : 'text-tone-danger-fg')
  : e.kind === 'returnedToClient' || e.kind === 'cancelled' ? 'text-gold-ink'
  : 'text-ink'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3" data-stage-history>
    <h3 class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ title }}</h3>
    <ol v-if="events.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="e in events" :key="e.id" class="grid grid-cols-[76px_minmax(0,1fr)] gap-2.5 text-sm leading-5" data-history-event :data-kind="e.kind">
        <span class="font-mono text-xs leading-5 text-muted tabular-nums">{{ eventTime(e.atUtc) }}</span>
        <span class="min-w-0 [overflow-wrap:anywhere]">
          <span :class="['font-semibold', accent(e)]">{{ eventLabel(e, audience, t, te) }}</span>
          <template v-if="second(e)"><br><span class="text-ink-3">{{ second(e) }}</span></template>
        </span>
      </li>
    </ol>
    <p v-else class="m-0 text-sm text-muted" data-history-empty>
      {{ t('stages.historyEmpty') }}<template v-if="emptyNote"><br><span class="text-xs">{{ emptyNote }}</span></template>
    </p>
  </div>
</template>
