import { useI18n } from 'vue-i18n'
import { useClassifiersStore } from '@/stores/classifiers'
import { taxModeLabelKey } from '../goods/editor/payments'

/**
 * Подпись вида платежа: 1010 / 2010 / 2050 / 5060 / акциз 4xxx — свои подписи (как в карточке товара), прочие — название
 * из классификатора tax-modes; нет ни того, ни другого — пусто.
 */
export function useModeLabel() {
  const { t, te } = useI18n()
  const classifiers = useClassifiersStore()
  return (code: string | null | undefined): string => {
    const key = taxModeLabelKey(code)
    if (key && te(`broker.dt.goods.editor.payments.modes.${key}`)) return t(`broker.dt.goods.editor.payments.modes.${key}`)
    return code ? classifiers.cache['tax-modes']?.find((c) => c.code === code)?.nameRu ?? '' : ''
  }
}
