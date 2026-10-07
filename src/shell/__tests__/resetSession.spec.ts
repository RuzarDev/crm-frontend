import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Import40CanCreateDto } from '@/api/import40'

const api = vi.hoisted(() => ({
  canCreate: vi.fn(),
  listDocuments: vi.fn(),
  getUnreadCount: vi.fn(),
}))
vi.mock('@/api/import40', () => ({ import40Api: { canCreate: api.canCreate } }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: { listDocuments: api.listDocuments } }))
vi.mock('@/api/notifications', () => ({ notificationsApi: { getUnreadCount: api.getUnreadCount, list: vi.fn() } }))

import { resetSession, REG_REDIRECT_FLAG } from '@/shell/resetSession'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { useCommandPalette } from '@/shell/useCommandPalette'
import { homeAttention } from '@/shell/attention'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { useProfileStore } from '@/stores/profile'

const incomplete: Import40CanCreateDto = {
  canCreate: false, reason: 'contract', needNew: null, profileComplete: true, contractOk: false, poaOk: false,
}
const signedByClient = [{ status: 1, clientSigned: true, providerSigned: false }]

const asClient = (userId = 'c1') => {
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.userId = userId
}

beforeEach(() => {
  setActivePinia(createPinia())
  api.canCreate.mockResolvedValue(incomplete)
  api.listDocuments.mockResolvedValue(signedByClient)
  api.getUnreadCount.mockResolvedValue({ data: { count: 0 } })
})
afterEach(() => {
  resetSession()
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

describe('resetSession', () => {
  it('забывает уведомления, профиль, бейдж, регистрацию, палитру и флаг переадресации', async () => {
    asClient()
    const reg = useClientRegistration()
    await reg.refresh()
    expect(reg.loaded.value).toBe(true)
    expect(reg.contractAwaitingUs.value).toBe(true)
    expect(reg.profileDone.value).toBe(true)

    vi.useFakeTimers()
    const notif = useNotificationsStore()
    notif.unreadCount = 5
    notif.startPolling()
    useProfileStore().profile = { userId: 'c1', username: 'c', displayName: 'Клиент Один', phone: null, companyName: null, innBin: null, role: 'Client' }
    homeAttention.value = 2
    useCommandPalette().show()
    sessionStorage.setItem(REG_REDIRECT_FLAG, '1')

    resetSession()

    expect(notif.unreadCount).toBe(0)
    // Опрос остановлен: через две минуты ни одного запроса счётчика от прежнего пользователя.
    api.getUnreadCount.mockClear()
    vi.advanceTimersByTime(120_000)
    expect(api.getUnreadCount).not.toHaveBeenCalled()
    vi.useRealTimers()
    expect(useProfileStore().profile).toBeNull()
    expect(homeAttention.value).toBeNull()
    expect(useCommandPalette().open.value).toBe(false)
    expect(sessionStorage.getItem(REG_REDIRECT_FLAG)).toBeNull()
    expect(reg.loaded.value).toBe(false)
    expect(reg.contractAwaitingUs.value).toBe(false)
    expect(reg.profileDone.value).toBe(false)
    expect(reg.nextStep.value).toBe('profile')
  })

  it('недоступный sessionStorage не ломает выход', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    homeAttention.value = 1
    expect(() => resetSession()).not.toThrow()
    expect(homeAttention.value).toBeNull()
    remove.mockRestore()
  })
})

describe('useClientRegistration: сброс и ошибки', () => {
  it('ответ запроса, ушедшего до выхода, не записывается; следующий клиент запрашивает заново', async () => {
    asClient('c1')
    let resolve!: (v: Import40CanCreateDto) => void
    api.canCreate.mockReturnValueOnce(new Promise<Import40CanCreateDto>((r) => { resolve = r }))
    const reg = useClientRegistration()
    const pending = reg.refresh()

    resetSession()
    resolve({ ...incomplete, canCreate: true, contractOk: true, poaOk: true })
    await pending
    expect(reg.loaded.value).toBe(false)
    expect(reg.complete.value).toBe(false)

    // Следующий клиент в той же вкладке: прежний запрос не держит inflight — уходит новый.
    asClient('c2')
    await reg.refresh()
    expect(api.canCreate).toHaveBeenCalledTimes(2)
    expect(api.listDocuments).toHaveBeenLastCalledWith('c2', 'contract')
    expect(reg.loaded.value).toBe(true)
    expect(reg.contractAwaitingUs.value).toBe(true)
  })

  it('ошибка перечитывания стирает прежний снимок', async () => {
    asClient()
    const reg = useClientRegistration()
    api.canCreate.mockResolvedValueOnce({ ...incomplete, canCreate: true, contractOk: true, poaOk: true })
    await reg.refresh()
    expect(reg.complete.value).toBe(true)

    api.canCreate.mockRejectedValueOnce(new Error('500'))
    await reg.refresh()
    await flushPromises()
    expect(reg.loaded.value).toBe(false)
    expect(reg.complete.value).toBe(false)
    expect(reg.contractAwaitingUs.value).toBe(false)
  })

  it('isClient — через общий геттер стора (с пробелами и регистром)', () => {
    const auth = useAuthStore()
    auth.role = '  Client '
    expect(auth.isClient).toBe(true)
    expect(useClientRegistration().isClient.value).toBe(true)
    auth.role = 'Administrator'
    expect(auth.isClient).toBe(false)
    expect(useClientRegistration().isClient.value).toBe(false)
  })
})
