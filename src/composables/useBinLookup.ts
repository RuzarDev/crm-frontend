import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from '@/ui/message'
import { companyLookupApi, isBinLike, type CompanyLookupDto } from '@/api/companyLookup'

/**
 * Поиск карточки по БИН/ИИН: юрлицо — из ГБД ЮЛ (data.egov.kz), ИП — из КГД. Результат и ошибки показывает
 * сам (тосты по статусу ответа), что подставлять из карточки — решает вызывающий (у профиля, мастера, граф ДТ
 * и регистрации разный набор полей). null — ошибка или строка не похожа на БИН (тогда без запроса).
 * anonymous — публичный эндпоинт (регистрация, без токена; rate-limit по IP). Читается при каждом поиске:
 * можно передать объект с геттером на prop.
 */
export function useBinLookup(opts: { anonymous?: boolean } = {}) {
  const { t } = useI18n()
  const loading = ref(false)

  const lookup = async (bin: string | null | undefined): Promise<CompanyLookupDto | null> => {
    if (!isBinLike(bin)) return null
    loading.value = true
    try {
      const company = await companyLookupApi.byBin(bin!, opts.anonymous ?? false)
      const name = company.nameRu ?? company.nameKz ?? company.bin
      if (company.isActive === false) {
        // ИП/юрлицо прекратило деятельность — данные подставлены, но декларант должен это увидеть.
        message.warning({ content: t('binLookup.inactive', { name, status: company.statusRu ?? '' }), duration: 8 })
      } else if (company.kind === 'ip') {
        message.success(t('binLookup.foundIp', { name }))
      } else {
        const status = company.statusRu ? ` · ${company.statusRu}` : ''
        message.success(t('binLookup.found', { name: `${name}${status}` }))
      }
      return company
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } }
      const st = err.response?.status
      const text = err.response?.data?.error
      if (st === 404) message.warning(text ?? t('binLookup.notFound'))
      else if (st === 503) message.error(text ?? t('binLookup.notConfigured'))
      else if (st === 400) message.warning(text ?? t('binLookup.badBin'))
      else message.error(text ?? t('binLookup.unavailable'))
      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, lookup }
}
