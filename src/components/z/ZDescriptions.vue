<script lang="ts">
import { Comment, Fragment, Text, cloneVNode, computed, defineComponent, h, provide, toRef, type PropType, type VNode } from 'vue'
import { cn } from '@/ui/cn'
import ZDescriptionsItem, { DESCRIPTIONS_KEY } from './ZDescriptionsItem.vue'

export interface DescriptionsItemData {
  label: string
  value?: unknown
  span?: number
}

const GRID: Record<number, string> = {
  1: 'grid-cols-[repeat(1,minmax(8rem,max-content)_minmax(0,1fr))]',
  2: 'grid-cols-[repeat(2,minmax(8rem,max-content)_minmax(0,1fr))]',
  3: 'grid-cols-[repeat(3,minmax(8rem,max-content)_minmax(0,1fr))]',
}

function flatten(nodes: unknown[], out: VNode[] = []): VNode[] {
  for (const n of nodes) {
    if (Array.isArray(n)) flatten(n, out)
    else if (n && typeof n === 'object') {
      const v = n as VNode
      if (v.type === Comment || v.type === Text) continue
      if (v.type === Fragment) flatten((v.children as unknown[]) ?? [], out)
      else out.push(v)
    }
  }
  return out
}

export default defineComponent({
  name: 'ZDescriptions',
  inheritAttrs: true,
  props: {
    column: { type: Number as PropType<1 | 2 | 3>, default: 3 },
    bordered: { type: Boolean, default: false },
    size: { type: String as PropType<'small' | 'middle'>, default: 'middle' },
    title: { type: String, default: undefined },
    multiline: { type: Boolean, default: false },
    items: { type: Array as PropType<DescriptionsItemData[]>, default: undefined },
  },
  setup(props, { slots }) {
    provide(DESCRIPTIONS_KEY, { bordered: toRef(props, 'bordered'), size: toRef(props, 'size'), multiline: toRef(props, 'multiline') })
    const column = computed(() => Math.min(3, Math.max(1, Math.round(props.column))))

    return () => {
      const cols = column.value
      const source: VNode[] = props.items
        ? props.items.map((it) => h(ZDescriptionsItem, { label: it.label, span: it.span ?? 1 }, { default: () => (it.value == null ? '' : String(it.value)) }))
        : flatten(slots.default?.() ?? [])

      const spans = source.map((n) => Math.min(cols, Math.max(1, Math.round(Number((n.props as Record<string, unknown> | null)?.span ?? 1)) || 1)))
      let used = 0
      for (let i = 0; i < spans.length; i++) {
        if (used + spans[i] > cols) {
          spans[i - 1] += cols - used
          used = 0
        }
        used += spans[i]
        if (used === cols) used = 0
      }
      if (used > 0 && spans.length) spans[spans.length - 1] += cols - used

      const kids = source.map((n, i) => cloneVNode(n, { colSpan: spans[i] }))
      const cell = props.bordered ? 'gap-px border border-line bg-line rounded-row overflow-hidden' : 'gap-x-4 gap-y-1'
      return h('div', null, [
        props.title ? h('h3', { class: 'm-0 mb-2 font-sans text-sm font-semibold text-ink-2' }, props.title) : null,
        h('dl', { class: cn('m-0 grid max-[640px]:grid-cols-[minmax(6rem,40%)_minmax(0,1fr)]', GRID[cols], cell) }, kids),
      ])
    }
  },
})
</script>
