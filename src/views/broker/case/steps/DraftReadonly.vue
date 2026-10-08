<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import type { CaseStepContext } from '../caseContext'
import { transportSummary } from '../caseFormat'
import DraftClientData from './DraftClientData.vue'
import DraftContainers from './DraftContainers.vue'

// Шаг 1 в режиме чтения: груз, пост, транспорт, контейнеры, данные от клиента и документы со скачиванием.
// Так шаг выглядит в «Пройденных шагах» и у сотрудника без права вести черновик.
const props = defineProps<{ ctx: CaseStepContext }>()
const { t } = useI18n()

const rows = computed(() => {
  const c = props.ctx.kase
  const out: { key: string; label: string; value: string; mono?: boolean }[] = [
    { key: 'cargo', label: t('broker.case.draft.cargo'), value: c.cargo || '—' },
    { key: 'post', label: t('broker.case.draft.post'), value: c.post || '—' },
    { key: 'transport', label: t('broker.case.draft.transport'), value: transportSummary(c, t) },
  ]
  if (c.transportMode === 1 && c.driverPhone) out.push({ key: 'driverPhone', label: t('broker.case.draft.driverPhone'), value: c.driverPhone })
  if (c.transportMode === 0 && c.station) out.push({ key: 'station', label: t('broker.case.draft.station'), value: c.station })
  if (c.transportMode === 2 && c.airWaybill) out.push({ key: 'airWaybill', label: t('broker.case.draft.awb'), value: c.airWaybill, mono: true })
  if (c.transportMode === 3 && c.billOfLading) out.push({ key: 'billOfLading', label: t('broker.case.draft.bl'), value: c.billOfLading, mono: true })
  return out
})
</script>

<template>
  <div class="flex flex-col gap-4" data-draft-readonly>
    <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      <template v-for="r in rows" :key="r.key">
        <dt class="text-muted">{{ r.label }}</dt>
        <dd :class="['m-0 text-ink [overflow-wrap:anywhere]', r.mono && 'font-mono']" :data-draft-row="r.key">{{ r.value }}</dd>
      </template>
    </dl>
    <div>
      <p class="m-0 mb-2 text-[13px] font-semibold text-ink">{{ t('broker.case.draft.containers') }}</p>
      <DraftContainers :ctx="ctx" />
    </div>
    <DraftClientData :kase="ctx.kase" />
    <CaseDocsSlot
      :ctx="ctx"
      section="documents"
      :label="t('broker.case.draft.documents')"
      with-kind
      :empty-text="t('broker.case.draft.docsEmptyRead')"
    />
  </div>
</template>
