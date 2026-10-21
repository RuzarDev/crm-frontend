<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { formatTnved } from '@/utils/tnvedFormat'
import type { Import40GoodsItemInput } from '@/types/api'
import { isErrorStatus, type GoodsStatus } from '../goodsStatus'

// Строка полосы списка товаров (GoodsEditorRail): № · код ТН ВЭД (точка — ошибки товара), под ним — описание.
// Отдельный компонент: код, описание и статус читает только своя строка. Правка открытого товара (каждая буква описания,
// гр. 31) перерисовывает одну эту строку, а не все N строк полосы со statusOf каждого товара (ревью №17; как filterGoods
// в SectionGoods не пересобирает 200 строк позади панели).
const props = defineProps<{
  item: Import40GoodsItemInput
  /** Позиция товара (с 0). */
  i: number
  /** Открытый товар. */
  active: boolean
  statusOf: (g: Import40GoodsItemInput) => GoodsStatus
}>()
const emit = defineEmits<{ open: [index: number] }>()
const { t } = useI18n()
const tg = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.${key}`, p ?? {})

const code = computed(() => (props.item.tnvedCode ?? '').trim())
const codeText = computed(() => (code.value ? formatTnved(code.value) : tg('noCode')))
const caption = computed(() => props.item.description || props.item.tnvedDescription || '')
const error = computed(() => isErrorStatus(props.statusOf(props.item)))
const label = computed(() => [
  tg('editor.rail.item', { n: props.i + 1 }), codeText.value, error.value ? tg('editor.rail.error') : '', caption.value,
].filter(Boolean).join(', '))

const itemClass = computed(() => cn(
  'flex w-full cursor-pointer flex-col gap-0.5 rounded-field border-0 px-2 py-1.5 text-left font-sans outline-hidden',
  'transition-colors focus-visible:shadow-focus',
  props.active ? 'bg-zircon-soft text-zircon-ink' : 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
))
</script>

<template>
  <li>
    <button
      type="button"
      :class="itemClass"
      :tabindex="active ? 0 : -1"
      :aria-current="active ? 'true' : undefined"
      :aria-label="label"
      :title="caption || undefined"
      :data-goods-rail-item="i"
      @click="emit('open', i)"
    >
      <span class="flex min-w-0 items-center gap-1.5 text-[12.5px]">
        <span class="w-6 shrink-0 text-right text-muted tabular-nums">{{ i + 1 }}</span>
        <span class="min-w-0 truncate font-mono" :class="code ? '' : 'text-danger'">{{ codeText }}</span>
        <span v-if="error" class="ml-auto size-1.5 shrink-0 rounded-pill bg-danger" aria-hidden="true" data-goods-rail-error />
      </span>
      <span v-if="caption" class="block truncate pl-7.5 text-xs text-ink-3">{{ caption }}</span>
    </button>
  </li>
</template>
