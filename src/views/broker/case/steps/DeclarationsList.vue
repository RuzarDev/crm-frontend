<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { PhArrowElbowDownRight, PhCode, PhCopy, PhDotsThree, PhDownloadSimple, PhPlus, PhSparkle } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown from '@/components/z/ZDropdown.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { documentChecksApi } from '@/api/documentChecks'
import { import40Api, type Import40DeclarationDto, type Import40ExtractionResult } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { cn } from '@/ui/cn'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { formatMoney } from '@/ui/number'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { dtLabel } from '../caseSteps'
import {
  dtListActive, dtPath, dtRowActions, filterDeclarations, groupDeclarations, hasSplitParts, isLiveSplitPart, missingPreview,
  splitBatchWarning, splitExportWarning, splitTag, type DtListRow,
} from '../declarations'
import ExtractionIssuesModal from './ExtractionIssuesModal.vue'
import ExtractDocsModal from './ExtractDocsModal.vue'
import CopyDtModal from './CopyDtModal.vue'
import { docHeaderFrom, type ExcelDoc } from './excelFallback'
import { prepareDocumentsDeclaration, type DocumentsNote } from './documentsImport'
import { goodsHeaderColumns, readExcelDocuments } from '@/utils/goodsExcel'
import { countryFromText } from '@/utils/importText'
import { useClassifiersStore } from '@/stores/classifiers'
import CondRelTag from '@/components/condrel/CondRelTag.vue'
import { briefOf } from '@/utils/conditionalRelease'
import QuoteImportModal from './QuoteImportModal.vue'

// Список ДТ шага 3 (доска Case): полоса «Декларации · N» с действиями, поиск при N > 1, строки ДТ.
// Строка: номер или «ДТ i» (ссылка на страницу ДТ), тег разделения, «товаров: N», полоса заполненности из сводки
// готовности (ctx.readiness — без запросов по каждой ДТ) и «не хватает: …».
// Разделение ЕТТ/ВТО (решение владельца 16.10.2026): исходная ДТ — «Исходная ДТ», «все товары: N», «Открыть» и XML
// (правят её части); её части — сразу под ней со сдвигом; часть, разделённая ещё раз до 16.10, — тег роли и
// «Разделена повторно», её части — ниже. 16.10 (вечер) — выбор, что подавать: XML исходной и частей с предупреждением
// (подаётся один вариант), удаление исходной — с подтверждением, части остаются отдельными ДТ.
// Действия над списком (добавить, из документов, из КП, пакетная выгрузка) — только на текущем шаге 3
// (declarations.dtListActive). «Заполнить» и XML в строке — на текущем шаге 3 и после него тем, кто может править ДТ
// (perms.canEditDt — правило страницы ДТ и сервера: админ, РОП, назначенный декларант; решения владельца 09.10),
// остальным после шага 3 — «Открыть». «Заполнить» без права править — выключена с подсказкой (нет роли / ведёт коллега).
// Запросы — те же, что у прежней карточки; всё под общим замком ctx.actions (повторно не нажать).
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const all = computed(() => kase.value.declarations)
const editable = computed(() => dtListActive(kase.value.status, props.mode))
const canEditDt = computed(() => props.ctx.perms.canEditDt)
const rowActions = computed(() => dtRowActions(kase.value.status, props.mode, canEditDt.value))
const canDeclare = computed(() => props.ctx.perms.can('declarant'))
const declHint = computed(() => (canDeclare.value ? '' : hintText({ kind: 'role', role: 'declarant' }, t)))
const fillHint = computed(() => hintText(props.ctx.perms.dtEditHint, t))
const busy = () => props.ctx.actions.busy()
const pending = (key: string) => props.ctx.actions.isPending(key)
const blocked = (key: string) => !canDeclare.value || (busy() && !pending(key))

