// «Из документов» в уже созданную ДТ (29.10.2026, задача 5 запуска) — страница ДТ, раздел «Товары»:
// 1. «Из документов» → документы заявки (GET files) → окно выбора ExtractDocsModal: отмечены загруженные после создания ДТ;
// 2. разбор — тот же extract-batch и тот же конвейер, что новая ДТ (documentsSources + prepareDocumentsDeclaration);
// 3. сводка (docsIntoDt.planDocsIntoDt) — «Применить» / «Отмена»; «Применить» строит план заново по текущей форме,
//    правит форму (товары — через модель товаров) и сохраняет ДТ обычным сохранением (очередь, версия, 409 — как везде);
//    в плашке — «Отменить». Сверка документов этого разбора привязывается к ДТ (как при новой ДТ).
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { documentChecksApi } from '@/api/documentChecks'
import { import40Api, type Import40CaseDto, type Import40DeclarationDto, type Import40ExtractionResult, type Import40FileDto } from '@/api/import40'
import { message } from '@/ui/message'
import { formatMoney } from '@/ui/number'
import { prepareDocumentsDeclaration, type DocumentsDeclaration } from '@/views/broker/case/steps/documentsImport'
import { cmrInBatch, documentsNoteText, loadDocKindNames, loadPackageKinds, readExcelDocs } from '@/views/broker/case/steps/documentsSources'
import type { DtFormState } from '../dtPayload'
import { applyDocsIntoDt, docsDefaults, planDocsIntoDt, type DocsDefaults, type DocsIntoDtPlan } from './docsIntoDt'
import type { DtGoodsModel } from './useDtGoods'

export interface UseDocsIntoDtOptions {
  caseId: string
  dtId: string
  form: DtFormState
  goods: DtGoodsModel
  kase: () => Import40CaseDto | null
  /** Последний ответ сервера по ДТ: дата создания, свой контракт ДТ. */
  dto: () => Import40DeclarationDto | null
  /** Можно ли сейчас (docsIntoDt.canDocsIntoDt и нет 409 / загрузки). */
  enabled: () => boolean
  /** Почему сейчас нельзя (409, перезагрузка, нет права) — текст для «Применить»; null — неизвестно. */
  blockedReason?: () => string | null
  save: () => Promise<boolean>
}

interface Pending {
  result: Import40ExtractionResult
  prepared: DocumentsDeclaration
  docKindNames: Map<string, string>
}

