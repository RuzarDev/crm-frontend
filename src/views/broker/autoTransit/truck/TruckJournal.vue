<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Party, TruckEvent } from '@/api/autoTransit'
import { stageKey } from '../autoTransit'
import { ddmm, hhmm } from './truckView'

// Журнал машины: события новыми сверху — время, кто, что (этап и действие), партия, комментарий.
const props = defineProps<{ events: TruckEvent[]; parties: Party[] }>()
const { t } = useI18n()
const J = 'broker.autoTransit.journal'

const today = () => ddmm(new Date().toISOString())
const rows = computed(() => [...props.events]
  .sort((a, b) => b.atUtc.localeCompare(a.atUtc))
  .map((e) => {
    const stage = t(stageKey(e.stage))
    const what = e.action === 'problem' ? t(`${J}.problem`)
      : e.action === 'problemCleared' ? t(`${J}.problemCleared`)
        : t(`${J}.${e.action}`, { stage })
    const party = e.partyId ? props.parties.find((p) => p.id === e.partyId) : undefined
    const day = ddmm(e.atUtc)
    return {
      id: e.id,
      time: day === today() ? hhmm(e.atUtc) : `${day} ${hhmm(e.atUtc)}`,
      who: e.by?.trim() || t(`${J}.system`),
      what,
      party: party ? t(`${J}.party`, { n: party.number }) : '',
      note: e.note?.trim() ?? '',
    }
  }))
</script>

<template>
  <section class="flex min-w-0 flex-col gap-1" aria-labelledby="truck-journal-title" data-journal>
    <h2 id="truck-journal-title" class="m-0 text-sm font-semibold text-ink">{{ t(`${J}.title`) }}</h2>
    <ol v-if="rows.length" class="m-0 list-none p-0">
      <li v-for="r in rows" :key="r.id" class="border-b border-line py-2 text-[13px] leading-5 text-ink-2 last:border-b-0" data-journal-row>
        <span class="mr-1.5 font-mono text-xs text-muted tabular-nums">{{ r.time }}</span>{{ ' ' }}<span class="font-semibold text-ink">{{ r.who }}</span>
        — {{ r.what }}<template v-if="r.party"> · {{ r.party }}</template>{{ r.note ? ' ' : '' }}<span v-if="r.note" class="block break-words text-ink-3" data-journal-note>{{ r.note }}</span>
      </li>
    </ol>
    <p v-else class="m-0 text-xs text-ink-3">{{ t(`${J}.empty`) }}</p>
  </section>
</template>