const tags = computed(() => new Map(all.value.map((d) => [d.id, splitTag(d, all.value, t)])))
// Условный выпуск (17.10): открытый — красная метка у строки ДТ.
const condRel = computed(() => new Map(all.value.map((d) => [d.id, briefOf(d)])))

const query = ref('')
// Группы и вид строки — по ПОЛНОМУ списку, поиск — уже по строкам: иначе исходная ДТ, чьи части не подошли под поиск,
// становилась обычной строкой с «Заполнить» и XML (выгрузка всех товаров второй раз).
const rows = computed(() => {
  const matched = new Set(filterDeclarations(all.value, query.value).map((d) => d.id))
  return groupDeclarations(all.value).filter((r) => matched.has(r.dt.id))
})
/** Строка только для просмотра (без «Заполнить», XML можно): исходная ДТ разделения или повторно разделённая часть. */
const viewOnly = (row: DtListRow<Import40DeclarationDto>) => row.kind === 'source' || row.resplit

const readinessById = computed(() => new Map<string, DeclarationReadiness>((props.ctx.readiness ?? []).map((r) => [r.declarationId, r])))
const readyCount = computed(() => (props.ctx.readiness ?? []).filter((r) => r.isReady).length)
const totalCount = computed(() => props.ctx.readiness?.length || all.value.length)
const readinessOf = (dt: Import40DeclarationDto) => (editable.value ? readinessById.value.get(dt.id) ?? null : null)
const percent = (r: DeclarationReadiness) => (r.total > 0 ? Math.round((r.filled / r.total) * 100) : 0)

const expanded = reactive<Record<string, boolean>>({})
// Свёрнутый «не хватает: …» — не больше двух строк (длинные названия граф не распирают строку ДТ), полный список — в title.
const missingShown = (r: DeclarationReadiness) => (expanded[r.declarationId] ? { shown: r.missing, rest: 0 } : missingPreview(r.missing))

const metaLine = (dt: Import40DeclarationDto, kind: DtListRow<Import40DeclarationDto>['kind']) => {
  const n = dt.goodsItems?.length ?? 0
  const parts = [kind === 'source' ? t('import40Case.splitSourceGoods', { n }) : t('import40Case.goodsCount', { n })]
  if (dt.totalInvoiceValue != null) parts.push(t('broker.case.declaring.list.value', { value: formatMoney(dt.totalInvoiceValue, dt.currency || '').trim() }))
  return parts.join(' · ')
}

// --- действия над ДТ ---
const addDt = () => props.ctx.actions.mutate('dt-add', () => import40Api.createDeclaration(kase.value.id, {}), { done: 'broker.case.done.dtAdded' })

