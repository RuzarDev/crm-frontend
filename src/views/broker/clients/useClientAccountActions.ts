import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clientsOnboardingApi, type ClientOnboardingRow } from '@/api/clientsOnboarding'
import type { ZDropdownItem } from '@/components/z/ZDropdown.vue'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { InviteReissue } from './InviteClientModal.vue'

/** Что нужно о клиенте: строка списка «Клиенты» или карточка клиента. */
export type ClientAccount = Pick<ClientOnboardingRow, 'id' | 'status' | 'email' | 'username' | 'bin' | 'companyName' | 'phone'>

/**
 * Действия с аккаунтом клиента (05.11.2026): «Новая ссылка», «Заблокировать», «Разблокировать» — одни и те же права,
 * условия и подтверждения в меню строки «Клиентов» и в меню ⋯ карточки. reload — перечитать экран после действия.
 * Окно приглашения рисует экран: <InviteClientModal v-if="canInvite" :open="inviteOpen" :reissue="reissue" …>.
 */
export function useClientAccountActions(reload: () => unknown) {
  const { t } = useI18n()
  const auth = useAuthStore()
  const { confirm } = useConfirm()

  const canInvite = computed(() => auth.hasPermission('clients.invite'))
  const canManage = computed(() => auth.hasPermission('clients.manage'))

  const accountItems = (c: Pick<ClientAccount, 'status'>): ZDropdownItem[] => [
    ...(canInvite.value && c.status === 'Invited' ? [{ key: 'reissue', label: t('broker.clients.action.newLink') }] : []),
    ...(canManage.value && c.status !== 'Blocked' ? [{ key: 'block', label: t('broker.clients.action.block'), danger: true, divider: true }] : []),
    ...(canManage.value && c.status === 'Blocked' ? [{ key: 'unblock', label: t('broker.clients.action.unblock') }] : []),
  ]

  const inviteOpen = ref(false)
  const reissue = ref<InviteReissue | null>(null)
  const openInvite = () => { reissue.value = null; inviteOpen.value = true }
  const onInviteOpen = (open: boolean) => {
    inviteOpen.value = open
    if (!open) reissue.value = null
  }

  const reissueLink = async (c: ClientAccount) => {
    const yes = await confirm({
      title: t('broker.clients.reissue.title'),
      content: t('broker.clients.reissue.text'),
      okText: t('broker.clients.reissue.ok'),
      cancelText: t('admin.otmena'),
    })
    if (!yes) return
    reissue.value = { email: c.email ?? c.username, bin: c.bin ?? '', companyName: c.companyName ?? '', phone: c.phone ?? '' }
    inviteOpen.value = true
  }

  // Блокировка и разблокировка: при ошибке тост показал перехватчик — экран не перечитываем.
  const toggleBlock = async (c: Pick<ClientAccount, 'id'>, block: boolean) => {
    if (block) {
      const yes = await confirm({
        title: t('admin.zablokirovatKlientaOnNe'),
        okText: t('admin.zablokirovat'),
        cancelText: t('admin.otmena'),
        danger: true,
      })
      if (!yes) return
    }
    try {
      await (block ? clientsOnboardingApi.block(c.id) : clientsOnboardingApi.unblock(c.id))
    } catch {
      return
    }
    message.success(t(block ? 'admin.klientZablokirovan' : 'admin.klientRazblokirovan'))
    await reload()
  }

  /** Пункт меню из accountItems: true — обработан здесь. */
  const onAccountAction = (c: ClientAccount, key: string): boolean => {
    if (key === 'reissue') void reissueLink(c)
    else if (key === 'block') void toggleBlock(c, true)
    else if (key === 'unblock') void toggleBlock(c, false)
    else return false
    return true
  }

  return { canInvite, canManage, accountItems, inviteOpen, reissue, openInvite, onInviteOpen, onAccountAction }
}
