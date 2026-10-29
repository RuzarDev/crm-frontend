// «Из документов» — общее для новой ДТ (список ДТ заявки, DeclarationsList) и для уже созданной ДТ (страница ДТ,
// goods/useDocsIntoDt): чтение Excel набора, справочники видов упаковки и документов, CMR в наборе, текст замечания.
// Вынесено из DeclarationsList 29.10.2026, чтобы второй путь не дублировал первый.
import { import40Api, type Import40FileDto } from '@/api/import40'
import type { ClassifierItem } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { goodsHeaderColumns, readExcelDocuments } from '@/utils/goodsExcel'
import { countryFromText } from '@/utils/importText'
import type { DocumentsNote } from './documentsImport'
import { docHeaderFrom, type ExcelDoc } from './excelFallback'

/**
 * Excel из набора — нашим разбором (excelFallback): файлы с компьютера как есть, документы заявки — скачиванием; .xlsx и
 * .xls (Zircon AI .xls не читает — пакет импорта 21.10), каждый лист с таблицей товаров — отдельный документ.
 * Ошибка чтения одного файла не мешает остальным (и самому распознаванию).
 */
export async function readExcelDocs(
  caseId: string, files: readonly File[], fileIds: readonly string[], caseFiles: readonly Import40FileDto[],
): Promise<ExcelDoc[]> {
  const isExcel = (name: string) => /\.xlsx?$/i.test(name)
  const sources: { name: string; load: () => Promise<Blob> }[] = [
    ...files.filter((f) => isExcel(f.name)).map((f) => ({ name: f.name, load: async () => f as Blob })),
    ...caseFiles.filter((f) => fileIds.includes(f.id) && isExcel(f.originalFileName))
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
          header: docHeaderFrom(`${s.name} ${d.sheet}`, d.headerRows, d.tableHeader, d.rows),
          rows: d.rows,
          placesHeader: cols.packagesCount != null ? String(d.tableHeader[cols.packagesCount] ?? '') : null,
          totals: d.totals,
        })
      }
    } catch { /* не прочитался — остаётся то, что распознал Zircon AI */ }
  }
  return docs
}

/** Виды упаковки (классификатор 2013) для товаров «Из документов»; не загрузились — без вида упаковки по словам. */
export async function loadPackageKinds(): Promise<ClassifierItem[]> {
  try {
    return await useClassifiersStore().load('2013')
  } catch {
    return []
  }
}

/** Названия видов документов (2009) для гр. 44 (e2e-4); не загрузились — сервер дозаполнит по коду. */
export async function loadDocKindNames(): Promise<Map<string, string>> {
  try {
    const items = await useClassifiersStore().load('2009')
    return new Map(items.flatMap((k) => (k.nameRu ? [[k.code, k.nameRu.trim().toLocaleUpperCase('ru-RU')] as [string, string]] : [])))
  } catch {
    return new Map()
  }
}

/** CMR в наборе (вид документа «CMR» или «cmr» в имени) — гр. 44 02015, а не документ по виду транспорта заявки. */
export function cmrInBatch(files: readonly File[], fileIds: readonly string[], caseFiles: readonly Import40FileDto[]): boolean {
  return files.some((f) => /cmr/i.test(f.name))
    || caseFiles.some((f) => fileIds.includes(f.id) && (f.docKind === 'cmr' || /cmr/i.test(f.originalFileName)))
}

/** Замечание конвейера импорта → текст (ключ broker.case.declaring.batch.*). */
export function documentsNoteText(n: DocumentsNote, t: (key: string, params?: Record<string, unknown>) => string): string {
  const p = { ...(n.params ?? {}) }
  if (typeof p.reasonKey === 'string') p.reason = t(`broker.case.declaring.batch.reason.${p.reasonKey}`)
  return t(`broker.case.declaring.batch.${n.key}`, p)
}
