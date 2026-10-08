import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({
  invite: vi.fn(), lookup: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: { invite: api.invite } }))
vi.mock('@/composables/useBinLookup', () => ({ useBinLookup: () => ({ loading: ref(false), lookup: api.lookup }) }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import InviteClientModal from '../InviteClientModal.vue'
import { useAuthStore } from '@/stores/auth'

const ModalStub = {
  props: ['open', 'okButtonProps', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><div data-footer><slot name="footer"><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></slot></div></div>',
}

let w: VueWrapper
const mountModal = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(InviteClientModal, { props: { open: true, ...props }, attachTo: document.body, global: { stubs: { ZModal: ModalStub } } })
  await flushPromises()
}
const as = (role: string) => { useAuthStore().role = role }
const fill = async (email: string, bin: string) => {
  await w.get('[data-invite-email]').setValue(email)
  await w.get('[data-invite-bin]').setValue(bin)
}
const service = () => w.findAll('[data-invite-service] button').find((b) => b.attributes('data-state') === 'on')?.text()
const RESPONSE = { clientId: 'c1', invitePath: '/invite/tok123', expiresAtUtc: '2026-10-15T04:00:00Z', reissued: false }

beforeEach(() => {
  setActivePinia(createPinia())
  as('sales')
  api.invite.mockResolvedValue(RESPONSE)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('InviteClientModal: форма', () => {
  it('«Создать приглашение» неактивна, пока нет email и 12 цифр БИН', async () => {
    await mountModal()
    const disabled = () => w.get('[data-ok]').attributes('disabled') !== undefined
    expect(disabled()).toBe(true)
    await w.get('[data-invite-email]').setValue('client@company.kz')
    expect(disabled()).toBe(true)
    await w.get('[data-invite-bin]').setValue('16044001234')
    expect(disabled()).toBe(true)
    await w.get('[data-invite-bin]').setValue('160440012345')
    expect(disabled()).toBe(false)
  })

  it('неверный email и неполный БИН — ошибки по месту после ухода из поля', async () => {
    await mountModal()
    expect(w.text()).not.toContain('Введите корректный email')
    await w.get('[data-invite-email]').setValue('client@company')
    await w.get('[data-invite-email]').trigger('blur')
    expect(w.text()).toContain('Введите корректный email')
    await w.get('[data-invite-bin]').setValue('1604')
    await w.get('[data-invite-bin]').trigger('blur')
    expect(w.text()).toContain('БИН — 12 цифр')
    await w.get('[data-invite-email]').setValue('client@company.kz')
    expect(w.text()).not.toContain('Введите корректный email')
  })

  it('неверный email при отправке: запроса нет, ошибка видна', async () => {
    await mountModal()
    await fill('client@company', '160440012345')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.invite).not.toHaveBeenCalled()
    expect(w.text()).toContain('Введите корректный email')
  })

  it('БИН — только цифры, до 12', async () => {
    await mountModal()
    const bin = w.get('[data-invite-bin]')
    await bin.setValue('ab16-04 40012345678')
    await flushPromises()
    expect((bin.element as HTMLInputElement).value).toBe('160440012345')
  })

  it('экспедитору по умолчанию «Транзит», остальным «Импорт 40»', async () => {
    as('expeditor')
    await mountModal()
    expect(service()).toBe('Транзит')
    w.unmount()
    as('rop')
    await mountModal()
    expect(service()).toBe('Импорт 40')
  })

  it('поиск по БИН подставляет название компании', async () => {
    api.lookup.mockResolvedValue({ bin: '160440012345', nameRu: 'ТОО «Найдено»', nameKz: null })
    await mountModal()
    expect(w.get('[data-invite-bin-find]').attributes('disabled')).toBeDefined()
    await w.get('[data-invite-bin]').setValue('160440012345')
    await w.get('[data-invite-bin-find]').trigger('click')
    await flushPromises()
    expect(api.lookup).toHaveBeenCalledWith('160440012345')
    expect((w.get('[data-invite-company]').element as HTMLInputElement).value).toBe('ТОО «Найдено»')
  })
})

describe('InviteClientModal: результат', () => {
  it('успех: приглашение отправлено с очищенными данными, ссылка origin + invitePath', async () => {
    await mountModal()
    await fill('  client@company.kz ', '1604 4001 2345')
    await w.get('[data-invite-company]').setValue('  ТОО «Новое»  ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.invite).toHaveBeenCalledWith({
      email: 'client@company.kz', bin: '160440012345', companyName: 'ТОО «Новое»', phone: null, service: 'import40',
    })
    expect(w.text()).toContain('Приглашение создано')
    expect((w.get('[data-invite-url]').element as HTMLInputElement).value).toBe(`${window.location.origin}/invite/tok123`)
    expect(w.emitted('invited')).toEqual([[RESPONSE]])
  })

  it('«Скопировать» кладёт ссылку в буфер и показывает тост; без буфера — просьба скопировать вручную', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await mountModal()
    await fill('client@company.kz', '160440012345')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    await w.get('[data-invite-copy]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/tok123`)
    expect(api.toast.success).toHaveBeenCalledWith('Ссылка скопирована')
    writeText.mockRejectedValueOnce(new Error('denied'))
    await w.get('[data-invite-copy]').trigger('click')
    await flushPromises()
    expect(api.toast.warning).toHaveBeenCalledWith('Скопируйте ссылку вручную')
  })

  it('«Пригласить ещё» сбрасывает форму', async () => {
    as('expeditor')
    await mountModal()
    await fill('client@company.kz', '160440012345')
    await w.get('[data-invite-company]').setValue('ТОО')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.find('[data-invite-form]').exists()).toBe(false)
    await w.get('[data-invite-again]').trigger('click')
    expect(w.find('[data-invite-result]').exists()).toBe(false)
    expect((w.get('[data-invite-email]').element as HTMLInputElement).value).toBe('')
    expect((w.get('[data-invite-bin]').element as HTMLInputElement).value).toBe('')
    expect((w.get('[data-invite-company]').element as HTMLInputElement).value).toBe('')
    expect(service()).toBe('Транзит')
  })

  it('ошибка сервера: окно остаётся с формой (тост показал перехватчик)', async () => {
    api.invite.mockRejectedValueOnce(new Error('409'))
    await mountModal()
    await fill('client@company.kz', '160440012345')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.find('[data-invite-form]').exists()).toBe(true)
    expect(w.emitted('invited')).toBeUndefined()
    expect(api.toast.error).not.toHaveBeenCalled()
  })
})

describe('InviteClientModal: новая ссылка', () => {
  it('reissue заполняет форму и сразу отправляет; результат — «Ссылка перевыпущена»', async () => {
    api.invite.mockResolvedValue({ ...RESPONSE, reissued: true })
    await mountModal({ reissue: { email: 'import@nomad.kz', bin: '170940022456', companyName: 'ТОО «Nomad»', phone: '+7 700 111 22 33' } })
    expect(api.invite).toHaveBeenCalledWith({
      email: 'import@nomad.kz', bin: '170940022456', companyName: 'ТОО «Nomad»', phone: '+7 700 111 22 33', service: 'import40',
    })
    expect(w.text()).toContain('Ссылка перевыпущена')
  })

  it('ошибка при перевыпуске: форма остаётся заполненной', async () => {
    api.invite.mockRejectedValueOnce(new Error('409'))
    await mountModal({ reissue: { email: 'import@nomad.kz', bin: '170940022456', companyName: '', phone: '' } })
    expect(w.find('[data-invite-form]').exists()).toBe(true)
    expect((w.get('[data-invite-email]').element as HTMLInputElement).value).toBe('import@nomad.kz')
  })
})
