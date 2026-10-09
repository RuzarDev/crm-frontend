import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import KatoField from '../KatoField.vue'

const kato = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn() }))
vi.mock('@/api/kato', async (orig) => ({ ...(await orig<typeof import('@/api/kato')>()), katoApi: kato }))

const item = (code: string, nameRu: string, path = '') => ({ code, nameRu, nameKk: nameRu, level: 2, path })
let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers() })
beforeEach(() => {
  kato.search.mockResolvedValue([])
  kato.get.mockResolvedValue(null)
})
const mount = (value: string | null = null, props: Record<string, unknown> = {}) => {
  w = mountWithI18n(KatoField, { props: { value, ...props }, attachTo: document.body })
}
const input = () => w.get('input').element as HTMLInputElement
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.replace(/\s+/g, ' ').trim())

describe('KatoField', () => {
  it('сохранённый код показывается с названием; монтирование значение не меняет', async () => {
    kato.get.mockResolvedValue(item('751110000', 'Алматы', 'Алматы Г.А.'))
    mount('751110000')
    await flushPromises()
    expect(kato.get).toHaveBeenCalledWith('751110000')
    expect(input().value).toBe('751110000 — Алматы (Алматы Г.А.)')
    expect(w.emitted('update:value')).toBeUndefined()
  })

  it('поиск — с паузой 250 мс, на сервере; ответ устаревшего запроса отбрасывается', async () => {
    vi.useFakeTimers()
    mount()
    let resolveSlow!: (v: unknown) => void
    kato.search.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
    kato.search.mockResolvedValueOnce([item('751210000', 'Медеуский район')])
    await w.get('input').setValue('ал')
    await vi.advanceTimersByTimeAsync(100)
    expect(kato.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(kato.search).toHaveBeenLastCalledWith('ал', 40, { silent: true })
    await w.get('input').setValue('медеу')
    await vi.advanceTimersByTimeAsync(300)
    expect(kato.search).toHaveBeenCalledTimes(2)
    resolveSlow([item('750000000', 'Алматы')])
    await flushPromises()
    expect(optionTexts()).toEqual(['Медеуский район751210000'])
  })

  it('выбор пишет код; очистка — null', async () => {
    kato.search.mockResolvedValue([item('751110000', 'Алматы', 'Алматы Г.А.')])
    mount()
    await w.get('input').trigger('focus')
    await flushPromises()
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual(['751110000'])
    await w.setProps({ value: '751110000' })
    await w.get('button[aria-label="Очистить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
  })
})
