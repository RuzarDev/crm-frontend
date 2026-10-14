import type { TnvedNonTariffAmendmentDto, TnvedNonTariffMeasureDto } from '@/types/api'
import { FEATURE_CODE_RE, normalizeFeatureCode } from '@/utils/nonTariffCodes'

// Нетарифные меры кода «как в справке D-Sector»: разделы по виду документа КЕДЕН, внутри — акты
// (ссылка «Решение … №299 от 28.05.2010 с изменениями …», заголовок акта), под актом — документы
// (что требуется), под документом — конкретные товары кода. Строка перечня мер нетарифного
// регулирования «Документ запретов или ограничений» несёт коды гр. 33 — их показываем одной строкой.

export type MeasureSectionKey = 'restrictions' | 'preferences' | 'others' | 'required'
export type MeasureGrouping = 'docType' | 'required'

export interface MeasureAct {
  key: string
  name: string | null
  number: string | null
  date: string | null
  url: string | null
  title: string | null
  amendments: TnvedNonTariffAmendmentDto[]
  /** Документы акта (без строки с кодами гр. 33). */
  docs: TnvedNonTariffMeasureDto[]
  /** Коды гр. 33 из «Документ запретов или ограничений»: без повторов, по порядку. */
  gr33: string[]
}

export interface MeasureSection {
  key: MeasureSectionKey
  acts: MeasureAct[]
  /** Сколько документов в разделе (строка кодов гр. 33 — один документ). */
  count: number
}

export const GR33_DOC_NAME = 'документ запретов или ограничений'

/** Документ перечня мер нетарифного регулирования, чьи «товары» — коды гр. 33 (D0110, C1700…). */
export function isGr33Doc(m: TnvedNonTariffMeasureDto): boolean {
  const goods = m.goods ?? []
  return m.name.trim().toLowerCase() === GR33_DOC_NAME
    && goods.length > 0
    && goods.every((g) => FEATURE_CODE_RE.test(normalizeFeatureCode(g)))
}

export function sectionOf(docType: string, by: MeasureGrouping): MeasureSectionKey {
  if (docType === 'PREFERENCE') return 'preferences'
  if (by === 'required') return 'required'
  return docType === 'RESTRICTION' ? 'restrictions' : 'others'
}

const ORDER: Record<MeasureGrouping, MeasureSectionKey[]> = {
  docType: ['restrictions', 'preferences', 'others'],
  required: ['required', 'preferences'],
}

/** «2010-05-28» → «28.05.2010» (без Date — без сдвига часового пояса). */
export function formatActDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null
}

/** «№ 1204» → «1204»: знак номера добавляет шаблон строки акта. */
export function cleanActNumber(n: string | null | undefined): string | null {
  const s = (n ?? '').replace(/^\s*№\s*/, '').trim()
  return s || null
}

const actKey = (m: TnvedNonTariffMeasureDto) =>
  m.resolutionId || [m.resolutionName, m.resolutionNumber, m.resolutionDate, m.resolutionUrl].map((x) => x ?? '').join('|')

const codeSort = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

export function groupMeasures(measures: TnvedNonTariffMeasureDto[] | null | undefined, by: MeasureGrouping = 'docType'): MeasureSection[] {
  const sections = new Map<MeasureSectionKey, { acts: Map<string, MeasureAct>; count: number }>()

  for (const m of measures ?? []) {
    const sKey = sectionOf(m.docType, by)
    let section = sections.get(sKey)
    if (!section) sections.set(sKey, (section = { acts: new Map(), count: 0 }))

    const key = actKey(m)
    let act = section.acts.get(key)
    if (!act) {
      act = {
        key,
        // «Перечень товаров, к которым применяются меры …регулирования.» — точка перед «№1» лишняя
        name: m.resolutionName?.trim().replace(/\.+$/, '') || null,
        number: cleanActNumber(m.resolutionNumber),
        date: formatActDate(m.resolutionDate),
        url: m.resolutionUrl ?? null,
        title: m.resolutionTitle?.trim() || null,
        amendments: [],
        docs: [],
        gr33: [],
      }
      section.acts.set(key, act)
    }
    for (const a of m.amendments ?? [])
      if (!act.amendments.some((x) => x.name === a.name && x.number === a.number && x.date === a.date)) act.amendments.push(a)

    if (isGr33Doc(m)) {
      if (!act.gr33.length) section.count += 1
      for (const g of m.goods ?? []) {
        const code = normalizeFeatureCode(g)
        if (!act.gr33.includes(code)) act.gr33.push(code)
      }
      act.gr33.sort(codeSort)
    } else {
      act.docs.push(m)
      section.count += 1
    }
  }

  return ORDER[by]
    .filter((k) => sections.has(k))
    .map((k) => ({ key: k, acts: [...sections.get(k)!.acts.values()], count: sections.get(k)!.count }))
}

/** Товары документа: без пустых и повторов (сервер уже чистит — на случай старых строк). */
export function goodsOf(m: TnvedNonTariffMeasureDto): string[] {
  const out: string[] = []
  for (const g of m.goods ?? []) {
    const s = g.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}
