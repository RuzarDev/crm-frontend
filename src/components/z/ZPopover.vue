<script setup lang="ts">
import { computed, useId } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { cn } from '@/ui/cn'
import { floatingSurface } from '@/ui/surfaces'
import { ZFieldBoundary } from '@/ui/form'

// Замена a-popover (2 места) и основа фильтров колонок. Триггер — слот trigger (as-child), содержимое — default.
// Escape и клик снаружи закрывают окно, фокус возвращается на триггер (это делает Reka).
// open — необязательное управление снаружи (v-model:open); без него окно открывается само.
const props = withDefaults(defineProps<{
  title?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Число — пиксели, строка — любое CSS-значение. */
  width?: number | string
  /** Классы окна поверх стандартных (сливаются через cn: 'p-0' заменит отступ p-3). */
  contentClass?: string
  /**
   * При открытии фокус на само окно, а не на первый элемент внутри: содержимое ещё грузится,
   * и первым доступным оказался бы случайный элемент (например, ссылка в подвале). Tab — дальше по порядку.
   */
  focusContent?: boolean
}>(), { title: '', side: 'bottom', align: 'start' })

const open = defineModel<boolean>('open', { default: false })

const titleId = useId()
const widthStyle = computed(() => (props.width == null ? undefined : { width: typeof props.width === 'number' ? `${props.width}px` : props.width }))

// Reka подписывает диалог id триггера (aria-labelledby) — при наличии заголовка подставляем его.
// Событие приходит на обёртку позиционирования, сам диалог (role=dialog, tabindex=-1) — внутри неё.
const onOpened = (e: Event) => {
  const el = e.target as HTMLElement | null
  const dialog = el?.getAttribute?.('role') === 'dialog' ? el : el?.querySelector?.<HTMLElement>('[role="dialog"]')
  if (props.title) dialog?.setAttribute('aria-labelledby', titleId)
  if (props.focusContent && dialog) {
    e.preventDefault()
    dialog.focus({ preventScroll: true })
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :class="cn(floatingSurface, 'p-3', contentClass)"
        :style="widthStyle"
        :side="side"
        :align="align"
        :side-offset="6"
        @open-auto-focus="onOpened"
      >
        <p v-if="title" :id="titleId" class="mb-2 text-sm font-semibold text-ink">{{ title }}</p>
        <!-- Содержимое — вне контекста ZField/ZForm (триггер остаётся связанным с полем). -->
        <ZFieldBoundary><slot /></ZFieldBoundary>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
