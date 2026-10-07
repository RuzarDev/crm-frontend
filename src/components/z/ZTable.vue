<script setup lang="ts" generic="T extends object">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, useAttrs, useId, useSlots, watch, type StyleValue, type VNodeChild } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { zFieldKey, type ZFieldContext } from '@/ui/form'
import {
  DEFAULT_PAGE_SIZE, alignClass, columnKey, columnKeys, fixedClass, fixedOffsets, fixedStyle, getValue, isEmptyContent, nextSortOrder,
  pageCount, paginate, resolveRowKey, sortRows,
  type ZColumn, type ZColumnView, type ZFixedInfo, type ZKey, type ZPaginationState, type ZRowKey, type ZRowSelection,
  type ZSortOrder, type ZSorter, type ZTablePagination,
} from '@/ui/table'
import ZCheckbox from './ZCheckbox.vue'
import ZEmpty from './ZEmpty.vue'
import ZPagination from './ZPagination.vue'
import ZSkeleton from './ZSkeleton.vue'
import ZSpin from './ZSpin.vue'
import ZTableHead from './ZTableHead.vue'

// Замена a-table и старого ui/ZTable: колонки и слоты как у AntD (#bodyCell/#headerCell/#emptyText/#summary,
// customRender, customRow, rowClassName, rowSelection, scroll.x/y), стандарты платформы — 25 строк без
// переключателя, пагинация скрыта на одной странице, карточки вместо таблицы на телефоне (только CSS).
// Не поддерживается: expandable, bordered, фильтры колонок, rowSelection.type='radio', showSizeChanger.
// Имя таблицы (aria-label / aria-labelledby / aria-describedby) — на <table>; class/style и прочие атрибуты — на корень.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const TABLE_ATTRS = ['aria-label', 'aria-labelledby', 'aria-describedby']
// $attrs не реактивен для computed — функции, вызываемые из шаблона.
const tableAttrs = () => Object.fromEntries(Object.entries(attrs).filter(([k]) => TABLE_ATTRS.includes(k)))
const rootAttrs = () => Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'class' && k !== 'style' && !TABLE_ATTRS.includes(k)))
const props = withDefaults(defineProps<{
  columns: ZColumn<T>[]
  dataSource?: T[]
  rowKey?: ZRowKey<T>
  loading?: boolean
  /** false — без пагинации; total задан — серверная (данные не режутся). */
  pagination?: false | ZTablePagination
  size?: 'large' | 'middle' | 'small'
  rowSelection?: ZRowSelection<T>
  /** x: ширина таблицы внутри прокрутки (число — px, true — по содержимому); y: высота области с прокруткой. */
  scroll?: { x?: number | string | true; y?: number | string }
  /** Строки-карточки на телефоне (по умолчанию да). */
  cards?: boolean
  rowClassName?: string | ((record: T, index: number) => string)
  /** Как у AntD: атрибуты и обработчики строки ({ onClick, style }). */
  customRow?: (record: T, index: number) => Record<string, unknown>
  locale?: { emptyText?: string }
}>(), { dataSource: () => [], rowKey: 'key', pagination: () => ({}), size: 'middle', cards: true })

const emit = defineEmits<{ change: [pagination: ZPaginationState, sorter: ZSorter<T>] }>()
defineSlots<{
  bodyCell?(p: { column: ZColumn<T>; record: T; index: number; text: unknown; value: unknown }): unknown
  headerCell?(p: { column: ZColumn<T>; title?: string }): unknown
  emptyText?(): unknown
  summary?(p: { pageData: T[] }): unknown
}>()
const slots = useSlots()
const { t } = useI18n()
// Таблица внутри ZField («Документы») не занимает поле своими чекбоксами выбора: подпись и ошибка поля
// не про них. Контекст формы (zFormKey) остаётся — ZField в редактируемых ячейках регистрируются в ZForm.
provide(zFieldKey, null as unknown as ZFieldContext)
const small = computed(() => props.size === 'small')

// --- ключи колонок: без повторов (две колонки без key с одним dataIndex), в разработке — предупреждение ---
const keys = computed(() => columnKeys(props.columns))
if (import.meta.env.DEV) {
  watch(keys, (list) => {
    const dup = list.filter((k, i) => k !== columnKey(props.columns[i], i))
    if (dup.length) console.warn(`[ZTable] колонки с одинаковым ключом (нет key, общий dataIndex) — задайте key: ${dup.join(', ')}`)
  }, { immediate: true })
}

