<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCheckCircle, PhInfo, PhWarning } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import {
  documentChecksApi,
  type DocumentCheck, type DocumentCheckDocValue, type DocumentCheckRow, type DocumentCheckRowResult, type DocumentCheckSource,
  type DocumentCheckVerdict, type DocumentDiscrepancy, type DocumentDiscrepancyValue,
} from '@/api/documentChecks'
import { formatDateText } from '@/ui/date'
import { formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// Сверка документов поставки (17.10; по полям — с 21.10, правка №13), карточка заявки сотрудника: по каждому разбору
// пакета документов («Из документов» на шаге ДТ) — что нашлось в каждом файле, что в ДТ и итог по полю. Поле, которого
// нет в документе или в ДТ, — «не найдено» / «нет в ДТ», а не «совпадает»; ничего не распознано — «не удалось сверить».
// «Сверить заново» заново разбирает те же файлы и сравнивает с ДТ в её текущем виде.

/** ДТ заявки для выбора «Сверять с ДТ». */
export interface DocCheckDeclaration {
  id: string
  declarationNumber?: string | null
  isSplitReplaced?: boolean
  splitSourceDeclarationId?: string | null
}

const props = withDefaults(defineProps<{
  caseId: string
  stamp?: string | null
  declarations?: DocCheckDeclaration[]
  canManage?: boolean
}>(), { stamp: null, declarations: () => [], canManage: false })
const { t, te, locale } = useI18n()
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

// ── Заголовок блока: худший итог среди показанных сверок ──
const VERDICT_ORDER: DocumentCheckVerdict[] = ['ok', 'partial', 'noDt', 'unrecognized', 'mismatch']
const verdictOf = (c: DocumentCheck): DocumentCheckVerdict => c.verdict ?? (c.discrepancies.length ? 'mismatch' : 'partial')
const verdict = computed<DocumentCheckVerdict>(() =>
  shown.value.reduce<DocumentCheckVerdict>((worst, c) => {
    const v = verdictOf(c)
    return VERDICT_ORDER.indexOf(v) > VERDICT_ORDER.indexOf(worst) ? v : worst
  }, 'ok'))
const mismatchTotal = computed(() => shown.value.reduce((n, c) => n + (c.mismatchCount ?? c.discrepancies.length), 0))
const notCheckedTotal = computed(() => shown.value.reduce((n, c) => n + (c.notComparedCount ?? 0), 0))
const title = computed(() => {
  const m = notCheckedTotal.value
  const tail = m > 0 ? ` · ${t('docCheck.notChecked', { m })}` : ''
  switch (verdict.value) {
    case 'mismatch': return t('docCheck.verdict.mismatch', { n: mismatchTotal.value }) + tail
    case 'partial': return t('docCheck.verdict.partial') + tail
    default: return t(`docCheck.verdict.${verdict.value}`)
  }
})
const tone = computed(() => (verdict.value === 'mismatch' || verdict.value === 'unrecognized' ? 'wait' : verdict.value === 'ok' ? 'done' : 'neutral'))

// ── Подписи ──
const checkTitle = (c: DocumentCheck) =>
  c.declarationSplit ? t('docCheck.splitDt')
    : c.declarationNumber ? t('docCheck.forDt', { n: c.declarationNumber })
      : c.declarationId ? t('docCheck.forDtNoNumber') : t('docCheck.noDt')
const when = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const rowLabel = (r: DocumentCheckRow) => (te(`docCheck.row.${r.field}`) ? t(`docCheck.row.${r.field}`) : r.fieldLabel)
const kindLabel = (kind: string) => (te(`docCheck.docKind.${kind}`) ? t(`docCheck.docKind.${kind}`) : t('docCheck.docKind.other'))
const reasonLabel = (s: DocumentCheckSource) => (s.reason && te(`docCheck.reason.${s.reason}`) ? t(`docCheck.reason.${s.reason}`) : '')
const docFileName = (d: DocumentCheckDocValue) => d.fileName ?? t('docCheck.source.documents')
/** Файл: распознан / не распознан / не отправлялся в распознавание (Excel .xls — читается в браузере). */
const docState = (s: DocumentCheckSource) => (s.reason === 'browserOnly' ? 'notSent' : s.recognized ? 'recognized' : 'notRecognized')
const DOC_TONE: Record<string, ZTone> = { recognized: 'done', notRecognized: 'wait', notSent: 'neutral' }

const num = (v: string, kind: DocumentCheckRow['valueKind'], currency?: string | null) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return kind === 'money'
    ? `${formatNumberIn(locale.value, n, 2, 2)}${currency ? ` ${currency}` : ''}`
    : formatNumberIn(locale.value, n, 3)
}
/** Значение по роду: числа и деньги — по языку интерфейса, даты — ДД.ММ.ГГГГ, списки — через запятую. */
const fmt = (v: string | null | undefined, r: DocumentCheckRow): string => {
  if (v == null || v === '') return '—'
  if (r.valueKind === 'number' || r.valueKind === 'money') return num(v, r.valueKind, r.currency)
  if (r.valueKind === 'date') return v.split(', ').map((d) => formatDateText(d) || d).join(', ')
  return v
}
const noteText = (note: string | null | undefined, r: DocumentCheckRow): string => {
  if (!note) return ''
  const [key, ...rest] = note.split(':')
  const arg = rest.join(':')
  switch (key) {
    case 'dtPartial': {
      const [k, n] = arg.split('/')
      return t('docCheck.note.dtPartial', { k, n })
    }
    case 'sum42': return t('docCheck.note.sum42', { v: num(arg, 'money', r.currency) })
    case 'docsSum': return t('docCheck.note.docsSum', { n: arg })
    case 'matchesFile': return t('docCheck.note.matchesFile', { f: arg })
    default: return te(`docCheck.note.${key}`) ? t(`docCheck.note.${key}`) : ''
  }
}
const RESULT_TONE: Record<DocumentCheckRowResult, ZTone> = {
  match: 'done', mismatch: 'danger', docsDiffer: 'danger', notInDocument: 'neutral', notInDt: 'wait', checkName: 'wait', notCompared: 'neutral',
}
const isBad = (r: DocumentCheckRow) => r.result === 'mismatch' || r.result === 'docsDiffer'

