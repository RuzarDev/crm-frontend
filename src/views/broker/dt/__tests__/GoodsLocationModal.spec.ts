import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import GoodsLocationModal from '../sections/GoodsLocationModal.vue'

const refs = vi.hoisted(() => ({ addGoodsLocation: vi.fn(), listClassifiers: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: toast }))

const item = (code: string, nameRu: string) => ({ id: code, classifierCode: 'goods-locations', code, nameRu, sortOrder: 0, isActive: true })
let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = { 'goods-locations': [item('11', 'СВХ')] }
})

const mount = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(GoodsLocationModal, { props: { open: true, ...props }, global: { plugins: [pinia] }, attachTo: document.body })
  await flushPromises()
}
const code = () => document.body.querySelector('[data-location-code]') as HTMLInputElement
const name = () => document.body.querySelector('[data-location-name]') as HTMLInputElement
const type = async (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); await nextTick() }
const okButton = () => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Добавить') as HTMLButtonElement

describe('GoodsLocationModal — добавить место нахождения товаров в справочник', () => {
  it('открывается с кодом из графы; без названия не сохраняет и показывает ошибку', async () => {
    await mount({ initialCode: '77' })
    expect(code().value).toBe('77')
    expect(name().value).toBe('')
    okButton().click()
    await flushPromises()
    expect(refs.addGoodsLocation).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Введите название')
  })

  it('код, которого уже нет в справочнике, не принимается', async () => {
    await mount({ initialCode: '11' })
    await type(name(), 'Другое')
    expect(document.body.textContent).toContain('Код 11 уже есть в справочнике')
    okButton().click()
    await flushPromises()
    expect(refs.addGoodsLocation).not.toHaveBeenCalled()
  })

  it('успех: POST, справочник перечитан, saved(код), окно закрыто, сообщение', async () => {
    refs.addGoodsLocation.mockResolvedValue({})
    refs.listClassifiers.mockResolvedValue([item('11', 'СВХ'), item('77', 'Новое')])
    await mount({ initialCode: ' 77 ' })
    await type(name(), ' Новое место ')
    okButton().click()
    await flushPromises()
    expect(refs.addGoodsLocation).toHaveBeenCalledWith('77', 'Новое место')
    expect(useClassifiersStore().options('goods-locations').map((o) => o.value)).toContain('77')
    expect(w.emitted('saved')).toEqual([['77']])
    expect(w.emitted('update:open')).toEqual([[false]])
    expect(toast.success).toHaveBeenCalledWith('Добавлено в справочник «Место нахождения товаров»')
  })

  it('отказ сервера: окно остаётся, введённое не теряется, сообщение об ошибке', async () => {
    refs.addGoodsLocation.mockRejectedValue(new Error('403'))
    await mount({ initialCode: '78' })
    await type(name(), 'Место')
    okButton().click()
    await flushPromises()
    expect(w.emitted('saved')).toBeUndefined()
    expect(w.emitted('update:open')).toBeUndefined()
    expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить в справочник')
    expect(name().value).toBe('Место')
    expect(code().value).toBe('78')
  })
})
