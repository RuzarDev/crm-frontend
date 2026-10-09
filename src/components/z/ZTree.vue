<script setup lang="ts">
import { computed, nextTick, ref, shallowReactive, watch } from 'vue'
import { TreeItem, TreeRoot } from 'reka-ui'
import { PhCaretRight } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import ZSkeleton from './ZSkeleton.vue'

// Дерево комплекта на Reka Tree (роль tree, фокус «бегунком»): ↑/↓ — соседняя строка, Home/End — первая/последняя,
// → — раскрыть (или к первому ребёнку), ← — свернуть (или к родителю), Enter/пробел — выбрать.
// Ветки ленивые: у узла hasChildren, детей отдаёт loadChildren(node) при первом раскрытии (один запрос на узел,
// пока идёт — кольцо вместо шеврона), пустой ответ делает узел листом. Можно отдать children сразу (статичное дерево).
// Клик по строке выбирает узел и раскрывает/сворачивает ветку; клик по шеврону — только раскрывает.
// Выбор — v-model:selected (id); select(node) — только на действие пользователя (reveal выделяет молча).
// Скорость: в DOM только раскрытые ветки (дерево ленивое — строк столько, сколько раскрыл человек),
// строки вне экрана не раскладываются и не рисуются (content-visibility: auto). Виртуализацию Reka не берём:
// у неё строки фиксированной высоты, а переход фокуса стрелками и reveal работают только по отрисованным строкам.
// class/style — на корень; он же прокручивается, когда высоту задаёт родитель (h-…, flex-1 min-h-0).
export type ZTreeId = string | number
export interface ZTreeNode {
  id: ZTreeId
  label: string
  /** Код/номер перед названием — моноширинным. */
  code?: string
  /** Есть дети: их загрузит loadChildren при раскрытии. */
  hasChildren?: boolean
  /** Дети известны сразу — loadChildren не нужен. */
  children?: ZTreeNode[]
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  items: ZTreeNode[]
  loadChildren?: (node: ZTreeNode) => Promise<ZTreeNode[]>
  selected?: ZTreeId | null
  /** Корень ещё грузится — скелетон вместо строк. */
  loading?: boolean
  ariaLabel?: string
}>(), { selected: null, loading: false, ariaLabel: undefined, loadChildren: undefined })
defineSlots<{
  /** Справа в строке (единица измерения, счётчик). */
  suffix?: (p: { node: ZTreeNode; level: number; selected: boolean }) => unknown
  /** Корень пуст (и не грузится). */
  empty?: () => unknown
}>()
const emit = defineEmits<{
  'update:selected': [id: ZTreeId]
  select: [node: ZTreeNode]
  /** loadChildren упал: ветка осталась свёрнутой, следующее раскрытие пробует снова. */
  'load-error': [node: ZTreeNode, error: unknown]
}>()

// ---- Узлы, дети, раскрытие ----
// Reka ведёт ключи строками — внутри всё по String(id), наружу (update:selected, select) уходит исходный id.
const keyOf = (id: ZTreeId) => String(id)
// Все известные узлы по ключу (корни, загруженные и статичные дети); version — чтобы computed видели новые.
const index = new Map<string, ZTreeNode>()
const version = ref(0)
const register = (list: ZTreeNode[]) => {
  for (const n of list) {
    index.set(keyOf(n.id), n)
    if (n.children) register(n.children)
  }
  version.value += 1
}
watch(() => props.items, (v) => register(v), { immediate: true })

const loaded = shallowReactive(new Map<string, ZTreeNode[]>())
const loadingKeys = shallowReactive(new Set<string>())
const pending = new Map<string, Promise<ZTreeNode[] | null>>()
// reset() отбрасывает ответы, начатые до него.
let generation = 0
const expanded = ref<string[]>([])

