<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { cn } from '@/ui/cn'
import { floatingSurface } from '@/ui/surfaces'
import ZButton from './ZButton.vue'

// Замена a-popconfirm (26 мест): маленькое подтверждение у кнопки. Триггер — слот.
// Фокус при открытии — на «Отмену» (безопасный выбор). Подтверждение эмитит confirm и закрывает окно;
// «Отмена», Escape и клик снаружи эмитят cancel ровно один раз. disabled — триггер не открывает окно.
const props = withDefaults(defineProps<{
  title: string
  description?: string
  okText?: string
  cancelText?: string
  danger?: boolean
  disabled?: boolean
}>(), { description: '', okText: '', cancelText: '', danger: false, disabled: false })

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()

const titleId = useId()
const open = ref(false)
const cancelBtn = ref<InstanceType<typeof ZButton>>()

// Закрытие, начатое Reka (Escape, клик снаружи, повторный клик по триггеру), — это отмена.
// Наши кнопки меняют open сами и эмитят событие сами; присваивание из кода update:open не вызывает — дублей нет.
const onOpenChange = (v: boolean) => {
  if (v && props.disabled) return
  if (!v && open.value) emit('cancel')
  open.value = v
}
const confirm = () => {
  open.value = false
  emit('confirm')
}
const cancel = () => {
  open.value = false
  emit('cancel')
}
// Reka сама подписывает диалог текстом триггера (aria-labelledby = id триггера) — ставим заголовок окна.
const onOpened = (e: Event) => {
  e.preventDefault()
  const el = e.target as HTMLElement | null // контейнер фокус-скоупа: обёртка позиционирования, role=dialog внутри
  const dialog = el?.getAttribute?.('role') === 'dialog' ? el : el?.querySelector?.('[role="dialog"]')
  dialog?.setAttribute('aria-labelledby', titleId)
  nextTick(() => (cancelBtn.value?.$el as HTMLElement | undefined)?.focus())
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :class="cn(floatingSurface, 'w-72 p-3')"
        :side-offset="6"
        align="end"
        @open-auto-focus="onOpened"
      >
        <p :id="titleId" class="text-sm font-semibold text-ink">{{ title }}</p>
        <p v-if="description" class="mt-1 text-sm text-ink-3">{{ description }}</p>
        <div class="mt-3 flex justify-end gap-2">
          <ZButton ref="cancelBtn" size="sm" variant="ghost" @click="cancel">{{ cancelText || t('common.cancel') }}</ZButton>
          <ZButton size="sm" :variant="danger ? 'danger' : 'primary'" @click="confirm">{{ okText || t('z.confirm') }}</ZButton>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
