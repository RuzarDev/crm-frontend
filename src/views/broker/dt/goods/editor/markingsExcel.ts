import type { Import40GoodsMarking } from '@/types/api'

// Импорт маркировки гр. 31.13 из Excel — формат как в старой карточке товара (без шапки, первый лист):
// A — номер маркировки (код идентификации), B — код уровня, C — код идентификатора применения (Excel теряет ведущий
// ноль у «02» — дополняем до 2 знаков), D — код вида идентификации. Пустые строки пропускаются; флаги — «нет».

const cell = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim() || null)
const pad2 = (v: unknown): string | null => {
  const s = cell(v)
  return s == null ? null : s.length === 1 ? `0${s}` : s
}

/** Строки листа (sheet_to_json header: 1) → строки маркировки. */
export function parseMarkingsSheet(rows: readonly unknown[]): Import40GoodsMarking[] {
  const out: Import40GoodsMarking[] = []
  for (const r of rows) {
    if (!Array.isArray(r)) continue
    const number = cell(r[0])
    const levelCode = cell(r[1])
    const idApplicationCode = pad2(r[2])
    const idTypeCode = cell(r[3])
    if (!number && !levelCode && !idApplicationCode && !idTypeCode) continue
    out.push({ markingAfterRelease: false, kizCount: null, levelCode, idTypeCode, idApplicationCode, number, aggregated: false })
  }
  return out
}