// Для Reka: массив — у узла есть дети (пустой — ещё не загружены), undefined — лист.
const childrenOf = (n: ZTreeNode): ZTreeNode[] | undefined => {
  if (n.children) return n.children.length ? n.children : undefined
  const got = loaded.get(keyOf(n.id))
  if (got) return got.length ? got : undefined
  return n.hasChildren ? [] : undefined
}
// Reka зовёт getKey и для пустого выбора ({}) — ключ undefined ни с чем не совпадёт.
const getKey = (n: ZTreeNode) => (n?.id === undefined ? (undefined as unknown as string) : keyOf(n.id))

const load = (n: ZTreeNode): Promise<ZTreeNode[] | null> => {
  const key = keyOf(n.id)
  const known = n.children ?? loaded.get(key)
  if (known) return Promise.resolve(known)
  if (!n.hasChildren || !props.loadChildren) return Promise.resolve([])
  const running = pending.get(key)
  if (running) return running
  const gen = generation
  const p = (async () => {
    loadingKeys.add(key)
    try {
      const list = await props.loadChildren!(n)
      if (gen !== generation) return null
      register(list)
      loaded.set(key, list)
      return list
    } catch (e) {
      if (gen === generation) emit('load-error', n, e)
      return null
    } finally {
      loadingKeys.delete(key)
      pending.delete(key)
    }
  })()
  pending.set(key, p)
  return p
}

const isExpanded = (id: ZTreeId) => expanded.value.includes(keyOf(id))
/** Раскрыть узел (догрузив детей). false — узла нет, детей нет или загрузка не удалась. */
const expand = async (id: ZTreeId): Promise<boolean> => {
  const n = index.get(keyOf(id))
  if (!n) return false
  const list = await load(n)
  if (!list?.length) return false
  if (!isExpanded(id)) expanded.value = [...expanded.value, keyOf(id)]
  return true
}
const collapse = (id: ZTreeId) => {
  expanded.value = expanded.value.filter((k) => k !== keyOf(id))
}
const toggle = (id: ZTreeId) => (isExpanded(id) ? (collapse(id), Promise.resolve(false)) : expand(id))
const collapseAll = () => { expanded.value = [] }
/** Забыть загруженных детей и раскрытие (корни — из items). */
const reset = () => {
  generation += 1
  loaded.clear()
  loadingKeys.clear()
  pending.clear()
  expanded.value = []
}

// ---- Выбор ----
const current = ref<ZTreeId | null>(props.selected)
watch(() => props.selected, (v) => { current.value = v ?? null })
const selectedNode = computed(() => {
  void version.value
  return current.value === null ? undefined : index.get(keyOf(current.value))
})
const setSelected = (id: ZTreeId) => {
  current.value = id
  emit('update:selected', id)
}

let revealSeq = 0
// Reka по умолчанию снимает выбор повторным кликом и сам раскрывает ветку — делаем это сами (ленивая загрузка).
const onItemSelect = (n: ZTreeNode, ev: Event) => {
  ev.preventDefault()
  if (n.disabled) return
  // Выбор человеком отменяет reveal в пути: иначе по его окончании выделение перескочило бы на раскрытый узел.
  revealSeq += 1
  setSelected(n.id)
  emit('select', n)
}
const onItemToggle = (n: ZTreeNode, ev: Event) => {
  ev.preventDefault()
  void toggle(n.id)
}

// ---- Прокрутка ----
const root = ref<HTMLElement>()
const rowEl = (id: ZTreeId) =>
  [...(root.value?.querySelectorAll<HTMLElement>('[data-z-tree-id]') ?? [])].find((e) => e.dataset.zTreeId === keyOf(id))
/** Прокрутить к узлу: строка встаёт в верхнюю треть дерева (видно и ветку под ней). */
const scrollTo = async (id: ZTreeId): Promise<boolean> => {
  await nextTick()
  const row = rowEl(id)
  const box = root.value
  if (!row || !box) return false
  if (box.scrollHeight > box.clientHeight) {
    const delta = row.getBoundingClientRect().top - box.getBoundingClientRect().top
    box.scrollTop += delta - box.clientHeight / 3
  } else {
    row.scrollIntoView({ block: 'nearest' })
  }
  return true
}
const scrollToSelected = () => (current.value === null ? Promise.resolve(false) : scrollTo(current.value))

