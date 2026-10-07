<script setup lang="ts">
import { computed, useAttrs, useSlots, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { Z_LAYER_MODAL, cssSize, focusFirstInside, isDraftEscape, modalBackdrop, modalCloseButton } from '@/ui/surfaces'

// Замена a-drawer: боковая панель (slide-over) на Reka Dialog — та же механика, что у ZModal
// (фокус заперт, страница не прокручивается, фокус возвращается к открывшему, Escape из черновика не закрывает).
// Закрытие крестиком, Escape (если keyboard) и кликом по фону (если maskClosable) — update:open(false) + close
// (событие a-drawer). Слоты: default, title, footer (подвал есть только со слотом).
// class/style и прочие атрибуты — на саму панель (role=dialog).
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const slots = useSlots()
const contentAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  open?: boolean
  title?: string
  width?: number | string
  placement?: 'right' | 'left'
  closable?: boolean
  maskClosable?: boolean
  keyboard?: boolean
}>(), { open: false, title: '', width: 560, placement: 'right', closable: true, maskClosable: true, keyboard: true })

const emit = defineEmits<{ 'update:open': [open: boolean]; close: [] }>()
const { t } = useI18n()

const hasTitle = computed(() => !!props.title || !!slots.title)

const close = () => {
  emit('update:open', false)
  emit('close')
}
const onOpenChange = (v: boolean) => {
  if (!v) close()
}
const onEscape = (e: KeyboardEvent) => {
  if (!props.keyboard || isDraftEscape(e)) e.preventDefault()
}
const onPointerOutside = (e: Event) => {
  if (!props.maskClosable) e.preventDefault()
}

const SIDE: Record<'right' | 'left', string> = {
  right: 'right-0 data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
  left: 'left-0 data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
}
const contentClass = computed(() => cn(
  Z_LAYER_MODAL,
  'fixed inset-y-0 flex w-[min(var(--w),100vw)] flex-col bg-surface font-sans text-sm text-ink shadow-float outline-hidden',
  SIDE[props.placement],
  'motion-reduce:animate-none',
  attrs.class as ClassValue,
))
const contentStyle = computed(() => [{ '--w': cssSize(props.width) }, attrs.style as StyleValue])
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay data-z-overlay :class="modalBackdrop" />
      <DialogContent
        :aria-describedby="undefined"
        aria-modal="true"
        v-bind="contentAttrs"
        :class="contentClass"
        :style="contentStyle"
        @escape-key-down="onEscape"
        @pointer-down-outside="onPointerOutside"
        @open-auto-focus="focusFirstInside"
      >
        <div :class="cn('min-h-16 shrink-0 border-b border-line px-6 py-5', !hasTitle && 'border-b-0', closable && 'pr-14')">
          <DialogTitle class="m-0 text-md font-semibold text-ink [overflow-wrap:anywhere]">
            <slot name="title">{{ title }}</slot>
          </DialogTitle>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <slot />
        </div>
        <div v-if="slots.footer" class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          <slot name="footer" />
        </div>
        <button v-if="closable" type="button" :aria-label="t('z.close')" :class="modalCloseButton" @click="close">
          <PhX :size="16" />
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
