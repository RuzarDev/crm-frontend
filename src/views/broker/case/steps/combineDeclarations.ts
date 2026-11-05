// Несколько вагонов — одна ДТ (05.11.2026): так работают декларанты, инвойс и накладная на вагон, товары и документы вместе.
// Файлы читаются по одному (иначе скан не успевает за предел времени), здесь их разборы собираются в одно тело создания ДТ.
import type { Import40DeclarationUpsert } from '@/api/import40'

type Doc44 = NonNullable<Import40DeclarationUpsert['doc44Items']>[number]
type Means = NonNullable<Import40DeclarationUpsert['arrivalTransportNumbers']>[number]

const docKey = (d: Doc44) => `${d.docTypeCode ?? ''}|${(d.docNumber ?? '').trim().toUpperCase()}`

const uniqueDocs = (docs: Doc44[]) => {
  const seen = new Set<string>()
  return docs.filter((d) => !seen.has(docKey(d)) && !!seen.add(docKey(d)))
}

const uniqueMeans = (means: Means[]) => {
  const seen = new Set<string>()
  return means.filter((m) => {
    const key = (m.number ?? '').trim().toUpperCase()
    return !key || (!seen.has(key) && !!seen.add(key))
  })
}

const blank = (v: unknown) => v == null || v === ''

/** Тела разборов → одно: шапка — первое непустое значение, товары и документы — все, стоимость — сумма. */
export function combineDeclarations(bodies: readonly Import40DeclarationUpsert[]): Import40DeclarationUpsert {
  const out: Record<string, unknown> = {}
  for (const body of bodies) {
    for (const [key, value] of Object.entries(body)) if (blank(out[key])) out[key] = value
  }
  const totals = bodies.map((b) => b.totalInvoiceValue)
  const arrival = uniqueMeans(bodies.flatMap((b) => b.arrivalTransportNumbers ?? []))
  const border = uniqueMeans(bodies.flatMap((b) => b.borderTransportNumbers ?? []))
  return {
    ...(out as Import40DeclarationUpsert),
    goodsItems: bodies.flatMap((b) => b.goodsItems ?? []),
    doc44Items: uniqueDocs(bodies.flatMap((b) => b.doc44Items ?? [])),
    totalInvoiceValue: totals.every((v) => v != null) ? totals.reduce<number>((sum, v) => sum + v!, 0) : null,
    arrivalTransportNumbers: arrival.length ? arrival : undefined,
    borderTransportNumbers: border.length ? border : undefined,
  }
}

/** Разные значения поля в разборах: валюта инвойсов должна совпадать, иначе стоимость одной ДТ сложена неверно. */
export function distinctCurrencies(bodies: readonly Import40DeclarationUpsert[]): string[] {
  return [...new Set(bodies.map((b) => b.currency?.trim().toUpperCase()).filter((c): c is string => !!c))]
}