export function useDocsIntoDt(o: UseDocsIntoDtOptions) {
  const { t } = useI18n()
  const tx = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.docsInto.${key}`, p ?? {})

  const pickOpen = ref(false)
  const summaryOpen = ref(false)
  const loadingFiles = ref(false)
  const busy = ref(false)
  const files = shallowRef<Import40FileDto[]>([])
  const defaults = shallowRef<DocsDefaults>({ ids: [], newIds: [], known: false })
  const pending = shallowRef<Pending | null>(null)
  const plan = shallowRef<DocsIntoDtPlan | null>(null)
  /** Переключатель сводки: «Дополнить совпавшие» / «Добавить все как новые» (ревью 29.10, I1). */
  const mode = ref<'fill' | 'append'>('fill')

  /** «Из документов»: документы заявки и что отметить; не загрузились — окно всё равно (файлы с компьютера). */
  const open = async () => {
    if (!o.enabled() || busy.value || loadingFiles.value) return
    loadingFiles.value = true
    try {
      files.value = await import40Api.listFiles(o.caseId, { silent: true }).catch((e) => {
        // Не загрузился список — окно всё равно (файлы с компьютера), но с объяснением (ревью 29.10, M8).
        console.error('docs-into-dt: case files', e)
        message.warning(tx('filesFailed'))
        return []
      })
      defaults.value = docsDefaults(files.value, o.dto()?.createdAtUtc ?? null)
      pickOpen.value = true
    } finally {
      loadingFiles.value = false
    }
  }

  const options = () => ({ docKindNames: pending.value?.docKindNames ?? null, mode: mode.value })
  const replan = () => {
    if (pending.value) plan.value = planDocsIntoDt(o.form, pending.value.prepared, options())
  }
  const setMode = (m: 'fill' | 'append') => {
    mode.value = m
    replan()
  }

  /** Разбор выбранного: тот же extract-batch и конвейер, что новая ДТ; затем — сводка. */
  const submit = async ({ fileIds, uploads }: { fileIds: string[]; uploads: File[] }) => {
    if (busy.value || (!fileIds.length && !uploads.length)) return
    pickOpen.value = false
    busy.value = true
    // Ошибка распознавания и ошибка разбора распознанного в ДТ — разные тексты (ревью 29.10, M8).
    let stage: 'extract' | 'prepare' = 'extract'
    try {
      const result = await import40Api.extractBatch(o.caseId, uploads, fileIds)
      stage = 'prepare'
      const [docs, packageKinds, docKindNames] = await Promise.all([
        readExcelDocs(o.caseId, uploads, fileIds, files.value),
        loadPackageKinds(),
        loadDocKindNames(),
      ])
      const k = o.kase()
      // Свой контракт ДТ или контракт заявки — гр. 44 03011 / 03031 ставит сервер, из документов не пишем.
      const prepared = await prepareDocumentsDeclaration(result, docs, {
        transportMode: k?.transportMode ?? null, foreignContractId: o.dto()?.foreignContractId ?? k?.foreignContractId ?? null,
      }, packageKinds, { docKindNames, cmrInBatch: cmrInBatch(uploads, fileIds, files.value) })
      pending.value = { result, prepared, docKindNames }
      mode.value = 'fill'
      plan.value = planDocsIntoDt(o.form, prepared, options())
      summaryOpen.value = true
    } catch (e) {
      console.error(`docs-into-dt: ${stage}`, e)
      message.error(stage === 'extract' ? t('broker.case.declaring.batch.failedExtract') : tx('failedPrepare'))
    } finally {
      busy.value = false
    }
  }

  /** Замечания для сводки: шапка ДТ, конвейер импорта (коды, единицы, гр. 44…), предупреждения распознавания. */
  const remarks = computed<string[]>(() => {
    const p = plan.value
    const pd = pending.value
    if (!p || !pd) return []
    const field = (f: unknown) => tx(`field.${String(f)}`)
    // Суммы — с разделителями и валютой гр. 22 («50 000,00 USD»), графа — подписью.
    const money = (v: unknown) => (typeof v === 'number' ? formatMoney(v, o.form.currency || '').trim() : v)
    const own = p.remarks.map((r) => tx(`remark.${r.key}`, r.key === 'totalDiffers'
      ? { dt: money(r.params.dt), sum: money(r.params.sum) }
      : 'field' in r.params ? { ...r.params, field: field(r.params.field) } : r.params))
    // Замечания про отправителя и получателя — только если их графы заполняются из документов (иначе стороны ДТ не меняются).
    const party: Record<string, 'sender' | 'receiver'> = {
      senderFromRefs: 'sender', senderAddressHan: 'sender', senderAddressClipped: 'sender', receiverByBin: 'receiver',
    }
    const notes = pd.prepared.notes.filter((n) => !party[n.key] || p.header.groups.includes(party[n.key])).map((n) => documentsNoteText(n, t))
    return [...own, ...notes, ...pd.result.warnings]
  })
  const extractionConflicts = computed(() => pending.value?.result.conflicts ?? [])

  const close = () => {
    summaryOpen.value = false
    pending.value = null
    plan.value = null
  }

  /** «Применить»: план заново по текущей форме → форма → сохранение; «Отменить» в плашке. */
  const apply = async () => {
    const pd = pending.value
    if (!pd) return
    // ДТ стала недоступна, пока открыта сводка (409, перезагрузка, выпуск): не молчать — закрыть и сказать почему (M6).
    if (!o.enabled()) {
      close()
      message.warning(o.blockedReason?.() || tx('blocked'))
      return
    }
    const fresh = planDocsIntoDt(o.form, pd.prepared, options())
    const res = applyDocsIntoDt(o.form, o.goods, fresh)
    const checkId = pd.result.documentCheckId
    close()
    if (checkId) void documentChecksApi.link(o.caseId, checkId, o.dtId).catch(() => undefined)
    void o.save()
    const content = tx('done', { added: res.added, updated: res.updated, docs: res.doc44Added, header: res.headerFilled })
    message.success({
      content: res.rowsSkipped ? `${content}. ${t('broker.dt.goods.excel.rowsSkipped', { n: res.rowsSkipped })}` : content,
      duration: 15,
      action: {
        label: t('broker.dt.goods.excel.undo'),
        onClick: () => {
          // Без права править откат был бы частичным (модель товаров не правит) — не откатываем, говорим почему (M8).
          if (!o.enabled()) {
            message.warning(o.blockedReason?.() || tx('blocked'))
            return
          }
          res.undo()
          // Сверка этого разбора — снова без ДТ.
          if (checkId) void documentChecksApi.link(o.caseId, checkId, null).catch(() => undefined)
          message.info(t('broker.dt.goods.excel.undone'))
        },
      },
    })
  }

  return {
    pickOpen, summaryOpen, loadingFiles, busy, files, defaults, plan, mode, setMode, remarks, extractionConflicts, open, submit, apply, close,
  }
}

export type DocsIntoDt = ReturnType<typeof useDocsIntoDt>
