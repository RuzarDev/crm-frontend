<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Slot } from 'vue'
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import { alignClass, fixedClass, fixedStyle, isEmptyContent, type ZColumnView, type ZFixedInfo } from '@/ui/table'
import ZCheckbox from './ZCheckbox.vue'

// Шапка ZTable (приватная часть). Сортировка — кнопка с названием колонки (имя кнопки = заголовок), порядок —
// aria-sort на <th>. На телефоне (карточки) шапка становится строкой «выбрать все» + кнопки сортировки,
// колонки без сортировки скрыты.
const props = defineProps<{
  views: ZColumnView[]
  small: boolean
  cards: boolean
  scrolled: { left: boolean; right: boolean }
  selection: null | { checked: boolean; indeterminate: boolean; disabled: boolean; fixed: ZFixedInfo }
  /** Нет строк — на телефоне шапка (сортировка, «выбрать все») не нужна. */
  empty: boolean
  headerCell?: Slot
}>()
const emit = defineEmits<{ sort: [key: string]; toggleAll: [] }>()
const { t } = useI18n()

const ariaSort = (v: ZColumnView) =>
  v.sortable ? (v.order === 'ascend' ? 'ascending' : v.order === 'descend' ? 'descending' : 'none') : undefined

const headerContent = (v: ZColumnView) => {
  const node = props.headerCell?.({ column: v.column, title: v.column.title })
  return isEmptyContent(node) ? v.column.title : node
}
const Content = (p: { node: unknown }) => p.node as never
Content.props = ['node']

// Enter/Space обрабатываем сами (и гасим нативный клик) — одно переключение на нажатие в любом браузере.
const onKeydown = (e: KeyboardEvent, key: string) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  if (!e.repeat) emit('sort', key)
}
const onKeyup = (e: KeyboardEvent) => { if (e.key === ' ') e.preventDefault() }

const thClass = (v: ZColumnView | null, fixed: ZFixedInfo, phoneVisible: boolean) => cn(
  'sticky top-0 z-[2] border-b border-line bg-canvas px-3 align-middle text-xs font-medium text-ink-3',
  props.small ? 'h-8' : 'h-9',
  v ? alignClass(v.column.align) : 'text-left',
  fixed.side && 'z-[3]',
  fixedClass(fixed, props.scrolled, props.cards),
  props.cards && (phoneVisible ? 'max-sm:static max-sm:h-auto max-sm:border-0 max-sm:bg-transparent max-sm:p-0' : 'max-sm:hidden'),
  v?.column.className,
)

const sortButton = computed(() => cn(
  'inline-flex max-w-full cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-transparent p-0 text-left',
  'font-[inherit] text-[length:inherit] font-medium text-inherit outline-hidden focus-visible:shadow-focus hover:text-ink',
  props.cards && 'max-sm:h-7 max-sm:rounded-pill max-sm:bg-sunken max-sm:px-2.5',
))
const caret = (on: boolean) => (on ? 'text-zircon-ink' : 'text-faint')
</script>

<template>
  <thead :class="cards ? (empty || (!selection && !views.some((v) => v.sortable)) ? 'max-sm:hidden' : 'max-sm:block') : undefined">
    <tr :class="cards && 'max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-2 max-sm:pb-2'">
      <th v-if="selection" scope="col" :class="cn(thClass(null, selection.fixed, true), 'w-10', cards && 'max-sm:w-auto')" :style="fixedStyle(selection.fixed)">
        <ZCheckbox
          :checked="selection.checked"
          :indeterminate="selection.indeterminate"
          :disabled="selection.disabled"
          :aria-label="t('z.selectAll')"
          class="align-middle"
          @change="emit('toggleAll')"
        >
          <span v-if="cards" class="hidden whitespace-nowrap text-xs text-ink-2 max-sm:inline">{{ t('z.selectAll') }}</span>
        </ZCheckbox>
      </th>
      <th
        v-for="v in views"
        :key="v.key"
        scope="col"
        :aria-sort="ariaSort(v)"
        :class="thClass(v, v.fixed, v.sortable)"
        :style="{ ...fixedStyle(v.fixed), minWidth: v.column.minWidth ? `${v.column.minWidth}px` : undefined }"
      >
        <button
          v-if="v.sortable"
          type="button"
          :class="sortButton"
          @click="emit('sort', v.key)"
          @keydown="onKeydown($event, v.key)"
          @keyup="onKeyup"
        >
          <span class="min-w-0 truncate"><Content :node="headerContent(v)" /></span>
          <span aria-hidden="true" class="inline-flex shrink-0 flex-col leading-none">
            <PhCaretUp :size="9" weight="fill" :class="caret(v.order === 'ascend')" />
            <PhCaretDown :size="9" weight="fill" :class="cn('-mt-0.5', caret(v.order === 'descend'))" />
          </span>
        </button>
        <Content v-else :node="headerContent(v)" />
      </th>
    </tr>
  </thead>
</template>
