<script setup lang="ts">
import { computed, useAttrs, useSlots, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { PhX } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { Z_LAYER_MODAL, cssSize, focusFirstInside, isDraftEscape, modalBackdrop, modalCloseButton } from '@/ui/surfaces'
import ZButton from './ZButton.vue'

// Замена a-modal (43 места): v-model:open, title, width, okText/cancelText, confirmLoading, okButtonProps,
// cancelButtonProps, footer (слот заменяет кнопки; false/null — без подвала), maskClosable, closable, keyboard,
// @ok/@cancel. Reka Dialog (модальный): фокус заперт в окне, страница не прокручивается, после закрытия
// фокус возвращается туда, откуда окно открыли.
// Закрытие крестиком, «Отменой», Escape (если keyboard) и кликом по фону (если maskClosable) —
// update:open(false) + cancel. «ОК» эмитит только ok: окно закрывает родитель (как у AntD).
// Escape из поля с черновиком (data-z-draft, ZDate) окно не закрывает — откатывает черновик.
// Крестик — последним в DOM (стоит в углу): первым фокус получает первое поле тела, без полей — «Отмена».
// Содержимое при закрытии размонтируется (у AntD по умолчанию оставалось) — состояние держит родитель.
// Слот description — описание окна (Reka DialogDescription, aria-describedby), над телом; без него
// aria-describedby у окна нет. class/style и прочие атрибуты — на само окно (role=dialog).
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
  okText?: string
  cancelText?: string
  confirmLoading?: boolean
  okButtonProps?: { disabled?: boolean; danger?: boolean }
  cancelButtonProps?: { disabled?: boolean }
  /** false / null — без подвала; слот footer заменяет кнопки. */
  footer?: boolean | null
  maskClosable?: boolean
  closable?: boolean
  /** Escape закрывает окно. */
  keyboard?: boolean
}>(), {
  open: false, title: '', width: 520, okText: '', cancelText: '', confirmLoading: false,
  okButtonProps: () => ({}), cancelButtonProps: () => ({}), footer: true, maskClosable: true, closable: true, keyboard: true,
})

const emit = defineEmits<{ 'update:open': [open: boolean]; ok: [e: MouseEvent]; cancel: [] }>()
const { t } = useI18n()

const showFooter = computed(() => props.footer !== false && props.footer !== null)
const hasTitle = computed(() => !!props.title || !!slots.title)
// Без описания снимаем aria-describedby, который Reka ставит всегда (иначе ссылка в пустоту и предупреждение).
const describedBy = computed(() => (slots.description ? {} : { 'aria-describedby': undefined }))

const close = () => {
  emit('update:open', false)
  emit('cancel')
}
// Закрытие, начатое Reka (Escape, клик по фону).
const onOpenChange = (v: boolean) => {
  if (!v) close()
}
const onEscape = (e: KeyboardEvent) => {
  if (!props.keyboard || isDraftEscape(e)) e.preventDefault()
}
const onPointerOutside = (e: Event) => {
  if (!props.maskClosable) e.preventDefault()
}

const contentClass = computed(() => cn(
  Z_LAYER_MODAL,
  'fixed left-1/2 top-[12vh] -translate-x-1/2 flex max-h-[76vh] w-[min(var(--w),calc(100vw-32px))] flex-col',
  'rounded-panel bg-surface font-sans text-sm text-ink shadow-float outline-hidden',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out motion-reduce:animate-none',
  attrs.class as ClassValue,
))
const contentStyle = computed(() => [{ '--w': cssSize(props.width) }, attrs.style as StyleValue])
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay data-z-overlay :class="modalBackdrop" />
      <DialogContent
        aria-modal="true"
        v-bind="{ ...describedBy, ...contentAttrs }"
        :class="contentClass"
        :style="contentStyle"
        @escape-key-down="onEscape"
        @pointer-down-outside="onPointerOutside"
        @open-auto-focus="focusFirstInside"
      >
        <div :class="cn('shrink-0 px-6 pt-5', hasTitle ? 'pb-3' : 'pb-1', closable && 'pr-14')">
          <DialogTitle class="m-0 text-md font-semibold text-ink [overflow-wrap:anywhere]">
            <slot name="title">{{ title }}</slot>
          </DialogTitle>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          <DialogDescription v-if="$slots.description" class="m-0 text-sm text-ink-2">
            <slot name="description" />
          </DialogDescription>
          <slot />
        </div>
        <div v-if="showFooter" class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          <slot name="footer">
            <ZButton variant="ghost" :disabled="cancelButtonProps.disabled" @click="close">
              {{ cancelText || t('common.cancel') }}
            </ZButton>
            <ZButton
              :variant="okButtonProps.danger ? 'danger' : 'primary'"
              :disabled="okButtonProps.disabled"
              :loading="confirmLoading"
              @click="emit('ok', $event)"
            >
              {{ okText || t('z.confirm') }}
            </ZButton>
          </slot>
        </div>
        <button v-if="closable" type="button" :aria-label="t('z.close')" :class="modalCloseButton" @click="close">
          <PhX :size="16" />
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
