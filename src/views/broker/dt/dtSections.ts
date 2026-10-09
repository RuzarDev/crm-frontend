// Разделы страницы ДТ (Импорт 40) и графы бланка в них — порядок как на доске волны 6.
// Отсюда же — сопоставление «графа → раздел» для счётчиков навигации и перехода «к недостающему»:
// по полю graph пункта готовности (сервер, Task 1), а если его нет — разбором номера графы
// из строки без учёта регистра (баг B7: раньше русские подстроки с учётом регистра, «Гр.8» уходило в «Общие»).

/** Имя маршрута страницы ДТ: адрес (?s=, ?item=) меняют только на нём (переход со страницы не трогает чужой ?item). */
export const DT_ROUTE = 'import-40-dt'

export type DtSectionKey =
  | 'number'
  | 'general'
  | 'parties'
  | 'countries'
  | 'transport'
  | 'finance'
  | 'customs'
  | 'goods'
  | 'docs'
  | 'dts'
  | 'closing'

export interface DtSectionDef {
  key: DtSectionKey
  /** Графы раздела в каноническом виде (normalizeGraph): цифры, «А», «В», «ДТС». */
  graphs: readonly string[]
}

export const DT_SECTIONS: readonly DtSectionDef[] = [
  { key: 'number', graphs: ['А'] },
  { key: 'general', graphs: ['1', '3', '4', '5', '6', '7'] },
  { key: 'parties', graphs: ['2', '8', '9', '14'] },
  { key: 'countries', graphs: ['11', '15', '16', '17'] },
  { key: 'transport', graphs: ['18', '19', '21', '25', '26'] },
  { key: 'finance', graphs: ['12', '20', '22', '23', '24'] },
  { key: 'customs', graphs: ['29', '30'] },
  { key: 'goods', graphs: ['31', '32', '33', '34', '35', '36', '37', '38', '39', '41', '42', '43', '45', '46', '47'] },
  { key: 'docs', graphs: ['40', '44'] },
  { key: 'dts', graphs: ['ДТС'] },
  { key: 'closing', graphs: ['48', '52', '54', 'В'] },
]

export const DT_SECTION_KEYS: readonly DtSectionKey[] = DT_SECTIONS.map((s) => s.key)

const SECTION_BY_GRAPH = new Map<string, DtSectionKey>(
  DT_SECTIONS.flatMap((s) => s.graphs.map((g) => [g, s.key] as const)),
)

// Латинские двойники букв граф бланка: «A» и «B» в тексте и в коде встречаются наравне с «А» и «В».
const LATIN_TO_CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С' }

/**
 * Номер графы в каноническом виде: без «гр.»/«графа», верхний регистр, латиница → кириллица,
 * подграфа отброшена («31.2» → «31»). Пусто — null.
 */
export function normalizeGraph(graph: string | null | undefined): string | null {
  if (graph == null) return null
  let g = graph.trim().toLocaleUpperCase('ru')
  g = g.replace(/^(ГРАФЫ|ГРАФА|ГР)\.?\s*/, '')
  if (!g) return null
  const num = /^(\d{1,2})(?:\.\d+)?$/.exec(g)
  if (num) return String(Number(num[1]))
  if (g.length === 1 && LATIN_TO_CYR[g]) return LATIN_TO_CYR[g]
  return g
}

/** Раздел графы; неизвестная — null. */
export function sectionForGraph(graph: string | null | undefined): DtSectionKey | null {
  const g = normalizeGraph(graph)
  return g ? (SECTION_BY_GRAPH.get(g) ?? null) : null
}

// «гр.8», «Гр. 30», «графы 44» — первое упоминание; перед «гр» не буква (Unicode-флаг — для кириллицы).
// Номер — одна-две цифры, за которыми не цифра: «гр.31.2» → 31 (подграфа отбрасывается), «гр.123» — не графа.
const GRAPH_IN_TEXT = /(?:^|[^\p{L}])гр(?:афы|афа|\.)?\s*(\d{1,2})(?!\d)/iu

/**
 * Запасной путь, когда сервер не прислал items: номер графы из текста пункта (регистр не важен).
 * «ДТС: …» → «ДТС»; «Орган подачи декларации» → «А» (код поста — в номере ДТ).
 */
export function graphFromText(text: string): string | null {
  if (/^\s*ДТС\s*:/iu.test(text)) return 'ДТС'
  const m = GRAPH_IN_TEXT.exec(text)
  if (m) return String(Number(m[1]))
  if (/орган подачи/iu.test(text)) return 'А'
  return null
}

/** «Товар N: …» (сервер нумерует с 1) → индекс товара с 0; иначе null. */
export function goodsIndexFromText(text: string): number | null {
  const m = /^\s*товар\s+(\d+)/iu.exec(text)
  return m ? Number(m[1]) - 1 : null
}

export interface ReadinessItemLike {
  text: string
  graph?: string | null
  goodsIndex?: number | null
}

/**
 * Раздел пункта готовности: графа с сервера → товар (goodsIndex или «Товар N:») → графа из текста → «Общие».
 */
export function sectionForReadinessItem(item: ReadinessItemLike): DtSectionKey {
  const byGraph = sectionForGraph(item.graph)
  if (byGraph) return byGraph
  if (item.goodsIndex != null || goodsIndexFromText(item.text) != null) return 'goods'
  return sectionForGraph(graphFromText(item.text)) ?? 'general'
}
