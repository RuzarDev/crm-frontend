import type { Import40TransportMeans } from '@/types/api'

// Вид транспорта гр. 25 / 26 по составу гр. 18 (классификатор 2004, правка декларантов №8, 21.10.2026): только голова —
// 30, голова с одним прицепом — 31, с несколькими прицепами — 32. То же правило на сервере — TransportComposition.cs
// (там же код ставится при создании ДТ и сверяется в готовности КЕДЕН); единицы транспорта — как в XML
// (KedenXmlExporter.TransportUnits). Таблица случаев общая с серверными тестами (TransportCompositionTests.cs).

export type RoadMode = '30' | '31' | '32'
export const ROAD_MODES: readonly RoadMode[] = ['30', '31', '32']

/** Автомобильный вид (30 / 31 / 32): только такие коды правило ставит, меняет и сверяет. */
export const isRoadMode = (code: string | null | undefined): boolean => (ROAD_MODES as readonly string[]).includes((code ?? '').trim())

/** Число прицепов у головы → код: 0 — 30, 1 — 31, больше — 32; null — состав неизвестен. */
export const modeByTrailers = (n: number | null): RoadMode | null => (n == null ? null : n === 0 ? '30' : n === 1 ? '31' : '32')

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

/**
 * Наибольшее число прицепов у одной головы (по сцепке — решение D1 по умолчанию) среди ТС с номером.
 * Голова начинает единицу, прицеп идёт к голове по «К голове»; не нашлась — к ближайшей голове выше, нет такой — к первой.
 * Старые записи (роль не задана ни у одной строки): строка с типом ТС после первой — прицеп предыдущей.
 * null — состав неизвестен: нет ТС с номером или нет ни одной головы.
 */
export function maxTrailersPerHead(means: readonly Import40TransportMeans[]): number | null {
  const rows = means.filter((m) => norm(m.number))
  if (!rows.length) return null
  if (rows.every((m) => m.isTrailer == null)) {
    const counts: number[] = []
    for (const m of rows) {
      if (norm(m.typeCode) && counts.length) counts[counts.length - 1]++
      else counts.push(0)
    }
    return Math.max(...counts)
  }
  const heads = rows.map((m, i) => ({ m, i })).filter((x) => x.m.isTrailer !== true)
  if (!heads.length) return null
  const counts = heads.map(() => 0)
  rows.forEach((t, i) => {
    if (t.isTrailer !== true) return
    const hn = norm(t.headNumber)
    let u = hn ? heads.findIndex((h) => norm(h.m.number) === hn) : -1
    if (u < 0) {
      u = 0
      heads.forEach((h, k) => { if (h.i < i) u = k })
    }
    counts[u]++
  })
  return Math.max(...counts)
}

/** Код гр. 25 / 26 по составу гр. 18; null — правило не применяется. */
export const compositionMode = (means: readonly Import40TransportMeans[]): RoadMode | null => modeByTrailers(maxTrailersPerHead(means))

/**
 * Код графы после смены состава гр. 18 (before → after). Код, выбранный вручную (не совпадал с правилом для прежнего
 * состава), не меняется — рядом предупреждение. Пустой код ставится только при прицепах (одна голова бывает и вагоном),
 * неавтомобильный (20, 10, 40 …) не трогается никогда.
 */
export function followComposition<T extends string | null | undefined>(current: T, before: RoadMode | null, after: RoadMode | null): T | RoadMode {
  const cur = (current ?? '').trim()
  if (!after || after === before) return current
  if (!cur) return after === '30' ? current : after
  if (!isRoadMode(cur)) return current
  return before == null || cur === before ? after : current
}
