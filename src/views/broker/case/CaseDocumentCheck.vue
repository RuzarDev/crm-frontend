<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowClockwise, PhArrowRight, PhCaretDown, PhCheck, PhWarning } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import {
  DOC_CHECK_CHANGED, documentChecksApi,
  type DocumentCheck, type DocumentCheckMarkKind, type DocumentCheckRow, type DocumentCheckSource, type DocumentDiscrepancy,
} from '@/api/documentChecks'
import { import40Api } from '@/api/import40'
import { message } from '@/ui/message'
import { saveBlob } from '@/ui/download'
import { cn } from '@/ui/cn'
import DocCheckLegacyView from './DocCheckLegacyView.vue'
import {
  conflictsOf, dtSectionOf, groupDocValues, pageOf, pickShown, rootDeclarations, rowsOf, sourceByDisplayName,
  type DocCheckDtRef,
} from './docCheckModel'
import { useDocCheckFormat } from './useDocCheckFormat'

// Сверка документов в карточке заявки — новый вид (01.11.2026, дизайн 2026-11-01-document-check-redesign-design.md).
// Что работник должен понять за секунды: что не совпадает с документами и что исправить. Сверху вниз: документы одной
// поставки? → «Исправить в ДТ» (карточки с действиями) → «Проверить вручную» (плашки и «Проверил») → «Совпадает» (свёрнуто).
// На ДТ — самая новая сверка, прежние — свёрнутой строкой внизу (старым видом, только чтение). Только тем, кто работает с
// ДТ (canManage): без права блок не запрашивается (КПП и клиент сверку не видят — решение владельца 01.11).

/** ДТ заявки для выбора «Сверять с ДТ». */
export interface DocCheckDeclaration extends DocCheckDtRef {
  declarationNumber?: string | null
  /** ETT | VTO — у частей разделённой ДТ. */
  splitRole?: string | null
}

const props = withDefaults(defineProps<{
  caseId: string
  stamp?: string | null
  declarations?: DocCheckDeclaration[]
  canManage?: boolean
}>(), { stamp: null, declarations: () => [], canManage: false })
const f = useDocCheckFormat()
const { t } = f
const uid = useId()

const checks = ref<DocumentCheck[]>([])
let seq = 0
const load = async () => {
  const my = ++seq
  if (!props.canManage) {
    checks.value = []
    return
  }
  try {
    const list = await documentChecksApi.list(props.caseId)
    if (my === seq) checks.value = list
  } catch {
    // Блок необязателен: сбой — не показываем.
    if (my === seq) checks.value = []
  }
}
watch(() => [props.caseId, props.stamp, props.canManage] as const, () => void load(), { immediate: true })
const replace = (updated: DocumentCheck) => { checks.value = checks.value.map((x) => (x.id === updated.id ? updated : x)) }

// ── Какие сверки показывать (D4) ──
const picked = computed(() => pickShown(checks.value, props.declarations))
const shown = computed(() => [...picked.value.perDt, ...(picked.value.noDt ? [picked.value.noDt] : [])])
const total = (k: 'fixCount' | 'manualCount' | 'matchCount') => shown.value.reduce((n, c) => n + (c[k] ?? 0), 0)
const counters = computed(() => [
  { key: 'fix', n: total('fixCount'), tone: 'danger' as const },
  { key: 'manual', n: total('manualCount'), tone: 'wait' as const },
  { key: 'match', n: total('matchCount'), tone: 'neutral' as const },
])
const unresolved = computed(() => shown.value.some((c) => c.unresolved))
const showDtLabel = computed(() => shown.value.length > 1 || !!picked.value.noDt)

