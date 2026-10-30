import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40GoodsItemDto } from '@/api/import40'
import type { ReworkItemDto } from '@/api/import40Rework'
import { confirmState } from '@/ui/confirm'
import { buildItems, dtCodesOf, emptyChecks, parseCodes, sortItems } from '../rework'
import { USERS, caseDto, declaration } from './caseFixture'
import { casePerms } from '../casePermissions'
import type { CaseActions } from '../useCaseActions'

const rework = vi.hoisted(() => ({ list: vi.fn(), suggestions: vi.fn(), returnToClient: vi.fn(), resolve: vi.fn(), remove: vi.fn(), uploadForItem: vi.fn() }))
vi.mock('@/api/import40Rework', async (orig) => ({ ...(await orig<typeof import('@/api/import40Rework')>()), reworkApi: rework }))

import ReturnToClientModal from '../ReturnToClientModal.vue'
import CaseReworkPanel from '../CaseReworkPanel.vue'
import CaseBanners from '../CaseBanners.vue'

const ModalStub = {
  props: ['open', 'okButtonProps', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><div data-modal-title>{{ title }}</div><slot /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}
const stubs = { ZModal: ModalStub }

const goods = (tnvedCode: string) => ({ tnvedCode }) as Import40GoodsItemDto
const kase = caseDto({
  status: 3,
  declarations: [
    declaration({ id: 'd1', goodsItems: [goods('8471300000'), goods('8471 30 000 0'), goods('123')] }),
    declaration({ id: 'd0', isSplitReplaced: true, goodsItems: [goods('9999999999')] }),
  ],
})

const fakeActions = (): CaseActions => ({
  run: vi.fn(async () => true),
  mutate: vi.fn(async (_k: string, fn: () => Promise<unknown>) => { await fn(); return true }),
  isPending: () => false,
  busy: () => false,
  reload: vi.fn(async () => true),
  ask: vi.fn(),
})

const item = (o: Partial<ReworkItemDto> = {}): ReworkItemDto => ({
  id: 'r1', kind: 'invoice', title: '', note: '', docKey: null, tnvedCode: null, actRef: null, createdAtUtc: '2026-10-17T05:00:00Z', createdByName: 'Айгерим К.',
  resolvedAtUtc: null, resolvedFileId: null, resolvedFileName: null, resolvedByName: null, ...o,
})

let w: VueWrapper
beforeEach(() => {
  rework.suggestions.mockResolvedValue({
    codes: ['8471300000'],
    items: [{ code: '8471300000', kind: 'conformity', docKey: 'conformityCert', title: 'Сертификат соответствия ЕАЭС', measure: 'Входит в перечень…', act: 'Решение Коллегии ЕЭК № 91 (12.08.2020)' }],
  })
  rework.returnToClient.mockResolvedValue(kase)
  rework.list.mockResolvedValue({ comment: null, items: [] })
})
afterEach(() => {
  w?.unmount()
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('rework.ts', () => {
  it('коды ДТ: 10 цифр без повторов, без исходной ДТ разделения', () => {
    expect(dtCodesOf(kase)).toEqual(['8471300000'])
    expect(parseCodes('8471300000, 8471300000;0101210000 12')).toEqual(['8471300000', '0101210000'])
  })
  it('тело: отмеченные виды по порядку чек-листа, затем «Другое»', () => {
    const c = emptyChecks()
    c.packing.on = true
    c.invoice.on = true
    c.invoice.note = ' подписанный '
    expect(buildItems(c, [
      { key: 'o1', kind: 'other', title: ' Письмо ', note: '', docKey: null, code: null, act: null },
      { key: 's1', kind: 'certificate', title: '', note: ' партия 2 ', docKey: 'vet', code: '0101210000', act: 'Решение КТС № 317' },
    ])).toEqual([
      { kind: 'invoice', note: 'подписанный' },
      { kind: 'packing', note: null },
      { kind: 'other', title: 'Письмо', note: null },
      { kind: 'certificate', note: 'партия 2', docKey: 'vet', code: '0101210000', act: 'Решение КТС № 317' },
    ])
  })
  it('сортировка: открытые сверху', () => {
    const list = sortItems([item({ id: 'a', resolvedAtUtc: '2026-10-17T06:00:00Z' }), item({ id: 'b' })])
    expect(list.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('ReturnToClientModal', () => {
  const mount = async (actions = fakeActions()) => {
    w = mountWithI18n(ReturnToClientModal, { props: { open: true, kase, actions }, global: { stubs } })
    await flushPromises()
    return actions
  }

  it('галочки видов документов чек-листа, вкл. сертификат; без выбора и комментария вернуть нельзя', async () => {
    await mount()
    expect(w.findAll('[data-rework-kind]').map((x) => x.attributes('data-rework-kind')))
      .toEqual(['invoice', 'transport', 'packing', 'contract', 'origin', 'conformity', 'permit', 'certificate'])
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-rework-need]').exists()).toBe(true)
  })

  it('подсказки по кодам товаров ДТ — сразу при открытии; «Добавить» кладёт пункт с кодом', async () => {
    await mount()
    expect(rework.suggestions).toHaveBeenCalledWith('c1', ['8471300000'], { dt: false, silent: true })
    expect((w.get('[data-rework-codes]').element as HTMLInputElement).value).toBe('8471300000')
    const row = w.get('[data-rework-sugg-row]')
    expect(row.text()).toContain('Сертификат соответствия ЕАЭС')
    expect(row.text()).toContain('Решение Коллегии ЕЭК № 91')
    await w.get('[data-rework-sugg-add]').trigger('click')
    const added = w.get('[data-rework-extra-kind="conformity"]')
    expect(added.text()).toContain('Код ТН ВЭД 8471300000')
    expect(added.text()).toContain('Сертификат соответствия ЕАЭС')
    expect(added.text()).toContain('Акт: Решение Коллегии ЕЭК № 91 (12.08.2020)')
    expect(w.get('[data-rework-sugg-add]').text()).toBe('Добавлено')
    expect(w.get('[data-rework-sugg-add]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-ok]').attributes('disabled')).toBeUndefined()
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    // Документ подсказки — ключом с кодом и актом, без русского названия и без комментария-кода.
    expect(rework.returnToClient).toHaveBeenCalledWith('c1', null, [
      { kind: 'conformity', note: null, docKey: 'conformityCert', code: '8471300000', act: 'Решение Коллегии ЕЭК № 91 (12.08.2020)' },
    ])
  })

  it('код под временной мерой РК — красная плашка запрета над подсказками, не пункт', async () => {
    rework.suggestions.mockResolvedValueOnce({
      codes: ['8471300000'], items: [],
      bans: [{
        code: '8471300000', kind: 'ban', goods: 'Пшеница', name: 'Запрет ввоза автомобильным транспортом', validFrom: '2026-07-27',
        validTo: '2027-01-26', act: 'Приказ Министра сельского хозяйства РК № 273 от 11.07.2026', actUrl: 'https://adilet.zan.kz/rus/docs/V2600039292',
        exceptions: 'ж/д в адрес элеваторов', partial: true,
      }],
    })
    await mount()
    const ban = w.get('[data-rework-ban]')
    expect(ban.text()).toContain('8471300000 · Временный запрет ввоза РК')
    expect(ban.text()).toContain('Запрет ввоза автомобильным транспортом — Пшеница, с 27.07.2026 по 26.01.2027')
    expect(ban.text()).toContain('Мера на часть кода')
    expect(ban.text()).toContain('Исключения: ж/д в адрес элеваторов')
    expect(ban.get('a').attributes('href')).toBe('https://adilet.zan.kz/rus/docs/V2600039292')
    expect(w.find('[data-rework-sugg-row]').exists()).toBe(false)
    expect(w.find('[data-rework-sugg-empty]').exists()).toBe(true)
  })

  it('«Другой документ» без названия не отправить; с пунктами общий комментарий не обязателен', async () => {
    const actions = await mount()
    await w.get('[data-rework-kind="invoice"] button[role="checkbox"]').trigger('click')
    await w.get('[data-rework-note="invoice"]').setValue('С печатью')
    await w.get('[data-rework-add-other]').trigger('click')
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-rework-missing-title]').exists()).toBe(true)
    await w.get('[data-rework-other-title]').setValue('Письмо поставщика')
    expect(w.get('[data-ok]').attributes('disabled')).toBeUndefined()

    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(actions.mutate).toHaveBeenCalledWith('return-to-client', expect.any(Function), { done: 'broker.case.done.returnToClient' })
    expect(rework.returnToClient).toHaveBeenCalledWith('c1', null, [
      { kind: 'invoice', note: 'С печатью' },
      { kind: 'other', title: 'Письмо поставщика', note: null },
    ])
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('только общий комментарий — как раньше', async () => {
    await mount()
    await w.get('[data-reason-input]').setValue('Уточните вес')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(rework.returnToClient).toHaveBeenCalledWith('c1', 'Уточните вес', [])
  })

  it('без кодов — подсказку не запрашиваем', async () => {
    w = mountWithI18n(ReturnToClientModal, { props: { open: true, kase: caseDto(), actions: fakeActions() }, global: { stubs } })
    await flushPromises()
    expect(rework.suggestions).not.toHaveBeenCalled()
    expect(w.find('[data-rework-sugg-nocodes]').exists()).toBe(true)
  })
})

describe('CaseReworkPanel', () => {
  const mountPanel = async (items: ReworkItemDto[], user = USERS.declarant) => {
    rework.list.mockResolvedValue({ comment: null, items })
    const actions = fakeActions()
    w = mountWithI18n(CaseReworkPanel, { props: { kase, perms: casePerms(user, kase), actions } })
    await flushPromises()
    return actions
  }

  it('без пунктов панели нет', async () => {
    await mountPanel([])
    expect(w.find('[data-case-rework]').exists()).toBe(false)
  })

  it('пункты со статусом: открытые сверху, файл у закрытого; закрыть вручную и удалить', async () => {
    const actions = await mountPanel([
      item({ id: 'r1', kind: 'packing', resolvedAtUtc: '2026-10-17T07:00:00Z', resolvedFileId: 'f9', resolvedFileName: 'pl.pdf' }),
      item({ id: 'r2', kind: 'certificate', docKey: 'vet', tnvedCode: '0101210000', actRef: 'Решение КТС № 317', note: 'на партию' }),
    ])
    expect(w.get('[data-rework-summary]').text()).toBe('загружено 1 из 2')
    const rows = w.findAll('[data-rework-item]')
    expect(rows.map((r) => r.attributes('data-rework-state'))).toEqual(['open', 'done'])
    expect(rows[0].text()).toContain('Ветеринарный сертификат')
    expect(rows[0].text()).toContain('на партию')
    expect(rows[0].get('[data-rework-item-ref]').text()).toBe('Код ТН ВЭД 0101210000 · Акт: Решение КТС № 317')
    expect(rows[1].text()).toContain('Упаковочный лист')
    expect(rows[1].get('[data-rework-resolution]').text()).toBe('Файл: pl.pdf')
    expect(rows[1].find('[data-rework-resolve]').exists()).toBe(false)

    rework.resolve.mockResolvedValue(item({ id: 'r2' }))
    await rows[0].get('[data-rework-resolve]').trigger('click')
    await flushPromises()
    expect(rework.resolve).toHaveBeenCalledWith('c1', 'r2')
    expect(actions.mutate).toHaveBeenCalledWith('rework:r2', expect.any(Function), { done: 'rework.list.resolved' })

    await rows[0].get('[data-rework-remove-item]').trigger('click')
    expect(confirmState.open).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(rework.remove).toHaveBeenCalledWith('c1', 'r2')
  })

  // E-6 (30.10.2026, живой прогон): у выполненной и отменённой заявки пункты — только просмотр.
  it.each([8, 9])('заявка в статусе %i (выполнена / отменена) — пункты без «Закрыть» и «Удалить»', async (status) => {
    const closed = caseDto({ status })
    rework.list.mockResolvedValue({ comment: null, items: [item(), item({ id: 'r2', resolvedAtUtc: '2026-10-17T07:00:00Z' })] })
    w = mountWithI18n(CaseReworkPanel, { props: { kase: closed, perms: casePerms(USERS.admin, closed), actions: fakeActions() } })
    await flushPromises()
    expect(w.findAll('[data-rework-item]')).toHaveLength(2)
    expect(w.find('[data-rework-resolve]').exists()).toBe(false)
    expect(w.find('[data-rework-remove-item]').exists()).toBe(false)
  })

  it('бухгалтер видит пункты, но не управляет ими', async () => {
    await mountPanel([item()], USERS.accountant)
    expect(w.find('[data-rework-item]').exists()).toBe(true)
    expect(w.find('[data-rework-resolve]').exists()).toBe(false)
    expect(w.find('[data-rework-remove-item]').exists()).toBe(false)
  })
})

describe('CaseBanners: возврат клиенту', () => {
  const mountBanner = (o: Parameters<typeof caseDto>[0]) => {
    const k = caseDto(o)
    w = mountWithI18n(CaseBanners, { props: { kase: k, perms: casePerms(USERS.declarant, k), actions: fakeActions() } })
  }
  it('без комментария — что клиенту осталось догрузить, на языке интерфейса', () => {
    mountBanner({ status: 0, returnReason: '', reworkRequested: true, openReworkItems: [item(), item({ id: 'r2', kind: 'other', title: 'Письмо' })] })
    expect(w.get('[data-returned-text]').text()).toBe('Клиенту нужно догрузить: Инвойс (коммерческий счёт), Письмо')
  })
  it('комментарий сотрудника — как есть; всё загружено — «Клиент загрузил…»', () => {
    mountBanner({ status: 0, returnReason: 'Догрузите документы: сертификат', reworkRequested: true, openReworkItems: [] })
    expect(w.get('[data-returned-text]').text()).toBe('Догрузите документы: сертификат')
    w.unmount()
    mountBanner({ status: 0, returnReason: '', reworkRequested: true, openReworkItems: [] })
    expect(w.get('[data-returned-text]').text()).toBe('Клиент загрузил все запрошенные документы')
  })
  it('обычный черновик — плашки нет', () => {
    mountBanner({ status: 0, returnReason: '' })
    expect(w.find('[data-case-banner="returned"]').exists()).toBe(false)
  })
})
