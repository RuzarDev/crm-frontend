import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZTable from '../ZTable.vue'
import ZPagination from '../ZPagination.vue'
import ZField from '../ZField.vue'
import ZForm from '../ZForm.vue'
import ZInput from '../ZInput.vue'
import type { ZColumn } from '@/ui/table'

let w: VueWrapper
afterEach(() => w?.unmount())

interface Row { id: number; name: string | null; sum: number | null; client: { bin: string } }
const rows: Row[] = [
  { id: 1, name: 'Яблоко', sum: 10, client: { bin: '111' } },
  { id: 2, name: 'арбуз', sum: 2, client: { bin: '222' } },
  { id: 3, name: null, sum: null, client: { bin: '333' } },
  { id: 4, name: 'Ёлка', sum: 33, client: { bin: '444' } },
]
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Строка ${i + 1}`, sum: i, client: { bin: '' } }))

const bodyRows = () => w.findAll('tbody tr')
const column = (i: number) => bodyRows().map((r) => r.findAll('td')[i].find('[data-z-value]').text())
const ths = () => w.findAll('thead th')

describe('ZTable — колонки и ячейки', () => {
  it('заголовки, значения, вложенный dataIndex строкой и массивом, align=right → tabular-nums', () => {
    const columns: ZColumn<Row>[] = [
      { title: 'Название', dataIndex: 'name' },
      { title: 'БИН', dataIndex: 'client.bin' },
      { title: 'БИН2', dataIndex: ['client', 'bin'] },
      { title: 'Сумма', dataIndex: 'sum', align: 'right' },
    ]
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id' } })
    expect(w.find('table').exists()).toBe(true)
    expect(ths().map((t) => t.text())).toEqual(['Название', 'БИН', 'БИН2', 'Сумма'])
    expect(column(1)).toEqual(['111', '222', '333', '444'])
    expect(column(2)).toEqual(['111', '222', '333', '444'])
    const sumCell = bodyRows()[0].findAll('td')[3]
    expect(sumCell.classes()).toEqual(expect.arrayContaining(['text-right', 'tabular-nums']))
    // подпись колонки для карточки на телефоне
    expect(bodyRows()[0].findAll('td')[0].find('[data-z-label]').text()).toBe('Название')
  })

  it('#bodyCell подменяет ячейку и получает { column, record, index, text }; пустой слот — текст по умолчанию', () => {
    const seen: Array<{ key?: string; id: number; index: number; text: unknown }> = []
    w = mountWithI18n(ZTable, {
      props: { columns: [{ title: 'Название', dataIndex: 'name', key: 'name' }, { title: 'Сумма', dataIndex: 'sum', key: 'sum' }], dataSource: rows.slice(0, 2), rowKey: 'id' },
      slots: {
        bodyCell: (p: { column: ZColumn<Row>; record: Row; index: number; text: unknown }) => {
          seen.push({ key: p.column.key, id: p.record.id, index: p.index, text: p.text })
          return p.column.key === 'name' ? h('b', `«${p.text}»`) : undefined
        },
      },
    })
    expect(column(0)).toEqual(['«Яблоко»', '«арбуз»'])
    expect(column(1)).toEqual(['10', '2'])
    expect(seen).toContainEqual({ key: 'name', id: 2, index: 1, text: 'арбуз' })
  })

  it('пустой слот из v-if (комментарий) тоже даёт текст по умолчанию', () => {
    w = mountWithI18n({
      components: { ZTable },
      data: () => ({ columns: [{ title: 'Н', dataIndex: 'name', key: 'name' }, { title: 'С', dataIndex: 'sum', key: 'sum' }], rows: rows.slice(0, 1) }),
      template: `<ZTable :columns="columns" :data-source="rows" row-key="id">
        <template #bodyCell="{ column, record }"><template v-if="column.key === 'sum'"><i>{{ record.sum }} ₸</i></template></template>
      </ZTable>`,
    })
    expect(column(0)).toEqual(['Яблоко'])
    expect(column(1)).toEqual(['10 ₸'])
  })

  it('customRender — строка или VNode', () => {
    const columns: ZColumn<Row>[] = [
      { title: 'Н', dataIndex: 'name', customRender: ({ text, index }) => `${index + 1}. ${text}` },
      { title: 'С', dataIndex: 'sum', customRender: ({ record }) => h('em', String((record.sum ?? 0) * 2)) },
    ]
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows.slice(0, 2), rowKey: 'id' } })
    expect(column(0)).toEqual(['1. Яблоко', '2. арбуз'])
    expect(bodyRows()[1].find('em').text()).toBe('4')
  })

  it('ellipsis — обрезка и title с полным текстом', () => {
    w = mountWithI18n(ZTable, { props: { columns: [{ title: 'Н', dataIndex: 'name', ellipsis: true }], dataSource: rows.slice(0, 1), rowKey: 'id' } })
    const v = bodyRows()[0].find('[data-z-value]')
    expect(v.classes()).toContain('truncate')
    expect(v.attributes('title')).toBe('Яблоко')
  })

  it('#headerCell, #emptyText не мешают; className и rowClassName; customRow вешает обработчики на строку', async () => {
    const onClick = vi.fn()
    w = mountWithI18n(ZTable, {
      props: {
        columns: [{ title: 'Н', dataIndex: 'name', key: 'name', className: 'col-x' }],
        dataSource: rows.slice(0, 2),
        rowKey: 'id',
        rowClassName: (r: Row) => (r.id === 2 ? 'row-two' : ''),
        customRow: (r: Row) => ({ onClick: () => onClick(r.id) }),
      },
      slots: { headerCell: ({ column: c }: { column: ZColumn<Row> }) => h('span', `[${c.title}]`) },
    })
    expect(ths()[0].text()).toBe('[Н]')
    expect(ths()[0].classes()).toContain('col-x')
    expect(bodyRows()[0].find('td').classes()).toContain('col-x')
    expect(bodyRows()[1].classes()).toContain('row-two')
    await bodyRows()[1].trigger('click')
    expect(onClick).toHaveBeenCalledWith(2)
  })
})

describe('ZTable — сортировка', () => {
  const columns: ZColumn<Row>[] = [
    { title: 'Название', dataIndex: 'name', key: 'name', sorter: true },
    { title: 'Сумма', dataIndex: 'sum', key: 'sum', sorter: true },
    { title: 'БИН', dataIndex: 'client.bin' },
  ]

  it('клик: по возрастанию → по убыванию → нет; aria-sort; change с sorter', async () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id' } })
    expect(ths()[1].attributes('aria-sort')).toBe('none')
    expect(ths()[2].attributes('aria-sort')).toBeUndefined()
    const btn = ths()[1].find('button')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.text()).toBe('Сумма')

    await btn.trigger('click')
    expect(ths()[1].attributes('aria-sort')).toBe('ascending')
    expect(column(1)).toEqual(['2', '10', '33', ''])
    const ev = w.emitted('change')!.at(-1)!
    expect(ev[0]).toEqual({ current: 1, pageSize: 25, total: 4 })
    expect(ev[1]).toMatchObject({ columnKey: 'sum', field: 'sum', order: 'ascend' })

    await btn.trigger('click')
    expect(ths()[1].attributes('aria-sort')).toBe('descending')
    expect(column(1)).toEqual(['33', '10', '2', ''])

    await btn.trigger('click')
    expect(ths()[1].attributes('aria-sort')).toBe('none')
    expect(column(1)).toEqual(['10', '2', '', '33'])
    expect(w.emitted('change')!.at(-1)![1]).toMatchObject({ columnKey: 'sum', order: null })
  })

  it('строки по-русски, пустые — в конце; другая колонка сбрасывает первую', async () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id' } })
    await ths()[1].find('button').trigger('click')
    await ths()[0].find('button').trigger('click')
    expect(column(0)).toEqual(['арбуз', 'Ёлка', 'Яблоко', ''])
    expect(ths()[1].attributes('aria-sort')).toBe('none')
    await ths()[0].find('button').trigger('click')
    expect(column(0)).toEqual(['Яблоко', 'Ёлка', 'арбуз', ''])
  })

  it('клавиатура: Enter и Space на кнопке заголовка (по одному шагу)', async () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id' } })
    const btn = ths()[1].find('button')
    await btn.trigger('keydown', { key: 'Enter' })
    expect(ths()[1].attributes('aria-sort')).toBe('ascending')
    await btn.trigger('keydown', { key: ' ' })
    await btn.trigger('keyup', { key: ' ' })
    expect(ths()[1].attributes('aria-sort')).toBe('descending')
  })

  it('defaultSortOrder и функция-sorter', () => {
    w = mountWithI18n(ZTable, {
      props: {
        columns: [{ title: 'С', dataIndex: 'sum', key: 'sum', defaultSortOrder: 'descend', sorter: (a: Row, b: Row) => (a.sum ?? -1) - (b.sum ?? -1) }],
        dataSource: rows,
        rowKey: 'id',
      },
    })
    expect(ths()[0].attributes('aria-sort')).toBe('descending')
    expect(column(0)).toEqual(['33', '10', '2', ''])
  })
})

describe('ZTable — пагинация', () => {
  const columns: ZColumn[] = [{ title: 'Н', dataIndex: 'name' }]

  it('по умолчанию 25 строк, страницы листаются, change с пагинацией', async () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: many(30), rowKey: 'id' } })
    expect(bodyRows()).toHaveLength(25)
    const nav = w.find('nav')
    expect(nav.attributes('aria-label')).toBe('Страницы')
    await nav.find('button[aria-label="Страница 2"]').trigger('click')
    expect(bodyRows()).toHaveLength(5)
    expect(column(0)[0]).toBe('Строка 26')
    expect(w.emitted('change')!.at(-1)![0]).toEqual({ current: 2, pageSize: 25, total: 30 })
  })

  it('одна страница — пагинации нет; :pagination="false" — все строки без пагинации', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: many(25), rowKey: 'id' } })
    expect(w.find('nav').exists()).toBe(false)
    w.unmount()
    w = mountWithI18n(ZTable, { props: { columns, dataSource: many(60), rowKey: 'id', pagination: false } })
    expect(bodyRows()).toHaveLength(60)
    expect(w.find('nav').exists()).toBe(false)
  })

  it('серверная (total): данные не режутся, change и onChange с новой страницей, showTotal', async () => {
    const onChange = vi.fn()
    w = mountWithI18n(ZTable, {
      props: {
        columns,
        dataSource: many(10),
        rowKey: 'id',
        pagination: { current: 1, pageSize: 10, total: 95, onChange, showTotal: (t: number) => `Всего ${t}` },
      },
    })
    expect(bodyRows()).toHaveLength(10)
    expect(w.text()).toContain('Всего 95')
    await w.find('nav button[aria-label="Страница 2"]').trigger('click')
    expect(onChange).toHaveBeenCalledWith(2, 10)
    expect(w.emitted('change')!.at(-1)![0]).toEqual({ current: 2, pageSize: 10, total: 95 })
    expect(bodyRows()).toHaveLength(10)
  })
})

describe('ZTable — выбор строк', () => {
  const columns: ZColumn<Row>[] = [{ title: 'Название', dataIndex: 'name' }]

  it('чекбокс в шапке: indeterminate при частичном выборе, выбрать все / снять; onChange(keys, rows)', async () => {
    const onChange = vi.fn()
    w = mountWithI18n({
      components: { ZTable },
      data: () => ({ keys: [2] as number[], columns, rows }),
      computed: {
        sel() {
          const vm = this as unknown as { keys: number[] }
          return {
            selectedRowKeys: vm.keys,
            onChange: (k: number[], r: Row[]) => { vm.keys = k; onChange(k, r) },
            getCheckboxProps: (r: Row) => ({ disabled: r.id === 4 }),
          }
        },
      },
      template: '<ZTable :columns="columns" :data-source="rows" row-key="id" :row-selection="sel" />',
    })
    const head = () => w.find('thead [role="checkbox"]')
    expect(head().attributes('aria-checked')).toBe('mixed')
    expect(head().attributes('aria-label')).toBe('Выбрать все на странице')
    expect(bodyRows()[1].attributes('data-selected')).toBeDefined()
    expect(bodyRows()[1].attributes('aria-selected')).toBe('true')

    await head().trigger('click')
    expect(onChange).toHaveBeenLastCalledWith([2, 1, 3], [rows[1], rows[0], rows[2]])
    expect(head().attributes('aria-checked')).toBe('true')
    const rowBox = (i: number) => bodyRows()[i].find('[role="checkbox"]')
    expect(rowBox(3).attributes('disabled')).toBeDefined()
    expect(rowBox(0).attributes('aria-label')).toBe('Выбрать строку')

    await rowBox(0).trigger('click')
    expect(onChange).toHaveBeenLastCalledWith([2, 3], [rows[1], rows[2]])
    await head().trigger('click') // частичный → все
    await head().trigger('click') // все → никого
    expect(onChange).toHaveBeenLastCalledWith([], [])
    expect(head().attributes('aria-checked')).toBe('false')
  })

  it('клик по чекбоксу не доходит до customRow onClick', async () => {
    const rowClick = vi.fn()
    w = mountWithI18n(ZTable, {
      props: { columns, dataSource: rows, rowKey: 'id', rowSelection: { selectedRowKeys: [] }, customRow: () => ({ onClick: rowClick }) },
    })
    await bodyRows()[0].find('[role="checkbox"]').trigger('click')
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('карточки на телефоне: чекбокс строки с областью нажатия 44px (отступ внутри label)', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id', rowSelection: { selectedRowKeys: [] } } })
    const label = bodyRows()[0].get('[role="checkbox"]').element.closest('label')!
    expect(label.className).toContain('max-sm:p-3.5')
    w.unmount()
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id', cards: false, rowSelection: { selectedRowKeys: [] } } })
    expect(bodyRows()[0].get('[role="checkbox"]').element.closest('label')!.className).not.toContain('max-sm:p-3.5')
  })

  it('rowKey-функция (record, index)', async () => {
    const onChange = vi.fn()
    w = mountWithI18n(ZTable, {
      props: { columns, dataSource: rows, rowKey: (r: Row, i: number) => `k${r.id}-${i}`, rowSelection: { selectedRowKeys: ['k2-1'], onChange } },
    })
    expect(bodyRows()[1].attributes('aria-selected')).toBe('true')
    await bodyRows()[0].find('[role="checkbox"]').trigger('click')
    expect(onChange).toHaveBeenLastCalledWith(['k2-1', 'k1-0'], [rows[1], rows[0]])
  })
})

describe('ZTable — загрузка и пусто', () => {
  const columns: ZColumn[] = [{ title: 'Н', dataIndex: 'name' }, { title: 'С', dataIndex: 'sum' }]

  it('loading без данных — 5 строк скелетона', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: [], loading: true } })
    expect(bodyRows()).toHaveLength(5)
    expect(w.findAll('[data-z-line]').length).toBe(10)
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('loading с данными — строки на месте, aria-busy и индикатор поверх', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id', loading: true } })
    expect(bodyRows()).toHaveLength(4)
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.find('[data-z-spin]').exists()).toBe(true)
  })

  it('пусто — ZEmpty с общими текстами; слот #emptyText; locale.emptyText', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: [] } })
    expect(w.text()).toContain('Здесь пока пусто')
    expect(w.find('tbody td').attributes('colspan')).toBe('2')
    w.unmount()
    w = mountWithI18n(ZTable, { props: { columns, dataSource: [] }, slots: { emptyText: () => 'Нет заявок' } })
    expect(w.find('tbody').text()).toBe('Нет заявок')
    w.unmount()
    w = mountWithI18n(ZTable, { props: { columns, dataSource: [], locale: { emptyText: 'Ничего' } } })
    expect(w.find('tbody').text()).toBe('Ничего')
  })

  it('#summary — в tfoot, получает pageData', () => {
    w = mountWithI18n(ZTable, {
      props: { columns, dataSource: rows, rowKey: 'id' },
      slots: { summary: ({ pageData }: { pageData: Row[] }) => h('tr', [h('td', `Итого ${pageData.length}`)]) },
    })
    expect(w.find('tfoot').text()).toBe('Итого 4')
  })
})

describe('ZTable — закреплённые колонки и прокрутка', () => {
  it('sticky left/right со смещениями; колонка выбора закрепляется вместе с левыми', () => {
    const columns: ZColumn<Row>[] = [
      { title: '№', key: 'n', width: 56, fixed: 'left' },
      { title: 'Название', dataIndex: 'name', width: 200 },
      { title: 'Действия', key: 'a', width: 130, fixed: 'right' },
    ]
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id', rowSelection: { selectedRowKeys: [] }, scroll: { x: 900 } } })
    const cells = bodyRows()[0].findAll('td')
    expect(cells[0].classes()).toContain('sticky')
    expect(cells[0].attributes('style')).toContain('left: 0px')
    expect(cells[1].attributes('style')).toContain('left: 40px')
    expect(cells[2].classes()).not.toContain('sticky')
    expect(cells[3].attributes('style')).toContain('right: 0px')
    expect(w.find('table').attributes('style')).toContain('--z-table-x: 900px')
    expect(w.find('[data-z-scroller]').classes()).toContain('overflow-x-auto')
  })
})

describe('ZTable — карточки на телефоне (CSS)', () => {
  const columns: ZColumn<Row>[] = [{ title: 'Название', dataIndex: 'name', sorter: true }, { title: 'БИН', dataIndex: 'client.bin' }]

  it('по умолчанию: таблица и строки становятся блоками/карточками на max-sm, шапка — строкой сортировки', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id' } })
    expect(w.find('table').classes()).toContain('max-sm:block')
    expect(bodyRows()[0].classes()).toEqual(expect.arrayContaining(['max-sm:flex', 'max-sm:rounded-row', 'max-sm:border']))
    expect(w.find('thead').classes()).toContain('max-sm:block')
    expect(ths()[1].classes()).toContain('max-sm:hidden') // без сортировки — скрыта на телефоне
    expect(ths()[0].classes()).not.toContain('max-sm:hidden')
  })

  it('пустая таблица — шапка на телефоне скрыта', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: [] } })
    expect(w.find('thead').classes()).toContain('max-sm:hidden')
  })

  it(':cards="false" — обычная таблица и на телефоне, без подписей ячеек', () => {
    w = mountWithI18n(ZTable, { props: { columns, dataSource: rows, rowKey: 'id', cards: false } })
    expect(w.html()).not.toContain('max-sm:')
    expect(w.find('[data-z-label]').exists()).toBe(false)
  })
})

describe('ZPagination', () => {
  it('кнопки страниц с aria-label, текущая aria-current, стрелки, многоточие', async () => {
    w = mountWithI18n(ZPagination, { props: { current: 1, total: 220, pageSize: 25 } })
    const nav = w.find('nav')
    expect(nav.attributes('aria-label')).toBe('Страницы')
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['Предыдущая страница', 'Страница 1', 'Страница 2', 'Страница 3', 'Страница 4', 'Страница 5', 'Страница 9', 'Следующая страница'])
    expect(w.text()).toContain('…')
    expect(w.find('button[aria-label="Страница 1"]').attributes('aria-current')).toBe('page')
    expect(w.find('button[aria-label="Предыдущая страница"]').attributes('disabled')).toBeDefined()
    for (const b of w.findAll('button')) expect(b.classes()).toContain('border-0')

    await w.find('button[aria-label="Следующая страница"]').trigger('click')
    expect(w.emitted('update:current')!.at(-1)).toEqual([2])
    expect(w.emitted('change')!.at(-1)).toEqual([2, 25])
    await w.setProps({ current: 9 })
    expect(w.find('button[aria-label="Следующая страница"]').attributes('disabled')).toBeDefined()
    await w.find('button[aria-label="Страница 9"]').trigger('click')
    expect(w.emitted('update:current')).toHaveLength(1) // текущая — без события
  })

  it('без v-model листается сама', async () => {
    w = mountWithI18n(ZPagination, { props: { total: 60 } })
    await w.find('button[aria-label="Страница 3"]').trigger('click')
    await nextTick()
    expect(w.find('button[aria-label="Страница 3"]').attributes('aria-current')).toBe('page')
  })
})

describe('ZTable — граница контекста поля', () => {
  const cols: ZColumn<Row>[] = [{ title: 'Название', dataIndex: 'name' }]
  it('ZField вокруг таблицы: чекбоксы выбора не занимают поле (нет id/aria поля, у подписи нет for)', async () => {
    const Host = defineComponent({
      render: () => h(ZField, { label: 'Документы', error: 'Нужен документ', required: true }, () =>
        h(ZTable, { columns: cols, dataSource: rows, rowKey: 'id', rowSelection: {} })),
    })
    w = mountWithI18n(Host, { attachTo: document.body })
    await nextTick()
    expect(w.get('label').attributes('for')).toBeUndefined()
    const boxes = w.findAll('[role="checkbox"]')
    expect(boxes.length).toBeGreaterThan(1)
    for (const b of boxes) {
      expect(b.attributes('aria-invalid')).toBeUndefined()
      expect(b.attributes('aria-describedby')).toBeUndefined()
      expect(b.attributes('id') ?? '').not.toMatch(/^z-field-/)
    }
  })
  it('ZField с обязательным ZInput в ячейке по-прежнему регистрируется в ZForm и не даёт отправить', async () => {
    const onFinish = vi.fn()
    const onFailed = vi.fn()
    const model = reactive({ items: [{ id: 1, qty: '' }] })
    const Host = defineComponent({
      render: () => h(ZForm, { model, onFinish, onFinishFailed: onFailed }, () => [
        h(ZTable, { columns: [{ title: 'Кол-во', key: 'qty' }], dataSource: model.items, rowKey: 'id' }, {
          bodyCell: ({ record }: { record: { qty: string } }) =>
            h(ZField, { name: 'items.0.qty', required: true }, () =>
              h(ZInput, { value: record.qty, 'onUpdate:value': (v: string) => { record.qty = v } })),
        }),
        h('button', { type: 'submit' }, 'OK'),
      ]),
    })
    w = mountWithI18n(Host, { attachTo: document.body })
    await w.get('form').trigger('submit')
    await new Promise((r) => setTimeout(r))
    expect(onFinish).not.toHaveBeenCalled()
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(w.get('td input').attributes('aria-invalid')).toBe('true')
  })
})

describe('ZTable — доработки финального ревью', () => {
  it('две колонки без key с одним dataIndex: ключи уникальны (без предупреждения Vue), dev-предупреждение, сортировка своя', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cols: ZColumn<Row>[] = [
      { title: 'Сумма', dataIndex: 'sum', sorter: true },
      { title: 'Сумма ещё', dataIndex: 'sum', sorter: true, customRender: ({ text }) => `≈${text ?? ''}` },
    ]
    w = mountWithI18n(ZTable, { props: { columns: cols, dataSource: rows, rowKey: 'id' } })
    await ths()[1].find('button').trigger('click')
    expect(ths()[1].attributes('aria-sort')).toBe('ascending')
    expect(ths()[0].attributes('aria-sort')).toBe('none')
    expect(w.emitted('change')!.at(-1)![1]).toMatchObject({ columnKey: 'sum-1', order: 'ascend' })
    const msgs = warn.mock.calls.map((c) => String(c[0]))
    expect(msgs.some((m) => m.includes('Duplicate keys'))).toBe(false)
    expect(msgs.some((m) => m.includes('ZTable') && m.includes('sum'))).toBe(true)
    warn.mockRestore()
  })
  it('имя таблицы: aria-label / aria-labelledby / aria-describedby — на <table>, class/style и прочее — на корень', () => {
    w = mountWithI18n(ZTable, {
      props: { columns: [{ title: 'Н', dataIndex: 'name' }], dataSource: rows, rowKey: 'id' },
      attrs: { class: 'mine', style: 'margin: 1px', 'aria-label': 'Декларации', 'aria-labelledby': 'h1', 'aria-describedby': 'd1', 'data-x': '1' },
    })
    const table = w.get('table')
    expect(table.attributes('aria-label')).toBe('Декларации')
    expect(table.attributes('aria-labelledby')).toBe('h1')
    expect(table.attributes('aria-describedby')).toBe('d1')
    expect(w.classes()).toContain('mine')
    expect(w.attributes('style')).toContain('margin')
    expect(w.attributes('aria-label')).toBeUndefined()
    expect(w.attributes('data-x')).toBe('1')
  })
  it('смена aria-label обновляет <table>', async () => {
    w = mountWithI18n(ZTable, { props: { columns: [{ title: 'Н', dataIndex: 'name' }], dataSource: rows, rowKey: 'id' }, attrs: { 'aria-label': 'А' } })
    await w.setProps({ 'aria-label': 'Б' } as never)
    expect(w.get('table').attributes('aria-label')).toBe('Б')
  })
  it('смена сортировки возвращает на первую страницу (клиентская)', async () => {
    w = mountWithI18n(ZTable, { props: { columns: [{ title: 'Н', dataIndex: 'sum', key: 'sum', sorter: true }], dataSource: many(30), rowKey: 'id' } })
    await w.find('nav button[aria-label="Страница 2"]').trigger('click')
    expect(bodyRows()).toHaveLength(5)
    await ths()[0].find('button').trigger('click')
    expect(bodyRows()).toHaveLength(25)
    expect(w.find('nav [aria-current="page"]').text()).toBe('1')
    expect(w.emitted('change')!.at(-1)![0]).toEqual({ current: 1, pageSize: 25, total: 30 })
  })
  it('смена сортировки на серверной: change и onChange с первой страницей', async () => {
    const onChange = vi.fn()
    w = mountWithI18n(ZTable, {
      props: { columns: [{ title: 'Н', dataIndex: 'sum', key: 'sum', sorter: true }], dataSource: many(10), rowKey: 'id', pagination: { current: 3, pageSize: 10, total: 95, onChange } },
    })
    await ths()[0].find('button').trigger('click')
    expect(w.emitted('change')!.at(-1)![0]).toEqual({ current: 1, pageSize: 10, total: 95 })
    expect(w.emitted('change')!.at(-1)![1]).toMatchObject({ columnKey: 'sum', order: 'ascend' })
    expect(onChange).toHaveBeenCalledWith(1, 10)
  })
  it('данные сократились — страница прижимается и остаётся прижатой, когда данных снова больше', async () => {
    w = mountWithI18n(ZTable, { props: { columns: [{ title: 'Н', dataIndex: 'name' }], dataSource: many(80), rowKey: 'id' } })
    await w.find('nav button[aria-label="Страница 4"]').trigger('click')
    expect(column(0)[0]).toBe('Строка 76')
    await w.setProps({ dataSource: many(40) })
    expect(column(0)[0]).toBe('Строка 26')
    await w.setProps({ dataSource: many(80) })
    expect(column(0)[0]).toBe('Строка 26')
    expect(w.find('nav [aria-current="page"]').text()).toBe('2')
  })
  it('чекбокс строки называется по первой ячейке строки (и общей подписью)', () => {
    w = mountWithI18n(ZTable, { props: { columns: [{ title: 'Название', dataIndex: 'name' }, { title: 'Сумма', dataIndex: 'sum' }], dataSource: rows, rowKey: 'id', rowSelection: {} }, attachTo: document.body })
    const names = bodyRows().map((r) => {
      const ids = r.get('[role="checkbox"]').attributes('aria-labelledby')!.split(' ')
      return ids.map((id) => document.getElementById(id)?.textContent?.trim()).join(' ')
    })
    expect(names[0]).toBe('Выбрать строку Яблоко')
    expect(names[1]).toBe('Выбрать строку арбуз')
    expect(new Set(names).size).toBe(names.length)
    expect(bodyRows()[0].get('[role="checkbox"]').attributes('aria-label')).toBe('Выбрать строку')
  })
})