// ── Выбор ДТ: живые ДТ заявки, разделённая (исходная с частями) — одной позицией ──
const dtOptions = computed(() => {
  const rolesOf = (id: string) => props.declarations.filter((p) => p.splitSourceDeclarationId === id && p.id !== id).map((p) => p.splitRole)
  return rootDeclarations(props.declarations).map((d) => ({
    value: d.id,
    label: d.isSplitReplaced
      ? `${f.splitLabel(rolesOf(d.id))}${d.declarationNumber ? ` · ${d.declarationNumber}` : ''}`
      : d.declarationNumber ? t('docCheck.forDt', { n: d.declarationNumber }) : t('docCheck.forDtNoNumber'),
  }))
})
const showDtSelect = (c: DocumentCheck) => dtOptions.value.length > 0 && (c.declarationId == null || dtOptions.value.length > 1)
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
    replace(await documentChecksApi.recheck(props.caseId, c.id))
    message.success(t('docCheck.recheckDone'))
  } catch (e) {
    const err = e as { code?: string; response?: { status?: number; data?: { title?: string } } }
    const res = err.response
    if (!res && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
      message.error(t('docCheck.recheckTimeout'))
      await load()
    } else if (res?.status === 409) {
      message.error(t(res.data?.title === RECHECK_NOTHING_TO_PARSE ? 'docCheck.nothingToParse' : 'docCheck.filesMissing'))
      if (res.data?.title === RECHECK_FILES_MISSING) await load()
    } else {
      message.error(t('docCheck.recheckFailed'))
      await load()
    }
  } finally {
    pending[c.id] = false
  }
}

// ── Отметки и «Поставить в ДТ»: одно действие за раз на сверку ──
const busy = reactive<Record<string, string>>({})
const act = async (c: DocumentCheck, key: string, run: () => Promise<DocumentCheck>, done?: string) => {
  if (busy[c.id]) return
  busy[c.id] = key
  try {
    replace(await run())
    if (done) message.success(done)
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { title?: string } } }).response
    if (res?.status === 409) {
      // Значения или ДТ изменились с тех пор, как их показали: перечитываем и говорим, почему.
      message.error(t(res.data?.title === DOC_CHECK_CHANGED ? 'docCheck.block.changed' : 'docCheck.block.dtChanged'))
      await load()
    } else {
      message.error(t('docCheck.block.actionFailed'))
    }
  } finally {
    delete busy[c.id]
  }
}
const mark = (c: DocumentCheck, kind: DocumentCheckMarkKind, items: { key: string; fingerprint?: string | null }[], tag: string) =>
  act(c, tag, () => documentChecksApi.addMarks(props.caseId, c.id, kind, items))
const unmark = (c: DocumentCheck, kind: DocumentCheckMarkKind, key: string | undefined, tag: string) =>
  act(c, tag, () => documentChecksApi.removeMarks(props.caseId, c.id, kind, key))
const apply = (c: DocumentCheck, r: DocumentCheckRow) =>
  act(c, `apply:${r.field}`, () => documentChecksApi.apply(props.caseId, c.id, r.field, r.fingerprint ?? '', c.declarationUpdatedAtUtc), t('docCheck.block.applied'))
const isBusy = (c: DocumentCheck, tag: string) => busy[c.id] === tag

// ── Документы одной поставки? ──
interface FileChip { name: string; parts: DocumentCheckSource[] }
/** Файлы пакета: части одного файла (листы, страницы) — одной плашкой; исключённые — отдельными строками. */
const fileChips = (c: DocumentCheck): FileChip[] => {
  const map = new Map<string, FileChip>()
  for (const s of c.documents ?? []) {
    if (s.excluded) continue
    const chip = map.get(s.fileName) ?? { name: s.fileName, parts: [] }
    chip.parts.push(s)
    map.set(s.fileName, chip)
  }
  return [...map.values()]
}
/** Что распознано в файле: «упаковочный лист · транспортный документ · инвойс × 3»; без распознанного — причина. */
const chipKinds = (chip: FileChip) => {
  const counts = new Map<string, number>()
  for (const p of chip.parts.filter((x) => x.recognized)) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1)
  return [...counts.entries()].map(([k, n]) => (n > 1 ? `${f.kindLabel(k)} × ${n}` : f.kindLabel(k))).join(' · ')
}
const chipUnrecognized = (chip: FileChip) => chip.parts.filter((x) => !x.recognized)
const chipDuplicates = (chip: FileChip) => [...new Set(chip.parts.flatMap((p) => p.duplicateNames ?? []))]
const excludedOf = (c: DocumentCheck) => (c.documents ?? []).filter((s) => s.excluded)
const partName = (s: DocumentCheckSource) => (s.sheet ? `${s.fileName} · ${s.sheet}` : s.fileName)
const foreignSources = (c: DocumentCheck, i: number) => (c.documents ?? []).filter((s) => s.shipmentGroup === i + 1 && !s.excluded)
const shipmentText = (c: DocumentCheck, g: NonNullable<DocumentCheck['shipment']>['foreign'][number]) => {
  const main = c.shipment!.main
  const sum = (v: number | null, cur: string | null) => (v == null ? '' : t('docCheck.block.onSum', { sum: f.money(v, cur) }))
  return t('docCheck.block.shipmentWarn', {
    files: g.fileNames.join(', '), invoice: g.invoice, sum: sum(g.value, g.currency),
    mainInvoice: main.invoice, mainSum: sum(main.value, main.currency),
  })
}

