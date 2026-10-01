<!-- Раскрывающееся дерево ТН ВЭД: разделы → группы → позиции → субпозиции → 10-значные коды.
     Ветки догружаются с сервера по мере раскрытия (в дереве ~21 тыс. узлов). Клик по названию
     выбирает узел и раскрывает его; reveal(code) раскрывает путь до кода (из поиска/ИИ-подбора).
     Общий для справочника ТН ВЭД и пикера кода в товаре ДТ. -->
<template>
  <a-spin :spinning="rootLoading" class="tnved-tree-wrap">
    <a-tree
      ref="treeRef"
      v-model:expanded-keys="expandedKeys"
      v-model:loaded-keys="loadedKeys"
      :selected-keys="selectedKeys"
      :tree-data="treeData"
      :load-data="onLoadData"
      :height="height"
      block-node
      class="tnved-tree"
      @select="onSelect"
    >
      <template #title="item">
        <span class="tt-node" :class="{ 'tt-leaf': item.raw?.is10 }" :title="item.raw?.treeName || item.raw?.name">
          <span v-if="item.raw?.code" class="tt-code">{{ item.raw.code }}</span>
          <span class="tt-name">{{ item.raw?.treeName || item.raw?.name }}</span>
          <span v-if="item.raw?.is10 && item.raw?.unitShort" class="tt-unit">{{ item.raw.unitShort }}</span>
        </span>
      </template>
    </a-tree>
  </a-spin>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto } from '@/types/api'

interface TreeItem {
  key: number
  title: string
  isLeaf: boolean
  raw: TnvedNodeDto
  children?: TreeItem[]
}

withDefaults(defineProps<{ height?: number }>(), { height: 520 })
const emit = defineEmits<{ (e: 'select', node: TnvedNodeDto): void }>()

const treeRef = ref<{ scrollTo: (o: { key: number; align?: 'top' | 'bottom' | 'auto'; offset?: number }) => void } | null>(null)
const treeData = ref<TreeItem[]>([])
const expandedKeys = ref<number[]>([])
const loadedKeys = ref<number[]>([])
const selectedKeys = ref<number[]>([])
const rootLoading = ref(false)
const byId = new Map<number, TreeItem>()
// Один запрос корня на экземпляр: reveal() может прийти раньше onMounted-загрузки.
let rootPromise: Promise<void> | null = null

const toItem = (n: TnvedNodeDto): TreeItem => {
  // 10-значный код — всегда лист (флаг isLast у части узлов не проставлен).
  const item: TreeItem = { key: n.id, title: n.treeName || n.name, isLeaf: n.isLast || n.is10, raw: n }
  byId.set(n.id, item)
  return item
}

// Догрузка детей узла (один раз); дерево перерисовывается через новый массив корня.
const ensureChildren = async (item: TreeItem) => {
  if (item.isLeaf || item.children) return
  const { data } = await tnvedApi.children(item.key)
  item.children = data.map(toItem)
  if (!item.children.length) item.isLeaf = true
  if (!loadedKeys.value.includes(item.key)) loadedKeys.value = [...loadedKeys.value, item.key]
  treeData.value = [...treeData.value]
}

const onLoadData = async (treeNode: { dataRef?: TreeItem; key?: number }) => {
  const item = treeNode.dataRef ?? (treeNode.key != null ? byId.get(treeNode.key) : undefined)
  if (item) await ensureChildren(item)
}

const onSelect = async (_keys: unknown, info: { node: { dataRef?: TreeItem; key?: number } }) => {
  const item = info.node.dataRef ?? (info.node.key != null ? byId.get(info.node.key) : undefined)
  if (!item) return
  selectedKeys.value = [item.key]
  emit('select', item.raw)
  // Клик по названию группы — раскрыть/свернуть (раньше приходилось целиться в стрелку).
  if (!item.isLeaf) {
    if (expandedKeys.value.includes(item.key)) {
      expandedKeys.value = expandedKeys.value.filter((k) => k !== item.key)
    } else {
      await ensureChildren(item)
      expandedKeys.value = [...expandedKeys.value, item.key]
    }
  }
}

const loadRoot = async () => {
  rootLoading.value = true
  try {
    const { data } = await tnvedApi.children(0)
    byId.clear()
    treeData.value = data.map(toItem)
    expandedKeys.value = []
    loadedKeys.value = []
    selectedKeys.value = []
  } catch {
    treeData.value = []
  } finally {
    rootLoading.value = false
  }
}

/** Раскрыть дерево до кода и выделить его. Возвращает найденный узел (или null). */
const reveal = async (code: string): Promise<TnvedNodeDto | null> => {
  const { data: path } = await tnvedApi.path(code)
  if (!path.length) return null
  await (rootPromise ??= loadRoot())
  const expand = new Set(expandedKeys.value)
  let target: TreeItem | undefined
  for (const p of path) {
    target = byId.get(p.id)
    if (!target) break
    if (p !== path[path.length - 1]) {
      await ensureChildren(target)
      expand.add(target.key)
    }
  }
  if (!target) return null
  expandedKeys.value = [...expand]
  selectedKeys.value = [target.key]
  await nextTick()
  treeRef.value?.scrollTo({ key: target.key, align: 'top', offset: 40 })
  return target.raw
}

/** Прокрутить к выбранному узлу (если дерево было скрыто во время reveal — виртуальный список не мог измерить строки). */
const scrollToSelected = async () => {
  const key = selectedKeys.value[0]
  if (key == null) return
  await nextTick()
  treeRef.value?.scrollTo({ key, align: 'top', offset: 40 })
}

/** Свернуть всё до разделов. */
const collapseAll = () => { expandedKeys.value = []; selectedKeys.value = [] }

onMounted(() => { rootPromise ??= loadRoot() })

defineExpose({ reveal, collapseAll, scrollToSelected, reload: () => (rootPromise = loadRoot()) })
</script>

<style scoped>
.tnved-tree-wrap { display: block; }
.tnved-tree :deep(.ant-tree-treenode) { padding: 1px 0; align-items: flex-start; }
.tnved-tree :deep(.ant-tree-switcher) { align-self: flex-start; height: 26px; line-height: 26px; }
.tnved-tree :deep(.ant-tree-node-content-wrapper) { min-height: 26px; line-height: 20px; padding: 3px 6px; }
.tt-node { display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--z-ink, var(--z-ink)); }
.tt-code {
  flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600;
  font-size: 12.5px; color: var(--z-teal-d, var(--z-teal-d));
}
.tt-leaf .tt-code { color: var(--z-ink, var(--z-ink)); }
.tt-name { flex: 1; min-width: 0; white-space: normal; }
.tt-unit { flex: none; font-size: 12px; color: var(--z-muted, var(--z-muted)); }
</style>
