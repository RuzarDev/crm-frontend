<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZTag from '@/components/z/ZTag.vue'
import StageBoard, { type BoardCard } from '@/components/stages/StageBoard.vue'
import type { Import40CaseDto, Import40CaseInvoiceDto, Import40FileDto } from '@/api/import40'
import type { CaseStages } from '@/api/stages'
import { buildStageCards, declaringSubstages, defaultSelectedStep, whenText } from '@/utils/import40StageModel'
import { TOTAL_STEPS, isCancelled, isDone } from './caseSteps'
import type { CaseStepInfo } from './caseContext'

// Этапы карточки заявки сотрудника по макету (17.10): под каждым шагом итог, ответственный, «на шаге · норма» с полосой,
// метка «Запрос таможни»; шаги 5 и 6 — «Параллельно»; нажатие на шаг — его история (шаг 3 — с подэтапами).
// Время и нормы — GET import40/{id}/stages; без них (ошибка) — только статус и сводки, как раньше.
const props = withDefaults(defineProps<{
  steps: CaseStepInfo[]
  status: number
  kase: Import40CaseDto
  stages?: CaseStages | null
  invoices?: Import40CaseInvoiceDto[]
  files?: Import40FileDto[]
}>(), { stages: null, invoices: () => [], files: () => [] })
const { t, te, locale } = useI18n()

const tag = computed(() =>
  isCancelled(props.status) ? { text: t('import40Case.cancelled'), tone: 'neutral' as const }
  : isDone(props.status) ? { text: t('import40Case.completed'), tone: 'done' as const }
  : null)

const input = computed(() => ({
  audience: 'staff' as const,
  kase: props.kase,
  stages: props.stages,
  invoices: props.invoices,
  docsCount: props.files.filter((f) => f.section === 'documents').length,
  locale: locale.value,
}))

const cards = computed<BoardCard[]>(() => {
  const model = buildStageCards(input.value, t, te)
  return props.steps.map((s) => {
    const m = model[s.n - 1]!
    // Без итога (будущий шаг без пояснения) — исполнитель шага, как прежняя полоса; пройденный без событий — прежняя сводка.
    const result = m.result || (s.state === 'done' ? s.summary : '')
    return { ...m, result, title: s.title, state: s.state === 'done' && m.state === 'done' ? 'done' : m.state, dataState: s.state }
  })
})
const substeps = computed(() => declaringSubstages(input.value, t, te))

const selected = ref<number | null>(defaultSelectedStep(props.status))
watch(() => [props.kase.id, props.status] as const, ([id, status], [prevId]) => {
  if (id !== prevId || selected.value == null) selected.value = defaultSelectedStep(status)
})

const current = computed(() => props.steps.find((s) => s.state === 'current') ?? null)
const sinceIso = computed(() => {
  const events = (props.stages?.steps ?? []).flatMap((s) => s.history).filter((e) => e.kind === 'submitted' || e.kind === 'resubmitted')
  return events.map((e) => e.atUtc).sort()[0] ?? null
})
const aside = computed(() => {
  if (!current.value) return ''
  const parts = [t('stages.stepOf', { n: current.value.n, total: TOTAL_STEPS })]
  if (sinceIso.value) parts.push(t('stages.inWorkSince', { when: whenText(sinceIso.value, t) }))
  return parts.join(' · ')
})
</script>

<template>
  <div data-case-stepper>
    <StageBoard
      v-model:selected="selected"
      :cards="cards"
      audience="staff"
      :heading="t('stages.titleStaff')"
      :aside="aside"
      :substeps="substeps"
      :history-empty-note="t('stages.historyStaffNote')"
    >
      <template v-if="tag" #tag><ZTag :tone="tag.tone" data-case-stepper-tag>{{ tag.text }}</ZTag></template>
    </StageBoard>
  </div>
</template>
