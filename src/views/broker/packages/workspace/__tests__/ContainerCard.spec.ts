import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'
import { container, file, fullPartia, pkg } from '../../partia/__tests__/packageFixture'
import { DropdownStub } from './harness'

import ContainerCard from '../ContainerCard.vue'

// Карточка контейнера сама по себе: номер, второй номер, ЖД накладная, партии (клиент, маршрут, пробелы, счётчики), права.
let w: VueWrapper
const mountCard = (o: { pkg?: DocumentPackageDto; index?: number; canEdit?: boolean; clientLabel?: (n: string) => string } = {}) => {
  const p = o.pkg ?? pkg()
  w = mountWithI18n(ContainerCard, {
    props: {
      pkg: p, container: p.containers[o.index ?? 0], canEdit: o.canEdit ?? true, busy: false,
      isPending: () => false, clientLabel: o.clientLabel ?? ((n: string) => n),
    },
    global: { stubs: { ZDropdown: DropdownStub } },
  })
}

afterEach(() => w?.unmount())

describe('ContainerCard', () => {
  it('номер моно «MRSU 488584 9», второй номер, ЖД накладная · n — нажатие открывает первую', async () => {
    mountCard({ pkg: pkg({ containers: [container({ secondaryContainerNumber: 'TGHU3102241' })] }) })
    expect(w.get('[data-ws-container-number]').text()).toBe('MRSU 488584 9')
    expect(w.get('[data-ws-container-secondary]').text()).toBe('прицеп TGHU 310224 1')
    expect(w.get('[data-ws-rail]').text()).toBe('ЖД накладная · 1')
    await w.get('[data-ws-rail]').trigger('click')
    expect(w.emitted('preview')?.[0]?.[0]).toMatchObject({ id: 'f-rail' })
  })

  it('без файлов уровня контейнера — без «ЖД накладной»; без партий — «Партий пока нет»', () => {
    mountCard({ index: 1 })
    expect(w.find('[data-ws-rail]').exists()).toBe(false)
    expect(w.get('[data-ws-no-partias]').text()).toBe('Партий пока нет')
  })

  it('партия: клиент подписью страницы, маршрут, счётчик товаров и привязанных файлов', () => {
    mountCard({ clientLabel: (n) => (n === 'kazakhmys' ? 'ТОО «Казахмыс Трейд»' : n) })
    expect(w.get('[data-ws-partia-client]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(w.get('[data-ws-partia-route]').text()).toBe('Lenovo Ltd → ТОО «Казахмыс Трейд» · ст. Сарыагаш · пломба SL-123')
    // 2 товара; документы — привязанные файлы партии (invoice.pdf и tsd.pdf), а не строки гр.44.
    expect(w.get('[data-ws-partia-summary]').text()).toBe('2 товара · 2 док.')
    expect(w.find('[data-ws-partia-gaps]').exists()).toBe(false)
  })

  it('чего не хватает партии — золотом; пустые стороны в маршруте — «—»', () => {
    const p = pkg({
      files: [file({ id: 'x', clientConsolidationId: 'p1' })],
      containers: [container({ consolidations: [fullPartia({ consignee: null, goodsItems: [], destinationStation: null, sealNumber: null })] })],
    })
    mountCard({ pkg: p })
    expect(w.get('[data-ws-partia-gaps]').text()).toBe('не хватает: получателя, товаров')
    expect(w.get('[data-ws-partia-route]').text()).toBe('Lenovo Ltd → —')
    expect(w.get('[data-ws-partia-summary]').text()).toBe('0 товаров · 1 док.')
  })

  it('действия: «+ Клиент», «Изменить», «Удалить», «Открыть», «Удалить партию»', async () => {
    mountCard()
    await w.get('[data-ws-add-partia]').trigger('click')
    const containerMenu = w.findAll('[data-dropdown]')[0] // первое меню — контейнера, дальше — партий
    await containerMenu.get('[data-menu-item="edit"]').trigger('click')
    await containerMenu.get('[data-menu-item="delete"]').trigger('click')
    await w.get('[data-ws-partia-open]').trigger('click')
    await w.get('[data-ws-partia] [data-menu-item="delete"]').trigger('click')
    expect(w.emitted('addPartia')).toHaveLength(1)
    expect(w.emitted('edit')).toHaveLength(1)
    expect(w.emitted('delete')).toHaveLength(1)
    expect(w.emitted('openPartia')?.[0]).toEqual(['p1'])
    expect(w.emitted('deletePartia')?.[0]).toEqual(['p1'])
  })

  it('только чтение: нет «+ Клиент» и меню, «Открыть» остаётся', () => {
    mountCard({ canEdit: false })
    expect(w.find('[data-ws-add-partia]').exists()).toBe(false)
    expect(w.find('[data-ws-container-more]').exists()).toBe(false)
    expect(w.find('[data-ws-partia-more]').exists()).toBe(false)
    expect(w.find('[data-ws-partia-open]').exists()).toBe(true)
  })
})