// ── Исправить в ДТ ──
const fixRows = (c: DocumentCheck) => rowsOf(c, 'fix', false)
const fixConflicts = (c: DocumentCheck) => conflictsOf(c, false)
const accepted = (c: DocumentCheck) => [...rowsOf(c, 'fix', true), ...conflictsOf(c, true)]
const groups = (r: DocumentCheckRow) => groupDocValues(r.documents, (v) => f.fmt(v, r).toUpperCase())
const sourceLine = (r: DocumentCheckRow) => {
  const g = groups(r)
  if (g.length !== 1) return ''
  return g[0].files.length > 1 ? t('docCheck.block.sameInAll', { n: g[0].files.length })
    : g[0].files.length === 1 ? t('docCheck.block.source', { file: g[0].files[0] }) : ''
}
const firstDocFile = (c: DocumentCheck, r: DocumentCheckRow) => {
  for (const g of groups(r)) for (const name of g.files) if (sourceByDisplayName(c, name)?.fileId) return name
  return null
}
const isConflict = (x: DocumentCheckRow | DocumentDiscrepancy): x is DocumentDiscrepancy => 'scope' in x
const conflictTitle = (d: DocumentDiscrepancy) =>
  `${f.fieldName(d)}${d.itemIndex ? ` · ${t('docCheck.item', { n: d.itemIndex })}${d.itemDescription ? ` «${d.itemDescription}»` : ''}` : ''}`
const dtLink = (c: DocumentCheck, field: string) => (c.openDeclarationId
  ? { path: `/import-40/${encodeURIComponent(props.caseId)}/dt/${encodeURIComponent(c.openDeclarationId)}`, query: { s: dtSectionOf(field) } }
  : null)
const markedBy = (m: { byName: string; atUtc: string } | null | undefined) => (m ? `${m.byName}, ${f.when(m.atUtc)}` : '')

// «Открыть документ»: PDF и картинки — в новой вкладке (на странице, если разбор её дал), прочее — скачать.
const openDoc = async (c: DocumentCheck, display: string) => {
  const src = sourceByDisplayName(c, display)
  if (!src?.fileId) return
  const viewable = /\.(pdf|png|jpe?g|gif|webp)$/i.test(src.fileName)
  // Окно — сразу по нажатию (после ожидания файла браузер счёл бы его всплывающим).
  const win = viewable ? window.open('about:blank', '_blank') : null
  try {
    const blob = await import40Api.downloadFile(props.caseId, src.fileId)
    if (win) {
      const url = URL.createObjectURL(blob)
      const page = /\.pdf$/i.test(src.fileName) ? pageOf(src.sheet) : null
      win.location.href = page ? `${url}#page=${page}` : url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } else {
      saveBlob(blob, src.fileName)
    }
  } catch {
    win?.close()
  }
}

// ── Проверить вручную ──
const manualRows = (c: DocumentCheck) => rowsOf(c, 'manual', false)
const manualChecked = (c: DocumentCheck) => rowsOf(c, 'manual', true)
const manualValue = (r: DocumentCheckRow) => {
  const doc = groups(r).map((g) => f.fmt(g.value, r)).join(', ')
  if (r.result === 'checkName') return t('docCheck.block.checkName', { dt: f.fmt(r.declarationValue, r), doc })
  if (r.result === 'notInDt') return t('docCheck.block.notInDt', { doc })
  if (r.declarationValue) return f.fmt(r.declarationValue, r)
  return doc || t('docCheck.block.inDtEmpty')
}
const checkAll = (c: DocumentCheck) =>
  mark(c, 'manual', manualRows(c).map((r) => ({ key: r.markKey ?? `row:${r.field}`, fingerprint: r.fingerprint })), 'manual')

