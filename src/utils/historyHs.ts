import type { Import40ExtractionResult } from '@/api/import40'

/** Сколько позиций разбора получили код ТН ВЭД из истории клиента (extras.goods[].hsFromHistory, 26.11.2026). */
export function historyHsCount(result: Pick<Import40ExtractionResult, 'extras'> | null | undefined): number {
  return result?.extras?.goods?.filter((g) => g.hsFromHistory).length ?? 0
}
