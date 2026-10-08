<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { TOTAL_STEPS } from './caseSteps'
import type { CaseStepInfo } from './caseContext'

// Оболочка текущего шага (доски Case/CaseSvh): точка zircon, название, «шаг N из 6 · meta», справа — кнопки шага.
// Тело — слот default; flush — без отступов (полосы во всю ширину, как список ДТ на шаге 3).
// На телефоне кнопки шага ≥ 44px — одним правилом на контейнер кнопок (кнопка часто обёрнута в span подсказки).
// id="case-step-current" + tabindex -1: «Изменить» в правой колонке переводит сюда фокус.
const props = withDefaults(defineProps<{ step: CaseStepInfo; meta?: string; flush?: boolean }>(), { meta: '', flush: false })
const { t } = useI18n()
const titleId = `case-step-${props.step.n}-title`
</script>

<template>
  <section
    id="case-step-current"
    tabindex="-1"
    :aria-labelledby="titleId"
    class="overflow-hidden rounded-panel border border-line bg-surface outline-hidden focus-visible:shadow-focus"
    :data-case-step-panel="step.n"
  >
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-[18px] pt-4 pb-3">
      <span class="size-2 shrink-0 rounded-pill bg-zircon" aria-hidden="true" />
      <h2 :id="titleId" class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ step.title }}</h2>
      <span class="text-xs text-muted tabular-nums">
        {{ t('broker.case.step.of', { n: step.n, total: TOTAL_STEPS }) }}<template v-if="meta || $slots.meta"> · <slot name="meta">{{ meta }}</slot></template>
      </span>
      <div v-if="$slots.actions" class="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&_button]:min-h-11" data-case-step-actions>
        <slot name="actions" />
      </div>
    </div>
    <div :class="cn(!flush && 'px-[18px] pb-[18px]')">
      <slot />
    </div>
  </section>
</template>
