<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Import40GoodsItemInput } from '@/types/api'
import type { GoodsStatus } from '../goodsStatus'
import { keyOf } from '../useDtGoods'
import GoodsEditorRailRow from './GoodsEditorRailRow.vue'

// Полоса списка товаров слева в широкой панели товара (правка №17: «слева остаётся узкая полоса списка, чтобы было видно,
// какой товар открыт»). Строка — № · код ТН ВЭД (точка — ошибки товара, как фильтр «С ошибками»), под ним — описание.
// Открытый товар отмечен и прокручен в видимую часть полосы (прокрутка только самой полосы). Нажатие — открыть товар.
// С клавиатуры полоса — одна остановка Tab (открытый товар), ↑/↓ / Home / End — по товарам, Enter — открыть.
// Показывается, когда панель достаточно широка (useEditorWidth: rail), в DOM — после содержимого товара: фокус при
// открытии и порядок Tab начинаются с шапки товара.
// Поля товаров здесь не читаются (только список и позиция): строка — GoodsEditorRailRow со своим товаром, и правка
// открытого товара перерисовывает одну его строку, а не всю полосу (до 999 товаров).
const props = defineProps<{
  items: readonly Import40GoodsItemInput[]
  /** Позиция открытого товара (с 0). */
  index: number
  statusOf: (g: Import40GoodsItemInput) => GoodsStatus
}>()
const emit = defineEmits<{ open: [index: number] }>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})
const onOpen = (i: number) => emit('open', i)

const list = ref<HTMLElement | null>(null)
const button = (i: number) => list.value?.querySelector<HTMLElement>(`[data-goods-rail-item="${i}"]`) ?? null
/** Открытый товар — в видимой части полосы (только сама полоса: scrollIntoView крутил бы ещё и панель). */
const reveal = () => {
  const box = list.value
  const el = button(props.index)
  if (!box || !el) return
  const top = el.offsetTop - 4
  const bottom = el.offsetTop + el.offsetHeight + 4
  if (top < box.scrollTop) box.scrollTop = Math.max(0, top)
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight
}
watch(() => props.index, async () => {
  await nextTick()
  reveal()
})
onMounted(reveal)

const onKey = (e: KeyboardEvent) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const at = Number((e.target as HTMLElement | null)?.dataset?.goodsRailItem)
  if (!Number.isInteger(at)) return
  const last = props.items.length - 1
  const to = e.key === 'ArrowDown' ? Math.min(last, at + 1)
    : e.key === 'ArrowUp' ? Math.max(0, at - 1)
      : e.key === 'Home' ? 0
        : e.key === 'End' ? last
          : null
  if (to == null) return
  e.preventDefault()
  button(to)?.focus()
}
</script>

<template>
  <nav class="flex w-44 shrink-0 flex-col border-r border-line bg-canvas" :aria-label="tg('editor.rail.label')" data-goods-rail>
    <p class="m-0 flex shrink-0 items-baseline gap-2 border-b border-line px-3 py-3 text-[13px] font-semibold text-ink">
      {{ tg('title') }}
      <span class="rounded-pill bg-sunken px-1.5 text-xs font-semibold text-ink-2 tabular-nums">{{ items.length }}</span>
    </p>
    <ol ref="list" class="relative m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]" @keydown="onKey">
      <GoodsEditorRailRow
        v-for="(g, i) in items"
        :key="keyOf(g)"
        :item="g"
        :i="i"
        :active="i === index"
        :status-of="statusOf"
        @open="onOpen"
      />
    </ol>
  </nav>
</template>