// ── Совпадает, прежние сверки ──
const open = reactive<Record<string, boolean>>({})
const toggle = (key: string) => { open[key] = !open[key] }
const olderDates = computed(() => [...new Set(picked.value.older.map((c) => f.day(c.parsedAtUtc ?? c.createdAtUtc)))].join(', '))

const titleId = `case-doccheck-${uid}`
const subhead = 'm-0 text-[13px] font-semibold text-ink'
const quiet = 'text-xs text-ink-3'
const linkBtn = 'inline-flex h-7 items-center gap-1.5 rounded-field px-2.5 text-xs font-semibold text-ink-2 no-underline outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus'
</script>

<template>
  <section
    v-if="canManage && shown.length"
    :aria-labelledby="titleId"
    :class="cn('rounded-panel border px-[18px] py-4 max-sm:px-3.5', unresolved ? 'border-tone-danger-fg/25 bg-surface' : 'border-line bg-surface')"
    data-case-doccheck
    :data-unresolved="unresolved"
  >
    <!-- 0. Шапка: заголовок и три счётчика -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 :id="titleId" class="m-0 flex min-w-0 items-center gap-2 text-[15px] leading-6 font-semibold text-ink">
        <PhWarning v-if="unresolved" :size="18" weight="bold" class="shrink-0 text-tone-danger-fg" aria-hidden="true" />
        <PhCheck v-else :size="18" weight="bold" class="shrink-0 text-tone-done-fg" aria-hidden="true" />
        <span class="[overflow-wrap:anywhere]">{{ t('docCheck.block.title') }}</span>
      </h2>
      <ul role="list" class="m-0 flex list-none flex-wrap gap-1.5 p-0" data-doccheck-counters>
        <li v-for="k in counters" :key="k.key"><ZTag :tone="k.n > 0 ? k.tone : 'neutral'" size="sm" :data-doccheck-counter="k.key">{{ t(`docCheck.block.count.${k.key}`, { n: k.n }) }}</ZTag></li>
      </ul>
    </div>

    <article v-for="c in shown" :key="c.id" class="mt-3 border-t border-line/70 pt-3" :data-doccheck="c.id" :data-unresolved="!!c.unresolved">
      <!-- ДТ, время разбора; «Сверить заново» -->
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p class="m-0 min-w-0 flex-[1_1_220px] text-[13px] text-ink-2 [overflow-wrap:anywhere]">
          <template v-if="showDtLabel"><span class="font-medium text-ink" data-doccheck-dt>{{ f.checkTitle(c) }}</span> · </template>
          {{ t('docCheck.parsedAt', { time: f.when(c.parsedAtUtc ?? c.createdAtUtc) }) }}
        </p>
        <ZButton
          size="sm"
          :loading="!!pending[c.id]"
          :disabled="c.canRecheck === false"
          :title="c.canRecheck === false ? t(c.recheckBlocked === 'nothingToParse' ? 'docCheck.nothingToParse' : 'docCheck.filesMissing') : undefined"
          :aria-busy="pending[c.id] ? 'true' : undefined"
          data-doccheck-recheck
          @click="recheck(c)"
        >
          <PhArrowClockwise :size="14" weight="bold" aria-hidden="true" />
          {{ t('docCheck.recheck') }}
        </ZButton>
      </div>
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

      <ZAlert v-if="c.verdict === 'unrecognized'" type="warning" show-icon class="mt-2" :description="t('docCheck.unrecognizedLead')" data-doccheck-unrecognized />
      <ZAlert
        v-else-if="c.verdict === 'noDt'"
        type="info"
        show-icon
        class="mt-2"
        :description="t(c.noDeclarationsInCase ? 'docCheck.noDtNoneLead' : 'docCheck.noDtLead')"
        data-doccheck-nodt
      />
      <!-- «Прежней версией» — только у самой новой сверки ДТ (она и показана здесь). -->
      <ZAlert v-if="c.legacy" type="info" show-icon class="mt-2" :description="t('docCheck.legacy')" data-doccheck-legacy />

      <!-- 1. Документы одной поставки? -->
      <div class="mt-3" data-doccheck-block="docs">
        <ul v-if="fileChips(c).length" role="list" class="m-0 flex list-none flex-wrap gap-1.5 p-0" data-doccheck-docs>
          <li
            v-for="chip in fileChips(c)"
            :key="chip.name"
            class="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-row bg-sunken px-2 py-1 text-xs"
            :data-doccheck-file="chip.name"
          >
            <span class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{{ chip.name }}</span>
            <span v-if="chipKinds(chip)" class="text-ink-2 [overflow-wrap:anywhere]">— {{ chipKinds(chip) }}</span>
            <template v-if="chipUnrecognized(chip).length">
              <span v-if="chipKinds(chip)" class="text-ink-3" data-doccheck-unrec>{{ t('docCheck.block.partsUnrecognized', { n: chipUnrecognized(chip).length }) }}</span>
              <span v-else class="text-ink-3 [overflow-wrap:anywhere]" data-doccheck-reason>
                {{ chipUnrecognized(chip)[0].reason === 'browserOnly' ? t('docCheck.doc.notSent') : t('docCheck.doc.notRecognized') }}<template v-if="f.reasonLabel(chipUnrecognized(chip)[0])"> — {{ f.reasonLabel(chipUnrecognized(chip)[0]) }}</template>
              </span>
            </template>
            <span v-if="chipDuplicates(chip).length" class="text-ink-3 [overflow-wrap:anywhere]">{{ t('docCheck.block.alsoAs', { names: chipDuplicates(chip).join(', ') }) }}</span>
          </li>
        </ul>
        <p v-else-if="c.sourceFileNames.length" :class="cn(quiet, 'm-0 [overflow-wrap:anywhere]')">{{ c.sourceFileNames.join(', ') }}</p>

        <!-- Похоже, другая поставка: предупреждение и «Исключить из сверки» -->
        <div
          v-for="(g, i) in c.shipment?.foreign ?? []"
          :key="`foreign-${i}`"
          class="mt-2 rounded-row border border-tone-wait-fg/25 bg-tone-wait-bg px-3 py-2.5"
          data-doccheck-shipment
        >
          <p class="m-0 flex items-start gap-2 text-[13px] text-ink">
            <PhWarning :size="16" weight="bold" class="mt-0.5 shrink-0 text-tone-wait-fg" aria-hidden="true" />
            <span class="min-w-0 [overflow-wrap:anywhere]">{{ shipmentText(c, g) }}</span>
          </p>
          <!-- Кнопка на каждый источник группы; имя — рядом, а не в кнопке: длинное имя не раздвигает экран телефона. -->
          <ul role="list" class="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0 pl-6 max-sm:pl-0">
            <li v-for="s in foreignSources(c, i)" :key="s.key" class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span v-if="foreignSources(c, i).length > 1" class="min-w-0 text-xs text-ink-2 [overflow-wrap:anywhere]">{{ partName(s) }}</span>
              <ZButton
                size="sm"
                :loading="isBusy(c, `exclude:${s.key}`)"
                :disabled="!!busy[c.id] && !isBusy(c, `exclude:${s.key}`)"
                data-doccheck-exclude
                @click="mark(c, 'exclude', [{ key: s.key ?? '' }], `exclude:${s.key}`)"
              >{{ t('docCheck.block.exclude') }}</ZButton>
            </li>
          </ul>
        </div>

        <ul v-if="excludedOf(c).length" role="list" class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          <li v-for="s in excludedOf(c)" :key="s.key" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3" data-doccheck-excluded>
            <span class="min-w-0 text-ink-2 line-through [overflow-wrap:anywhere]">{{ partName(s) }}</span>
            <span>{{ t('docCheck.block.excluded') }} · {{ markedBy(s.excluded) }}</span>
            <ZButton variant="link" size="sm" :disabled="!!busy[c.id]" data-doccheck-restore @click="unmark(c, 'exclude', s.key, `restore:${s.key}`)">{{ t('docCheck.block.restore') }}</ZButton>
          </li>
        </ul>
      </div>

      <!-- 2. Исправить в ДТ -->
      <div class="mt-3" data-doccheck-block="fix">
        <h3 :class="subhead">{{ t('docCheck.block.fixTitle', { n: c.fixCount ?? fixRows(c).length + fixConflicts(c).length }) }}</h3>
        <p v-if="!fixRows(c).length && !fixConflicts(c).length" :class="cn(quiet, 'm-0 mt-1')" data-doccheck-fix-empty>{{ t('docCheck.block.fixEmpty') }}</p>
        <ul v-else role="list" class="m-0 mt-1.5 flex list-none flex-col gap-2 p-0">
          <li
            v-for="r in fixRows(c)"
            :key="r.field"
            class="flex flex-col gap-1.5 rounded-row border border-tone-danger-fg/20 bg-tone-danger-bg/40 px-3 py-2.5"
            :data-doccheck-fix="r.field"
            :data-result="r.result"
          >
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-sm font-medium text-ink">{{ f.rowLabel(r) }}</span>
              <span v-if="r.box" :class="cn(quiet, 'whitespace-nowrap')">{{ t('docCheck.box', { n: r.box }) }}</span>
            </div>
            <!-- В ДТ (зачёркнуто) → в документе -->
            <p v-if="r.result === 'mismatch' || groups(r).length === 1" class="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" data-doccheck-change>
              <span v-if="r.declarationValue" class="min-w-0 text-ink-2 line-through decoration-tone-danger-fg/60 [overflow-wrap:anywhere]">
                <span class="sr-only">{{ t('docCheck.block.inDt') }}: </span>{{ f.fmt(r.declarationValue, r) }}
              </span>
              <PhArrowRight v-if="r.declarationValue" :size="13" class="shrink-0 text-ink-3" aria-hidden="true" />
              <span class="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
                <span class="sr-only">{{ t('docCheck.block.inDoc') }}: </span>{{ groups(r).map((g) => f.fmt(g.value, r)).join(', ') }}
              </span>
            </p>
            <p v-if="sourceLine(r)" :class="cn(quiet, 'm-0 [overflow-wrap:anywhere]')" data-doccheck-source>{{ sourceLine(r) }}</p>
            <!-- Документы расходятся: что в каком документе и что уточнить у клиента -->
            <template v-if="groups(r).length > 1">
              <p v-if="r.result === 'docsDiffer' && r.declarationValue" class="m-0 text-[13px] text-ink-2">{{ t('docCheck.block.inDt') }}: <span class="font-medium text-ink">{{ f.fmt(r.declarationValue, r) }}</span></p>
              <ul role="list" class="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]" data-doccheck-differ>
                <li v-for="g in groups(r)" :key="g.value" class="[overflow-wrap:anywhere]">
                  <span class="text-ink-3">{{ g.files.join(', ') || t('docCheck.source.documents') }} →</span> <span class="font-medium text-ink">{{ f.fmt(g.value, r) }}</span>
                </li>
              </ul>
              <p v-if="r.result === 'docsDiffer'" :class="cn(quiet, 'm-0')">{{ t('docCheck.block.docsDifferHint') }}</p>
            </template>
            <p v-if="f.noteText(r.declarationNote, r) || f.noteText(r.documentsNote, r)" :class="cn(quiet, 'm-0')">
              {{ [f.noteText(r.documentsNote, r), f.noteText(r.declarationNote, r)].filter(Boolean).join(' · ') }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <ZButton
                v-if="c.canApply && r.applyValue"
                variant="primary"
                size="sm"
                :loading="isBusy(c, `apply:${r.field}`)"
                :disabled="!!busy[c.id] && !isBusy(c, `apply:${r.field}`)"
                data-doccheck-apply
                @click="apply(c, r)"
              >{{ t('docCheck.block.apply') }}</ZButton>
              <RouterLink v-if="dtLink(c, r.field)" :to="dtLink(c, r.field)!" :class="linkBtn" data-doccheck-open-dt>{{ t('docCheck.block.openDt') }}</RouterLink>
              <ZButton v-if="firstDocFile(c, r)" variant="ghost" size="sm" data-doccheck-open-doc @click="openDoc(c, firstDocFile(c, r)!)">{{ t('docCheck.block.openDoc') }}</ZButton>
              <ZButton
                variant="ghost"
                size="sm"
                :loading="isBusy(c, `accept:${r.field}`)"
                :disabled="!!busy[c.id] && !isBusy(c, `accept:${r.field}`)"
                data-doccheck-accept
                @click="mark(c, 'accept', [{ key: r.markKey ?? `row:${r.field}`, fingerprint: r.fingerprint }], `accept:${r.field}`)"
              >{{ t('docCheck.block.accept') }}</ZButton>
            </div>
          </li>
          <!-- Документы между собой (строки товаров) и с заявкой (номера ТС) -->
          <li
            v-for="d in fixConflicts(c)"
            :key="d.markKey ?? `${d.scope}:${d.field}:${d.itemIndex}`"
            class="flex flex-col gap-1.5 rounded-row border border-tone-danger-fg/20 bg-tone-danger-bg/40 px-3 py-2.5"
            :data-doccheck-fix="`${d.scope}:${d.field}`"
          >
            <span class="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">{{ conflictTitle(d) }}</span>
            <ul role="list" class="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]">
              <li v-for="(v, j) in d.values" :key="j" class="[overflow-wrap:anywhere]" data-doccheck-value>
                <span class="text-ink-3">{{ f.sourceName(v) }} →</span> <span class="font-medium text-ink">{{ v.value ?? '—' }}</span>
              </li>
            </ul>
            <p v-if="d.scope === 'documents'" :class="cn(quiet, 'm-0')">{{ t('docCheck.block.docsDifferHint') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <ZButton
                variant="ghost"
                size="sm"
                :loading="isBusy(c, `accept:${d.markKey}`)"
                :disabled="!!busy[c.id] && !isBusy(c, `accept:${d.markKey}`)"
                data-doccheck-accept
                @click="mark(c, 'accept', [{ key: d.markKey ?? '', fingerprint: d.fingerprint }], `accept:${d.markKey}`)"
              >{{ t('docCheck.block.acceptOther') }}</ZButton>
            </div>
          </li>
        </ul>

        <!-- Принято «В ДТ верно» — свёрнуто -->
        <div v-if="accepted(c).length" class="mt-1.5" data-doccheck-accepted>
          <button
            type="button"
            :aria-expanded="!!open[`acc:${c.id}`]"
            class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans text-[13px] text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus"
            @click="toggle(`acc:${c.id}`)"
          >
            <PhCaretDown :size="13" :class="cn('transition-transform motion-reduce:transition-none', open[`acc:${c.id}`] && 'rotate-180')" aria-hidden="true" />
            {{ t('docCheck.block.accepted', { n: accepted(c).length }) }}
          </button>
          <ul v-if="open[`acc:${c.id}`]" role="list" class="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            <li v-for="x in accepted(c)" :key="isConflict(x) ? x.markKey : x.field" class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
              <span class="font-medium text-ink">{{ isConflict(x) ? conflictTitle(x) : f.rowLabel(x) }}</span>
              <span :class="quiet">{{ t('docCheck.block.acceptedBy', { by: markedBy(x.mark) }) }}</span>
              <ZButton
                variant="link"
                size="sm"
                :disabled="!!busy[c.id]"
                data-doccheck-unaccept
                @click="unmark(c, 'accept', x.markKey, `unaccept:${x.markKey}`)"
              >{{ t('docCheck.block.undo') }}</ZButton>
            </li>
          </ul>
        </div>
      </div>

      <!-- 3. Проверить вручную -->
      <div v-if="manualRows(c).length || manualChecked(c).length" class="mt-3" data-doccheck-block="manual">
        <template v-if="manualRows(c).length">
          <h3 :class="subhead">{{ t('docCheck.block.manualTitle', { n: manualRows(c).length }) }}</h3>
          <p :class="cn(quiet, 'm-0 mt-0.5')">{{ t('docCheck.block.manualLead') }}</p>
          <ul role="list" class="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
            <li
              v-for="r in manualRows(c)"
              :key="r.field"
              class="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-row bg-sunken px-2 py-1 text-xs"
              :data-doccheck-manual="r.field"
              :data-result="r.result"
            >
              <span class="text-ink-3">{{ f.rowLabel(r) }}:</span>
              <span class="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{{ manualValue(r) }}</span>
              <ZButton
                v-if="c.canApply && r.applyValue"
                variant="link"
                size="sm"
                :loading="isBusy(c, `apply:${r.field}`)"
                :disabled="!!busy[c.id] && !isBusy(c, `apply:${r.field}`)"
                data-doccheck-apply
                @click="apply(c, r)"
              >{{ t('docCheck.block.apply') }}</ZButton>
            </li>
          </ul>
          <ZButton
            size="sm"
            class="mt-2"
            :loading="isBusy(c, 'manual')"
            :disabled="!!busy[c.id] && !isBusy(c, 'manual')"
            data-doccheck-checked
            @click="checkAll(c)"
          >
            <PhCheck :size="14" weight="bold" aria-hidden="true" />{{ t('docCheck.block.manualDone') }}
          </ZButton>
        </template>
        <p v-if="manualChecked(c).length" :class="cn('m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2', manualRows(c).length && 'mt-1.5')" data-doccheck-manual-done>
          <PhCheck :size="14" weight="bold" class="text-tone-done-fg" aria-hidden="true" />
          {{ t('docCheck.block.manualChecked', { n: manualChecked(c).length }) }}
          <span :class="quiet">{{ markedBy(manualChecked(c)[0].mark) }}</span>
          <ZButton variant="link" size="sm" :disabled="!!busy[c.id]" data-doccheck-unchecked @click="unmark(c, 'manual', undefined, 'unmanual')">{{ t('docCheck.block.manualUndo') }}</ZButton>
        </p>
      </div>

      <!-- 4. Совпадает — свёрнуто -->
      <div v-if="rowsOf(c, 'match').length" class="mt-3" data-doccheck-block="match">
        <button
          type="button"
          :aria-expanded="!!open[`match:${c.id}`]"
          class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans text-[13px] font-semibold text-ink outline-hidden hover:text-ink-2 focus-visible:shadow-focus"
          data-doccheck-match-toggle
          @click="toggle(`match:${c.id}`)"
        >
          <PhCaretDown :size="13" :class="cn('transition-transform motion-reduce:transition-none', open[`match:${c.id}`] && 'rotate-180')" aria-hidden="true" />
          {{ t('docCheck.block.matchTitle', { n: rowsOf(c, 'match').length }) }}
        </button>
        <ul v-if="open[`match:${c.id}`]" role="list" class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-[13px]" data-doccheck-match>
          <li v-for="r in rowsOf(c, 'match')" :key="r.field" class="[overflow-wrap:anywhere]">
            <span class="text-ink-3">{{ f.rowLabel(r) }}:</span> <span class="font-medium text-ink">{{ f.fmt(r.declarationValue ?? r.documents[0]?.value, r) }}</span>
          </li>
        </ul>
      </div>

      <p v-if="c.declarationUpdatedAtUtc" :class="cn(quiet, 'm-0 mt-2')" data-doccheck-footer>
        {{ t('docCheck.comparedAt', { time: f.when(c.declarationUpdatedAtUtc) }) }}
      </p>
    </article>

    <!-- 5. Прежние сверки — свёрнутой строкой, старым видом и только для чтения -->
    <div v-if="picked.older.length" class="mt-3 border-t border-line/70 pt-2" data-doccheck-older>
      <button
        type="button"
        :aria-expanded="!!open.older"
        class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans text-[13px] text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus"
        data-doccheck-older-toggle
        @click="toggle('older')"
      >
        <PhCaretDown :size="13" :class="cn('transition-transform motion-reduce:transition-none', open.older && 'rotate-180')" aria-hidden="true" />
        {{ t('docCheck.block.older', { dates: olderDates }) }}
      </button>
      <div v-if="open.older" class="mt-2 flex flex-col gap-3">
        <DocCheckLegacyView v-for="c in picked.older" :key="c.id" :check="c" class="border-t border-line/50 pt-2 first:border-t-0 first:pt-0" />
      </div>
    </div>
  </section>
</template>
