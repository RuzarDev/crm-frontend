<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWarningCircle } from '@phosphor-icons/vue'
import type { ConditionalReleaseBrief } from '@/api/conditionalRelease'
import { cn } from '@/ui/cn'
import { condRelDate, condRelLabel, condRelState } from '@/utils/conditionalRelease'

// Метка условного выпуска (17.10): красная, пока ждём документ (blink — мигает; при prefers-reduced-motion — без мигания),
// спокойная «на проверке» — когда клиент уже загрузил. short — только «Условный выпуск · до ДД.ММ» (узкие колонки).
const props = withDefaults(defineProps<{ brief: ConditionalReleaseBrief; blink?: boolean; short?: boolean }>(), { blink: false, short: false })
const { t } = useI18n()

const state = computed(() => condRelState(props.brief))
const full = computed(() => condRelLabel(props.brief, t))
const text = computed(() => (props.short ? t('condRel.tagShort', { date: condRelDate(props.brief.deadline) }) : full.value))
const more = computed(() => (props.brief.openCount > 1 ? t('condRel.more', { n: props.brief.openCount - 1 }) : ''))
</script>

<template>
  <span
    :class="cn(
      'inline-flex max-w-full min-w-0 items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs leading-5 font-semibold',
      state === 'uploaded' ? 'bg-tone-wait-bg text-tone-wait-fg' : 'bg-tone-danger-bg text-tone-danger-fg',
      blink && state !== 'uploaded' && 'motion-safe:animate-pulse',
    )"
    :title="full"
    :data-condrel-tag="state"
  >
    <PhWarningCircle :size="13" weight="fill" class="shrink-0" aria-hidden="true" />
    <span class="min-w-0 truncate">{{ text }}</span>
    <span v-if="more" class="shrink-0 font-normal">{{ more }}</span>
  </span>
</template>