// ── Документы между собой и с заявкой (прежняя разметка списка) ──
const fieldName = (d: DocumentDiscrepancy) => (te(`docCheck.field.${d.field}`) ? t(`docCheck.field.${d.field}`) : d.fieldLabel)
const sourceName = (v: DocumentDiscrepancyValue) => {
  if (v.sourceKind === 'case') return t('docCheck.source.case')
  if (v.sourceKind === 'declaration') return t('docCheck.source.dt', { n: v.source || '—' })
  if (v.sourceKind === 'documents') return t('docCheck.source.documents')
  return v.source || t('docCheck.source.document')
}

// ── Выбор ДТ: живые ДТ заявки, разделённая (исходная с частями) — одной позицией «ДТ ЕТТ + ВТО» ──
const dtOptions = computed(() => {
  const ids = new Set(props.declarations.map((d) => d.id))
  return props.declarations
    .filter((d) => !d.splitSourceDeclarationId || d.splitSourceDeclarationId === d.id || !ids.has(d.splitSourceDeclarationId))
    .map((d) => ({
      value: d.id,
      label: d.isSplitReplaced
        ? `${t('docCheck.splitDt')}${d.declarationNumber ? ` · ${d.declarationNumber}` : ''}`
        : d.declarationNumber ? t('docCheck.forDt', { n: d.declarationNumber }) : t('docCheck.forDtNoNumber'),
    }))
})
const showDtSelect = (c: DocumentCheck) => props.canManage && dtOptions.value.length > 0 && (c.declarationId == null || dtOptions.value.length > 1)
const linking = reactive<Record<string, boolean>>({})
const onChooseDt = async (c: DocumentCheck, value: unknown) => {
  if (typeof value !== 'string' || value === c.declarationId) return
  linking[c.id] = true
  try {
    await documentChecksApi.link(props.caseId, c.id, value)
  } catch {
    // Связь не сохранилась — блок покажет прежнее состояние.
  } finally {
    linking[c.id] = false
    await load()
  }
}

// ── «Сверить заново» ── (коды — title ответа сервера, Import40DocumentCheckEndpoints)
const RECHECK_FILES_MISSING = 'Import40.DocumentCheckFilesMissing'
const RECHECK_NOTHING_TO_PARSE = 'Import40.DocumentCheckNothingToParse'
const pending = reactive<Record<string, boolean>>({})
const recheck = async (c: DocumentCheck) => {
  if (pending[c.id]) return
  pending[c.id] = true
  try {
    const updated = await documentChecksApi.recheck(props.caseId, c.id)
    checks.value = checks.value.map((x) => (x.id === updated.id ? updated : x))
    message.success(t('docCheck.recheckDone'))
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { title?: string } } }).response
    if (res?.status === 409) {
      message.error(t(res.data?.title === RECHECK_NOTHING_TO_PARSE ? 'docCheck.nothingToParse' : 'docCheck.filesMissing'))
      if (res.data?.title === RECHECK_FILES_MISSING) await load()
    } else {
      // Сервис распознавания недоступен (502) или сбой — сверка по прежнему разбору с текущей ДТ (пересчёт на GET).
      message.error(t('docCheck.recheckFailed'))
      await load()
    }
  } finally {
    pending[c.id] = false
  }
}

