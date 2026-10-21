// «Из документов» → тело создания ДТ (пакет импорта 21.10.2026, №1–7, №9, №10, №16): тот же конвейер, что «Из Excel» в
// товарах ДТ, только без предпросмотра — замечания идут в окно замечаний после создания ДТ.
//   1. applyExcelFallback — товары (Zircon AI + Excel), шапка, гр. 44, номера машины;
//   2. resolveCodes — коды одним запросом (действующий 10-значный код, не номер инвойса/контракта/CMR; ДЕИ);
//   3. buildGoods — товары ДТ по одним правилам (гр. 41 / строка гр. 31, упаковка, страна, заглавные);
//   4. отправитель — из справочника сторон (точное совпадение названия) или разбором адреса из документа.
import { partyRefsApi } from '@/api/partyRefs'
import type { Import40DeclarationUpsert, Import40ExtractionResult, Import40Party } from '@/api/import40'
import type { ClassifierItem } from '@/types/api'
import { countryFromText, hasHan, normPartyName, parseForeignAddress, upperRu } from '@/utils/importText'
import { ensureOkeiUnits } from '@/views/broker/dt/goods/editor/okei'
import { buildGoods, noteCount, noteDetails, SENDER_AS_MANUFACTURER_DEFAULT } from '@/views/broker/dt/goods/importBuild'
import { resolveCodes } from '@/views/broker/dt/goods/importResolve'
import { previewToUpsert, type DocumentsBuilt } from '../declarations'
import { applyExcelFallback, type ExcelDoc } from './excelFallback'

/** Замечание для окна замечаний: ключ i18n broker.case.declaring.batch.* и параметры. */
export interface DocumentsNote { key: string; params?: Record<string, unknown> }

export interface DocumentsDeclaration {
  body: Import40DeclarationUpsert
  notes: DocumentsNote[]
  usedExcelGoods: boolean
  /** Получатель из документов (имя) — после создания ДТ проверяется, совпал ли он с компанией клиента. */
  receiverName: string | null
}

export interface DocumentsCase {
  transportMode?: number | null
  foreignContractId?: string | null
}

/** Краткое наименование стороны в R.055 — Name120. */
const SHORT_NAME_MAX = 120

/**
 * Отправитель гр. 2 (№7): справочник сторон — точное совпадение названия без форм собственности → все поля из
 * справочника (В17); иначе разбор адреса из документа. Краткое = полное (до 120 знаков). ЗАГЛАВНЫМИ.
 */
export async function resolveSender(name: string | null | undefined, address: string | null | undefined, notes: DocumentsNote[]):
  Promise<DocumentsBuilt['sender']> {
  const full = upperRu(name)
  if (!full) return null
  try {
    const list = await partyRefsApi.search(name!.trim(), { silent: true })
    const key = normPartyName(name)
    const hit = key ? list.find((r) => normPartyName(r.name) === key) : undefined
    if (hit) {
      notes.push({ key: 'senderFromRefs' })
      return {
        party: { name: upperRu(hit.name), countryCode: hit.countryCode, region: hit.region, city: hit.city, street: hit.street },
        shortName: upperRu(hit.shortName) ?? full.slice(0, SHORT_NAME_MAX),
        house: hit.house, apt: hit.apt,
      }
    }
  } catch { /* справочник недоступен — разбираем адрес из документа */ }
  const addr = parseForeignAddress(address)
  if (!addr && address && hasHan(address)) notes.push({ key: 'senderAddressHan' })
  if (addr?.clipped) notes.push({ key: 'senderAddressClipped' })
  const party: Import40Party = {
    name: full,
    countryCode: countryFromText(addr?.countryText) ?? null,
    region: addr?.region ?? null,
    city: addr?.city ?? null,
    street: addr?.street ?? null,
  }
  return { party, shortName: full.slice(0, SHORT_NAME_MAX), district: addr?.district ?? null, house: addr?.house ?? null, apt: addr?.apt ?? null }
}

export async function prepareDocumentsDeclaration(
  result: Import40ExtractionResult, docs: readonly ExcelDoc[], kase: DocumentsCase, packageKinds: readonly ClassifierItem[],
): Promise<DocumentsDeclaration> {
  const extras = result.extras ?? null
  const excel = applyExcelFallback(result.declaration, docs, {
    extras, transportMode: kase.transportMode ?? null, hasCaseContract: !!kase.foreignContractId,
  })
  const invoiceNo = extras?.invoiceNumber ?? docs.find((d) => d.header.kind === 'invoice')?.header.number ?? null
  const [resolved] = await Promise.all([
    resolveCodes(excel.rows.map((r) => r.tnvedCode), { invoiceNo, contractNo: extras?.contractNumber, transportDoc: extras?.transportDocument }),
    // Справочник ОКЕИ — только если есть единицы («шт» → 796); без него — латинские и частые русские обозначения.
    excel.rows.some((r) => r.unitText) ? ensureOkeiUnits().catch(() => undefined) : undefined,
  ])
  const senderName = excel.preview.sender?.name ?? null
  const built = buildGoods(excel.rows, {
    currency: excel.preview.currency,
    packageKinds,
    resolved,
    // В9: «производитель = отправитель» — тем же значением по умолчанию, что галочка «Из Excel» (по умолчанию выключено).
    options: { senderAsManufacturer: SENDER_AS_MANUFACTURER_DEFAULT ? senderName : null },
  })

  const notes: DocumentsNote[] = []
  for (const d of noteDetails(built.notes, 'invalidCode')) {
    const [code, reason] = d.split(':')
    notes.push({ key: 'codesRejected', params: { code, reasonKey: reason } })
  }
  if (built.notes.some((n) => n.kind === 'codesNotChecked')) notes.push({ key: 'codesNotChecked' })
  const counts: [string, number][] = [
    ['toRow', noteCount(built.notes, 'toRow')], ['noUnit', noteCount(built.notes, 'noUnit')],
    ['deiMismatch', noteCount(built.notes, 'deiMismatch')], ['han', noteCount(built.notes, 'han')],
  ]
  for (const [key, n] of counts) if (n) notes.push({ key, params: { n } })
  const unknownUnits = noteDetails(built.notes, 'unknownUnit')
  if (unknownUnits.length) notes.push({ key: 'unknownUnits', params: { list: unknownUnits.join(', ') } })
  const unknownCountries = noteDetails(built.notes, 'unknownCountry')
  if (unknownCountries.length) notes.push({ key: 'unknownCountries', params: { list: unknownCountries.join(', ') } })
  const unknownPackaging = noteDetails(built.notes, 'unknownPackaging')
  if (unknownPackaging.length) notes.push({ key: 'unknownPackaging', params: { list: unknownPackaging.join(', ') } })
  if (excel.conflicts.length) notes.push({ key: 'docsConflicts', params: { n: excel.conflicts.length } })

  const sender = await resolveSender(senderName, excel.senderAddress, notes)
  // Получатель — ЗАГЛАВНЫМИ, как поля ДТ (совпал с компанией клиента — сервер возьмёт поля профиля).
  const receiver = excel.preview.receiver?.name ? { ...excel.preview.receiver, name: upperRu(excel.preview.receiver.name) } : excel.preview.receiver
  const body = previewToUpsert({ ...excel.preview, receiver }, {
    goods: built.goods, sender, receiverBin: excel.receiverBin, doc44Items: excel.doc44Items,
  })
  return { body, notes, usedExcelGoods: excel.usedExcelGoods, receiverName: excel.preview.receiver?.name ?? null }
}
