// Чек-лист документов на импорт (утверждён владельцем 09.10, доска Wizard). key = DocKind на сервере.
// certificate (17.10) — ветеринарный/фитосанитарный сертификат, СГР: их просят при возврате на доработку по нетарифным мерам.
export type DocKind = 'invoice' | 'transport' | 'packing' | 'contract' | 'origin' | 'conformity' | 'permit' | 'certificate' | 'other'
export type DocNeed = 'required' | 'ifAny' | 'ifRequired'
export interface DocKindDef { key: Exclude<DocKind, 'other'>; need: DocNeed }

export const DOC_CHECKLIST: DocKindDef[] = [
  { key: 'invoice', need: 'required' },
  { key: 'transport', need: 'required' },
  { key: 'packing', need: 'required' },
  { key: 'contract', need: 'required' },
  { key: 'origin', need: 'ifAny' },
  { key: 'conformity', need: 'ifRequired' },
  { key: 'permit', need: 'ifRequired' },
  { key: 'certificate', need: 'ifRequired' },
]

/** Все виды документов клиента (сервер: Import40FileEndpoints.DocKinds); certificate — иной сертификат (запрос таможни). */
export const ALL_DOC_KINDS: DocKind[] = ['invoice', 'transport', 'packing', 'contract', 'origin', 'conformity', 'permit', 'certificate', 'other']

export const isDocKind = (v: unknown): v is DocKind =>
  typeof v === 'string' && ALL_DOC_KINDS.includes(v as DocKind)

/** Обязательные позиции чек-листа без файла — для подсказки перед отправкой (сервер требует лишь ≥1 файл). */
export const missingRequired = (kindsPresent: (string | null | undefined)[]): DocKindDef[] =>
  DOC_CHECKLIST.filter((d) => d.need === 'required' && !kindsPresent.includes(d.key))

// Подсказка вида по имени файла (01.11.2026, правки 30.10 п.4): клиент бросил «Контракт+от+29.07.2026г.pdf» в «Другие
// документы», и контракт не засчитался. Слова — без учёта регистра; «счёт» и латинские сокращения — отдельным словом
// (не «расчёт», не «inventory»). Совпало несколько видов («Invoice & packing list») — не угадываем: клиент выберет сам.
const GUESS_RULES: { kind: Exclude<DocKind, 'other'>; re: RegExp }[] = [
  { kind: 'contract', re: /контракт|contract|договор/ },
  { kind: 'invoice', re: /invoice|инвойс|(?<![а-я])сч[её]т|(?<![a-z])inv(?![a-z])/ },
  { kind: 'packing', re: /packing|упаков/ },
  { kind: 'transport', re: /(?<![a-z])cmr(?![a-z])|смгс|smgs|накладн|waybill|коносамент/ },
]

export const guessDocKind = (fileName: string): Exclude<DocKind, 'other'> | null => {
  const name = fileName.toLowerCase()
  const hits = GUESS_RULES.filter((r) => r.re.test(name)).map((r) => r.kind)
  return hits.length === 1 ? hits[0] : null
}
