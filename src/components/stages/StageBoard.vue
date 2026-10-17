<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhPause, PhWarning } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import type { StageCard, StageAudience, StageTone, SubStage } from '@/utils/import40StageModel'
import StageHistory from './StageHistory.vue'

// Этапы заявки по утверждённому макету (17.10) — общая доска для карточки сотрудника и поставки клиента.
// Широко (контейнер ≥ 48rem) — пять колонок: шаги 1–4 и колонка «5 и 6 параллельно»; узко (телефон) — вертикальный
// список с линией слева. Шаг — кнопка: нажатие открывает историю шага под доской (шаг 3 — ещё и подэтапы).
// data-step / data-state на li — общие хуки тестов (state задаёт обёртка: статусы сотрудника или сегменты клиента).
export type BoardCard = StageCard & { title: string; dataState: string }

const props = withDefaults(defineProps<{
  cards: BoardCard[]
  audience: StageAudience
  heading: string
  aside?: string
  selected: number | null
  substeps?: SubStage[]
  /** Сотрудник: пояснение под пустой историей (события пишутся с 17.10). */
  historyEmptyNote?: string
}>(), { aside: '', substeps: () => [], historyEmptyNote: '' })
const emit = defineEmits<{ 'update:selected': [n: number | null] }>()

const { t } = useI18n()
const uid = useId()
const headingId = `stage-board-${uid}`
const panelId = `stage-detail-${uid}`
const client = computed(() => props.audience === 'client')

const selectedCard = computed(() => props.cards.find((c) => c.n === props.selected) ?? null)
const toggle = (n: number) => emit('update:selected', props.selected === n ? null : n)

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const CIRCLE: Record<StageTone, string> = {
  ok: 'bg-tone-done-bg text-tone-done-fg',
  current: 'bg-zircon text-navy font-bold',
  ask: 'bg-gold text-navy font-bold',
  problem: 'bg-zircon text-navy font-bold',
  future: 'border-[1.5px] border-control bg-surface text-ink-2',
}
const BAR: Record<StageTone, string> = {
  ok: 'bg-tone-done-fg',
  current: 'bg-zircon',
  ask: 'bg-gold',
  problem: 'bg-danger',
  future: 'bg-line',
}
const RESULT: Record<StageTone, string> = {
  ok: 'text-tone-done-fg',
  current: 'text-ink',
  ask: 'text-ink',
  problem: 'text-ink',
  future: 'text-ink-2',
}

const liClass = (c: BoardCard) => cn(
  'grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-3 @3xl:block',
  c.n <= 4 && '@3xl:row-span-2',
  c.n === 5 && '@3xl:col-start-5 @3xl:row-start-1',
  c.n === 6 && '@3xl:col-start-5 @3xl:row-start-2',
)
const cardClass = (c: BoardCard) => cn(
  'flex w-full min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 pb-4 text-left font-sans text-inherit outline-hidden',
  'min-h-11 rounded-row focus-visible:shadow-focus',
  '@3xl:min-h-0 @3xl:gap-2 @3xl:rounded-[10px] @3xl:border @3xl:border-solid @3xl:border-line @3xl:bg-surface @3xl:p-3.5',
  c.n <= 4 && '@3xl:h-full',
  c.n >= 5 && '@3xl:gap-1 @3xl:px-3.5 @3xl:py-3',
  c.state === 'current' && '@3xl:border-2 @3xl:p-[13px] @3xl:shadow-[0_12px_32px_-12px_rgb(60_48_30/0.22)]',
  c.state === 'current' && (c.tone === 'ask' ? '@3xl:border-gold' : '@3xl:border-zircon'),
  c.state === 'future' && '@3xl:border-dashed @3xl:border-line-strong @3xl:bg-canvas',
  props.selected === c.n && '@max-3xl:bg-sunken/60 @3xl:ring-2 @3xl:ring-navy/15',
)
const circle = (c: BoardCard, size: 'rail' | 'card') => cn(
  'box-border inline-flex shrink-0 items-center justify-center rounded-pill text-xs tabular-nums',
  size === 'rail' ? 'size-[26px]' : 'size-6',
  CIRCLE[c.tone],
)
const rail = (c: BoardCard) => cn('min-h-3 w-0.5 flex-1', c.state === 'done' ? 'bg-tone-done-fg' : 'bg-line')
const stateText = (c: BoardCard) => t(`broker.case.stepper.${c.state}`)
// Клиенту на текущем шаге без метки — «сейчас — работает AQNIET».
const nowText = (c: BoardCard) => (client.value && c.state === 'current' && !c.flag ? t('stages.nowUs') : '')
</script>

