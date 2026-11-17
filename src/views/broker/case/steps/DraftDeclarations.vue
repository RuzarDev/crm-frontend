<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CaseStepProps } from '../caseContext'
import DeclarationsList from './DeclarationsList.vue'

// Черновик ДТ до прохода границы (Несибели 17.11.2026): на шагах 1–2 декларант заранее заполняет ДТ по товарам
// («Из документов», «Из Excel», «Копировать»), транспорт и СВХ дописывает, когда груз придёт. Подать ДТ — только на шаге 3.
defineProps<CaseStepProps>()
const { t } = useI18n()
</script>

<template>
  <section aria-labelledby="case-draft-dt-title" class="overflow-hidden rounded-panel border border-line bg-surface" data-case-draft-dt>
    <div class="px-[18px] pt-3.5 pb-3">
      <h2 id="case-draft-dt-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.case.draftDt.title') }}</h2>
      <p class="m-0 mt-1 text-[13px] text-muted">{{ t('broker.case.draftDt.note') }}</p>
    </div>
    <DeclarationsList :ctx="ctx" mode="current" draft />
  </section>
</template>
