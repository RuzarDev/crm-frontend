import type { ClientDeclaration, ClientDeclarationStatus } from '@/api/clientDeclarations'
import type { ZTone } from '@/components/z/ZTag.vue'
import { normSearch } from '@/views/client/documents/documents'

// «Мои декларации» клиента (02.11.2026, пакет K): фильтр по статусу и поиск по номеру ДТ, поставки и товару.

export type DeclFilter = 'all' | 'released' | 'inWork' | 'refused'
export const DECL_FILTERS: DeclFilter[] = ['all', 'released', 'inWork', 'refused']
export const isDeclFilter = (v: unknown): v is DeclFilter => typeof v === 'string' && (DECL_FILTERS as string[]).includes(v)

// Условный выпуск — тоже выпуск (товар выпущен, клиент лишь доносит документ), поэтому во «Выпущены».
const FILTER_OF: Record<ClientDeclarationStatus, Exclude<DeclFilter, 'all'>> = {
  submitted: 'inWork',
  released: 'released',
  conditionalRelease: 'released',
  refused: 'refused',
  withdrawn: 'refused',
}
export const passesDeclFilter = (d: Pick<ClientDeclaration, 'status'>, f: DeclFilter): boolean =>
  f === 'all' || FILTER_OF[d.status] === f

export const STATUS_TONE: Record<ClientDeclarationStatus, ZTone> = {
  submitted: 'submitted',
  released: 'done',
  conditionalRelease: 'wait',
  refused: 'danger',
  withdrawn: 'neutral',
}

/** Поиск по подстроке (регистр и ё/е не важны): номер ДТ, номер поставки, товар. */
export function matchesDecl(d: Pick<ClientDeclaration, 'number' | 'caseNumber' | 'goods'>, needle: string): boolean {
  const n = normSearch(needle)
  if (!n) return true
  return [d.number, d.caseNumber, d.goods].some((v) => normSearch(v).includes(n))
}
