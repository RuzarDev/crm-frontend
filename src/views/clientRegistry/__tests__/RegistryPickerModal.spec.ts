import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { fileDto } from '@/views/client/__tests__/caseFixture'
import { regDoc } from './registryFixture'

const api = vi.hoisted(() => ({ list: vi.fn(), attachToCase: vi.fn() }))
const imp = vi.hoisted(() => ({ listFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn() }))
vi.mock('@/api/clientRegistry', async (orig) => ({
  ...(await orig<typeof import('@/api/clientRegistry')>()),
  clientRegistryApi: api,
}))
vi.mock('@/api/import40', () => ({ import40Api: imp }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

import RegistryPickerModal from '../RegistryPickerModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import StepDocuments from '@/views/client/wizard/StepDocuments.vue'
import { useShipmentFiles } from '@/views/client/wizard/useShipmentFiles'

const DOCS = [
  regDoc({ id: 'old', category: 'permit', number: 'P-OLD', status: 'expired', daysLeft: -10, validUntil: '2026-10-07' }),
  regDoc({ id: 'cert', category: 'certificate', number: 'KZ-7', status: 'active', daysLeft: 120, validUntil: '2027-02-14' }),
  regDoc({ id: 'sc', category: 'supplyContract', number: 'SC-1', status: 'unlimited', daysLeft: null, validUntil: null }),
]

let w: VueWrapper
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const qa = (sel: string) => Array.from(document.body.querySelectorAll(sel)) as HTMLElement[]

beforeEach(() => {
  api.list.mockResolvedValue(DOCS)
  api.attachToCase.mockResolvedValue([fileDto({ id: 'n1', originalFileName: 'cert.pdf', docKind: 'conformity' })])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('RegistryPickerModal', () => {
  it('действующие — выше истёкших; истёкший помечен и предупреждает; вид документа — по категории', async () => {
    w = mountWithI18n(RegistryPickerModal, { props: { open: true, clientId: 'c1', caseId: 'case1' }, attachTo: document.body })
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith('c1', { silent: true })
    expect(qa('[data-picker-doc]').map((e) => e.dataset.pickerDoc)).toEqual(['cert', 'sc', 'old'])
    const old = q('[data-picker-doc="old"]')!
    expect(old.textContent).toContain('Истёк')

    old.click()
    await flushPromises()
    expect(q('[data-picker-expired]')?.textContent).toContain('Срок действия документа истёк')

    q('[data-picker-doc="cert"]')!.click()
    await flushPromises()
    expect(q('[data-picker-expired]')).toBeNull()
    expect(w.findComponent(ZSelect).props('value')).toBe('conformity')
  })

  it('«Приложить» — копия в заявку с видом документа, событие attached', async () => {
    w = mountWithI18n(RegistryPickerModal, { props: { open: true, clientId: 'c1', caseId: 'case1' }, attachTo: document.body })
    await flushPromises()
    q('[data-picker-doc="sc"]')!.click()
    await flushPromises()
    const ok = qa('[data-registry-picker] button').find((b) => b.textContent?.trim() === 'Приложить')!
    ok.click()
    await flushPromises()
    expect(api.attachToCase).toHaveBeenCalledWith('case1', 'sc', 'contract')
    expect(w.emitted('attached')?.[0]?.[0]).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('пустой реестр — подсказка, куда добавить', async () => {
    api.list.mockResolvedValue([])
    w = mountWithI18n(RegistryPickerModal, { props: { open: true, clientId: 'c1', caseId: 'case1' }, attachTo: document.body })
    await flushPromises()
    expect(q('[data-picker-empty]')?.textContent).toContain('В реестре пока нет документов')
  })
})

describe('StepDocuments: «Выбрать из реестра»', () => {
  it('кнопка есть, только когда известны заявка и клиент; после выбора список файлов перечитан', async () => {
    imp.listFiles.mockResolvedValue([])
    const docs = useShipmentFiles(ref('case1'))
    w = mountWithI18n(StepDocuments, { props: { docs }, attachTo: document.body })
    await flushPromises()
    expect(w.find('[data-docs-from-registry]').exists()).toBe(false)
    w.unmount()

    w = mountWithI18n(StepDocuments, { props: { docs, caseId: 'case1', clientId: 'c1' }, attachTo: document.body })
    await flushPromises()
    await w.get('[data-docs-from-registry]').trigger('click')
    await flushPromises()
    q('[data-picker-doc="cert"]')!.click()
    await flushPromises()
    imp.listFiles.mockResolvedValue([fileDto({ id: 'n1', originalFileName: 'cert.pdf', docKind: 'conformity' })])
    qa('[data-registry-picker] button').find((b) => b.textContent?.trim() === 'Приложить')!.click()
    await flushPromises()
    expect(api.attachToCase).toHaveBeenCalledWith('case1', 'cert', 'conformity')
    expect(w.get('[data-docs-registry-attached]').text()).toBe('Приложено из реестра: cert.pdf')
    expect(docs.filesOf('conformity').map((f) => f.originalFileName)).toEqual(['cert.pdf'])
  })
})
