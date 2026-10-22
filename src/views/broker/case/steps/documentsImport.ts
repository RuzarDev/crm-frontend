// «Из документов» → тело создания ДТ (пакет импорта 21.10.2026, №1–7, №9, №10, №16): тот же конвейер, что «Из Excel» в
// товарах ДТ, только без предпросмотра — замечания идут в окно замечаний после создания ДТ.
//   1. applyExcelFallback — товары (Zircon AI + Excel), шапка, гр. 44, номера машины;
//   2. resolveCodes — коды одним запросом (действующий 10-значный код, не номер инвойса/контракта/CMR; ДЕИ);
//   3. buildGoods — товары ДТ по одним правилам (гр. 41 / строка гр. 31, упаковка, страна, заглавные);
//   4. отправитель — из справочника сторон (точное совпадение названия) или разбором адреса из документа.
import { companyLookupApi, isBinLike } from '@/api/companyLookup'
import { partyRefsApi } from '@/api/partyRefs'
import type { Import40DeclarationDto, Import40DeclarationUpsert, Import40ExtractionResult, Import40Party } from '@/api/import40'
import type { ClassifierItem } from '@/types/api'
import { countryFromText, fixCyrillicLookalikes, hasHan, normPartyName, parseForeignAddress, upperRu, type CountryOption } from '@/utils/importText'
import { parseKzAddress } from '@/utils/kzAddress'
import { ensureOkeiUnits } from '@/views/broker/dt/goods/editor/okei'
import { docDateConflicts } from '@/views/broker/dt/goods/goodsImport'
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

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/**
 * Получатель созданной ДТ — компания клиента? Тем же правилом, что IsClientCompany на сервере (В17): тот же БИН, а без БИН —
 * то же название без форм собственности и кавычек. Компания клиента — декларант новой ДТ: его сервер ставит из профиля
 * клиента. null — профиля нет (декларант пуст), сравнивать не с чем и предупреждать не о чем (ревью 21.10: раньше вывод
 * делался по пустому городу и улице получателя и ошибался, когда в профиле нет адреса).
 */
export function receiverIsClient(dt: Pick<Import40DeclarationDto, 'receiver' | 'receiverBin' | 'declarantName' | 'declarantBin'>): boolean | null {
  if (!dt.declarantName?.trim()) return null
  const receiverBin = digits(dt.receiverBin)
  if (receiverBin) return digits(dt.declarantBin) === receiverBin
  const name = normPartyName(dt.receiver?.name)
  return !!name && name === normPartyName(dt.declarantName)
}

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

