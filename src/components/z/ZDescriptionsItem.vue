<script lang="ts">
import { Comment, Text, computed, defineComponent, h, inject, type InjectionKey, type PropType, type Ref, type VNode } from 'vue'
import { cn } from '@/ui/cn'

export interface DescriptionsContext {
  bordered: Ref<boolean>
  size: Ref<'small' | 'middle'>
  multiline: Ref<boolean>
}
export const DESCRIPTIONS_KEY: InjectionKey<DescriptionsContext> = Symbol('z-descriptions')

const PAIR: Record<number, string> = {
  1: 'col-span-2 max-[640px]:col-span-2',
  2: 'col-span-4 max-[640px]:col-span-2',
  3: 'col-span-6 max-[640px]:col-span-2',
}
const VALUE: Record<number, string> = {
  1: 'col-span-1 max-[640px]:col-span-1',
  2: 'col-span-3 max-[640px]:col-span-1',
  3: 'col-span-5 max-[640px]:col-span-1',
}
const CELL = {
  bordered: { small: 'px-3 py-1.5', middle: 'px-4 py-2.5' },
  plain: { small: 'py-0.5', middle: 'py-1' },
}

function isEmpty(nodes: VNode[] | undefined): boolean {
  if (!nodes) return true
  return nodes.every((n) => {
    if (n.type === Comment) return true
    if (n.type === Text) return typeof n.children !== 'string' || n.children.trim() === ''
    if (Array.isArray(n.children) && typeof n.type === 'symbol') return isEmpty(n.children as VNode[])
    return false
  })
}

export default defineComponent({
  name: 'ZDescriptionsItem',
  props: {
    label: { type: String, default: undefined },
    span: { type: Number, default: 1 },
    colSpan: { type: Number, default: undefined },
    multiline: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const ctx = inject(DESCRIPTIONS_KEY, null)
    const bordered = computed(() => ctx?.bordered.value ?? false)
    const size = computed(() => ctx?.size.value ?? 'small')
    const spanOf = computed(() => Math.min(3, Math.max(1, Math.round(props.colSpan ?? props.span))))
    return () => {
      const cell = CELL[bordered.value ? 'bordered' : 'plain'][size.value]
      const value = slots.default?.()
      const multiline = props.multiline || ctx?.multiline.value
      return h('div', { class: cn('grid grid-cols-subgrid', PAIR[spanOf.value]) }, [
        h('dt', { class: cn('m-0 min-w-0 text-sm text-ink-3 break-words', cell, bordered.value && 'bg-canvas') }, slots.label?.() ?? props.label),
        h(
          'dd',
          {
            class: cn('m-0 min-w-0 text-sm text-ink break-words', VALUE[spanOf.value], cell, bordered.value && 'bg-surface', multiline && 'whitespace-pre-line'),
          },
          isEmpty(value) ? [h('span', { class: 'text-faint' }, '—')] : value,
        ),
      ])
    }
  },
})
</script>
