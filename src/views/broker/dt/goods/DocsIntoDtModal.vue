<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZModal from '@/components/z/ZModal.vue'
import type { Import40ExtractionConflict } from '@/api/import40'
import { formatQty } from '@/views/broker/transit/record/sections/goods'
import { planHasChanges, type DocsIntoDtPlan } from './docsIntoDt'

// Сводка «Из документов» в эту ДТ (29.10.2026): сколько товаров добавится и дозаполнится, сколько строк гр. 44, какие
// пустые графы шапки заполнятся; расхождения с товарами ДТ (оставлены значения ДТ) и замечания. «Применить» / «Отмена».
const props = defineProps<{
  open: boolean
  plan: DocsIntoDtPlan | null
  remarks: readonly string[]
  conflicts: readonly Import40ExtractionConflict[]
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; apply: [] }>()
const { t, locale } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.docsInto.${key}`, p ?? {})

const changes = computed(() => (props.plan ? planHasChanges(props.plan) : false))
const goods = computed(() => props.plan?.goods.plan ?? null)
const headerList = computed(() => (props.plan?.header.groups ?? []).map((g) => tx(`field.${g}`)).join(', '))

// Поля сравнения товаров (importMerge.COMPARE_FIELDS) → подписи окна «Из Excel».
const FIELD_LABEL: Record<string, string> = {
  tnvedCode: 'tnvedCode', countryOfOrigin: 'countryCode', grossWeightKg: 'grossWeightKg', netWeightKg: 'netWeightKg',
  packagesCount: 'places', customsValue: 'value', quantity: 'quantity',
}
const fmt = (v: unknown) => (typeof v === 'number' ? formatQty(v, locale.value) : String(v ?? '—'))
const conflictLines = computed(() => (props.plan?.goods.conflicts ?? []).map((c) => tx('conflictLine', {
  n: c.existing + 1,
  field: t(`broker.dt.goods.excel.conflictField.${FIELD_LABEL[c.field as string] ?? 'value'}`),
  dt: fmt(c.dtValue),
  doc: fmt(c.fileValue),
})))
const quoted = (value: string | null | undefined, source: string | null | undefined) => `«${value ?? '—'}»${source ? ` (${source})` : ''}`
const extractionLines = computed(() => props.conflicts.map((c) =>
  `${c.fieldLabel}: ${quoted(c.value, c.sourceDocument)} — ${c.alternatives.map((a) => quoted(a.value, a.sourceDocument)).join(', ')}`))

const warn = 'm-0 rounded-row bg-gold-soft px-3 py-2 text-gold-ink'
</script>

<template>
  <ZModal
    :open="open"
    :title="tx('title')"
    :width="680"
    :ok-text="tx('apply')"
    :cancel-text="t('common.cancel')"
    :ok-button-props="{ disabled: !changes }"
    destroy-on-close
    data-docs-into-modal
    @update:open="emit('update:open', $event)"
    @ok="emit('apply')"
  >
    <div v-if="plan" class="flex min-w-0 flex-col gap-3 text-sm text-ink">
      <ul class="m-0 flex list-none flex-col gap-1.5 p-0" data-docs-into-summary>
        <li v-if="goods && !goods.added && !goods.updated" class="text-ink-3" data-docs-into-no-goods>{{ tx('noGoods') }}</li>
        <template v-else-if="goods">
          <li data-docs-into-added>{{ tx('added', { n: goods.added }) }}</li>
          <li v-if="goods.updated" data-docs-into-updated>{{ tx('updated', { n: goods.updated }) }}</li>
        </template>
        <li data-docs-into-doc44>
          {{ plan.doc44.added || plan.doc44.filled ? tx('doc44', { n: plan.doc44.added }) : tx('doc44None') }}
          <template v-if="plan.doc44.filled"> · {{ tx('doc44Filled', { n: plan.doc44.filled }) }}</template>
        </li>
        <li data-docs-into-header>{{ headerList ? tx('header', { list: headerList }) : tx('headerNone') }}</li>
      </ul>

      <p v-if="!changes" class="m-0 text-ink-3" data-docs-into-nothing>{{ tx('nothing') }}</p>

      <details v-if="conflictLines.length" :class="warn" data-docs-into-conflicts>
        <summary class="cursor-pointer">{{ tx('conflicts', { n: conflictLines.length }) }}</summary>
        <ul class="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-xs">
          <li v-for="(l, i) in conflictLines.slice(0, 30)" :key="i">{{ l }}</li>
        </ul>
      </details>

      <section v-if="remarks.length || extractionLines.length" data-docs-into-remarks>
        <p class="m-0 mb-1.5 text-xs text-ink-3">{{ tx('remarks') }}</p>
        <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
          <li v-for="(l, i) in extractionLines" :key="`c${i}`" class="[overflow-wrap:anywhere]">{{ l }}</li>
          <li v-for="(r, i) in remarks" :key="`r${i}`" class="[overflow-wrap:anywhere]">{{ r }}</li>
        </ul>
      </section>
      <p class="m-0 text-xs text-ink-3">{{ tx('note') }}</p>
    </div>
  </ZModal>
</template>