const removeDt = async (dt: Import40DeclarationDto) => {
  // Исходная ДТ с частями: части отцепятся и подаются как обычные ДТ (сервер), изменить разделение будет нельзя.
  // Промежуточная часть старой цепочки — то же для её частей, но это не «исходная ДТ». Уже выгружалась в КЕДЕН — её
  // черновик там остаётся (C3).
  const withParts = hasSplitParts(dt, all.value)
  const midChain = withParts && isLiveSplitPart(dt, all.value)
  const lines = [
    dtLabel(kase.value, dt.id, t) + '.',
    ...(withParts ? [t(midChain ? 'import40Case.deleteMidChainText' : 'import40Case.deleteSourceText')] : []),
    ...(dt.uploadedToKeden ? [t('import40Case.deleteUploadedText')] : []),
  ]
  const ok = await confirm({
    title: t(withParts && !midChain ? 'import40Case.deleteSourceTitle' : 'import40Case.deleteDt'),
    content: lines.length > 1 ? lines.join(' ') : dtLabel(kase.value, dt.id, t),
    okText: t('broker.case.declaring.list.deleteOk'),
    cancelText: t('broker.case.declaring.list.keep'),
    danger: true,
  })
  if (!ok) return
  await props.ctx.actions.mutate(`dt-delete:${dt.id}`, () => import40Api.deleteDeclaration(kase.value.id, dt.id), { done: 'broker.case.done.dtDeleted' })
}
// Удаление (решение владельца 09.10): до выпуска — кто может править ДТ; с выпуска — только администратор,
// остальным пункт виден выключенным с причиной «После выпуска ДТ удалить нельзя».
const showMenu = computed(() => rowActions.value && (props.ctx.perms.canDeleteDt || props.ctx.perms.dtDeleteBlockedByRelease))
const menuItems = (dt: Import40DeclarationDto) => {
  if (!props.ctx.perms.canDeleteDt) return [{ key: 'delete-blocked', label: t('broker.case.declaring.list.deleteAfterRelease'), disabled: true }]
  // Исходная ДТ разделения удаляется и при частях (подтверждение говорит, что части останутся отдельными ДТ).
  // Промежуточная часть старой цепочки — «Удалить ДТ» с той же подсказкой (это не исходная).
  if (hasSplitParts(dt, all.value)) {
    const label = isLiveSplitPart(dt, all.value) ? 'broker.case.declaring.list.delete' : 'broker.case.declaring.list.deleteSource'
    return [{ key: 'delete', label: t(label), danger: true, hint: t('broker.case.declaring.list.deleteSourceHint') }]
  }
  return [{ key: 'delete', label: t('broker.case.declaring.list.delete'), danger: true }]
}
const onMenu = (dt: Import40DeclarationDto, key: string) => { if (key === 'delete') void removeDt(dt) }

// XML для КЕДЕН по одной ДТ: 400 → список «Для XML не хватает данных» под строкой; файл — скачивание и подсказка про гр.54.
const xmlMissing = ref<{ id: string; errors: string[] } | null>(null)
const exportXml = async (dt: Import40DeclarationDto) => {
  // Один вариант разделения в КЕДЕН: исходная целиком или части — предупредить, выгрузку не запрещать.
  const warning = splitExportWarning(dt, all.value, t)
  if (warning && !(await confirm({
    title: t('import40Case.splitExportTitle'),
    content: warning,
    okText: t('import40Case.splitExportOk'),
    cancelText: t('import40Case.splitExportCancel'),
  }))) return
  xmlMissing.value = null
  let res: Awaited<ReturnType<typeof import40Api.downloadKedenXml>> | null = null
  const ok = await props.ctx.actions.mutate(`dt-xml:${dt.id}`, async () => { res = await import40Api.downloadKedenXml(kase.value.id, dt.id) }, { reload: false })
  const out = res as Awaited<ReturnType<typeof import40Api.downloadKedenXml>> | null
  if (!ok || !out) return
  if ('errors' in out) {
    xmlMissing.value = { id: dt.id, errors: out.errors }
    message.warning(t('import40Case.xmlNotFormed'))
    return
  }
  saveBlob(out.blob, out.fileName)
  // Сервер присвоил EDocId: флаг сразу, не дожидаясь перечитывания, — следующее предупреждение (XML части после исходной
  // и наоборот) уже его видит (C1).
  dt.uploadedToKeden = true
  // Гр.54 КЕДЕН из XML не переносит — подсказка, как раньше, 8 секунд.
  message.success({ content: `${t('import40Case.xmlFormed')}. ${t('dt.xmlGr54Hint')}`, duration: 8 })
  void props.ctx.actions.reload() // в журнале появилась запись о выгрузке
}

