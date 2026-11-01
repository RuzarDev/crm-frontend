<script setup lang="ts">
import ZAlert from '@/components/z/ZAlert.vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import type { DocumentCheck, DocumentCheckDocValue, DocumentCheckRow, DocumentCheckRowResult, DocumentCheckSource } from '@/api/documentChecks'
import { cn } from '@/ui/cn'
import { useDocCheckFormat } from './useDocCheckFormat'

// Прежний вид сверки (17.10–31.10: таблица «в документе / в ДТ / итог»), только для чтения — «Прежние сверки» в новом
// блоке (01.11.2026, D4). Без «Сверить заново» и выбора ДТ: действуют только по самой новой сверке ДТ.
const props = defineProps<{ check: DocumentCheck }>()
const { t, te, checkTitle, when, rowLabel, kindLabel, reasonLabel, fmt, noteText, fieldName, sourceName } = useDocCheckFormat()

const c = props.check
const verdictOf = (x: DocumentCheck) => x.verdict ?? (x.discrepancies.length ? 'mismatch' : 'partial')
const docFileName = (d: DocumentCheckDocValue) => d.fileName ?? t('docCheck.source.documents')
const docState = (s: DocumentCheckSource) => (s.reason === 'browserOnly' ? 'notSent' : s.recognized ? 'recognized' : 'notRecognized')
const DOC_TONE: Record<string, ZTone> = { recognized: 'done', notRecognized: 'wait', notSent: 'neutral' }
const RESULT_TONE: Record<DocumentCheckRowResult, ZTone> = {
  match: 'done', mismatch: 'danger', docsDiffer: 'danger', notInDocument: 'neutral', notInDt: 'wait', checkName: 'wait', notCompared: 'neutral',
}
const isBad = (r: DocumentCheckRow) => r.result === 'mismatch' || r.result === 'docsDiffer'
</script>

<template>
  <div class="text-[13px]" :data-doccheck-legacy-view="c.id">
    <p class="m-0 text-ink-2 [overflow-wrap:anywhere]">
      <span class="font-medium text-ink">{{ checkTitle(c) }}</span>
      · {{ t('docCheck.parsedAt', { time: when(c.parsedAtUtc ?? c.createdAtUtc) }) }}
      <template v-if="c.sourceFileNames.length && !c.documents?.length"> · {{ c.sourceFileNames.join(', ') }}</template>
    </p>

    <ul v-if="c.documents?.length" role="list" class="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
      <li v-for="(s, i) in c.documents" :key="i" class="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-row bg-sunken px-2 py-1 text-xs">
        <span class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{{ s.fileName }}<template v-if="s.sheet"> · {{ s.sheet }}</template></span>
        <span class="text-ink-3">— {{ kindLabel(s.kind) }}</span>
        <ZTag :tone="DOC_TONE[docState(s)]" size="sm">{{ t(`docCheck.doc.${docState(s)}`) }}</ZTag>
        <span v-if="!s.recognized && reasonLabel(s)" class="text-ink-2 [overflow-wrap:anywhere]">{{ reasonLabel(s) }}</span>
      </li>
    </ul>

    <ZAlert v-if="verdictOf(c) === 'unrecognized'" type="warning" show-icon class="mt-2" :description="t('docCheck.unrecognizedLead')" />

    <!-- ≥ 640 px — таблица, уже — карточка на строку (без горизонтальной прокрутки). -->
    <table v-if="verdictOf(c) !== 'unrecognized' && c.rows?.length" class="mt-2 w-full border-collapse max-sm:block">
      <caption class="sr-only">{{ t('docCheck.tableCaption') }}</caption>
      <thead class="max-sm:hidden">
        <tr class="text-left text-xs text-ink-3">
          <th scope="col" class="py-1.5 pr-3 font-medium">{{ t('docCheck.col.field') }}</th>
          <th scope="col" class="py-1.5 pr-3 font-medium">{{ t('docCheck.col.document') }}</th>
          <th scope="col" class="py-1.5 pr-3 font-medium">{{ t('docCheck.col.dt') }}</th>
          <th scope="col" class="py-1.5 font-medium">{{ t('docCheck.col.result') }}</th>
        </tr>
      </thead>
      <tbody class="max-sm:flex max-sm:flex-col max-sm:gap-1.5">
        <tr
          v-for="r in c.rows"
          :key="r.field"
          :class="cn('border-t border-line/70 align-top max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:rounded-row max-sm:border max-sm:px-2.5 max-sm:py-2',
                     isBad(r) && 'bg-tone-danger-bg/40')"
        >
          <th scope="row" class="py-1.5 pr-3 text-left font-normal max-sm:col-start-1 max-sm:row-start-1 max-sm:p-0">
            <span class="font-medium text-ink">{{ rowLabel(r) }}</span>
            <span v-if="r.box" class="ml-1 text-xs text-ink-3 whitespace-nowrap">{{ t('docCheck.box', { n: r.box }) }}</span>
          </th>
          <td class="py-1.5 pr-3 max-sm:col-span-2 max-sm:row-start-2 max-sm:p-0 max-sm:pt-1">
            <span class="text-xs text-ink-3 sm:hidden">{{ t('docCheck.inDocument') }}: </span>
            <template v-if="r.documents.length">
              <span v-for="(d, j) in r.documents" :key="j" class="block [overflow-wrap:anywhere]">
                <span class="font-medium text-ink">{{ fmt(d.value, r) }}</span>
                <span class="text-xs text-ink-3">{{ ` · ${docFileName(d)}` }}</span>
              </span>
              <span v-if="r.documentsNote" class="block text-xs text-ink-3">{{ noteText(r.documentsNote, r) }}</span>
            </template>
            <span v-else class="text-ink-3">—</span>
          </td>
          <td class="py-1.5 pr-3 max-sm:col-span-2 max-sm:row-start-3 max-sm:p-0 max-sm:pt-0.5">
            <span class="text-xs text-ink-3 sm:hidden">{{ t('docCheck.inDt') }}: </span>
            <span :class="cn('[overflow-wrap:anywhere]', r.declarationValue ? 'font-medium text-ink' : 'text-ink-3')">{{ fmt(r.declarationValue, r) }}</span>
            <span v-if="noteText(r.declarationNote, r)" class="block text-xs text-ink-3">{{ noteText(r.declarationNote, r) }}</span>
          </td>
          <td class="py-1.5 max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0 max-sm:text-right">
            <ZTag :tone="RESULT_TONE[r.result] ?? 'neutral'" size="sm">{{ te(`docCheck.result.${r.result}`) ? t(`docCheck.result.${r.result}`) : r.result }}</ZTag>
          </td>
        </tr>
      </tbody>
    </table>

    <ul v-if="(c.itemConflicts ?? []).length || (c.caseDiscrepancies ?? []).length" role="list" class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
      <li v-for="(d, i) in [...(c.itemConflicts ?? []), ...(c.caseDiscrepancies ?? [])]" :key="i" class="rounded-row bg-tone-danger-bg/40 px-3 py-2">
        <span class="font-medium text-ink">{{ fieldName(d) }}</span>
        <span v-if="d.itemIndex" class="text-ink-3"> · {{ t('docCheck.item', { n: d.itemIndex }) }}</span>
        <span v-for="(v, j) in d.values" :key="j" class="block [overflow-wrap:anywhere]">
          <span class="text-ink-3">{{ sourceName(v) }}:</span> <span class="font-medium text-ink">{{ v.value ?? '—' }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
