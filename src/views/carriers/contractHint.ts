import type { CarrierContractRef } from '@/api/carriers'
import { formatDay } from '@/views/broker/list'

type T = (key: string, params?: Record<string, unknown>) => string

/** Срок договора перевозки: «договор до 01.12.2026», «договор истекает через 5 дн.», «договор истёк», «договор бессрочный». */
export function contractHint(c: CarrierContractRef, t: T): string {
  switch (c.status) {
    case 'unlimited':
      return t('carriers.contract.unlimited')
    case 'expired':
      return t('carriers.contract.expired', { date: formatDay(c.validUntil!) })
    case 'expiring':
      return c.daysLeft === 0 ? t('carriers.contract.today') : t('carriers.contract.expiring', { n: c.daysLeft ?? 0 })
    default:
      return t('carriers.contract.until', { date: formatDay(c.validUntil!) })
  }
}
