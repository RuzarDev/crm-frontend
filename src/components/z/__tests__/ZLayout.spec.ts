import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZSkeleton from '../ZSkeleton.vue'
import ZEmpty from '../ZEmpty.vue'
import ZPanel from '../ZPanel.vue'
import ZPage from '../ZPage.vue'

describe('ZSkeleton', () => {
  it('рисует N строк и помечен как загрузка', () => {
    const w = mount(ZSkeleton, { props: { lines: 3 } })
    expect(w.findAll('[data-z-line]')).toHaveLength(3)
    expect(w.attributes('aria-busy')).toBe('true')
  })
})

describe('ZEmpty', () => {
  it('заголовок, подсказка и действие', () => {
    const w = mount(ZEmpty, { props: { title: 'Заявок пока нет', hint: 'Создайте первую' }, slots: { action: '<button>Новая заявка</button>' } })
    expect(w.text()).toContain('Заявок пока нет')
    expect(w.text()).toContain('Создайте первую')
    expect(w.find('button').exists()).toBe(true)
  })
})

describe('ZPanel', () => {
  it('заголовок и действия в шапке; без заголовка шапки нет', () => {
    const w = mount(ZPanel, { props: { title: 'Товары · 3' }, slots: { actions: '<button>Добавить</button>', default: 'тело' } })
    expect(w.find('header').text()).toContain('Товары · 3')
    expect(w.find('header button').exists()).toBe(true)
    expect(mount(ZPanel, { slots: { default: 'x' } }).find('header').exists()).toBe(false)
  })
  it('только действия — шапка есть, пустого h2 нет, действия справа', () => {
    const w = mount(ZPanel, { slots: { actions: '<button>Добавить</button>', default: 'тело' } })
    expect(w.find('header').exists()).toBe(true)
    expect(w.find('h2').exists()).toBe(false)
    expect(w.find('header > div').classes()).toContain('ml-auto')
  })
})

describe('ZPage', () => {
  it('h1 с заголовком, слоты meta/actions', () => {
    const w = mount(ZPage, {
      props: { title: 'И40-182 · ТОО «Казахмыс Трейд»', subtitle: 'Импорт 40' },
      slots: { meta: '<span class="m">Декларирование</span>', actions: '<button>Подать</button>', default: '<p>тело</p>' },
    })
    expect(w.find('h1').text()).toBe('И40-182 · ТОО «Казахмыс Трейд»')
    expect(w.find('.m').exists()).toBe(true)
    expect(w.find('button').text()).toBe('Подать')
  })
})
