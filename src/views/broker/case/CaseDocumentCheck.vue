<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarning } from '@phosphor-icons/vue'
import ZTag from '@/components/z/ZTag.vue'
import { documentChecksApi, type DocumentCheck, type DocumentDiscrepancy, type DocumentDiscrepancyValue } from '@/api/documentChecks'
import { cn } from '@/ui/cn'

// Сверка документов поставки (17.10), карточка заявки сотрудника: по каждому разбору пакета документов (кнопка «Из
// документов» на шаге ДТ) — где инвойс, упаковочный лист, контракт и CMR разошлись между собой, с заявкой и с ДТ.
// Разборов нет — блока нет; расхождений нет — одна строка «сверено».
const props = defineProps<{ caseId: string; stamp?: string | null }>()
const { t, te } = useI18n()
const uid = useId()

const checks = ref<DocumentCheck[]>([])
let seq = 0
const load = async () => {
  const my = ++seq
  try {
    const list = await documentChecksApi.list(props.caseId)
    if (my === seq) checks.value = list
  } catch {
    // Блок необязателен: сбой — не показываем.
    if (my === seq) checks.value = []
  }
}
watch(() => [props.caseId, props.stamp] as const, () => void load(), { immediate: true })

// По ДТ — последний разбор (связанный с ДТ или единственный); без ДТ — последний без ДТ.
const shown = computed(() => {
  const seen = new Set<string>()
  return checks.value.filter((c) => {
    const key = c.declarationId ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const total = computed(() => shown.value.reduce((n, c) => n + c.discrepancies.length, 0))

const fieldName = (d: DocumentDiscrepancy) => (te(`docCheck.field.${d.field}`) ? t(`docCheck.field.${d.field}`) : d.fieldLabel)
const sourceName = (v: DocumentDiscrepancyValue) => {
  if (v.sourceKind === 'case') return t('docCheck.source.case')
  if (v.sourceKind === 'declaration') return t('docCheck.source.dt', { n: v.source || '—' })
  if (v.sourceKind === 'documents') return t('docCheck.source.documents')
  return v.source || t('docCheck.source.document')
}
const checkTitle = (c: DocumentCheck) =>
  c.declarationNumber ? t('docCheck.forDt', { n: c.declarationNumber }) : c.declarationId ? t('docCheck.forDtNoNumber') : t('docCheck.noDt')
const when = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const SCOPE_TONE = { documents: 'danger', case: 'wait', declaration: 'wait' } as const

const titleId = `case-doccheck-${uid}`
</script>

<template>
  <section
    v-if="shown.length"
    :aria-labelledby="titleId"
    :class="cn('rounded-panel border px-[18px] py-4', total ? 'border-tone-wait-fg/25 bg-tone-wait-bg' : 'border-line bg-surface')"
    data-case-doccheck
  >
    <h2 :id="titleId" class="m-0 flex items-center gap-2 text-[15px] leading-6 font-semibold text-ink">
      <PhWarning v-if="total" :size="18" weight="bold" class="shrink-0 text-tone-wait-fg" aria-hidden="true" />
      <PhCheckCircle v-else :size="18" weight="bold" class="shrink-0 text-tone-done-fg" aria-hidden="true" />
      {{ total ? t('docCheck.title', { n: total }) : t('docCheck.allGood') }}
    </h2>
    <div v-for="c in shown" :key="c.id" class="mt-3 border-t border-line/70 pt-3 first-of-type:mt-2" :data-doccheck="c.id">
      <p class="m-0 text-[13px] text-ink-2 [overflow-wrap:anywhere]">
        <span class="font-medium text-ink">{{ checkTitle(c) }}</span> · {{ when(c.createdAtUtc) }}
        <template v-if="c.sourceFileNames.length"> · {{ c.sourceFileNames.join(', ') }}</template>
      </p>
      <p v-if="c.contractNumber || c.invoiceNumber || c.transportPlates.length" class="m-0 mt-0.5 text-xs text-ink-3 [overflow-wrap:anywhere]" data-doccheck-facts>
        <template v-if="c.contractNumber">{{ t('docCheck.contract', { n: c.contractNumber }) }}</template>
        <template v-if="c.invoiceNumber"><template v-if="c.contractNumber"> · </template>{{ t('docCheck.invoice', { n: c.invoiceNumber }) }}</template>
        <template v-if="c.transportPlates.length"><template v-if="c.contractNumber || c.invoiceNumber"> · </template>{{ t('docCheck.transport', { n: c.transportPlates.join(' / ') }) }}</template>
      </p>
      <p v-if="!c.discrepancies.length" class="m-0 mt-1 text-sm text-ink-3" data-doccheck-ok>{{ t('docCheck.noDiscrepancies') }}</p>
      <ul v-else role="list" class="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        <li
          v-for="(d, i) in c.discrepancies"
          :key="i"
          class="flex flex-col gap-1 rounded-row bg-surface px-3 py-2"
          :data-doccheck-item="`${d.scope}:${d.field}`"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ZTag :tone="SCOPE_TONE[d.scope]" size="sm">{{ t(`docCheck.scope.${d.scope}`) }}</ZTag>
            <span class="text-sm font-medium text-ink">{{ fieldName(d) }}</span>
            <span v-if="d.itemIndex" class="min-w-0 text-[13px] text-ink-3 [overflow-wrap:anywhere]">
              {{ t('docCheck.item', { n: d.itemIndex }) }}<template v-if="d.itemDescription"> «{{ d.itemDescription }}»</template>
            </span>
          </div>
          <ul role="list" class="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]">
            <li v-for="(v, j) in d.values" :key="j" class="[overflow-wrap:anywhere]" data-doccheck-value>
              <span class="text-ink-3">{{ sourceName(v) }}:</span> <span class="font-medium text-ink">{{ v.value ?? '—' }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </section>
</template>