// Пакетная выгрузка готовых ДТ одним zip.
const exportBatch = async () => {
  // Исходная с частями: пакет выгрузит части — в КЕДЕН подаётся один вариант (C2). Предупреждение, не запрет.
  const warning = splitBatchWarning(all.value, t)
  if (warning && !(await confirm({
    title: t('import40Case.splitExportTitle'),
    content: warning,
    okText: t('import40Case.splitExportOk'),
    cancelText: t('import40Case.splitExportCancel'),
  }))) return
  let res: Awaited<ReturnType<typeof import40Api.downloadKedenBatch>> | null = null
  const ok = await props.ctx.actions.mutate('dt-xml-batch', async () => { res = await import40Api.downloadKedenBatch(kase.value.id) }, { reload: false })
  const out = res as Awaited<ReturnType<typeof import40Api.downloadKedenBatch>> | null
  if (!ok || !out) return
  if ('error' in out) {
    message.warning(out.error)
    return
  }
  saveBlob(out.blob, out.fileName)
  message.success(t('import40Case.batchExported'))
  void props.ctx.actions.reload()
}

// «Из документов»: пакет файлов → извлечение (Aqniet) → создание ДТ → переход к ней; при конфликтах/замечаниях —
// сначала окно замечаний, переход — при его закрытии. Ошибка — тост с этапом, на котором остановились.
// 19.10.2026: сначала окно выбора — документы заявки (уже загруженные, без повторной загрузки) и/или файлы с диска.
const issues = ref<Import40ExtractionResult | null>(null)
const issuesOpen = ref(false)
const pickOpen = ref(false)
let pendingDt: string | null = null

const pickBatch = () => { if (!busy()) pickOpen.value = true }
const onPicked = async ({ fileIds, uploads }: { fileIds: string[]; uploads: File[] }) => {
  pickOpen.value = false
  await runBatch(uploads, fileIds)
}
/**
 * Разбор в новую ДТ: files — с диска (сохраняются в заявку), fileIds — уже загруженные документы заявки (выбранные в
 * окне или сканы с границы, StepDeclaring) — их сервер берёт из хранилища.
 */
/**
 * Excel из набора — нашим разбором (excelFallback): файлы с компьютера как есть, документы заявки — скачиванием; .xlsx и
 * .xls (Zircon AI .xls не читает — пакет импорта 21.10), каждый лист с таблицей товаров — отдельный документ.
 * Ошибка чтения одного файла не мешает остальным (и самому распознаванию).
 */
const readExcelDocs = async (caseId: string, files: File[], fileIds: readonly string[]): Promise<ExcelDoc[]> => {
  const isExcel = (name: string) => /\.xlsx?$/i.test(name)
  const sources: { name: string; load: () => Promise<Blob> }[] = [
    ...files.filter((f) => isExcel(f.name)).map((f) => ({ name: f.name, load: async () => f as Blob })),
    ...props.ctx.files.filter((f) => fileIds.includes(f.id) && isExcel(f.originalFileName))
      .map((f) => ({ name: f.originalFileName, load: () => import40Api.downloadFile(caseId, f.id) })),
  ]
  const docs: ExcelDoc[] = []
  for (const s of sources) {
    try {
      const res = await readExcelDocuments(await s.load(), { details: true, countryResolver: (text) => countryFromText(text) })
      if ('problem' in res) continue
      for (const d of res.docs) {
        const cols = goodsHeaderColumns(d.tableHeader, { details: true }, d.rows.slice(1, 50))
        docs.push({
          fileName: s.name,
          sheet: res.docs.length > 1 ? d.sheet : null,
          goods: d.goods,
          header: docHeaderFrom(`${s.name} ${d.sheet}`, d.headerRows, d.tableHeader),
          rows: d.rows,
          placesHeader: cols.packagesCount != null ? String(d.tableHeader[cols.packagesCount] ?? '') : null,
        })
      }
    } catch { /* не прочитался — остаётся то, что распознал Zircon AI */ }
  }
  return docs
}

/** Виды упаковки (классификатор 2013) для товаров «Из документов»; не загрузились — без вида упаковки по словам. */
const loadPackageKinds = async () => {
  try {
    return await useClassifiersStore().load('2013')
  } catch {
    return []
  }
}
/** Замечание конвейера импорта → текст окна замечаний. */
const noteText = (n: DocumentsNote): string => {
  const p = { ...(n.params ?? {}) }
  if (typeof p.reasonKey === 'string') p.reason = t(`broker.case.declaring.batch.reason.${p.reasonKey}`)
  return t(`broker.case.declaring.batch.${n.key}`, p)
}