// --- сортировка: внутренняя (defaultSortOrder) или управляемая (sortOrder у колонок) ---
const firstDefault = props.columns.findIndex((c) => c.defaultSortOrder)
const innerSort = ref<{ key: string; order: ZSortOrder } | null>(
  firstDefault >= 0 ? { key: keys.value[firstDefault], order: props.columns[firstDefault].defaultSortOrder! } : null,
)
const activeSort = computed(() => {
  if (!props.columns.some((c) => c.sortOrder !== undefined)) return innerSort.value
  const i = props.columns.findIndex((c) => c.sortOrder)
  return i >= 0 ? { key: keys.value[i], order: props.columns[i].sortOrder ?? null } : null
})
const orderOf = (key: string): ZSortOrder => (activeSort.value?.key === key ? activeSort.value.order : null)

// --- выбор строк ---
const hasSelection = computed(() => !!props.rowSelection)
const leadFixed = computed(() => hasSelection.value && props.columns.some((c) => c.fixed === 'left'))
const views = computed<ZColumnView<T>[]>(() => {
  const offsets = fixedOffsets(props.columns, leadFixed.value ? 40 : 0)
  return props.columns.map((column, i) => {
    const key = keys.value[i]
    return { column, key, fixed: offsets[i], sortable: !!column.sorter, order: orderOf(key) }
  })
})
const selectionFixed = computed<ZFixedInfo>(() => (leadFixed.value ? { side: 'left', offset: 0, edge: false } : {}))

const keyOf = computed(() => new Map(props.dataSource.map((r, i) => [r, resolveRowKey(r, i, props.rowKey)])))
const rowOf = computed(() => new Map(props.dataSource.map((r) => [String(keyOf.value.get(r)), r])))
const innerSelected = ref<ZKey[]>([])
const selectedKeys = computed(() => props.rowSelection?.selectedRowKeys ?? innerSelected.value)
const selectedSet = computed(() => new Set(selectedKeys.value.map(String)))
const isSelected = (r: T) => selectedSet.value.has(String(keyOf.value.get(r)))
const isSelectable = (r: T) => !props.rowSelection?.getCheckboxProps?.(r)?.disabled
const setSelection = (keys: ZKey[]) => {
  innerSelected.value = keys
  props.rowSelection?.onChange?.(keys, keys.map((k) => rowOf.value.get(String(k))).filter((r): r is T => r !== undefined))
}
const toggleRow = (r: T, checked: boolean) => {
  const key = keyOf.value.get(r)!
  setSelection(checked ? [...selectedKeys.value, key] : selectedKeys.value.filter((k) => String(k) !== String(key)))
}

// --- данные: сортировка → страница ---
const server = computed(() => props.pagination !== false && props.pagination.total !== undefined)
const sorted = computed(() => {
  const a = activeSort.value
  const col = a?.order ? views.value.find((v) => v.key === a.key)?.column : undefined
  // При серверной пагинации sorter: true сортирует сервер (как у AntD), функция — текущую страницу.
  if (!col || (server.value && col.sorter === true)) return props.dataSource
  return sortRows(props.dataSource, col, a!.order)
})
const pager = computed(() => (props.pagination === false ? null : props.pagination))
const pageSize = computed(() => pager.value?.pageSize ?? DEFAULT_PAGE_SIZE)
const total = computed(() => pager.value?.total ?? sorted.value.length)
const innerPage = ref(pager.value?.current ?? 1)
const lastPage = computed(() => Math.max(1, pageCount(total.value, pageSize.value)))
const current = computed(() => Math.min(Math.max(1, pager.value?.current ?? innerPage.value), lastPage.value))
// Данных стало меньше — своя страница прижимается к последней и такой остаётся (не прыгает назад, когда данных снова больше).
watch(lastPage, (last) => { if (innerPage.value > last) innerPage.value = last })
const pageRows = computed(() => (!pager.value || server.value ? sorted.value : paginate(sorted.value, current.value, pageSize.value)))
const showPager = computed(() => !!pager.value && !(pager.value.hideOnSinglePage !== false && pageCount(total.value, pageSize.value) <= 1))
const totalText = computed(() => {
  if (!pager.value?.showTotal) return ''
  const from = total.value ? (current.value - 1) * pageSize.value + 1 : 0
  return pager.value.showTotal(total.value, [from, Math.min(current.value * pageSize.value, total.value)])
})

const pageSelectable = computed(() => pageRows.value.filter(isSelectable))
const headSelection = computed(() => {
  if (!hasSelection.value) return null
  const all = pageSelectable.value.length > 0 && pageSelectable.value.every(isSelected)
  const some = pageSelectable.value.some(isSelected)
  return { checked: all, indeterminate: some && !all, disabled: pageSelectable.value.length === 0, fixed: selectionFixed.value }
})
const toggleAll = () => {
  const pageKeys = pageSelectable.value.map((r) => keyOf.value.get(r)!)
  const onPage = new Set(pageKeys.map(String))
  if (headSelection.value?.checked) setSelection(selectedKeys.value.filter((k) => !onPage.has(String(k))))
  else setSelection([...selectedKeys.value, ...pageKeys.filter((k) => !selectedSet.value.has(String(k)))])
}

