<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'

// Временная панель шага (Task 2): что делается на шаге и сводка. Tasks 3–5 заменяют её на steps/Step*.vue
// по контракту caseContext.ts.
defineProps<CaseStepProps>()
const { t } = useI18n()
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step">
    <p class="m-0 text-sm text-ink-2" data-step-placeholder>{{ t(`broker.case.stepHint.s${ctx.step.n}`) }}</p>
  </CaseStepPanel>
  <p v-else class="m-0 text-sm text-ink-2" data-step-placeholder>{{ ctx.step.summary }}</p>
</template>
