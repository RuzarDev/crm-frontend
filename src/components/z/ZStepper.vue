<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
    'mt-1.5 block text-xs',
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
        <i data-z-step-bar aria-hidden="true" :class="cn('block h-1.5 rounded-pill', barClass(i))" />
        <span :class="labelClass(i)">{{ step.label }}</span>
        <span v-if="step.hint" class="block text-[11px] text-faint max-sm:hidden">{{ step.hint }}</span>
      </li>
    </ol>
    <p v-if="index >= 0" class="m-0 mt-1.5 text-xs text-ink-3 tabular-nums sm:hidden">{{ t('z.stepOf', { n: index + 1, total: steps.length }) }}</p>
  </div>
</template>