// --- события ---
const sorterFor = (key: string | undefined, order: ZSortOrder): ZSorter<T> => {
  const v = views.value.find((x) => x.key === key)
  return { column: order ? v?.column : undefined, columnKey: key, field: v?.column.dataIndex, order }
}
const pagingState = (page = current.value): ZPaginationState => ({ current: page, pageSize: pageSize.value, total: total.value })
// Новая сортировка — с первой страницы (как у AntD: change с current 1 и pagination.onChange(1, pageSize)).
const onSort = (key: string) => {
  const order = nextSortOrder(orderOf(key))
  innerSort.value = order ? { key, order } : null
  innerPage.value = 1
  if (pager.value) pager.value.onChange?.(1, pageSize.value)
  emit('change', pagingState(1), sorterFor(key, order))
}
const onPage = (page: number) => {
  innerPage.value = page
  pager.value?.onChange?.(page, pageSize.value)
  emit('change', pagingState(page), sorterFor(activeSort.value?.key, activeSort.value?.order ?? null))
}

// --- ячейки ---
const cellOf = (v: ZColumnView<T>, record: T, index: number) => {
  const text = getValue(record, v.column.dataIndex)
  const fromSlot = slots.bodyCell?.({ column: v.column, record, index, text, value: text })
  let node: unknown = fromSlot
  if (isEmptyContent(fromSlot)) {
    node = v.column.customRender ? v.column.customRender({ text, value: text, record, index, column: v.column }) : text
  }
  const plain = typeof node === 'string' || typeof node === 'number' ? String(node) : undefined
  return { v, node: plain ?? node, title: v.column.ellipsis ? plain : undefined }
}
// Имя чекбокса строки: общая подпись «Выбрать строку» + текст первой ячейки строки («Выбрать строку ДТ-0012»).
const uid = `z-table-${useId()}`
const selectLabelId = `${uid}-select`
const firstCellId = (index: number) => `${uid}-r${index}`
const Content = (p: { node: unknown }) => p.node as VNodeChild
Content.props = ['node']

const rowClass = (r: T, i: number) => cn(
  'group/row',
  small.value ? 'h-8' : 'h-10',
  isSelected(r) ? 'bg-zircon-soft' : 'bg-surface hover:bg-canvas',
  props.cards && 'max-sm:flex max-sm:h-auto max-sm:flex-col max-sm:rounded-row max-sm:border max-sm:border-line max-sm:p-3',
  typeof props.rowClassName === 'function' ? props.rowClassName(r, i) : props.rowClassName,
)
const tdBase = computed(() => cn(
  'border-b border-line px-3 align-middle text-sm text-ink',
  small.value ? 'py-1' : 'py-2',
  props.cards && 'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:border-0 max-sm:px-0 max-sm:py-1',
))
const tdClass = (v: ZColumnView<T>) =>
  cn(tdBase.value, alignClass(v.column.align), v.fixed.side && 'z-[1] bg-inherit', fixedClass(v.fixed, edges, props.cards), v.column.className)
const selTdClass = computed(() =>
  cn(tdBase.value, 'w-10', leadFixed.value && 'z-[1] bg-inherit', fixedClass(selectionFixed.value, edges, props.cards), props.cards && 'max-sm:justify-start'))

// --- раскладка и прокрутка ---
const colCount = computed(() => props.columns.length + (hasSelection.value ? 1 : 0))
const scrollX = computed(() => {
  const x = props.scroll?.x
  return x === undefined ? undefined : x === true ? 'max-content' : typeof x === 'number' ? `${x}px` : x
})
const fixedLayout = computed(() => (scrollX.value !== undefined && scrollX.value !== 'max-content') || props.columns.some((c) => c.ellipsis || c.fixed))
const px = (w: number | string | undefined) => (typeof w === 'number' ? `${w}px` : w)
const isLoadingEmpty = computed(() => props.loading && pageRows.value.length === 0)

const scroller = ref<HTMLElement>()
const edges = reactive({ left: false, right: false })
const updateEdges = () => {
  const el = scroller.value
  if (!el) return
  edges.left = el.scrollLeft > 0
  edges.right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}