/** Раскрыть путь (id от корня до узла), выделить последний узел и прокрутить к нему. Новый вызов (или выбор строки) отменяет прежний. */
const reveal = async (path: ZTreeId[]): Promise<ZTreeNode | null> => {
  const my = ++revealSeq
  if (!path.length) return null
  for (const id of path.slice(0, -1)) {
    const ok = await expand(id)
    if (my !== revealSeq || !ok) return null
  }
  const target = index.get(keyOf(path[path.length - 1]))
  if (!target) return null
  setSelected(target.id)
  await scrollTo(target.id)
  return target
}

defineExpose({ reveal, collapseAll, expand, collapse, toggle, scrollTo, scrollToSelected, reset, getNode: (id: ZTreeId) => index.get(keyOf(id)) })

// ---- Вид ----
const INDENT = 16
const rowClass = cn(
  'group flex min-h-9 cursor-pointer items-center gap-1.5 rounded-row py-1 pr-2 text-sm text-ink-2 outline-hidden select-none max-sm:min-h-11',
  'transition-colors duration-150 hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none',
  'data-[selected]:bg-zircon-soft data-[selected]:text-zircon-ink data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
  '[contain-intrinsic-size:auto_36px] [content-visibility:auto]',
)
</script>

<template>
  <div ref="root" class="min-w-0 overflow-y-auto overflow-x-clip p-1">
    <div v-if="loading" data-z-tree-skeleton class="px-2 py-2"><ZSkeleton :lines="8" /></div>
    <slot v-else-if="!items.length" name="empty" />
    <TreeRoot
      v-else
      v-slot="{ flattenItems }"
      :items="items"
      :get-key="getKey"
      :get-children="childrenOf"
      :expanded="expanded"
      :model-value="selectedNode"
      :aria-label="ariaLabel"
      class="m-0 list-none p-0"
    >
      <TreeItem
        v-for="item in flattenItems"
        :key="item._id"
        v-slot="{ isExpanded: open, isSelected }"
        v-bind="item.bind"
        :data-z-tree-id="item._id"
        :disabled="item.value.disabled"
        :aria-busy="loadingKeys.has(item._id) ? 'true' : undefined"
        :class="rowClass"
        :style="{ paddingLeft: `${(item.level - 1) * INDENT + 4}px` }"
        @select="onItemSelect(item.value, $event)"
        @toggle="onItemToggle(item.value, $event)"
      >
        <span class="flex size-5 shrink-0 items-center justify-center text-muted group-data-[selected]:text-zircon-ink">
          <span
            v-if="loadingKeys.has(item._id)"
            data-z-tree-loading
            aria-hidden="true"
            class="size-3 animate-spin rounded-pill border-2 border-zircon-ink border-r-transparent motion-reduce:animate-none"
          />
          <span
            v-else-if="item.hasChildren"
            data-z-tree-toggle
            aria-hidden="true"
            class="flex size-5 items-center justify-center"
            @click.stop="toggle(item.value.id)"
          >
            <PhCaretRight :size="12" weight="bold" :class="cn('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-90')" />
          </span>
        </span>
        <span
          v-if="item.value.code"
          data-z-tree-code
          class="shrink-0 font-mono font-semibold whitespace-nowrap text-ink tabular-nums group-data-[selected]:text-zircon-ink"
        >{{ item.value.code }}</span>{{ ' ' }}<span data-z-tree-label class="min-w-0 flex-1 truncate" :title="item.value.label">{{ item.value.label }}</span>{{ ' ' }}<span v-if="$slots.suffix" class="shrink-0 text-xs text-muted">
          <slot name="suffix" :node="item.value" :level="item.level" :selected="isSelected" />
        </span>
      </TreeItem>
    </TreeRoot>
  </div>
</template>
