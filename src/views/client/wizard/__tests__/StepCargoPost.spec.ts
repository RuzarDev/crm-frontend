import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'
import { resetAiTnvedStatus } from '@/components/aiTnved/aiTnved'
import { buildCustomsPostOptions } from '@/utils/customsPosts'
import ru from '@/i18n/locales/ru'

const api = vi.hoisted(() => ({ suggest: vi.fn(), select: vi.fn(), status: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(), stats: vi.fn() }))
vi.mock('@/api/aiTnved', async (orig) => ({ ...(await orig<typeof import('@/api/aiTnved')>()), aiTnvedApi: api }))

import StepCargo from '../StepCargo.vue'

// Правка №11 (21.10): «Куда прибудет груз» ищет пост по коду, названию и адресу из КЕДЕН; в заявку уходит полное имя.
const options = buildCustomsPostOptions([
  { id: '1', name: '55101 — ТАМОЖЕННЫЙ ПОСТ «АСТАНА – ЦЕНТР ТАМОЖЕННОГО ОФОРМЛЕНИЯ»', isActive: true },
  { id: '2', name: '55103 — ТАМОЖЕННЫЙ ПОСТ «АУЕЖАЙ-АСТАНА»', isActive: true, code: '55103', transportKind: 'AIR', location: 'РЕСПУБЛИКА КАЗАХСТАН Г.АСТАНА, МЕЖДУНАРОДНЫЙ АЭРОПОРТ' },
  { id: '3', name: '55301 — ТАМОЖЕННЫЙ ПОСТ «ЖЕТЫСУ»', isActive: true, transportKind: 'AIR', location: 'РЕСПУБЛИКА КАЗАХСТАН 050079 Г.АЛМАТЫ, УЛ.АХМЕТОВА, 51, УЛ.МАЙЛИНА, 2' },
  { id: '4', name: '55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦЕНТР ТАМОЖЕННОГО ОФОРМЛЕНИЯ»', isActive: true },
  { id: '5', name: '55303 — ТАМОЖЕННЫЙ ПОСТ «СПЕЦИАЛЬНАЯ ЭКОНОМИЧЕСКАЯ ЗОНА «ПАРК ИНОВАЦИОННЫХ ТЕХНОЛОГИЙ»', isActive: true },
], (k) => ({ AIR: 'авиа', AUTO: 'авто', RW: 'ж/д', VESSEL: 'море' })[k])

let w: VueWrapper
beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().role = 'client'
  resetAiTnvedStatus()
  api.status.mockResolvedValue({ available: false, configured: false, clientsEnabled: false, provider: 'Off', model: null })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const draft = () => reactive({ cargo: 'Насосы', post: '', estimatedValue: null, currency: null })
const mount = async (d = draft()) => {
  w = mountWithI18n(StepCargo, { props: { draft: d as never, postOptions: options }, attachTo: document.body })
  await flushPromises()
  return d
}
const postInput = () => w.get('input[data-wz-post]')
const search = async (q: string) => {
  await postInput().trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
  await postInput().setValue(q)
  await nextTick()
}
const optionEls = () => [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[]

describe('StepCargo: поиск поста', () => {
  it('подсказка в поле — про код и название', async () => {
    await mount()
    expect(postInput().attributes('placeholder')).toBe('Код или название: 55103, аэропорт')
  })

  it('«553» — три поста, у каждого код отдельно; адрес и вид транспорта — только у поста с данными КЕДЕН', async () => {
    await mount()
    await search('553')
    const els = optionEls()
    expect(els.map((e) => e.querySelector('[data-post-code]')?.textContent)).toEqual(['55301', '55302', '55303'])
    expect(els.every((e) => e.querySelector('[data-post-option]'))).toBe(true)
    expect(els[0].querySelector('[data-post-hint]')?.textContent).toBe('авиа · Г.АЛМАТЫ, УЛ.АХМЕТОВА, 51, УЛ.МАЙЛИНА, 2')
    expect(els[1].querySelector('[data-post-hint]')).toBeNull()
  })

  it('«аэропорт алматы» — пост 55301 по адресу из КЕДЕН', async () => {
    await mount()
    await search('аэропорт алматы')
    expect(optionEls().map((e) => e.querySelector('[data-post-code]')?.textContent)).toEqual(['55301'])
  })

  it('ничего не найдено — совет ввести код или оставить пустым', async () => {
    await mount()
    await search('99999')
    expect(optionEls()).toHaveLength(0)
    expect(document.body.textContent).toContain(ru.client.wizard.cargo.postNotFound)
  })

  it('выбор найденного по коду — в черновик уходит полное имя поста', async () => {
    const d = await mount()
    await search('55103')
    expect(optionEls()).toHaveLength(1)
    optionEls()[0].click()
    await nextTick()
    expect(d.post).toBe('55103 — ТАМОЖЕННЫЙ ПОСТ «АУЕЖАЙ-АСТАНА»')
  })

  it('старое значение черновика не из справочника показывается как есть', async () => {
    await mount(reactive({ cargo: 'Насосы', post: 'Хоргос — ЦТО', estimatedValue: null, currency: null }))
    expect((postInput().element as HTMLInputElement).value).toBe('Хоргос — ЦТО')
  })
})