let ro: ResizeObserver | undefined
onMounted(() => {
  updateEdges()
  ro = new ResizeObserver(updateEdges)
  if (scroller.value) ro.observe(scroller.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch([pageRows, () => props.columns], () => nextTick(updateEdges))
</script>

<template>
  <div v-bind="rootAttrs()" :class="cn('min-w-0', attrs.class as ClassValue)" :style="attrs.style as StyleValue" :aria-busy="loading || undefined">
    <span v-if="hasSelection" :id="selectLabelId" hidden>{{ t('z.selectRow') }}</span>
    <ZSpin :spinning="!!loading && pageRows.length > 0" class="isolate">
      <div
        ref="scroller"
        data-z-scroller
        class="overflow-x-auto"
        :class="scroll?.y !== undefined && 'overflow-y-auto'"
        :style="scroll?.y !== undefined ? { maxHeight: px(scroll.y) } : undefined"
        @scroll.passive="updateEdges"
      >
        <table
          v-bind="tableAttrs()"
          :class="cn(
            'w-full border-separate border-spacing-0 bg-surface text-sm text-ink',
            fixedLayout ? 'table-fixed' : 'table-auto',
            scrollX && 'min-w-(--z-table-x)',
            cards && 'max-sm:block max-sm:min-w-0 max-sm:bg-transparent',
          )"
          :style="scrollX ? { '--z-table-x': scrollX } : undefined"
        >
          <colgroup :class="cards && 'max-sm:hidden'">
            <col v-if="hasSelection" style="width: 40px">
            <col v-for="v in views" :key="v.key" :style="{ width: px(v.column.width) }">
          </colgroup>
          <ZTableHead
            :views="views"
            :small="small"
            :cards="cards"
            :scrolled="edges"
            :selection="headSelection"
            :header-cell="$slots.headerCell"
            :empty="pageRows.length === 0"
            @sort="onSort"
            @toggle-all="toggleAll"
          />
          <tbody :class="cards && 'max-sm:flex max-sm:flex-col max-sm:gap-2'">
            <template v-if="isLoadingEmpty">
              <tr v-for="i in 5" :key="`sk-${i}`" :class="cn(small ? 'h-8' : 'h-10', cards && 'max-sm:block')">
                <td v-if="hasSelection" :class="cn(tdBase, cards && 'max-sm:hidden')" />
                <td v-for="v in views" :key="v.key" :class="cn(tdBase, cards && 'max-sm:block')">
                  <ZSkeleton width="70%" />
                </td>
              </tr>
            </template>
            <tr v-else-if="pageRows.length === 0" :class="cards && 'max-sm:block'">
              <td :colspan="colCount" :class="cn('border-b border-line', cards && 'max-sm:block max-sm:border-0')">
                <slot name="emptyText">
                  <p v-if="locale?.emptyText" class="m-0 py-8 text-center text-sm text-ink-3">{{ locale.emptyText }}</p>
                  <ZEmpty v-else :title="t('common.emptyTitle')" :hint="t('common.emptyHint')" />
                </slot>
              </td>
            </tr>
            <tr
              v-for="(record, index) in pageRows"
              v-else
              :key="keyOf.get(record)"
              v-bind="customRow?.(record, index)"
              :class="rowClass(record, index)"
              :data-selected="(hasSelection && isSelected(record)) || undefined"
              :aria-selected="hasSelection ? isSelected(record) : undefined"
            >
              <td v-if="hasSelection" :class="selTdClass" :style="fixedStyle(selectionFixed)" @click.stop>
                <ZCheckbox
                  :checked="isSelected(record)"
                  :disabled="!isSelectable(record)"
                  :aria-label="t('z.selectRow')"
                  :aria-labelledby="views.length ? `${selectLabelId} ${firstCellId(index)}` : undefined"
                  class="align-middle"
                  @change="toggleRow(record, $event)"
                />
              </td>
              <td
                v-for="(cell, ci) in views.map((v) => cellOf(v, record, index))"
                :key="cell.v.key"
                :class="tdClass(cell.v)"
                :style="fixedStyle(cell.v.fixed)"
              >
                <span v-if="cards && cell.v.column.title" data-z-label class="hidden shrink-0 text-left text-xs text-ink-3 max-sm:block">{{ cell.v.column.title }}</span>
                <div
                  data-z-value
                  :id="ci === 0 && hasSelection ? firstCellId(index) : undefined"
                  :title="cell.title"
                  :class="cn('min-w-0', cell.v.column.ellipsis && 'truncate', cards && 'max-sm:ml-auto max-sm:text-right max-sm:whitespace-normal')"
                ><Content :node="cell.node" /></div>
              </td>
            </tr>
          </tbody>
          <tfoot
            v-if="$slots.summary"
            :class="cn('bg-canvas font-medium [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2', cards && 'max-sm:block max-sm:[&_tr]:flex max-sm:[&_tr]:flex-col')"
          >
            <slot name="summary" :page-data="pageRows" />
          </tfoot>
        </table>
      </div>
    </ZSpin>
    <div v-if="showPager" class="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <span v-if="totalText" class="mr-auto text-xs text-ink-3">{{ totalText }}</span>
      <ZPagination :current="current" :total="total" :page-size="pageSize" @change="onPage" />
    </div>
  </div>
</template>
