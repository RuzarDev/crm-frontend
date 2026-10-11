import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import dayjs from 'dayjs'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCompanyProfileDto, Import40DocumentDto } from '@/api/import40Contract'

// Прежнее поведение сотрудничьей «Компании клиента» (Import40CompanyView + Import40DocumentStep) — закреплено
// перед переводом на Z (волна 7): выбор клиента и ?client=, шаги и ?step=, формирование (разовый, «действует до»),
// отзыв — только администратор, подпись AQNIET — администратор или РОП, подпись клиента, eGov по стороне.

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  listDocuments: vi.fn(),
  generateDocument: vi.fn(),
  revokeDocument: vi.fn(),
  downloadDocument: vi.fn(),
  signDocument: vi.fn(),
}))
const imp = vi.hoisted(() => ({ listClients: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<object>()), import40Api: imp }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/components/PageHeader.vue', () => ({
  default: { props: ['title', 'subtitle', 'kicker'], template: '<header data-header><h1>{{ title }}</h1><slot name="actions" /></header>' },
}))
vi.mock('@/components/BinLookupButton.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/components/ui/PhoneInput.vue', () => ({ default: { template: '<input />' } }))
vi.mock('@/components/SigexSignModal.vue', () => ({
  default: {
    props: ['open', 'clientId', 'docId', 'side'],
    template: '<div data-sigex :data-open="String(open)" :data-client="clientId" :data-doc="docId" :data-side="side" />',
  },
}))

import { useAuthStore } from '@/stores/auth'
import Import40CompanyView from '../Import40CompanyView.vue'

// ---- Заглушки AntD ----
const pass = { template: '<div><slot /></div>' }
const stubs = {
  'a-spin': pass,
  'a-card': pass,
  'a-collapse': pass,
  'a-collapse-panel': pass,
  'a-button': {
    props: ['disabled', 'loading', 'type', 'danger', 'size'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" :data-danger="danger ? \'\' : undefined" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  'a-input': { props: ['value'], emits: ['update:value'], template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />' },
  'a-select': {
    props: ['value', 'options'],
    emits: ['update:value', 'change'],
    template: '<select data-select :value="value" @change="$emit(\'update:value\', $event.target.value); $emit(\'change\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
  },
  'a-steps': {
    props: ['current', 'items'],
    emits: ['change'],
    template: '<ol data-steps :data-current="current"><li v-for="(it, i) in items" :key="i" data-step :data-status="it.status" @click="$emit(\'change\', i)">{{ it.title }} — {{ it.description }}</li></ol>',
  },
  'a-tag': { props: ['color'], template: '<span data-tag :data-color="color"><slot /></span>' },
  'a-tooltip': { props: ['title'], template: '<span data-tooltip :title="title"><slot /></span>' },
  'a-alert': { props: ['message', 'description', 'type'], template: '<div data-alert>{{ message }} {{ description }}</div>' },
  'a-checkbox': {
    props: ['checked', 'disabled'],
    emits: ['update:checked'],
    template: '<label data-single><input type="checkbox" :checked="checked" :disabled="disabled" @change="$emit(\'update:checked\', $event.target.checked)" /><slot /></label>',
  },
  'a-date-picker': defineComponent({
    props: ['value'],
    emits: ['update:value'],
    setup: (_p, { emit }) => () => h('input', { 'data-until': '', onChange: (e: Event) => emit('update:value', dayjs((e.target as HTMLInputElement).value)) }),
  }),
  'a-popconfirm': {
    props: ['title'],
    emits: ['confirm'],
    template: '<span data-popconfirm :title="title"><slot /><button type="button" data-pop-ok @click="$emit(\'confirm\')">ok</button></span>',
  },
}

const PROFILE: ClientCompanyProfileDto = {
  clientId: 'c1', companyName: 'ТОО «Альфа»', bin: '123456789012', directorName: 'Иванов И.И.', directorBasis: 'устава',
  legalAddress: 'г. Алматы', bank: 'Халык', iik: 'KZ1', bik: 'HSBK', phone: '', email: '',
  legalCountryCode: '398', legalRegion: '', legalCity: '', legalStreet: '', kbe: '', okpo: '', ownershipType: '',
  contactPersonName: '', contactPersonPosition: '', contactPhone: '', contactEmail: '', isComplete: true, updatedAtUtc: null,
}
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'c1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: '2026-10-08T07:00:00Z',
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null, consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE_CONTRACT = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true })
const ACTIVE_POA = doc({ id: 'p0', kind: 'poa', status: 2, clientSigned: true })

