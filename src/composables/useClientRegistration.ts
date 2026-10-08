import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { import40Api, type Import40CanCreateDto } from '@/api/import40'
import { import40ContractApi, type Import40DocumentDto } from '@/api/import40Contract'

// Регистрация клиента = три шага «Моей компании»: реквизиты → договор → доверенность.
// Пока они не пройдены, заявку подать нельзя (сервер отвечает 403), поэтому клиент должен
// видеть, что осталось, на любой странице (владелец, 2026-09-28: «при первом заходе сразу
// видеть, что нужно завершить регистрацию»). Состояние общее для плашки, меню и страницы.
//
// Аудит 5.3/5.4: раньше плашка, «Моя компания» и «Мои заявки» считали это каждый по-своему
// (разные наборы документов/полей) и противоречили друг другу. Теперь единственный источник
// истины — GET import40/can-create, та же проверка, что использует сам POST import40.

export type RegistrationStep = 'profile' | 'contract' | 'poa'

const loaded = ref(false)
const state = ref<Import40CanCreateDto | null>(null)
// Клиент подписал договор, а AQNIET ещё нет — от клиента ничего не требуется, только ждать.
// can-create этого не различает (contractOk = false в обоих случаях: занят и «ждём подписи»),
// поэтому для текста плашки отдельно смотрим документы.
const contractAwaitingUs = ref(false)
let inflight: Promise<void> | null = null
// Поколение состояния: reset() его увеличивает, и ответ запроса, ушедшего до выхода, уже не запишется
// (следующий пользователь в этой вкладке не увидит чужой статус регистрации).
let generation = 0

/** Выход из системы: забыть состояние регистрации прежнего клиента. */
export function resetClientRegistration(): void {
  generation += 1
  state.value = null
  loaded.value = false
  contractAwaitingUs.value = false
  inflight = null
}

export function useClientRegistration() {
  const authStore = useAuthStore()
  // Только клиенту Импорта 40: транзитному клиенту договор и доверенность здесь не нужны.
  const isClient = computed(() => authStore.isClient && authStore.clientHasModule('import40'))

  /**
   * Перечитать состояние регистрации.
   * - silent — без тоста перехватчика: экран сам показывает ошибку по месту («Моя компания»);
   * - contracts — список договоров, который экран уже запрашивает сам: не запрашиваем его второй раз.
   */
  const refresh = async (
    opts: { silent?: boolean; contracts?: Promise<Import40DocumentDto[]> } = {},
  ): Promise<void> => {
    if (!isClient.value || !authStore.userId) return
    if (inflight) return inflight
    const clientId = authStore.userId
    const gen = generation
    const run = async () => {
      try {
        const [canCreate, contracts] = await Promise.all([
          opts.silent ? import40Api.canCreate({ silent: true }) : import40Api.canCreate(),
          opts.contracts
            ?? (opts.silent
              ? import40ContractApi.listDocuments(clientId, 'contract', { silent: true })
              : import40ContractApi.listDocuments(clientId, 'contract')),
        ])
        if (gen !== generation) return
        state.value = canCreate
        contractAwaitingUs.value = !canCreate.contractOk
          && contracts.some((d) => d.status === 1 && d.clientSigned && !d.providerSigned)
        loaded.value = true
      } catch {
        if (gen !== generation) return
        // Не удалось узнать состояние — плашку не показываем, чтобы не пугать ложной тревогой,
        // и не держим прежний снимок: экраны не должны опираться на устаревшее состояние.
        state.value = null
        contractAwaitingUs.value = false
        loaded.value = false
      }
    }
    // Колбэк finally всегда асинхронный — request к этому моменту уже присвоен. Чужой (после reset) не трогаем.
    const request: Promise<void> = run().finally(() => { if (inflight === request) inflight = null })
    inflight = request
    return request
  }

  const complete = computed(() => !!state.value?.canCreate)
  const reason = computed(() => state.value?.reason ?? null)
  const needNew = computed(() => state.value?.needNew ?? null)
  const profileDone = computed(() => !!state.value?.profileComplete)
  const contractDone = computed(() => !!state.value?.contractOk)
  const poaDone = computed(() => !!state.value?.poaOk)

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
    reason,
    needNew,
    nextStep,
    doneCount,
    profileDone,
    contractDone,
    poaDone,
    contractAwaitingUs,
    refresh,
    reset: resetClientRegistration,
  }
}
