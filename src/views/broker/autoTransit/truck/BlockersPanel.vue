<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Blocker, Party } from '@/api/autoTransit'
import { blockerText, isUrgent } from './truckView'

// «Что мешает» (макет 2, справа): блокеры текущего этапа (страница передаёт currentBlockers), у блокера партии — её
// номер. Пусто (в том числе на этапах 3–4) — не показывается. «ПИ не подана» срочно (pi_urgent, до въезда < 2 ч) — красной
// строкой с минутами, а вся плашка — с красной рамкой.
const props = defineProps<{ blockers: Blocker[]; parties: Party[] }>()
const { t } = useI18n()
const lines = computed(() => props.blockers.map((b, i) => ({ key: `${b.code}:${b.partyId ?? ''}:${i}`, code: b.code, urgent: isUrgent(b), text: blockerText(b, props, t) })))
const anyUrgent = computed(() => lines.value.some((l) => l.urgent))
</script>

<template>
  <section
    v-if="lines.length"
    :class="['rounded-row border bg-gold-soft px-3.5 py-3 text-sm leading-5 text-gold-ink', anyUrgent ? 'border-tone-danger-fg' : 'border-gold-line']"
    aria-labelledby="truck-blockers-title"
    data-blockers
  >
    <h2 id="truck-blockers-title" class="m-0 text-sm font-semibold">{{ t('broker.autoTransit.blocker.title') }}</h2>
    <ul role="list" class="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
      <li v-for="l in lines" :key="l.key" :class="['break-words', l.urgent && 'font-semibold text-tone-danger-fg']" :data-blocker="l.code">{{ l.text }}</li>
    </ul>
  </section>
</template>