let w: VueWrapper
let router: Router
const docs: Record<string, { contract: Import40DocumentDto[]; poa: Import40DocumentDto[] }> = {}
const setDocs = (clientId: string, contract: Import40DocumentDto[], poa: Import40DocumentDto[]) => { docs[clientId] = { contract, poa } }

const as = (role: string, businessRoles: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.businessRole = businessRoles[0] ?? null
  auth.businessRoles = businessRoles
}
const mountAt = async (path = '/import-40/company') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(Import40CompanyView, { attachTo: document.body, global: { plugins: [router], stubs } })
  await flushPromises()
}
const current = () => Number(w.get('[data-steps]').attributes('data-current'))
const buttons = (text: string) => w.findAll('button').filter((b) => b.text().includes(text))

beforeEach(() => {
  setActivePinia(createPinia())
  as('Administrator')
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  imp.listClients.mockResolvedValue([
    { id: 'c1', username: 'alpha', companyName: 'ТОО «Альфа»' },
    { id: 'c2', username: 'beta', companyName: null },
  ])
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true }])
  api.getProfile.mockImplementation((id: string) => Promise.resolve({ ...PROFILE, clientId: id }))
  api.listDocuments.mockImplementation((id: string, kind: 'contract' | 'poa') => Promise.resolve(docs[id]?.[kind] ?? []))
  setDocs('c1', [], [])
  setDocs('c2', [], [])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Import40CompanyView (сотрудник) — прежнее поведение', () => {
  it('выбор клиента: подписи «Компания (логин)» / логин; без ?client= — первый клиент', async () => {
    await mountAt()
    const opts = w.get('[data-select]').findAll('option').map((o) => o.text())
    expect(opts).toEqual(['ТОО «Альфа» (alpha)', 'beta'])
    expect(api.getProfile).toHaveBeenCalledWith('c1')
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'contract')
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'poa')
  })

  it('?client= — сразу нужный клиент; неизвестный — первый', async () => {
    await mountAt('/import-40/company?client=c2')
    expect(api.getProfile).toHaveBeenCalledWith('c2')
    expect(api.getProfile).not.toHaveBeenCalledWith('c1')
    w.unmount()
    vi.clearAllMocks()
    await mountAt('/import-40/company?client=zzz')
    expect(api.getProfile).toHaveBeenCalledWith('c1')
  })

  it('без ?step= — первый незавершённый шаг', async () => {
    api.getProfile.mockResolvedValueOnce({ ...PROFILE, isComplete: false })
    await mountAt()
    expect(current()).toBe(0)
    w.unmount()
    await mountAt()
    expect(current()).toBe(1) // реквизиты есть, действующего договора нет
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt()
    expect(current()).toBe(2)
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [ACTIVE_POA])
    await mountAt()
    expect(current()).toBe(2)
  })

  it('?step=contract / ?step=poa открывают шаг даже при незаполненных реквизитах', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    await mountAt('/import-40/company?client=c1&step=contract')
    expect(current()).toBe(1)
    w.unmount()
    await mountAt('/import-40/company?client=c1&step=poa')
    expect(current()).toBe(2)
  })

  it('смена клиента — профиль и документы нового клиента, шаг — первый незавершённый', async () => {
    setDocs('c2', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(current()).toBe(1)
    await w.get('[data-select]').setValue('c2')
    await flushPromises()
    expect(api.getProfile).toHaveBeenLastCalledWith('c2')
    expect(api.listDocuments).toHaveBeenCalledWith('c2', 'contract')
    expect(current()).toBe(2)
  })

  it('метка регистрации: готово — действующий договор и доверенность; иначе — чего не хватает', async () => {
    await mountAt()
    expect(w.get('[data-tooltip]').attributes('title')).toBe('Не хватает: действующий договор, действующая доверенность')
    expect(w.text()).toContain('Регистрация не завершена')
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [ACTIVE_POA])
    await mountAt()
    expect(w.text()).toContain('Регистрация завершена')
    expect(w.find('[data-tooltip]').exists()).toBe(false)
  })

  it('шаги: доверенность израсходована разовой заявкой — «Использована — для новой заявки нужна новая»', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [doc({ id: 'p1', kind: 'poa', status: 2, clientSigned: true, isSingleUse: true, consumedByCaseId: 'k1' })])
    await mountAt()
    const steps = w.findAll('[data-step]')
    expect(steps[0].attributes('data-status')).toBe('finish')
    expect(steps[1].attributes('data-status')).toBe('finish')
    expect(steps[2].text()).toContain('Использована — для новой заявки нужна новая')
    // Онбординг при этом пройден (расход разовой его не отменяет).
    expect(w.text()).toContain('Регистрация завершена')
  })

  it('реквизиты: «Сохранить реквизиты» — saveProfile по выбранному клиенту и тост', async () => {
    api.saveProfile.mockResolvedValue(PROFILE)
    await mountAt('/import-40/company?client=c2&step=requisites')
    expect(current()).toBe(1) // ?step=requisites прежний экран не знал — первый незавершённый
    w.get('[data-steps]').findAll('[data-step]')[0].trigger('click')
    await flushPromises()
    await buttons('Сохранить реквизиты')[0].trigger('click')
    await flushPromises()
    expect(api.saveProfile).toHaveBeenCalledWith('c2', expect.objectContaining({ companyName: 'ТОО «Альфа»', bin: '123456789012' }))
    expect(msg.success).toHaveBeenCalledWith('Реквизиты сохранены')
  })

  it('сформировать: разовый + «действует до» уходят в generateDocument, затем документы перечитываются', async () => {
    api.generateDocument.mockResolvedValue(doc({}))
    await mountAt('/import-40/company?step=poa')
    await w.get('[data-single] input').setValue(true)
    await w.get('[data-until]').setValue('2027-12-31')
    await w.get('[data-until]').trigger('change')
    api.listDocuments.mockClear()
    await buttons('Сформировать')[0].trigger('click')
    await flushPromises()
    const [clientId, req] = api.generateDocument.mock.calls[0]
    expect(clientId).toBe('c1')
    expect(req.kind).toBe('poa')
    expect(req.isSingleUse).toBe(true)
    expect(req.validUntilUtc).toBe(dayjs('2027-12-31').endOf('day').toISOString())
    expect(api.generateDocument.mock.calls[0]).toHaveLength(2) // без silent: текст отказа показывает перехватчик
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'poa')
    expect(msg.success).toHaveBeenCalledWith('Доверенность сформирована')
  })

  it('сформировать недоступно без реквизитов — подсказка «Сначала заполните реквизиты»', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    await mountAt('/import-40/company?step=contract')
    expect(buttons('Сформировать')[0].attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Сначала заполните реквизиты компании')
  })

  it('отказ сервера при формировании — текст показывает перехватчик (своего тоста нет); без ответа — общий текст', async () => {
    api.generateDocument.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Уже есть' } } })
    await mountAt('/import-40/company?step=contract')
    await buttons('Сформировать')[0].trigger('click')
    await flushPromises()
    expect(msg.error).not.toHaveBeenCalled()
    api.generateDocument.mockRejectedValueOnce(new Error('network'))
    await buttons('Сформировать')[0].trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('Не удалось сформировать документ')
  })

  it('действует многоразовый договор: плашка и «разовый» включён и закреплён', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-alert]').text()).toContain('Действует многоразовый договор')
    expect(w.get('[data-alert]').text()).toContain('отзовите действующий')
    const box = w.get('[data-single] input').element as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
  })

  it('отозвать — только администратор и не для отозванного; подтверждение → revokeDocument и перечитывание', async () => {
    api.revokeDocument.mockResolvedValue(doc({ status: 4 }))
    setDocs('c1', [doc({ id: 'd1' }), doc({ id: 'd2', number: '13', status: 4 })], [])
    await mountAt('/import-40/company?step=contract')
    const pops = w.findAll('[data-popconfirm]')
    expect(pops).toHaveLength(1)
    expect(pops[0].attributes('title')).toContain('Отозвать документ?')
    await pops[0].get('[data-pop-ok]').trigger('click')
    await flushPromises()
    expect(api.revokeDocument).toHaveBeenCalledWith('c1', 'd1')
    expect(msg.success).toHaveBeenCalledWith('Документ отозван')
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(w.find('[data-popconfirm]').exists()).toBe(false)
  })

  it('подпись AQNIET (только договор): администратор или РОП; декларанту — нет', async () => {
    setDocs('c1', [doc({ id: 'd1', clientSigned: true })], [doc({ id: 'p1', kind: 'poa' })])
    await mountAt('/import-40/company?step=contract')
    expect(w.text()).toContain('Подпись AQNIET')
    expect(buttons('Подписать через eGov')).toHaveLength(1) // клиент уже подписал — кнопки только у AQNIET
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(buttons('Подписать через eGov')).toHaveLength(1)
    w.unmount()
    as('Declarant', ['declarant'])
    await mountAt('/import-40/company?step=contract')
    expect(w.text()).toContain('Подпись AQNIET')
    expect(buttons('Подписать через eGov')).toHaveLength(0)
    w.unmount()
    as('Administrator')
    await mountAt('/import-40/company?step=poa')
    expect(w.text()).not.toContain('Подпись AQNIET') // доверенность — односторонний документ клиента
  })

  it('подписано обеими сторонами — кнопок подписи нет', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(buttons('Подписать через eGov')).toHaveLength(0)
    expect(buttons('Загрузить подписанный файл')).toHaveLength(0)
  })

  it('eGov: окно подписи получает клиента, документ и сторону', async () => {
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    const egov = buttons('Подписать через eGov')
    expect(egov).toHaveLength(2) // подпись клиента и подпись AQNIET
    await egov[1].trigger('click')
    const m = w.get('[data-sigex]')
    expect(m.attributes()).toMatchObject({ 'data-open': 'true', 'data-client': 'c1', 'data-doc': 'd1', 'data-side': 'provider' })
    await egov[0].trigger('click')
    expect(w.get('[data-sigex]').attributes('data-side')).toBe('client')
  })

  it('загрузка подписанного файла: signDocument со стороной, затем перечитывание и тост', async () => {
    api.signDocument.mockResolvedValue(doc({}))
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    const input = w.get('input[type="file"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    await buttons('Загрузить подписанный файл')[1].trigger('click')
    expect(click).toHaveBeenCalled()
    const file = new File(['x'], 'sig.cms')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(api.signDocument).toHaveBeenCalledWith('c1', 'd1', 'provider', file)
    expect(msg.success).toHaveBeenCalledWith('Подписанный файл загружен')
  })

  it('теги документа: действует + статус, разовый · использован, срок', async () => {
    setDocs('c1', [], [doc({ id: 'p1', kind: 'poa', status: 2, clientSigned: true, isSingleUse: true, consumedByCaseId: 'k1', validUntilUtc: '2099-12-31T12:00:00Z' })])
    await mountAt('/import-40/company?step=poa')
    const tags = w.findAll('[data-tag]').map((t) => t.text())
    expect(tags).toEqual(expect.arrayContaining(['Активен', 'разовый · использован', 'до 31.12.2099']))
    expect(tags).not.toContain('Действует') // использованная разовая уже не «действует»
  })
})
