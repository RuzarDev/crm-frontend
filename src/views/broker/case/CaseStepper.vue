<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZTag from '@/components/z/ZTag.vue'
import { cn } from '@/ui/cn'
import { TOTAL_STEPS, isCancelled, isDone } from './caseSteps'
import type { CaseStepInfo } from './caseContext'

// Полоса из 6 шагов (доски Case/CaseSvh): пройденный — тёмный круг с галочкой и сводкой; текущий — кольцо zircon
// и «сейчас · исполнитель»; будущий — серый и исполнитель. Отменённая — все будущие и тег «Отменена»;
// выполненная — все пройдены и тег «Выполнено». Уже 1024px (планшет, телефон) — одна строка «Шаг N из 6 · название».
const props = defineProps<{ steps: CaseStepInfo[]; status: number }>()
const { t } = useI18n()

const current = computed(() => props.steps.find((s) => s.state === 'current') ?? null)
const tag = computed(() =>
  isCancelled(props.status) ? { text: t('import40Case.cancelled'), tone: 'neutral' as const }
  : isDone(props.status) ? { text: t('import40Case.completed'), tone: 'done' as const }
  : null)

const circle = (s: CaseStepInfo) => cn(
  'inline-flex size-[26px] shrink-0 items-center justify-center rounded-pill text-xs font-semibold tabular-nums',
  s.state === 'done' && 'bg-navy text-white',
  s.state === 'current' && 'bg-surface font-bold text-zircon-ink shadow-[inset_0_0_0_2px_var(--color-zircon)]',
  s.state === 'future' && 'bg-sunken text-muted',
)
const sub = (s: CaseStepInfo) =>
  s.state === 'done' ? s.summary : s.state === 'current' ? t('broker.case.stepper.now', { executor: s.executorLabel }) : s.executorLabel
</script>

<template>
  <div class="rounded-panel border border-line bg-surface px-5 pt-4 pb-3.5 max-sm:px-4 max-sm:py-3" data-case-stepper>
    <div v-if="tag" class="mb-3 max-lg:hidden" data-case-stepper-tag><ZTag :tone="tag.tone">{{ tag.text }}</ZTag></div>

    <ol :aria-label="t('broker.case.stepper.label')" class="m-0 flex list-none p-0 max-lg:hidden">
      <li
        v-for="(s, i) in steps"
        :key="s.n"
        :aria-current="s.state === 'current' ? 'step' : undefined"
        class="flex min-w-0 flex-1 flex-col gap-2"
        :data-step="s.n"
        :data-state="s.state"
      >
        <div class="flex items-center">
          <span :class="circle(s)" aria-hidden="true">
            <PhCheck v-if="s.state === 'done'" :size="14" weight="bold" />
            <template v-else>{{ s.n }}</template>
          </span>
          <span
            v-if="i < steps.length - 1"
            aria-hidden="true"
            :class="cn('mx-2.5 h-0.5 flex-1 rounded-[2px]', s.state === 'done' ? 'bg-navy' : 'bg-line')"
          />
        </div>
        <div class="min-w-0 pr-3">
          <div :class="cn('text-[13px] leading-[18px] [overflow-wrap:anywhere]', s.state === 'current' ? 'font-semibold text-ink' : s.state === 'done' ? 'font-medium text-ink-2' : 'font-medium text-muted')" :title="s.title">
            {{ s.title }}<span class="sr-only"> — {{ t(`broker.case.stepper.${s.state}`) }}</span>
          </div>
          <div
            :class="cn('mt-px truncate text-xs', s.state === 'current' ? 'text-zircon-ink' : 'text-muted')"
            :title="sub(s)"
            data-step-sub
          >{{ sub(s) }}</div>
        </div>
      </li>
    </ol>

    <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm lg:hidden" data-case-stepper-phone>
      <template v-if="current">
        <span class="font-semibold text-ink tabular-nums">{{ t('broker.case.stepper.phone', { n: current.n, total: TOTAL_STEPS, title: current.title }) }}</span>
        <span class="text-zircon-ink">{{ t('broker.case.stepper.now', { executor: current.executorLabel }) }}</span>
      </template>
      <ZTag v-else-if="tag" :tone="tag.tone">{{ tag.text }}</ZTag>
    </p>
    <div class="mt-2.5 flex gap-1 lg:hidden" aria-hidden="true">
      <span
        v-for="s in steps"
        :key="s.n"
        :class="cn('h-1 flex-1 rounded-pill', s.state === 'done' ? 'bg-navy' : s.state === 'current' ? 'bg-zircon' : 'bg-line')"
      />
    </div>
  </div>
</template>