const runBatch = async (files: File[], fileIds: readonly string[] = []) => {
  if ((!files.length && !fileIds.length) || busy()) return
  const caseId = kase.value.id
  let stage: 'extract' | 'create' = 'extract'
  let result: Import40ExtractionResult | null = null
  let createdId: string | null = null
  let usedExcel = false
  let extraWarnings: string[] = []
  const ok = await props.ctx.actions.mutate('dt-batch', async () => {
    result = await import40Api.extractBatch(caseId, files, fileIds)
    // Zircon AI + наш разбор Excel → товары ДТ по одним правилам с «Из Excel» (коды одним запросом, гр. 41 / гр. 31,
    // упаковка, страна, отправитель с адресом), гр. 44 инвойса, упаковочного и транспортного документа.
    const [docs, packageKinds] = await Promise.all([
      readExcelDocs(caseId, files, fileIds),
      loadPackageKinds(),
    ])
    const prepared = await prepareDocumentsDeclaration(result, docs, kase.value, packageKinds)
    usedExcel = prepared.usedExcelGoods
    extraWarnings = prepared.notes.map(noteText)
    stage = 'create'
    const created = await import40Api.createDeclaration(caseId, prepared.body)
    createdId = created.id
    // Получатель из документов не совпал с компанией клиента — сервер не взял поля профиля (В17): предупредить.
    if (prepared.receiverName && !created.receiver?.city && !created.receiver?.street) {
      extraWarnings.push(t('broker.case.declaring.batch.receiverMismatch', { name: prepared.receiverName }))
    }
    // Сверка документов этого разбора — к созданной ДТ (17.10); не вышло — сверка просто не привязана к ДТ.
    if (result.documentCheckId) {
      await documentChecksApi.link(caseId, result.documentCheckId, created.id).catch(() => undefined)
    }
  }, { reload: false })
  const extracted = result as Import40ExtractionResult | null
  const dtId = createdId as string | null
  if (!ok || !extracted || !dtId) {
    message.error(t(stage === 'extract' ? 'broker.case.declaring.batch.failedExtract' : 'broker.case.declaring.batch.failedCreate'))
    return
  }
  message.success(t(usedExcel ? 'broker.case.declaring.batch.doneFromExcel' : 'import40Case.batchProcessed'))
  const warnings = [...extracted.warnings, ...extraWarnings]
  if (extracted.conflicts.length || warnings.length) {
    issues.value = { ...extracted, warnings }
    pendingDt = dtId
    issuesOpen.value = true
    return
  }
  await router.push(dtPath(caseId, dtId))
}
defineExpose({ runBatch })
const closeIssues = () => {
  issuesOpen.value = false
  const dtId = pendingDt
  pendingDt = null
  if (dtId) void router.push(dtPath(kase.value.id, dtId))
}

const quoteOpen = ref(false)

// «Копировать ДТ» (20.10.2026): новая ДТ по образцу ДТ этой или прошлой заявки клиента — сразу на её страницу.
const copyOpen = ref(false)
const copyDt = async (payload: { sourceDeclarationId: string; includeGoods: boolean }) => {
  const caseId = kase.value.id
  let createdId: string | null = null
  const ok = await props.ctx.actions.mutate('dt-copy', async () => {
    createdId = (await import40Api.copyDeclaration(caseId, payload)).id
  }, { done: 'broker.case.done.dtCopied' })
  copyOpen.value = false
  const id = createdId as string | null
  if (ok && id) await router.push(dtPath(caseId, id))
}

