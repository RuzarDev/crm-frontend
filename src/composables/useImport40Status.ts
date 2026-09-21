import { useI18n } from 'vue-i18n'
import { IMPORT40_STATUSES } from '@/api/import40'

// Подписи статусов Импорт 40 по текущей локали (enum.import40Status.<key>).
// IMPORT40_STATUSES.short остаётся RU-эталоном для экранов без i18n и для поиска.
export function useImport40Status() {
  const { t } = useI18n()
  const statusLabel = (id: number): string => {
    const s = IMPORT40_STATUSES.find((x) => x.id === id)
    return s ? t(`enum.import40Status.${s.key}`) : t('enum.import40Status.unknown')
  }
  return { statusLabel }
}