/** Начало банковских реквизитов или контактов в адресе стороны (как normalize._BANK_TAIL Zircon AI). */
const BANK_TAIL = /(?:^|[\s,;(])(?:ИИК|IBAN|БИК|БСК|SWIFT|банк(?!овск)[\p{L}]*|bank\b|р\/с|тел\b|тел\.|tel\b|tel\.|phone|e-?mail)|(?<![A-Z0-9])KZ\d{2}[0-9A-Z]{16}/iu

/** Адрес без хвоста реквизитов: «…, УЛИЦА САРЫ-АРҚА, ИИК: KZ49… БИК: …» → «…, УЛИЦА САРЫ-АРҚА». */
export function withoutBankTail(address: string): string {
  const m = BANK_TAIL.exec(address)
  return (m ? address.slice(0, m.index) : address).replace(/[\s,;]+$/, '').trim()
}

/**
 * Адрес получателя созданной ДТ — не тот, что прислан (сервер взял адрес профиля компании клиента, В17): замечание «адрес
 * по БИН из реестра» тогда неверно (ревью 22.10).
 */
export function receiverAddressReplaced(
  sent: Pick<Import40DeclarationUpsert, 'receiver'>, created: Pick<Import40DeclarationDto, 'receiver'>,
): boolean {
  const n = (v: string | null | undefined) => (v ?? '').trim().toLocaleUpperCase('ru-RU')
  const a = sent.receiver
  const b = created.receiver
  return !!a && !!b && (n(a.region) !== n(b.region) || n(a.city) !== n(b.city) || n(a.street) !== n(b.street))
}

/**
 * Получатель гр. 8 по БИН из документов (правка 2.1, 22.10.2026): адрес — из ГБД ЮЛ (data.egov.kz, тот же поиск, что
 * «Найти по БИН» на странице ДТ); реестр не ответил — разбор адреса из документа (латиница-двойник в русских словах
 * «Kазаxстан», «Θтешкали» исправляется). Только адрес: имя — из документа (сервер заменит его профилем, если это
 * компания клиента). КАТО по адресу не подбирается (несколько совпадений по названию — декларант выбирает сам).
 */
export async function resolveReceiverAddress(
  bin: string | null | undefined, docAddress: string | null | undefined, notes: DocumentsNote[],
): Promise<{ region: string | null; district: string | null; city: string | null; street: string | null; house: string | null; apt: string | null; nameFromRegistry: string | null } | null> {
  let address: string | null = null
  let nameFromRegistry: string | null = null
  if (bin && isBinLike(bin)) {
    try {
      const c = await companyLookupApi.byBin(bin)
      address = c.addressRu ?? c.addressKz ?? null
      nameFromRegistry = upperRu(c.nameRu ?? c.nameKz ?? null)
      if (address) notes.push({ key: 'receiverByBin', params: { bin } })
    } catch { /* реестр недоступен или БИН не найден — адрес из документа */ }
  }
  // Адрес из документа: «…область г.Атырау» без запятой перед городом, «почтовый индекс 060000» — не часть адреса гр. 8,
  // банковские реквизиты и контакты («ИИК: KZ…», «БИК», «Тел») — тоже (ревью 22.10: попадали в улицу гр. 8).
  if (!address && docAddress) {
    address = fixCyrillicLookalikes(withoutBankTail(docAddress))
      .replace(/,?\s*(?:почтовый\s+)?индекс\s*:?\s*\d{6}/giu, '')
      .replace(/([^,\s])\s+(?=(?:г\.|город\s))/giu, '$1, ')
  }
  if (!address) return nameFromRegistry ? { region: null, district: null, city: null, street: null, house: null, apt: null, nameFromRegistry } : null
  const p = parseKzAddress(address)
  return {
    region: upperRu(p.region), district: upperRu(p.district), city: upperRu(p.city), street: upperRu(p.street),
    house: upperRu(p.house), apt: upperRu(p.apt), nameFromRegistry,
  }
}

export interface DocumentsExtra {
  /** Названия видов документов (классификатор 2009) — «Вид документа» строк гр. 44. */
  docKindNames?: ReadonlyMap<string, string> | null
  countries?: readonly CountryOption[]
  /** В наборе есть CMR — гр. 44 02015 (см. DocumentsContext.road). */
  cmrInBatch?: boolean
}

export async function prepareDocumentsDeclaration(
  result: Import40ExtractionResult, docs: readonly ExcelDoc[], kase: DocumentsCase, packageKinds: readonly ClassifierItem[],
  extra: DocumentsExtra = {},
): Promise<DocumentsDeclaration> {
  const extras = result.extras ?? null
  const excel = applyExcelFallback(result.declaration, docs, {
    extras, transportMode: kase.transportMode ?? null, hasCaseContract: !!kase.foreignContractId,
    docKindNames: extra.docKindNames, countries: extra.countries, road: extra.cmrInBatch,
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
    ['hanDropped', noteCount(built.notes, 'hanDropped')], ['modelFromDescription', noteCount(built.notes, 'modelFromDescription')],
  ]
  for (const [key, n] of counts) if (n) notes.push({ key, params: { n } })
  const unknownUnits = noteDetails(built.notes, 'unknownUnit')
  if (unknownUnits.length) notes.push({ key: 'unknownUnits', params: { list: unknownUnits.join(', ') } })
  const unknownCountries = noteDetails(built.notes, 'unknownCountry')
  if (unknownCountries.length) notes.push({ key: 'unknownCountries', params: { list: unknownCountries.join(', ') } })
  const unknownPackaging = noteDetails(built.notes, 'unknownPackaging')
  if (unknownPackaging.length) notes.push({ key: 'unknownPackaging', params: { list: unknownPackaging.join(', ') } })
  if (excel.conflicts.length) notes.push({ key: 'docsConflicts', params: { n: excel.conflicts.length } })
  // Места текстом неоднозначны (коробки на поддоне, несколько чисел) — пусто, декларант укажет; итог мест не сошёлся (2.5).
  const ambiguous = noteDetails(built.notes, 'placesAmbiguous')
  if (ambiguous.length) {
    notes.push({ key: 'placesAmbiguous', params: { n: noteCount(built.notes, 'placesAmbiguous'), list: ambiguous.slice(0, 3).map((v) => `«${v}»`).join('; ') } })
  }
  if (excel.placesCheck) notes.push({ key: excel.placesCheck.unknown ? 'placesTotalUnknown' : 'placesTotal', params: { ...excel.placesCheck } })
  // Один документ с разными датами (e2e-5).
  for (const c of docDateConflicts(excel.rows, excel.doc44Items)) {
    notes.push({ key: 'docDates', params: { code: c.code, number: c.number, dates: c.dates.map((d) => (d.date ? d.date.split('-').reverse().join('.') : '—')).join(', ') } })
  }

  const [sender, receiverAddr] = await Promise.all([
    resolveSender(senderName, excel.senderAddress, notes),
    resolveReceiverAddress(excel.receiverBin, excel.receiverAddress, notes),
  ])
  // Получатель — ЗАГЛАВНЫМИ, как поля ДТ (совпал с компанией клиента — сервер возьмёт поля профиля); адрес — по БИН.
  const docReceiver = excel.preview.receiver
  const receiverName = upperRu(docReceiver?.name) ?? receiverAddr?.nameFromRegistry ?? null
  const receiver: Import40Party | null | undefined = receiverName || receiverAddr
    ? {
        ...(docReceiver ?? {}),
        name: receiverName,
        countryCode: docReceiver?.countryCode ?? (receiverAddr ? '398' : null),
        region: docReceiver?.region ?? receiverAddr?.region ?? null,
        city: docReceiver?.city ?? receiverAddr?.city ?? null,
        street: docReceiver?.street ?? receiverAddr?.street ?? null,
      }
    : docReceiver
  // Гр. 22 — сумма стоимости построенных товаров (e2e-3), а не ориентировочная сумма клиента из заявки.
  const goodsTotal = built.goods.some((g) => g.customsValue != null)
    ? Math.round(built.goods.reduce((s, g) => s + (g.customsValue ?? 0), 0) * 100) / 100
    : null
  const body = previewToUpsert({ ...excel.preview, receiver, totalInvoiceValue: goodsTotal ?? excel.preview.totalInvoiceValue ?? null }, {
    goods: built.goods, sender, receiverBin: excel.receiverBin, doc44Items: excel.doc44Items,
    receiverExtra: receiverAddr ? { district: receiverAddr.district, house: receiverAddr.house, apt: receiverAddr.apt } : null,
  })
  return { body, notes, usedExcelGoods: excel.usedExcelGoods, receiverName: excel.preview.receiver?.name ?? null }
}
