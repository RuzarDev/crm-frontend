import { safeInternalPath } from './safePath'

// «Назад» туда, откуда пришли (30.10.2026, аудит S-6/C-15): карточку контракта или перевозчика открывают из заявки
// (поставки) или ДТ с ?from=<путь>. Только свой путь (safeInternalPath); подпись — по виду страницы.
type T = (key: string) => string

export function backFrom(raw: unknown, isClient: boolean, t: T): { to: string; label: string } | null {
  const to = safeInternalPath(raw)
  if (!to) return null
  const path = to.split(/[?#]/)[0]
  if (/^\/import-40\/[^/]+\/dt\/[^/]+$/.test(path)) return { to, label: t('common.backToDt') }
  if (/^\/import-40\/[^/]+$/.test(path) && path !== '/import-40/new' && path !== '/import-40/company' && path !== '/import-40/manage') {
    return { to, label: t(isClient ? 'common.backToShipment' : 'common.backToCase') }
  }
  return { to, label: t('common.back') }
}