const iconBase = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 focus-visible:shadow-focus enabled:hover:bg-sunken enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress motion-reduce:transition-none max-sm:size-11'
const toolBtn = 'max-sm:min-h-11'
const openLink = 'inline-flex h-7 items-center rounded-field bg-sunken px-2.5 text-xs font-semibold text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <div :class="cn(mode === 'done' && 'overflow-hidden rounded-row border border-line')" data-dt-list>
    <div
      :class="cn('flex flex-wrap items-center gap-x-2 gap-y-2 bg-canvas px-4 py-2.5', mode === 'current' && 'border-t border-line')"
      data-dt-strip
    >
      <h3 class="m-0 text-[13px] font-medium text-ink-3">{{ t('broker.case.declaring.list.title') }}</h3>
      <span class="rounded-pill bg-sunken px-1.5 text-[11.5px] font-semibold tabular-nums text-ink-3" data-dt-count>{{ all.length }}</span>

      <div v-if="editable" class="ml-auto flex flex-wrap justify-end gap-1.5 max-sm:ml-0 max-sm:w-full max-sm:justify-start" data-dt-toolbar>
        <template v-if="kase.status === 2">
          <ZTooltip :title="declHint">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-add')" :loading="pending('dt-add')" data-dt-add @click="addDt">
                <PhPlus :size="15" aria-hidden="true" />{{ t('import40Case.addDt') }}
              </ZButton>
            </span>
          </ZTooltip>
          <ZTooltip :title="declHint || t('broker.case.declaring.list.copyHint')">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-copy')" :loading="pending('dt-copy')" data-dt-copy @click="copyOpen = true">
                <PhCopy :size="15" aria-hidden="true" />{{ t('broker.case.declaring.list.copy') }}
              </ZButton>
            </span>
          </ZTooltip>
          <ZTooltip :title="declHint || t('broker.case.declaring.list.fromDocsHint')">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-batch')" :loading="pending('dt-batch')" data-dt-from-docs @click="pickBatch">
                <PhSparkle :size="15" aria-hidden="true" />{{ pending('dt-batch') ? t('broker.case.declaring.list.fromDocsBusy') : t('broker.case.declaring.list.fromDocs') }}
              </ZButton>
            </span>
          </ZTooltip>
          <ZTooltip :title="declHint">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-quote')" data-dt-quote @click="quoteOpen = true">
                {{ t('import40Case.importQuote') }}
              </ZButton>
            </span>
          </ZTooltip>
        </template>
        <ZTooltip v-if="all.length && canDeclare" :title="t('import40Case.readyCount', { ready: readyCount, total: totalCount })">
          <span class="inline-flex" tabindex="0">
            <ZButton
              size="sm"
              :class="toolBtn"
              :disabled="readyCount === 0 || blocked('dt-xml-batch')"
              :loading="pending('dt-xml-batch')"
              data-dt-xml-batch
              @click="exportBatch"
            >
              <PhDownloadSimple :size="15" aria-hidden="true" />{{ t('broker.case.declaring.list.xmlReady', { n: readyCount }) }}
            </ZButton>
          </span>
        </ZTooltip>
      </div>
    </div>

    <div v-if="all.length > 1" class="border-t border-line px-4 py-2.5">
      <ZInput
        v-model:value="query"
        type="search"
        allow-clear
        :placeholder="t('import40Case.searchDt')"
        :aria-label="t('import40Case.searchDt')"
        class="w-full max-w-[320px] max-sm:max-w-none"
        data-dt-search
      />
    </div>

    <div v-if="!all.length" class="border-t border-line px-4 py-5" data-dt-empty>
      <p class="m-0 text-sm text-ink-2">{{ t('import40Case.noDt') }}</p>
      <p v-if="editable && kase.status === 2 && canDeclare" class="m-0 mt-1 text-[13px] text-muted">{{ t('broker.case.declaring.list.emptyHint') }}</p>
    </div>
    <p v-else-if="!rows.length" class="m-0 border-t border-line px-4 py-4 text-sm text-ink-3" data-dt-nothing>{{ t('broker.case.declaring.list.nothingFound') }}</p>

    <ul v-else role="list" class="m-0 list-none p-0">
      <li
        v-for="row in rows"
        :key="row.dt.id"
        :class="cn(
          'grid grid-cols-1 items-center gap-x-4 gap-y-2.5 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]',
          row.kind === 'source' && 'bg-canvas',
        )"
        :style="row.depth ? { paddingLeft: `${1 + row.depth * 1.5}rem` } : undefined"
        :data-dt-row="row.dt.id"
        :data-dt-kind="row.kind"
        :data-dt-depth="row.depth"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <PhArrowElbowDownRight v-if="row.depth" :size="14" class="shrink-0 text-ink-3" aria-hidden="true" />
            <RouterLink
              :to="dtPath(kase.id, row.dt.id)"
              class="rounded-[4px] font-mono text-sm font-medium text-ink no-underline outline-hidden hover:text-zircon-ink hover:underline focus-visible:shadow-focus"
              data-dt-link
            >{{ dtLabel(kase, row.dt.id, t) }}</RouterLink>
            <ZTooltip v-if="tags.get(row.dt.id)" :title="tags.get(row.dt.id)!.tip">
              <span class="inline-flex" :tabindex="tags.get(row.dt.id)!.tip ? 0 : undefined">
                <ZTag :tone="tags.get(row.dt.id)!.tone" size="sm" data-dt-split>{{ tags.get(row.dt.id)!.label }}</ZTag>
              </span>
            </ZTooltip>
            <CondRelTag v-if="condRel.get(row.dt.id)" :brief="condRel.get(row.dt.id)!" short />
            <ZTooltip v-if="row.resplit" :title="t('import40Case.splitResplitTooltip')">
              <span class="inline-flex" tabindex="0">
                <ZTag tone="neutral" size="sm" data-dt-resplit>{{ t('import40Case.splitResplit') }}</ZTag>
              </span>
            </ZTooltip>
          </div>
          <div class="mt-0.5 text-[12.5px] text-muted tabular-nums" data-dt-meta>{{ metaLine(row.dt, row.kind) }}</div>
        </div>

        <div class="min-w-0" data-dt-readiness>
          <template v-if="readinessOf(row.dt)">
            <div class="flex items-center gap-2.5">
              <span
                role="progressbar"
                :aria-valuemin="0"
                :aria-valuemax="readinessOf(row.dt)!.total"
                :aria-valuenow="readinessOf(row.dt)!.filled"
                :aria-label="t('broker.case.declaring.list.progress', { filled: readinessOf(row.dt)!.filled, total: readinessOf(row.dt)!.total })"
                class="block h-1.5 w-[120px] max-w-full shrink overflow-hidden rounded-pill bg-sunken"
              >
                <span
                  :class="cn('block h-full rounded-pill', readinessOf(row.dt)!.isReady ? 'bg-tone-done-fg' : 'bg-gold')"
                  :style="{ width: `${percent(readinessOf(row.dt)!)}%` }"
                />
              </span>
              <span class="text-[12.5px] font-medium tabular-nums text-ink-2" data-dt-graphs>
                {{ t('broker.case.declaring.list.graphs', { filled: readinessOf(row.dt)!.filled, total: readinessOf(row.dt)!.total }) }}
              </span>
            </div>
            <div v-if="readinessOf(row.dt)!.isReady" class="mt-1 text-xs text-tone-done-fg" data-dt-ready>{{ t('broker.case.declaring.list.ready') }}</div>
            <div
              v-else-if="readinessOf(row.dt)!.missing.length"
              class="mt-1 text-xs text-gold-ink"
              :title="t('broker.case.declaring.list.missing', { list: readinessOf(row.dt)!.missing.join(', ') })"
              data-dt-missing
            >
              <span :class="['break-words', !expanded[row.dt.id] && 'line-clamp-2']" data-dt-missing-text>{{
                t('broker.case.declaring.list.missing', { list: missingShown(readinessOf(row.dt)!).shown.join(', ') })
              }}</span>
              <button
                v-if="missingPreview(readinessOf(row.dt)!.missing).rest > 0"
                type="button"
                :aria-expanded="!!expanded[row.dt.id]"
                class="cursor-pointer rounded-[4px] border-0 bg-transparent p-0 font-sans text-xs font-medium text-gold-ink underline underline-offset-2 outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
                data-dt-missing-more
                @click="expanded[row.dt.id] = !expanded[row.dt.id]"
              >{{ expanded[row.dt.id] ? t('broker.case.declaring.list.less') : t('broker.case.declaring.list.more', { n: missingPreview(readinessOf(row.dt)!.missing).rest }) }}</button>
            </div>
          </template>
        </div>

        <div class="flex items-center gap-1.5 sm:justify-end" data-dt-actions>
          <template v-if="rowActions">
            <RouterLink v-if="viewOnly(row)" :to="dtPath(kase.id, row.dt.id)" :class="openLink" data-dt-open>{{ t('broker.case.declaring.list.open') }}</RouterLink>
            <ZTooltip v-else :title="fillHint">
              <span class="inline-flex" :tabindex="fillHint ? 0 : undefined">
                <ZButton size="sm" :class="toolBtn" :disabled="!canEditDt" data-dt-fill @click="router.push(dtPath(kase.id, row.dt.id))">
                  {{ t('import40Case.fill') }}
                </ZButton>
              </span>
            </ZTooltip>
            <ZTooltip :title="declHint || t('import40Case.xmlForKeden')">
              <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
                <button
                  type="button"
                  :class="iconBase"
                  :disabled="blocked(`dt-xml:${row.dt.id}`)"
                  :aria-busy="pending(`dt-xml:${row.dt.id}`) || undefined"
                  :aria-label="t('import40Case.xmlForKeden')"
                  data-dt-xml
                  @click="!pending(`dt-xml:${row.dt.id}`) && exportXml(row.dt)"
                >
                  <PhCode :size="16" aria-hidden="true" />
                </button>
              </span>
            </ZTooltip>
            <ZDropdown v-if="showMenu" :items="menuItems(row.dt)" @select="onMenu(row.dt, $event)">
              <button
                type="button"
                :class="iconBase"
                :disabled="busy() && !pending(`dt-delete:${row.dt.id}`)"
                :aria-busy="pending(`dt-delete:${row.dt.id}`) || undefined"
                :aria-label="t('broker.case.declaring.list.actions', { label: dtLabel(kase, row.dt.id, t) })"
                data-dt-more
              >
                <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
              </button>
            </ZDropdown>
          </template>
          <RouterLink v-else :to="dtPath(kase.id, row.dt.id)" :class="openLink" data-dt-open>{{ t('broker.case.declaring.list.open') }}</RouterLink>
        </div>

        <ZAlert
          v-if="rowActions && xmlMissing?.id === row.dt.id"
          type="warning"
          show-icon
          :message="t('import40Case.xmlMissingTitle')"
          class="sm:col-span-3"
          data-dt-xml-missing
        >
          <ul class="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
            <li v-for="m in xmlMissing.errors" :key="m">{{ m }}</li>
          </ul>
        </ZAlert>
      </li>
    </ul>

    <QuoteImportModal v-if="editable" v-model:open="quoteOpen" :ctx="ctx" />
    <ExtractionIssuesModal v-if="editable" :open="issuesOpen" :issues="issues" @close="closeIssues" />
    <CopyDtModal v-if="editable" v-model:open="copyOpen" :case-id="kase.id" :busy="pending('dt-copy')" @submit="copyDt" />
    <ExtractDocsModal v-if="editable" v-model:open="pickOpen" :files="ctx.files" :busy="pending('dt-batch')" @submit="onPicked" />
  </div>
</template>
