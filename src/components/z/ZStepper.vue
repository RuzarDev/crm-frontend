<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhWarning } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'

export interface ZStep { key: string; label: string; hint?: string }

// Полоса этапов (стиль C): пройденные — zircon, текущий — zircon-ink (danger при ошибке), будущие — line.
// Без градиентов (спека §4). На телефоне остаётся подпись текущего этапа и счётчик «Шаг N из M».
const props = withDefaults(defineProps<{
  steps: ZStep[]
  current: string
  status?: 'process' | 'error'
}>(), { status: 'process' })

const { t } = useI18n()
const index = computed(() => props.steps.findIndex((s) => s.key === props.current))
const stateOf = (i: number) => (i < index.value ? 'done' : i === index.value ? 'current' : 'todo')

const barClass = (i: number) => {
  const s = stateOf(i)
  if (s === 'done') return 'bg-zircon'
  if (s === 'current') return props.status === 'error' ? 'bg-danger' : 'bg-zircon-ink'
  return 'bg-line'
}
const labelClass = (i: number) => {
  const s = stateOf(i)
  return cn(
    'mt-1.5 flex min-w-0 items-center gap-1 text-xs',
    s === 'current' ? 'font-semibold' : 'max-sm:hidden',
    s === 'current' ? (props.status === 'error' ? 'text-danger' : 'text-zircon-ink') : s === 'done' ? 'text-ink-3' : 'text-muted',
  )
}
</script>

<template>
  <div>
    <ol :aria-label="t('z.steps')" class="m-0 flex list-none gap-1 p-0">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        :aria-current="stateOf(i) === 'current' ? 'step' : undefined"
        :class="cn('min-w-0', stateOf(i) === 'current' ? 'flex-[2] sm:flex-1' : 'flex-1')"
      >
        <span data-z-step-bar aria-hidden="true" :class="cn('block h-1.5 rounded-pill', barClass(i))" />
        <span data-z-step-label :class="labelClass(i)">
          <PhCheck v-if="stateOf(i) === 'done'" :size="12" weight="bold" aria-hidden="true" class="shrink-0" />
          <PhWarning v-else-if="stateOf(i) === 'current' && status === 'error'" :size="12" weight="bold" aria-hidden="true" class="shrink-0" />
          <span class="min-w-0 truncate">{{ step.label }}</span>
          <span v-if="stateOf(i) === 'done'" class="sr-only"> — {{ t('z.stepDone') }}</span>
          <span v-else-if="stateOf(i) === 'current' && status === 'error'" class="sr-only"> — {{ t('z.stepError') }}</span>
        </span>
        <span v-if="step.hint" class="block text-xs text-muted max-sm:hidden">{{ step.hint }}</span>
      </li>
    </ol>
    <p v-if="index >= 0" class="m-0 mt-1.5 text-xs text-ink-3 tabular-nums sm:hidden">{{ t('z.stepOf', { n: index + 1, total: steps.length }) }}</p>
  </div>
</template>