const titleId = `case-doccheck-${uid}`
</script>

<template>
  <section
    v-if="shown.length"
    :aria-labelledby="titleId"
    :class="cn('rounded-panel border px-[18px] py-4', tone === 'wait' ? 'border-tone-wait-fg/25 bg-tone-wait-bg' : 'border-line bg-surface')"
    data-case-doccheck
    :data-verdict="verdict"
  >
    <h2 :id="titleId" class="m-0 flex items-start gap-2 text-[15px] leading-6 font-semibold text-ink">
      <PhWarning v-if="tone === 'wait'" :size="18" weight="bold" class="mt-[3px] shrink-0 text-tone-wait-fg" aria-hidden="true" />
      <PhCheckCircle v-else-if="tone === 'done'" :size="18" weight="bold" class="mt-[3px] shrink-0 text-tone-done-fg" aria-hidden="true" />
      <PhInfo v-else :size="18" weight="bold" class="mt-[3px] shrink-0 text-ink-3" aria-hidden="true" />
      <span class="min-w-0 [overflow-wrap:anywhere]">{{ title }}</span>
    </h2>

    <div v-for="c in shown" :key="c.id" class="mt-3 border-t border-line/70 pt-3 first-of-type:mt-2" :data-doccheck="c.id" :data-verdict="verdictOf(c)">
      <!-- Строка заголовка: ДТ, время разбора, файлы; справа — «Сверить заново» -->
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p class="m-0 min-w-0 flex-[1_1_240px] text-[13px] text-ink-2 [overflow-wrap:anywhere]">
          <span class="font-medium text-ink" data-doccheck-dt>{{ checkTitle(c) }}</span>
          · {{ t('docCheck.parsedAt', { time: when(c.parsedAtUtc ?? c.createdAtUtc) }) }}
          <template v-if="c.sourceFileNames.length && !c.documents?.length"> · {{ c.sourceFileNames.join(', ') }}</template>
        </p>
        <ZButton
          v-if="canManage"
          size="sm"
          :loading="!!pending[c.id]"
          :disabled="c.canRecheck === false"
          :title="c.canRecheck === false ? t('docCheck.filesMissing') : undefined"
          :aria-busy="pending[c.id] ? 'true' : undefined"
          data-doccheck-recheck
          @click="recheck(c)"
        >
          <PhArrowClockwise :size="14" weight="bold" aria-hidden="true" />
          {{ t('docCheck.recheck') }}
        </ZButton>
      </div>

      <!-- Сверять с ДТ -->
      <div v-if="showDtSelect(c)" class="mt-2 flex flex-wrap items-center gap-2" data-doccheck-choose-dt>
        <label :for="`${titleId}-dt-${c.id}`" class="text-[13px] text-ink-2">{{ t('docCheck.chooseDt') }}</label>
        <ZSelect
          :id="`${titleId}-dt-${c.id}`"
          size="sm"
          class="w-full max-w-[320px] sm:w-[320px]"
          :value="c.declarationId"
          :options="dtOptions"
          :disabled="!!linking[c.id]"
          :placeholder="t('docCheck.note.noDt')"
          @update:value="(v) => onChooseDt(c, v)"
        />
      </div>

      <!-- Что дал каждый файл -->
      <ul v-if="c.documents?.length" role="list" class="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0" data-doccheck-docs>
        <li
          v-for="(s, i) in c.documents"
          :key="i"
          class="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-row bg-sunken px-2 py-1 text-xs"
          :data-doccheck-doc="docState(s)"
        >
          <span class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{{ s.fileName }}<template v-if="s.sheet"> · {{ s.sheet }}</template></span>
          <span class="text-ink-3">— {{ kindLabel(s.kind) }}</span>
          <ZTag :tone="DOC_TONE[docState(s)]" size="sm">{{ t(`docCheck.doc.${docState(s)}`) }}</ZTag>
          <span v-if="s.recognized && s.itemsCount > 0" class="text-ink-3">{{ t('docCheck.doc.items', { n: s.itemsCount }) }}</span>
          <span v-if="!s.recognized && reasonLabel(s)" class="text-ink-2 [overflow-wrap:anywhere]" data-doccheck-reason>{{ reasonLabel(s) }}</span>
        </li>
      </ul>

      <ZAlert v-if="verdictOf(c) === 'unrecognized'" type="warning" show-icon class="mt-2" :description="t('docCheck.unrecognizedLead')" data-doccheck-unrecognized />
      <ZAlert v-else-if="verdictOf(c) === 'noDt'" type="info" show-icon class="mt-2" :description="t('docCheck.noDtLead')" data-doccheck-nodt />
      <ZAlert v-if="c.legacy" type="info" show-icon class="mt-2" :description="t('docCheck.legacy')" data-doccheck-legacy />

      <!-- Поля: в документе / в ДТ / итог. ≥ 640 px — таблица, уже — карточка на строку (без горизонтальной прокрутки). -->
      <table
        v-if="verdictOf(c) !== 'unrecognized' && c.rows?.length"
        class="mt-3 w-full border-collapse text-[13px] max-sm:block"
        data-doccheck-table
      >
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
            :data-doccheck-row="r.field"
            :data-result="r.result"
          >
            <th scope="row" class="py-1.5 pr-3 text-left font-normal max-sm:col-start-1 max-sm:row-start-1 max-sm:p-0">
              <span class="font-medium text-ink">{{ rowLabel(r) }}</span>
              <span v-if="r.box" class="ml-1 text-xs text-ink-3 whitespace-nowrap">{{ t('docCheck.box', { n: r.box }) }}</span>
            </th>
            <td class="py-1.5 pr-3 max-sm:col-span-2 max-sm:row-start-2 max-sm:p-0 max-sm:pt-1" data-doccheck-cell="document">
              <span class="text-xs text-ink-3 sm:hidden">{{ t('docCheck.inDocument') }}: </span>
              <template v-if="r.documents.length">
                <span v-for="(d, j) in r.documents" :key="j" class="block [overflow-wrap:anywhere]" data-doccheck-docvalue>
                  <span :class="cn('font-medium', d.result === 'mismatch' ? 'text-tone-danger-fg' : 'text-ink')">{{ fmt(d.value, r) }}</span>
                  <span class="text-xs text-ink-3">{{ ` · ${docFileName(d)}` }}</span>
                </span>
                <span v-if="r.documentsNote" class="block text-xs text-ink-3">{{ noteText(r.documentsNote, r) }}</span>
              </template>
              <span v-else class="text-ink-3">—</span>
            </td>
            <td class="py-1.5 pr-3 max-sm:col-span-2 max-sm:row-start-3 max-sm:p-0 max-sm:pt-0.5" data-doccheck-cell="dt">
              <span class="text-xs text-ink-3 sm:hidden">{{ t('docCheck.inDt') }}: </span>
              <span :class="cn('[overflow-wrap:anywhere]', r.declarationValue ? 'font-medium text-ink' : 'text-ink-3')">{{ fmt(r.declarationValue, r) }}</span>
              <span v-if="noteText(r.declarationNote, r)" class="block text-xs text-ink-3" data-doccheck-note>{{ noteText(r.declarationNote, r) }}</span>
            </td>
            <td class="py-1.5 max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0 max-sm:text-right">
              <ZTag :tone="RESULT_TONE[r.result] ?? 'neutral'" size="sm" data-doccheck-result>{{ te(`docCheck.result.${r.result}`) ? t(`docCheck.result.${r.result}`) : r.result }}</ZTag>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Документы между собой (строки товаров, поля шапки вне таблицы) и документы ↔ заявка -->
      <template v-for="section in [
        { key: 'docs', title: t('docCheck.sectionDocs'), list: c.itemConflicts ?? [] },
        { key: 'case', title: t('docCheck.sectionCase'), list: c.caseDiscrepancies ?? [] },
      ]" :key="section.key">
        <div v-if="section.list.length" class="mt-3" :data-doccheck-section="section.key">
          <h3 class="m-0 text-[13px] font-semibold text-ink">{{ section.title }}</h3>
          <ul role="list" class="m-0 mt-1.5 flex list-none flex-col gap-2 p-0">
            <li
              v-for="(d, i) in section.list"
              :key="i"
              class="flex flex-col gap-1 rounded-row bg-tone-danger-bg/40 px-3 py-2"
              :data-doccheck-item="`${d.scope}:${d.field}`"
            >
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
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
      </template>

      <p v-if="c.declarationUpdatedAtUtc" class="m-0 mt-2 text-xs text-ink-3" data-doccheck-footer>
        {{ t('docCheck.comparedAt', { time: when(c.declarationUpdatedAtUtc) }) }}
      </p>
    </div>
  </section>
</template>
