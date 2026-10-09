import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DtGuideEntry } from '@/types/api'
import ZSelect from '@/components/z/ZSelect.vue'

const api = vi.hoisted(() => ({ getDtGuide: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: api }))

import DtGuidePage from '../DtGuidePage.vue'

const ENTRIES: DtGuideEntry[] = [
  { graph: '1', title: 'Декларация', html: '<p>Первая графа</p>' },
  { graph: '3', title: 'Формы', html: '<p>Графа три</p>' },
  { graph: '31', title: 'Грузовые места и описание товаров', html: '<p>&nbsp;&nbsp;&nbsp; Указываются сведения о товаре</p><p><br></p><script>window.__xss = 1</script><img src=x onerror="window.__xss = 2"><a href="javascript:alert(1)">ссылка</a>' },
  { graph: '33', title: 'Код товара', html: '<p>Код по ТН ВЭД</p><div>div table</div>' },
  { graph: '44', title: 'Дополнительная информация', html: '<p>Документы</p>' },
]
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
let router: Router
const mountAt = async (path = '/dt-guide') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(DtGuidePage, { attachTo: document.body, global: { plugins: [createPinia(), router] } })
  await flushPromises()
}
const items = () => w.findAll('[data-guide-item]').map((b) => b.attributes('data-guide-item'))
const active = () => w.find('[data-guide-item][aria-current="true"]').attributes('data-guide-item')
const title = () => w.get('[data-dtguide-title]').text()
const search = async (v: string) => { await w.get('[data-dtguide-search]').setValue(v); await flushPromises() }

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.getDtGuide.mockResolvedValue(ENTRIES)
  delete (window as unknown as Record<string, unknown>).__xss
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('DtGuidePage', () => {
  it('открывает первую графу и пишет её в ?graph=; список — все графы', async () => {
    await mountAt()
    expect(w.get('h1').text()).toBe('Порядок заполнения ДТ')
    expect(items()).toEqual(['1', '3', '31', '33', '44'])
    expect(active()).toBe('1')
    expect(title()).toBe('Декларация')
    expect(w.get('[data-dtguide-kicker]').text()).toBe('Графа 1')
    expect(router.currentRoute.value.query.graph).toBe('1')
  })

  it('?graph= из адреса открывает графу; неизвестная — первая, адрес исправляется', async () => {
    await mountAt('/dt-guide?graph=33')
    expect(active()).toBe('33')
    expect(title()).toBe('Код товара')
    w.unmount()
    await mountAt('/dt-guide?graph=999')
    expect(active()).toBe('1')
    expect(router.currentRoute.value.query.graph).toBe('1')
  })

  it('выбор графы в списке пишет ?graph= (replace) и меняет текст; смена адреса снаружи тоже', async () => {
    await mountAt()
    await w.get('[data-guide-item="44"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.graph).toBe('44')
    expect(title()).toBe('Дополнительная информация')
    await router.push('/dt-guide?graph=3')
    await flushPromises()
    expect(active()).toBe('3')
    expect(title()).toBe('Формы')
  })

  it('поиск по номеру: точный номер первым, затем номера с этим началом', async () => {
    await mountAt()
    await search('3')
    expect(items().filter((g) => g !== active()).slice(0, 3)).toEqual(['3', '31', '33'])
  })

  it('поиск по названию; в разметку графы поиск не заглядывает', async () => {
    await mountAt('/dt-guide?graph=44')
    await search('товар')
    expect(items()).toEqual(['44', '31', '33'])
    await search('div')
    expect(w.find('[data-dtguide-nothing]').exists()).toBe(true)
    expect(w.get('[data-dtguide-nothing]').text()).toContain('По запросу «div» граф не нашлось')
    await search('')
    expect(w.find('[data-dtguide-nothing]').exists()).toBe(false)
    expect(items()).toEqual(['1', '3', '31', '33', '44'])
  })

  it('фильтр скрыл открытую графу: она остаётся открытой, в списке закреплена сверху и подсвечена', async () => {
    await mountAt('/dt-guide?graph=44')
    await search('код товара')
    expect(title()).toBe('Дополнительная информация')
    expect(items()).toEqual(['44', '33'])
    expect(active()).toBe('44')
    expect(w.get('[data-guide-item="44"]').attributes('data-pinned')).toBe('true')
    expect(w.get('[data-dtguide-pinned]').text()).toContain('не подходит под поиск')
    expect(router.currentRoute.value.query.graph).toBe('44')
    // Открытая графа подходит под поиск — закреплять нечего.
    await search('допол')
    expect(items()).toEqual(['44'])
    expect(w.find('[data-dtguide-pinned]').exists()).toBe(false)
  })

  it('текст графы очищается: ни скриптов, ни обработчиков, ни javascript:, отступ из &nbsp; убран', async () => {
    await mountAt('/dt-guide?graph=31')
    const html = w.get('[data-dtguide-html]')
    expect(html.text()).toContain('Указываются сведения о товаре')
    expect(html.html()).not.toContain('<script')
    expect(html.html()).not.toContain('onerror')
    expect(html.find('img').exists()).toBe(false)
    expect(html.find('a').attributes('href')).toBeUndefined()
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined()
    expect(html.findAll('p')[0].html()).not.toContain('&nbsp;')
    expect(html.findAll('p')).toHaveLength(1)
  })

  it('справочник грузится тихо (ошибку рисует сама страница, без второго тоста)', async () => {
    await mountAt()
    expect(api.getDtGuide).toHaveBeenCalledWith({ silent: true })
  })

  it('текст с <br> и пустым абзацем по краям начинается с текста; картинка, что не загрузилась, прячется вместе с абзацем', async () => {
    api.getDtGuide.mockResolvedValue([
      { graph: '1', title: 'Декларация', html: '<br><p><img src="https://adilet.zan.kz/a.png"></p><br><p>Первая графа</p><br>' },
    ])
    await mountAt()
    const box = w.get('[data-dtguide-html]')
    expect(box.element.innerHTML.startsWith('<p><img')).toBe(true)
    expect(box.element.innerHTML.endsWith('</p>')).toBe(true)
    const img = box.get('img')
    img.element.dispatchEvent(new Event('error')) // событие error не всплывает — обработчик ловит его в фазе захвата на контейнере
    await flushPromises()
    expect((img.element as HTMLImageElement).hidden).toBe(true)
    expect(box.get('p').element.hidden).toBe(true)
    expect(box.text()).toContain('Первая графа')
  })

  it('на телефоне список — выбор над текстом: те же графы, выбор открывает графу', async () => {
    await mountAt('/dt-guide?graph=33')
    const select = w.findComponent(ZSelect)
    expect(select.exists()).toBe(true)
    expect((select.props('options') as { value: string; label: string }[]).map((o) => o.label)).toEqual([
      'Гр. 1 · Декларация', 'Гр. 3 · Формы', 'Гр. 31 · Грузовые места и описание товаров', 'Гр. 33 · Код товара', 'Гр. 44 · Дополнительная информация',
    ])
    expect(select.props('value')).toBe('33')
    await select.vm.$emit('update:value', '3')
    await flushPromises()
    expect(title()).toBe('Формы')
    expect(router.currentRoute.value.query.graph).toBe('3')
  })

  it('ошибка — «Повторить»; после повтора список и текст на месте', async () => {
    api.getDtGuide.mockRejectedValueOnce(httpError(500))
    await mountAt()
    expect(w.get('[data-dtguide-error]').text()).toContain('Не удалось загрузить')
    expect(w.find('[data-dtguide-list]').exists()).toBe(false)
    await w.get('[data-dtguide-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-dtguide-error]').exists()).toBe(false)
    expect(items()).toHaveLength(5)
    expect(title()).toBe('Декларация')
  })

  it('пустой справочник — отдельный текст, не ошибка', async () => {
    api.getDtGuide.mockResolvedValueOnce([])
    await mountAt()
    expect(w.find('[data-dtguide-error]').exists()).toBe(false)
    expect(w.get('[data-dtguide-pick]').text()).toContain('Порядок заполнения пока не загружен')
  })
})
