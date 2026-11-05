import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { import40ContractApi } from '@/api/import40Contract'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { validDate } from '@/views/client/company/company'

/**
 * «Продлить» многоразовый договор (30.10.2026): до 31.12 следующего года. Подтверждение и запрос одни на карточку клиента
 * и «Документы клиентов» (05.11.2026). extending — id документа, который продлевается сейчас; after — перечитать экран.
 */
export function useContractExtend(after: () => unknown) {
  const { t } = useI18n()
  const { confirm } = useConfirm()
  const extending = ref<string | null>(null)
  const extend = async (clientId: string, d: { id: string; number: string; year: number; validUntilUtc: string | null }) => {
    if (extending.value) return
    const ok = await confirm({
      title: t('broker.company.renewTitle', { no: `${d.number}/${d.year}` }),
      content: t('broker.company.renewConfirm', { date: `31.12.${new Date(d.validUntilUtc!).getUTCFullYear() + 1}` }),
      okText: t('broker.clientCard.doc.extend'),
    })
    if (!ok) return
    extending.value = d.id
    try {
      const renewed = await import40ContractApi.renewDocument(clientId, d.id, { silent: true })
      message.success(t('broker.clientCard.doc.extended', { date: validDate(renewed.validUntilUtc) }))
      await after()
    } catch (e) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data
      message.error(data?.error || t('broker.clientCard.doc.extendError'))
    } finally {
      extending.value = null
    }
  }
  return { extending, extend }
}
