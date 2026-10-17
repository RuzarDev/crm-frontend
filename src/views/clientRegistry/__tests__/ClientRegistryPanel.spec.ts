import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import { regDoc } from './registryFixture'

const api = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), addFiles: vi.fn(), archive: vi.fn(), restore: vi.fn(), download: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/clientRegistry', async (orig) => ({
  ...(await orig<typeof import('@/api/clientRegistry')>()),
  clientRegistryApi: api,
}))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => ({ saveBlob: vi.fn() }))

import ClientRegistryPanel from '../ClientRegistryPanel.vue'

const DOCS = [
  regDoc({ id: 'a', category: 'certificate', number: 'KZ-1', status: 'expiring', daysLeft: 12, validUntil: '2026-10-29' }),
  regDoc({ id: 'b', category: 'supplyContract', number: 'SC-7', status: 'active', daysLeft: 200, validUntil: '2027-05-05', addedByClient: false }),
  regDoc({ id: 'c', category: 'permit', number: 'P-2', status: 'expired', daysLeft: -4, validUntil: '2026-10-13' }),
  regDoc({ id: 'd', category: 'unk', number: 'UNK-1', status: 'unlimited', daysLeft: null, validUntil: null }),
]

let w: VueWrapper
const mountPanel = async () => {
  w = mountWithI18n(ClientRegistryPanel, { props: { clientId: 'c1' }, attachTo: document.body })
  await flushPromises()
}
const ids = () => w.findAll('[data-registry-doc]').map((r) => r.attributes('data-registry-doc'))

beforeEach(() => {
  api.list.mockResolvedValue(DOCS)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('ClientRegistryPanel', () => {
  it('список: категории, статусы, срок, кто добавил; плашка про истекающие и истёкшие', async () => {
    await mountPanel()
    expect(api.list).toHaveBeenCalledWith('c1', { includeArchived: false, silent: true })
    expect(ids()).toEqual(['a', 'b', 'c', 'd'])
    const a = w.get('[data-registry-doc="a"]')
    expect(a.get('[data-registry-doc-title]').text()).toBe('Сертификат № KZ-1')
    expect(a.get('[data-registry-status]').text()).toBe('Истекает')
    expect(a.get('[data-registry-hint]').text()).toBe('осталось 12 дн.')
    expect(w.get('[data-registry-doc="c"] [data-registry-hint]').text()).toBe('истёк 4 дн. назад')
    expect(w.get('[data-registry-doc="d"] [data-registry-until]').text()).toBe('бессрочный')
    expect(w.get('[data-registry-doc="b"] [data-registry-added-by]').text()).toBe('добавил AQNIET')
    expect(w.get('[data-registry-attention]').text()).toContain('Истёкших документов: 1.')
    expect(w.get('[data-registry-attention]').text()).toContain('Истекают в ближайшие 30 дней: 1.')
  })

  it('фильтр по статусу и поиск', async () => {
    await mountPanel()
    const buttons = w.findAll('[data-registry-status-filter] button')
    expect(buttons.map((b) => b.text())).toEqual(['Все 4', 'Действует 1', 'Истекает 1', 'Истёк 1', 'Бессрочный 1'])
    await buttons[3].trigger('click')
    expect(ids()).toEqual(['c'])
    await buttons[0].trigger('click')
    await w.get('input[data-registry-search]').setValue('SC-7')
    expect(ids()).toEqual(['b'])
    await w.get('input[data-registry-search]').setValue('нет-такого')
    expect(w.get('[data-registry-empty]').text()).toContain('Ничего не найдено')
  })

  it('«В архив» — с вопросом; документ убирается из списка', async () => {
    api.archive.mockResolvedValue({ ...DOCS[0], isArchived: true })
    await mountPanel()
    await w.get('[data-registry-doc="a"] [data-registry-archive]').trigger('click')
    expect(confirmState.open).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.archive).toHaveBeenCalledWith('c1', 'a')
    expect(ids()).toEqual(['b', 'c', 'd'])
    expect(msg.success).toHaveBeenCalledWith('Документ убран в архив')
  })

  it('«Показать архив» перечитывает с архивом; «Вернуть» — без вопроса', async () => {
    await mountPanel()
    api.list.mockResolvedValue([...DOCS, regDoc({ id: 'z', isArchived: true, number: 'OLD' })])
    api.restore.mockResolvedValue(regDoc({ id: 'z', isArchived: false, number: 'OLD' }))
    await w.get('[data-registry-show-archived]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenLastCalledWith('c1', { includeArchived: true, silent: true })
    const z = w.get('[data-registry-doc="z"]')
    expect(z.get('[data-registry-archived-tag]').text()).toBe('В архиве')
    expect(z.find('[data-registry-edit]').exists()).toBe(false)
    await z.get('[data-registry-archive]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.restore).toHaveBeenCalledWith('c1', 'z')
  })

  it('ошибка загрузки — «Повторить»', async () => {
    api.list.mockRejectedValueOnce(new Error('x'))
    await mountPanel()
    expect(w.find('[data-registry-error]').exists()).toBe(true)
    await w.get('[data-registry-retry]').trigger('click')
    await flushPromises()
    expect(ids()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('новый документ: без номера — ошибка в поле, запрос не уходит', async () => {
    await mountPanel()
    await w.get('[data-registry-add]').trigger('click')
    await flushPromises()
    const modal = document.body.querySelector('[data-registry-modal]')
    expect(modal).not.toBeNull()
    const form = modal!.querySelector('form')!
    form.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(api.create).not.toHaveBeenCalled()
    expect(modal!.textContent).toContain('Укажите номер документа')
    expect(modal!.textContent).toContain('Приложите файл документа')
  })
})
