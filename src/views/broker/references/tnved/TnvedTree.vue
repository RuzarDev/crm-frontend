<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZTree, { type ZTreeId, type ZTreeNode } from '@/components/z/ZTree.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto } from '@/types/api'
import { cleanName, formatTnvedCode } from '@/views/references/tnvedShared'

// Дерево ТН ВЭД ЕАЭС (редизайн, волна 5а) на ZTree: разделы → группы → позиции → субпозиции → 10-значные коды.
// Ветки догружаются по раскрытию (в классификаторе ~21 тыс. узлов; чтения tnved/* — 60 в минуту, поэтому
// только по действию человека и один раз на ветку). select(node) — на клик/Enter, полный TnvedNodeDto;
// reveal(code) раскрывает путь до кода (tnvedApi.path) и выделяет его молча — данные кода грузит вызывающий.
// Общее для окна выбора кода (TnvedPickerModal) и экрана справочника. class — на корень (высоту задаёт родитель).
defineProps<{ ariaLabel?: string }>()
const emit = defineEmits<{ select: [node: TnvedNodeDto] }>()
const { t } = useI18n()

const treeRef = ref<InstanceType<typeof ZTree> | null>(null)
const items = shallowRef<ZTreeNode[]>([])
const selected = ref<ZTreeId | null>(null)
const rootState = ref<'loading' | 'error' | 'done'>('loading')
const dtos = new Map<ZTreeId, TnvedNodeDto>()

// 10-значный код — всегда лист (флаг isLast у части узлов не проставлен).
const toNode = (n: TnvedNodeDto): ZTreeNode => {
  dtos.set(n.id, n)
  return {
    id: n.id,
    code: n.code ? formatTnvedCode(n.code) : undefined,
    label: cleanName(n.treeName || n.name) || n.code,
    hasChildren: !(n.isLast || n.is10),
  }
}
const loadChildren = async (z: ZTreeNode) => (await tnvedApi.children(Number(z.id))).data.map(toNode)

// Один запрос корня на экземпляр: reveal() может прийти раньше загрузки при монтировании. Ошибка — свой блок
// с «Повторить» (без тоста), следующий reveal/«Повторить» пробует снова.
let rootPromise: Promise<boolean> | null = null
const loadRoot = async (): Promise<boolean> => {
  rootState.value = 'loading'
  try {
    items.value = (await tnvedApi.children(0, { silent: true })).data.map(toNode)
    rootState.value = 'done'
    return true
  } catch {
    rootState.value = 'error'
    return false
  }
}
const ensureRoot = () => (rootPromise ??= loadRoot().then((ok) => {
  if (!ok) rootPromise = null
  return ok
}))
void ensureRoot()

const onSelect = (z: ZTreeNode) => {
  const dto = dtos.get(z.id)
  if (dto) emit('select', dto)
}

/** Раскрыть дерево до кода и выделить его. Возвращает узел (или null; новый вызов отменяет прежний). */
let seq = 0
const reveal = async (code: string): Promise<TnvedNodeDto | null> => {
  const my = ++seq
  let path: { id: number }[]
  try {
    path = (await tnvedApi.path(code)).data
  } catch {
    return null
  }
  if (my !== seq || !path.length) return null
  if (!(await ensureRoot()) || my !== seq) return null
  const z = await treeRef.value?.reveal(path.map((p) => p.id))
  if (!z || my !== seq) return null
  return dtos.get(z.id) ?? null
}

/** Путь до узла (от раздела до него самого) по уже загруженным веткам — без запросов. Пусто — узел не загружен. */
const pathOf = (id: number): TnvedNodeDto[] => {
  const out: TnvedNodeDto[] = []
  const seen = new Set<number>()
  let cur = dtos.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parentId ? dtos.get(cur.parentId) : undefined
  }
  return out
}

/** Выделить уже загруженный узел (напр. предка из пути карточки): раскрыть до него и выделить молча, без запросов. */
const selectLoaded = async (id: number): Promise<TnvedNodeDto | null> => {
  const my = ++seq
  const ids = pathOf(id).map((n) => n.id)
  if (!ids.length) return null
  const z = await treeRef.value?.reveal(ids)
  if (!z || my !== seq) return null
  return dtos.get(z.id) ?? null
}

/** Прокрутить к выбранному (дерево было скрыто во время reveal — строка не могла встать на место). */
const scrollToSelected = () => treeRef.value?.scrollToSelected() ?? Promise.resolve(false)
/** Свернуть всё до разделов; выделение остаётся (видно снова, когда ветку раскроют). */
const collapseAll = () => treeRef.value?.collapseAll()
const clearSelection = () => { selected.value = null }
const reload = () => {
  treeRef.value?.reset()
  rootPromise = null
  return ensureRoot()
}

defineExpose({ reveal, collapseAll, scrollToSelected, clearSelection, reload, pathOf, selectLoaded })
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div v-if="rootState === 'error'" role="alert" class="flex flex-col items-start gap-2 px-3 py-4 text-sm text-ink-2">
      <span>{{ t('broker.references.tree.loadError') }}</span>
      <ZButton size="sm" data-tnved-tree-retry @click="reload">{{ t('broker.references.tree.retry') }}</ZButton>
    </div>
    <ZTree
      v-else
      ref="treeRef"
      v-model:selected="selected"
      :items="items"
      :load-children="loadChildren"
      :loading="rootState === 'loading'"
      :aria-label="ariaLabel || t('broker.references.tree.label')"
      class="min-h-0 flex-1"
      @select="onSelect"
    >
      <template #suffix="{ node }">
        <template v-if="dtos.get(node.id)?.is10">{{ dtos.get(node.id)?.unitShort }}</template>
      </template>
      <template #empty>
        <p class="m-0 px-3 py-4 text-sm text-ink-3">{{ t('broker.references.tree.empty') }}</p>
      </template>
    </ZTree>
  </div>
</template>
