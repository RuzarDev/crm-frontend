import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientOnboardingRow } from '@/api/clientsOnboarding'

const api = vi.hoisted(() => ({
  list: vi.fn(), invite: vi.fn(), block: vi.fn(), unblock: vi.fn(), listDocuments: vi.fn(), exportXlsx: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/clientsOnboarding', () => ({
  clientsOnboardingApi: { list: api.list, invite: api.invite, block: api.block, unblock: api.unblock },
}))
vi.mock('@/api/import40Contract', () => ({
  import40ContractApi: { listDocuments: api.listDocuments, downloadDocument: vi.fn(), downloadDocumentSignedFile: vi.fn() },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/composables/useBinLookup', () => ({ useBinLookup: () => ({ loading: ref(false), lookup: vi.fn() }) }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import ClientsListView from '../ClientsListView.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'

// Панель и окно — заглушки (механика Reka не проверяется): состав экрана и запросы.
const DrawerStub = { props: ['open'], emits: ['update:open'], template: '<div v-if="open" data-drawer><slot name="title" /><slot /></div>' }
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}

const row = (o: Partial<ClientOnboardingRow>): ClientOnboardingRow => ({
  id: 'x', username: 'login', email: null, companyName: null, bin: null, phone: null, status: 'Active', emailConfirmed: true,
  hasContract: true, hasPoa: true, createdAtUtc: '2026-03-12T04:00:00Z', inviteExpiresAtUtc: null,
  ...o,
})
const ROWS = [
  row({ id: 'a', companyName: 'ТОО «Казахмыс Трейд»', email: 'finance@kazakhmys.kz', bin: '160440012345' }),
  row({ id: 'b', companyName: 'ТОО «Altyn Med»', email: 'zakup@altyn.kz', bin: '200540031208', hasPoa: false }),
  row({ id: 'c', username: 'import', companyName: 'ТОО «Nomad Build»', email: 'import@nomad.kz', bin: '170940022456', phone: '+7 700 111 22 33', status: 'Invited', hasContract: false, hasPoa: false, inviteExpiresAtUtc: '2099-10-14T04:00:00Z' }),
  row({ id: 'd', username: 'old', companyName: 'ТОО «Старый»', status: 'Invited', hasContract: false, hasPoa: false, inviteExpiresAtUtc: '2020-01-01T04:00:00Z' }),
  row({ id: 'e', companyName: 'ИП «Елубаев»', status: 'Blocked', hasPoa: false }),
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(ClientsListView, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { ZDrawer: DrawerStub, ZModal: ModalStub } },
  })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const names = () => w.findAll('[data-client-name]').map((b) => b.text())
const segments = () => w.findAll('[data-clients-segments] button').map((b) => b.text().replace(/\s+/g, ' '))
const bodyRows = () => w.findAll('tbody tr')

// Меню строки: открыть и прочитать пункты; выбрать пункт по подписи.
const openMenu = async (i: number) => {
  await w.findAll('[data-row-more]')[i].trigger('keydown', { key: 'Enter' })
  await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0))
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((e) => e.textContent!.trim())
}
const choose = async (label: string) => {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.trim() === label)!
  item.click()
  await flushPromises()
}

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/clients')
  api.list.mockResolvedValue(ROWS)
  api.invite.mockResolvedValue({ clientId: 'c', invitePath: '/invite/tok', expiresAtUtc: '2099-10-14T04:00:00Z', reissued: true })
  api.block.mockResolvedValue(undefined)
  api.unblock.mockResolvedValue(undefined)
  api.listDocuments.mockResolvedValue([])
  as('sales', ['clients.read', 'clients.invite', 'clients.manage', 'import40.read'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('ClientsListView: список', () => {
  it('один запрос (silent); заголовок со счётчиком; колонки и строки', async () => {
    await mountView()
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Клиенты')
    expect(w.get('[data-clients-count]').text()).toBe('5')
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Компания', 'Статус', 'Документы', 'С нами с', 'Действия'])
    expect(names()).toEqual(['ТОО «Казахмыс Трейд»', 'ТОО «Altyn Med»', 'ТОО «Nomad Build»', 'ТОО «Старый»', 'ИП «Елубаев»'])
    expect(bodyRows()[0].text()).toContain('finance@kazakhmys.kz · БИН 160440012345')
    expect(bodyRows()[0].text()).toContain('12.03.2026')
  })

  it('статус и срок ссылки у приглашённых', async () => {
    await mountView()
    const statuses = w.findAll('[data-client-status]').map((s) => s.text())
    expect(statuses).toEqual(['Активен', 'Активен', 'Приглашён', 'Приглашён', 'Заблокирован'])
    expect(bodyRows()[2].text()).toContain('до 14.10.2099')
    expect(bodyRows()[3].text()).toContain('ссылка истекла')
    expect(bodyRows()[0].find('[data-client-until]').exists()).toBe(false)
  })

  it('документы: есть — галочка, нет — тире', async () => {
    await mountView()
    const docs = (i: number) => bodyRows()[i].findAll('[data-doc]').map((d) => `${d.attributes('data-doc')}:${d.attributes('data-has')}`)
    expect(docs(0)).toEqual(['contract:true', 'poa:true'])
    expect(docs(1)).toEqual(['contract:true', 'poa:false'])
    expect(bodyRows()[1].text()).toContain('— Доверенность')
  })

  it('сегменты со счётчиками; «Без документов» — нет договора или доверенности; поиск по БИН', async () => {
    await mountView()
    expect(segments()).toEqual(['Все 5', 'Активные 2', 'Приглашены 2', 'Без документов 4', 'Заблокированы 1'])
    await w.findAll('[data-clients-segments] button')[3].trigger('click')
    await flushPromises()
    expect(names()).toEqual(['ТОО «Altyn Med»', 'ТОО «Nomad Build»', 'ТОО «Старый»', 'ИП «Елубаев»'])
    await w.get('input[type="search"]').setValue('1709400')
    expect(names()).toEqual(['ТОО «Nomad Build»'])
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('ничего не найдено: пустое состояние со сбросом', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-clients-reset]').trigger('click')
    expect(names()).toHaveLength(5)
  })

  it('клиентов нет: «Пригласить» в пустом состоянии — только при clients.invite', async () => {
    api.list.mockResolvedValue([])
    await mountView()
    expect(w.text()).toContain('Клиентов пока нет')
    expect(w.findAll('button').filter((b) => b.text() === 'Пригласить клиента')).toHaveLength(2)
    w.unmount()
    as('accountant', ['clients.read'])
    await mountView()
    expect(w.findAll('button').filter((b) => b.text() === 'Пригласить клиента')).toHaveLength(0)
  })

  it('ошибка загрузки: блок с «Повторить», тост не дублируется (silent)', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(has('[data-clients-error]')).toBe(true)
    expect(has('[data-clients-table]')).toBe(false)
    expect(w.get('[data-clients-error]').text()).toContain('Не удалось загрузить список')
    await w.get('[data-clients-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-clients-error]')).toBe(false)
    expect(names()).toHaveLength(5)
  })

  it('смена поиска возвращает на первую страницу', async () => {
    api.list.mockResolvedValue(Array.from({ length: 30 }, (_, i) => row({ id: `m${i}`, companyName: `Компания ${100 + i}` })))
    await mountView()
    w.getComponent(ZPagination).vm.$emit('change', 2)
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(2)
    await w.get('input[type="search"]').setValue('Компания')
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(1)
  })
})

