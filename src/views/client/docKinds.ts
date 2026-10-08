// Чек-лист документов на импорт (утверждён владельцем 09.10, доска Wizard). key = DocKind на сервере.
export type DocKind = 'invoice' | 'transport' | 'packing' | 'contract' | 'origin' | 'conformity' | 'permit' | 'other'
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
]

export const isDocKind = (v: unknown): v is DocKind =>
  typeof v === 'string' && ['invoice', 'transport', 'packing', 'contract', 'origin', 'conformity', 'permit', 'other'].includes(v)

/** Обязательные позиции чек-листа без файла — для подсказки перед отправкой (сервер требует лишь ≥1 файл). */
export const missingRequired = (kindsPresent: (string | null | undefined)[]): DocKindDef[] =>
  DOC_CHECKLIST.filter((d) => d.need === 'required' && !kindsPresent.includes(d.key))
