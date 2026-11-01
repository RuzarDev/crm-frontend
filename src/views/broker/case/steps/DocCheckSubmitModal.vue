<script setup lang="ts">
import { computed } from 'vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { SubmitFixItem, SubmitSummary } from '../docCheckModel'
import { conflictValueKind, groupConflictValues, groupDocValues } from '../docCheckModel'
import { useDocCheckFormat } from '../useDocCheckFormat'

// Окно при «Подать ДТ» (01.11.2026, D5): остались расхождения с документами или файл другой поставки. Одно окно вместо
// обычного подтверждения подачи — два окна подряд быть не должно. Подать можно («предупредить и дать подать»).
const props = defineProps<{ open: boolean; summary: SubmitSummary | null; loading?: boolean }>()
const emit = defineEmits<{ back: []; submit: []; cancel: [] }>()
const f = useDocCheckFormat()
const { t } = f

const MAX = 5
const items = computed(() => props.summary?.fix ?? [])
const shownItems = computed(() => items.value.slice(0, MAX))
const line = (it: SubmitFixItem) => {
  if (it.row) {
    const r = it.row
    const doc = groupDocValues(r.documents).map((g) => f.fmt(g.value, r)).join(', ') || '—'
    return t('docCheck.submit.fixLine', { field: f.rowLabel(r), dt: f.fmt(r.declarationValue, r), doc })
  }
  const d = it.conflict!
  // Одно значение — один раз, числа с разрядами — как в карточке сверки (01.11.2026, доработка).
  const values = groupConflictValues(d, () => '').map((g) => (g.value ? f.fmt(g.value, { valueKind: conflictValueKind(d), currency: null }) : '—'))
  return `${f.fieldName(d)}${d.itemIndex ? ` · ${t('docCheck.item', { n: d.itemIndex })}` : ''}: ${values.join(' / ')}`
}
</script>

<template>
  <ZModal
    :open="open"
    :width="480"
    :title="t('docCheck.submit.title')"
    destroy-on-close
    data-doccheck-submit-modal
    @cancel="emit('cancel')"
  >
    <template #description>{{ t('docCheck.submit.lead') }}</template>
    <div class="flex flex-col gap-2 text-[13.5px] text-ink">
      <ul v-if="items.length" role="list" class="m-0 flex list-none flex-col gap-1 p-0" data-doccheck-submit-fix>
        <li v-for="(it, i) in shownItems" :key="i" class="[overflow-wrap:anywhere]">{{ line(it) }}</li>
        <li v-if="items.length > MAX" class="text-ink-3" data-doccheck-submit-more>{{ t('docCheck.submit.more', { n: items.length - MAX }) }}</li>
      </ul>
      <p v-if="summary?.foreignFiles.length" class="m-0 [overflow-wrap:anywhere]" data-doccheck-submit-foreign>
        {{ t('docCheck.submit.foreign', { files: summary.foreignFiles.join(', ') }) }}
      </p>
      <p v-if="summary?.manual" class="m-0 text-ink-2" data-doccheck-submit-manual>{{ t('docCheck.submit.manual', { n: summary.manual }) }}</p>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2 max-sm:flex-col-reverse">
        <ZButton class="max-sm:w-full" data-doccheck-submit-back @click="emit('back')">{{ t('docCheck.submit.back') }}</ZButton>
        <ZButton variant="primary" class="max-sm:w-full" :loading="loading" data-doccheck-submit-anyway @click="emit('submit')">{{ t('docCheck.submit.submit') }}</ZButton>
      </div>
    </template>
  </ZModal>
</template>