<template>
  <section :aria-labelledby="headingId" class="@container rounded-panel border border-line bg-surface p-5 max-sm:px-4 max-sm:py-4">
    <div class="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 :id="headingId" class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ heading }}</h2>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="tag" />
        <span v-if="aside" class="text-[13px] text-muted tabular-nums" data-stage-aside>{{ aside }}</span>
      </div>
    </div>

    <ol class="m-0 flex list-none flex-col p-0 @3xl:grid @3xl:grid-cols-5 @3xl:grid-rows-[auto_auto] @3xl:gap-3">
      <li
        v-for="c in cards"
        :key="c.n"
        :class="liClass(c)"
        :data-step="c.n"
        :data-state="c.dataState"
        :aria-current="c.state === 'current' ? 'step' : undefined"
      >
        <span aria-hidden="true" class="flex flex-col items-center @3xl:hidden">
          <span :class="circle(c, 'rail')">
            <PhCheck v-if="c.state === 'done'" :size="14" weight="bold" />
            <template v-else>{{ c.n }}</template>
          </span>
          <span v-if="c.n < cards.length" :class="rail(c)" />
        </span>

        <div class="flex min-w-0 flex-col gap-1.5">
          <div v-if="c.n === 5" class="flex items-center gap-1.5 text-xs leading-4 text-muted @max-3xl:pt-1" data-stage-parallel>
            <PhPause :size="13" aria-hidden="true" />{{ client ? t('stages.parallelClient') : t('stages.parallelStaff') }}
          </div>
          <button
            type="button"
            :class="cardClass(c)"
            :aria-expanded="selected === c.n"
            :aria-controls="panelId"
            :data-stage-card="c.n"
            @click="toggle(c.n)"
          >
            <span v-if="c.n <= 4" aria-hidden="true" :class="cn('hidden h-1 w-full rounded-pill @3xl:block', BAR[c.tone])" />
            <span class="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" :class="cn(circle(c, 'card'), 'hidden @3xl:inline-flex')">
                <PhCheck v-if="c.state === 'done'" :size="13" weight="bold" />
                <template v-else>{{ c.n }}</template>
              </span>
              <span class="min-w-0 text-[14.5px] leading-[22px] font-semibold text-ink [overflow-wrap:anywhere]" data-step-title>{{ c.title }}</span>
              <span class="sr-only"> — {{ stateText(c) }}</span>
            </span>
            <span v-if="c.result" :class="cn('text-[13px] leading-[18px] [overflow-wrap:anywhere]', RESULT[c.tone])" data-step-sub>{{ c.result }}</span>
            <span v-if="c.detail" class="text-xs leading-4 text-muted [overflow-wrap:anywhere]" data-step-note>{{ c.detail }}</span>
            <span v-if="c.responsible" class="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-2" data-step-who>
              <span
                v-if="c.initials"
                aria-hidden="true"
                class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-pill bg-zircon-soft text-[9px] font-bold text-zircon-ink"
              >{{ c.initials }}</span>
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ c.responsible }}<template v-if="c.meta"> · {{ c.meta }}</template></span>
            </span>
            <span v-else-if="c.meta" class="text-xs leading-4 text-muted" data-step-meta>{{ c.meta }}</span>
            <span v-if="c.timing" class="flex flex-col gap-1" data-step-timing>
              <span class="flex justify-between gap-2 text-xs leading-4 tabular-nums">
                <span :class="c.timing.overdue ? 'font-semibold text-tone-danger-fg' : 'text-ink'">{{ c.timing.elapsed }}<template v-if="c.timing.overdue"> · {{ t('stages.overdue') }}</template></span>
                <span class="text-muted">{{ c.timing.norm }}</span>
              </span>
              <span aria-hidden="true" class="block h-1 rounded-pill bg-sunken">
                <span :class="cn('block h-1 rounded-pill', c.timing.overdue ? 'bg-danger' : 'bg-zircon-ink')" :style="{ width: `${c.timing.pct}%` }" />
              </span>
            </span>
            <span
              v-if="c.flag"
              :class="cn(
                'inline-flex items-center gap-1.5 self-start rounded-[6px] px-2 py-1 text-xs leading-4 font-semibold',
                c.flag.tone === 'gold' ? 'bg-gold-soft text-gold-ink' : 'bg-tone-danger-bg text-tone-danger-fg',
              )"
              data-step-flag
              :data-step-alert="c.flag.tone === 'danger' ? '' : undefined"
              :data-step-now="client ? '' : undefined"
            >
              <span v-if="c.flag.tone === 'gold'" aria-hidden="true" class="size-1.5 rounded-pill bg-gold" />
              <PhWarning v-else :size="12" weight="bold" aria-hidden="true" />
              {{ c.flag.text }}
            </span>
            <span v-else-if="nowText(c)" class="text-xs leading-4 text-muted" data-step-now>{{ nowText(c) }}</span>
          </button>
        </div>
      </li>
    </ol>

    <div
      v-if="selectedCard"
      :id="panelId"
      class="mt-2 grid gap-5 border-t border-line pt-4 @3xl:mt-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      data-stage-detail
      :data-detail-step="selectedCard.n"
    >
      <div v-if="selectedCard.n === 3 && substeps.length" class="flex min-w-0 flex-col gap-3">
        <h3 class="m-0 text-[13px] font-semibold tracking-[0.04em] text-muted uppercase">{{ t('stages.sub.label') }}</h3>
        <ol class="m-0 flex list-none flex-col gap-2 p-0 @xl:grid @xl:grid-cols-4 @xl:gap-2" data-stage-substeps>
          <li
            v-for="s in substeps"
            :key="s.key"
            :data-sub="s.key"
            :data-sub-state="s.state"
            class="flex items-baseline justify-between gap-3 rounded-row bg-sunken px-3 py-2 @xl:flex-col @xl:items-stretch @xl:justify-start @xl:gap-1.5 @xl:bg-transparent @xl:p-0"
          >
            <span aria-hidden="true" :class="cn('hidden h-1 rounded-pill @xl:block', BAR[s.tone])" />
            <span :class="cn('text-[13px] font-semibold', s.state === 'todo' ? 'text-ink-2' : 'text-ink')">{{ s.label }}</span>
            <span
              :class="cn(
                'text-right text-xs leading-4 @xl:text-left',
                s.tone === 'ok' && 'text-tone-done-fg',
                s.tone === 'ask' && 'font-semibold text-gold-ink',
                s.tone === 'problem' && 'font-semibold text-tone-danger-fg',
                (s.tone === 'current' || s.tone === 'future') && 'text-muted',
              )"
            >{{ s.caption }}</span>
          </li>
        </ol>
      </div>
      <StageHistory
        :class="selectedCard.n === 3 && substeps.length ? '' : '@3xl:col-span-2'"
        :title="t('stages.history', { n: selectedCard.n }) + ' · ' + selectedCard.title"
        :events="selectedCard.history"
        :audience="audience"
        :empty-note="historyEmptyNote"
      />
    </div>
  </section>
</template>
