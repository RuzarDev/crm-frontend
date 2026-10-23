import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ConditionalReleaseDto } from '@/api/conditionalRelease'

const api = vi.hoisted(() => ({ upload: vi.fn(), set: vi.fn(), resolve: vi.fn(), confirm: vi.fn() }))
vi.mock('@/api/conditionalRelease', async (orig) => ({ ...(await orig<object>()), conditionalReleaseApi: { upload: api.upload, set: api.set, resolve: api.resolve } }))
vi.mock('@/api/import40', () => ({ import40Api: { downloadFile: vi.fn() } }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import DtConditionalRelease from '../DtConditionalRelease.vue'

const year = new Date().getFullYear()
const cr = (o: Partial<ConditionalReleaseDto> = {}): ConditionalReleaseDto => ({
  docKind: 'conformity', note: null, deadline: `${year}-12-15`, setAtUtc: null, fileId: null, fileName: null,
  uploadedAtUtc: null, resolvedAtUtc: null, overdue: false, daysLeft: 30, ...o,
})
const mountWith = (props: Record<string, unknown>) =>
  mountWithI18n(DtConditionalRelease, { props: { caseId: 'c1', caseStatus: 4, canEdit: true, dt: { id: 'd1', conditionalRelease: null }, ...props }, attachTo: document.body })

afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

describe('DtConditionalRelease', () => {
  it('до подачи ДТ блока нет; без права — без кнопок', () => {
    expect(mountWith({ caseStatus: 2 }).find('[data-dt-condrel]').exists()).toBe(false)
    const w = mountWith({ canEdit: false })
    expect(w.get('[data-condrel-none]').text()).toBe('ДТ выпущена без условия.')
    expect(w.find('[data-condrel-mark]').exists()).toBe(false)
  })

  it('отметить: без вида не сохраняет; с видом — PUT с пустым сроком (сервер ставит выпуск + 60)', async () => {
    api.set.mockResolvedValue(cr({ docKind: 'origin' }))
    const w = mountWith({})
    await w.get('[data-condrel-mark]').trigger('click')
    await w.get('[data-condrel-save]').trigger('click')
    expect(api.set).not.toHaveBeenCalled()
    w.findComponent({ name: 'ZSelect' }).vm.$emit('update:value', 'origin')
    await flushPromises()
    await w.get('[data-condrel-save]').trigger('click')
    await flushPromises()
    expect(api.set).toHaveBeenCalledWith('c1', 'd1', { isConditionalRelease: true, docKind: 'origin', note: null, deadline: null })
    expect(w.get('[data-condrel-doc]').text()).toBe('Сертификат происхождения')
    expect(w.get('[data-condrel-tag]').text()).toContain('Условный выпуск · до 15.12')
  })

  it('«Другой документ» требует основание', async () => {
    const w = mountWith({})
    await w.get('[data-condrel-mark]').trigger('click')
    w.findComponent({ name: 'ZSelect' }).vm.$emit('update:value', 'other')
    await flushPromises()
    await w.get('[data-condrel-save]').trigger('click')
    expect(api.set).not.toHaveBeenCalled()
    expect(w.text()).toContain('Опишите, какой документ нужен')
  })

  it('загружено клиентом → «Подтвердить закрытие» после подтверждения зовёт resolve', async () => {
    api.confirm.mockResolvedValue(true)
    api.resolve.mockResolvedValue(cr({ uploadedAtUtc: '2026-10-17T05:00:00Z', fileName: 'cert.pdf', fileId: 'f1', resolvedAtUtc: '2026-10-18T05:00:00Z' }))
    const w = mountWith({ dt: { id: 'd1', conditionalRelease: cr({ uploadedAtUtc: '2026-10-17T05:00:00Z', fileName: 'cert.pdf', fileId: 'f1' }) } })
    expect(w.get('[data-condrel-upload-state]').text()).toContain('cert.pdf')
    await w.get('[data-condrel-resolve]').trigger('click')
    await flushPromises()
    expect(api.resolve).toHaveBeenCalledWith('c1', 'd1')
    expect(w.find('[data-condrel-resolve]').exists()).toBe(false)
    expect(w.get('[data-condrel-resolved]').exists()).toBe(true)
    expect(w.find('[data-condrel-mark-again]').exists()).toBe(true)
  })

  it('просрочка — «просрочено на N дн.»; снять отметку — PUT false', async () => {
    api.confirm.mockResolvedValue(true)
    api.set.mockResolvedValue(null)
    const w = mountWith({ dt: { id: 'd1', conditionalRelease: cr({ overdue: true, daysLeft: -3 }) } })
    expect(w.get('[data-condrel-days]').text()).toBe('просрочено на 3 дн.')
    await w.get('[data-condrel-remove]').trigger('click')
    await flushPromises()
    expect(api.set).toHaveBeenCalledWith('c1', 'd1', { isConditionalRelease: false })
    expect(w.find('[data-condrel-none]').exists()).toBe(true)
  })

  // 23.10.2026: «Сформировать обязательство» — право CanManageDeclarations (canObligation), и без отметки, и с ней.
  it('«Сформировать обязательство» — только с правом; окно открывает страница (событие obligation)', async () => {
    let w = mountWith({ canEdit: false })
    expect(w.find('[data-condrel-obligation]').exists()).toBe(false)
    w.unmount()
    w = mountWith({ canEdit: false, canObligation: true })
    expect(w.find('[data-condrel-mark]').exists()).toBe(false)
    await w.get('[data-condrel-obligation]').trigger('click')
    expect(w.emitted('obligation')).toHaveLength(1)
    w.unmount()
    w = mountWith({ canObligation: true, dt: { id: 'd1', conditionalRelease: cr() } })
    expect(w.get('[data-condrel-obligation]').text()).toBe('Сформировать обязательство')
    expect(w.find('[data-condrel-edit]').exists()).toBe(true)
  })
})
