import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { import40ContractApi, isDocumentActive, isDocumentEffective } from '@/api/import40Contract'

// Регистрация клиента = три шага «Моей компании»: реквизиты → договор → доверенность.
// Пока они не пройдены, заявку подать нельзя (сервер отвечает 403), поэтому клиент должен
// видеть, что осталось, на любой странице (владелец, 2026-09-28: «при первом заходе сразу
// видеть, что нужно завершить регистрацию»). Состояние общее для плашки, меню и страницы.

export type RegistrationStep = 'profile' | 'contract' | 'poa'

const loaded = ref(false)
const profileDone = ref(false)
const contractDone = ref(false)
// Клиент подписал договор, а AQNIET ещё нет — от клиента ничего не требуется, только ждать.
const contractAwaitingUs = ref(false)
const poaDone = ref(false)
let inflight: Promise<void> | null = null

export function useClientRegistration() {
  const authStore = useAuthStore()
  // Только клиенту Импорта 40: транзитному клиенту договор и доверенность здесь не нужны.
  const isClient = computed(() => (authStore.role || '').toLowerCase() === 'client' && authStore.clientHasModule('import40'))

  const refresh = async (): Promise<void> => {
    if (!isClient.value || !authStore.userId) return
    if (inflight) return inflight
    const clientId = authStore.userId
    inflight = (async () => {
      try {
        const [profile, contracts, poas] = await Promise.all([
          import40ContractApi.getProfile(clientId),
          import40ContractApi.listDocuments(clientId, 'contract'),
          import40ContractApi.listDocuments(clientId, 'poa'),
        ])
        profileDone.value = !!profile?.isComplete
        contractDone.value = contracts.some(isDocumentEffective)
        contractAwaitingUs.value = !contractDone.value
          && contracts.some((d) => d.status === 1 && d.clientSigned && !d.providerSigned)
        poaDone.value = poas.some(isDocumentActive)
        loaded.value = true
      } catch {
        // Не удалось узнать состояние — плашку не показываем, чтобы не пугать ложной тревогой.
        loaded.value = false
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  const complete = computed(() => profileDone.value && contractDone.value && poaDone.value)

  // Следующий шаг, который делает сам клиент; null — всё сделано или ждём AQNIET.
  const nextStep = computed<RegistrationStep | null>(() => {
    if (!profileDone.value) return 'profile'
    if (!contractDone.value && !contractAwaitingUs.value) return 'contract'
    if (!poaDone.value) return 'poa'
    return null
  })

  const doneCount = computed(() => [profileDone.value, contractDone.value, poaDone.value].filter(Boolean).length)

  return {
    isClient,
    loaded,
    complete,
    nextStep,
    doneCount,
    contractAwaitingUs,
    refresh,
  }
}