describe('ClientsListView: клик по строке', () => {
  it('строка и название ведут в /clients/<id>; меню строки — нет', async () => {
    await mountView()
    await bodyRows()[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/b')
    await router.push('/clients')
    await w.findAll('[data-client-open]')[2].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/c')
    await router.push('/clients')
    await w.findAll('[data-row-more]')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients')
  })
})

describe('ClientsListView: права', () => {
  it('«Пригласить клиента» — только при clients.invite', async () => {
    await mountView()
    expect(has('[data-clients-invite]')).toBe(true)
    w.unmount()
    as('accountant', ['clients.read', 'import40.read'])
    await mountView()
    expect(has('[data-clients-invite]')).toBe(false)
  })

  it('«Документы» в меню — только при import40.read, и открывает панель', async () => {
    await mountView()
    expect(await openMenu(0)).toContain('Документы')
    await choose('Документы')
    expect(has('[data-drawer]')).toBe(true)
    expect(api.listDocuments).toHaveBeenCalledWith('a', undefined, { silent: true })
    w.unmount()
    document.body.innerHTML = ''

    as('expeditor', ['clients.read', 'clients.invite'])
    await mountView()
    // Меню — только у приглашённых («Новая ссылка»): документов и блокировки без прав нет.
    expect(w.findAll('[data-row-more]')).toHaveLength(2)
    expect(await openMenu(0)).toEqual(['Новая ссылка'])
    expect(has('[data-drawer]')).toBe(false)
    expect(api.listDocuments).toHaveBeenCalledTimes(1)
  })

  it('пункты меню по статусу и праву: «Новая ссылка» — Invited + invite; блок — manage', async () => {
    await mountView()
    expect(await openMenu(0)).toEqual(['Документы', 'Заблокировать'])
    w.unmount()
    document.body.innerHTML = ''
    await mountView()
    expect(await openMenu(2)).toEqual(['Документы', 'Новая ссылка', 'Заблокировать'])
    w.unmount()
    document.body.innerHTML = ''
    await mountView()
    expect(await openMenu(4)).toEqual(['Документы', 'Разблокировать'])
    w.unmount()
    document.body.innerHTML = ''

    as('rop', ['clients.read', 'clients.invite', 'import40.read'])
    await mountView()
    expect(await openMenu(2)).toEqual(['Документы', 'Новая ссылка'])
    w.unmount()
    document.body.innerHTML = ''
    as('mpp', ['clients.read', 'clients.manage'])
    await mountView()
    expect(await openMenu(2)).toEqual(['Заблокировать'])
  })
})

describe('ClientsListView: блокировка и новая ссылка', () => {
  it('блокировка — с подтверждением; отказ ничего не вызывает', async () => {
    await mountView()
    await openMenu(0)
    await choose('Заблокировать')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Заблокировать клиента? Он не сможет войти.')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.block).not.toHaveBeenCalled()

    await openMenu(0)
    await choose('Заблокировать')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.block).toHaveBeenCalledWith('a')
    expect(api.toast.success).toHaveBeenCalledWith('Клиент заблокирован')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('ошибка блокировки: без тоста успеха и без перезагрузки списка', async () => {
    api.block.mockRejectedValueOnce(new Error('500'))
    await mountView()
    await openMenu(0)
    await choose('Заблокировать')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('разблокировка — сразу, без вопроса', async () => {
    await mountView()
    await openMenu(4)
    await choose('Разблокировать')
    expect(confirmState.open).toBe(false)
    expect(api.unblock).toHaveBeenCalledWith('e')
    expect(api.toast.success).toHaveBeenCalledWith('Клиент разблокирован')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('«Новая ссылка» спрашивает подтверждение и отправляет приглашение с данными строки', async () => {
    await mountView()
    await openMenu(2)
    await choose('Новая ссылка')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Выпустить новую ссылку?')
    expect(confirmState.content).toBe('Старая перестанет работать.')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.invite).not.toHaveBeenCalled()
    expect(has('[data-modal]')).toBe(false)

    await openMenu(2)
    await choose('Новая ссылка')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.invite).toHaveBeenCalledTimes(1)
    expect(api.invite).toHaveBeenCalledWith({
      email: 'import@nomad.kz', bin: '170940022456', companyName: 'ТОО «Nomad Build»', phone: '+7 700 111 22 33', service: 'import40',
    })
    expect(w.get('[data-invite-url]').element).toBeTruthy()
    expect(w.text()).toContain('Ссылка перевыпущена')
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})

describe('ClientsListView: «Выгрузить»', () => {
  it('выгружает отфильтрованные строки; без строк неактивна', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('altyn')
    await w.get('[data-clients-export]').trigger('click')
    await flushPromises()
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, sheet, data] = api.exportXlsx.mock.calls[0]
    expect(base).toBe('clients')
    expect(sheet).toBe('Клиенты')
    expect(data).toHaveLength(1)
    expect(data[0]['Клиент']).toBe('ТОО «Altyn Med»')
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.get('[data-clients-export]').attributes('disabled')).toBeDefined()
  })
})
