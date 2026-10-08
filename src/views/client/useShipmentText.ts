import { useI18n } from 'vue-i18n'
import type { ClientShipment } from '@/api/clientShipments'
import { formatMoney } from '@/ui/number'
import { shortWhen } from '@/views/home/brokerHome'
import { dayMonth } from '@/views/home/clientHome'
import { TOTAL_STEPS, askFor, shipmentTag, stepNo } from '@/views/client/shipment'

/** Подписи поставки в словаре клиента — общие для строки списка и карточек «Главной». */
export function useShipmentText() {
  const { t } = useI18n()
  const closed = (s: ClientShipment) => s.status >= 8

  /** Текст тега (client.tag.*). */
  const tagText = (s: ClientShipment) => t(`client.tag.${shipmentTag(s).key}`)

  /** Подпись под полосой этапов: ход клиента — что сделать; закрытая — дата; иначе — название этапа. */
  const caption = (s: ClientShipment) => {
    const ask = askFor(s)
    if (ask) return t(`client.ask.${ask}.title`)
    if (closed(s)) return t('client.row.closedOn', { date: dayMonth(s.updatedAtUtc) })
    return t(`enum.stepClient.s${stepNo(s)}`)
  }

  /** Текст полосы для чтения с экрана: «Этап n из 6 · название»; у закрытой — её итог. */
  const stepLabel = (s: ClientShipment) => {
    if (closed(s)) return tagText(s)
    const n = stepNo(s)
    return t('client.stepOf', { n, total: TOTAL_STEPS, name: t(`enum.stepClient.s${n}`) })
  }

  /** Пояснение к вопросу «Нужно от вас». */
  const askText = (s: ClientShipment) => {
    switch (askFor(s)) {
      case 'problem': return s.problemClientMessage || s.cargo
      case 'returned': return s.returnReason
      case 'draft': return t('client.ask.draft.text')
      case 'paySvh':
        return s.svhInvoiceAmount
          ? t('client.ask.paySvh.text', { sum: formatMoney(s.svhInvoiceAmount) })
          : t('client.ask.paySvh.textNoSum')
      default: return ''
    }
  }

  /** Когда менялась: сегодня — время, вчера — «вчера», иначе ДД.ММ. */
  const when = (s: ClientShipment, now = new Date()) => shortWhen(s.updatedAtUtc, now, t('home.yesterday'))

  return { tagText, caption, stepLabel, askText, when }
}
