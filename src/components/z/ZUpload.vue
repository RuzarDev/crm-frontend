<script setup lang="ts">
import { computed, ref, useAttrs, useId, type ComponentPublicInstance, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhUploadSimple } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import { message } from '@/ui/message'
import { useFieldControl } from '@/ui/form'
import ZButton, { type ZButtonSize, type ZButtonVariant } from './ZButton.vue'

// Замена a-upload / a-upload-dragger. Загрузка всегда ручная: компонент только выбирает файлы, проверяет
// тип (accept) и размер (maxSizeMb), затем для каждого принятого файла зовёт beforeUpload (false — стоп)
// и customRequest. Списка загруженных файлов нет — его рисуют экраны (поэтому и show-upload-list не нужен).
// type="button": рисуется ZButton (слот — подпись, иначе z.uploadChoose; иконка — слот icon, по умолчанию PhUploadSimple).
// type="drag": зона с role=button (слот — подсказка, иначе z.uploadDrop). Слот НЕ заменяет сам элемент управления:
// у a-upload внутри лежала своя a-button, здесь на её месте остаётся только подпись.
// class/style — на корень, остальные $attrs (aria-*, data-*) — на кнопку/зону. Скрытый input лежит рядом с ними, не внутри.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const innerAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

type CustomRequestOptions = {
  file: File
  onSuccess: (response?: unknown) => void
  onError: (error?: unknown) => void
}

const props = withDefaults(defineProps<{
  accept?: string
  multiple?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'drag'
  maxSizeMb?: number
  beforeUpload?: (file: File) => boolean | void | Promise<boolean | void>
  customRequest?: (options: CustomRequestOptions) => void
  buttonVariant?: ZButtonVariant
  buttonSize?: ZButtonSize
}>(), { type: 'button', multiple: false, disabled: false, loading: false, buttonVariant: 'secondary', buttonSize: 'md' })

const emit = defineEmits<{ select: [files: File[]] }>()
const { t } = useI18n()

const input = ref<HTMLInputElement>()
const control = ref<ComponentPublicInstance | HTMLElement>()
const dragging = ref(false)

const controlEl = () => {
  const c = control.value
  return c instanceof HTMLElement ? c : (c?.$el as HTMLElement | undefined)
}
const open = () => {
  if (props.disabled || props.loading) return
  input.value?.click()
}
defineExpose({ focus: () => controlEl()?.focus(), blur: () => controlEl()?.blur(), open })

// Внутри ZField: id/aria-* поля — на кнопку или зону (не на скрытый input), выбор файлов — change поля.
// Значение для правил поля — последние принятые файлы (required: «файл выбран»).
const chosen = ref<File[]>([])
const { fieldId, fieldDescribedBy, fieldAriaInvalid, fieldRequired, fieldLabelId, notifyChange } = useFieldControl({
  attrs, focus: () => controlEl()?.focus(), value: () => chosen.value,
})
// <label for> не называет div role=button, поэтому у зоны имя — подпись поля + своя подсказка (свои aria-label/-labelledby главнее).
const hintId = `z-upload-${useId()}-hint`
const zoneLabelledBy = computed(() => (attrs['aria-labelledby'] as string | undefined)
  ?? (!attrs['aria-label'] && fieldLabelId.value ? `${fieldLabelId.value} ${hintId}` : undefined))
const fieldAttrs = computed(() => ({
  id: fieldId.value,
  'aria-describedby': fieldDescribedBy.value,
  'aria-invalid': fieldAriaInvalid.value,
  'aria-required': fieldRequired.value,
}))

// accept: расширения («.xlsx», без учёта регистра), MIME («application/pdf») и маски («image/*»).
const tokens = computed(() => (props.accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
const typeOk = (f: File) => {
  if (!tokens.value.length) return true
  const name = f.name.toLowerCase()
  const mime = (f.type || '').toLowerCase()
  return tokens.value.some((tk) => {
    if (tk.startsWith('.')) return name.endsWith(tk)
    if (tk.endsWith('/*')) return mime.startsWith(tk.slice(0, -1))
    return mime === tk
  })
}

const handle = async (list: File[]) => {
  if (props.disabled || props.loading) return
  const picked = props.multiple ? list : list.slice(0, 1)
  const accepted: File[] = []
  for (const f of picked) {
    if (!typeOk(f)) {
      message.error(t('z.uploadWrongType', { name: f.name }))
    } else if (props.maxSizeMb != null && f.size > props.maxSizeMb * 1024 * 1024) {
      message.error(t('z.uploadTooBig', { mb: props.maxSizeMb, name: f.name }))
    } else {
      accepted.push(f)
    }
  }
  if (!accepted.length) return
  chosen.value = accepted
  emit('select', accepted)
  notifyChange()
  // По очереди: beforeUpload одного файла может показать окно/ошибку, и порядок важен.
  for (const f of accepted) {
    let result: boolean | void
    try {
      result = await props.beforeUpload?.(f)
    } catch {
      continue
    }
    if (result === false) continue
    props.customRequest?.({ file: f, onSuccess: () => {}, onError: () => {} })
  }
}

const onChange = (e: Event) => {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  // Сброс — чтобы повторный выбор того же файла снова вызвал change.
  el.value = ''
  if (files.length) void handle(files)
}

const onDragOver = (e: DragEvent) => {
  if (props.disabled) return
  e.preventDefault()
  dragging.value = true
}
const onDragLeave = (e: DragEvent) => {
  const next = e.relatedTarget as Node | null
  if (next && (e.currentTarget as HTMLElement).contains(next)) return
  dragging.value = false
}
const onDrop = (e: DragEvent) => {
  e.preventDefault()
  dragging.value = false
  if (props.disabled) return
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) void handle(files)
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  open()
}

const zoneClasses = computed(() => cn(
  'flex flex-col items-center gap-2 rounded-panel border border-dashed p-6 text-center text-sm text-ink-2',
  'transition-[border-color,background-color] duration-150 ease-out motion-reduce:transition-none',
  'outline-hidden focus-visible:shadow-focus',
  dragging.value ? 'border-zircon bg-zircon-soft' : 'border-line-strong bg-canvas',
  props.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
  // Hover не перебивает подсветку перетаскивания.
  !props.disabled && !dragging.value && 'hover:border-faint',
))
</script>

<template>
  <div :class="cn(type === 'drag' ? 'block' : 'inline-block', attrs.class as string)" :style="attrs.style as StyleValue">
    <input
      ref="input"
      type="file"
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="onChange"
    >
    <div
      v-if="type === 'drag'"
      ref="control"
      v-bind="{ ...innerAttrs, ...fieldAttrs }"
      :aria-labelledby="zoneLabelledBy"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled || undefined"
      :class="zoneClasses"
      @click="open"
      @keydown="onKeydown"
      @dragenter="onDragOver"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <PhUploadSimple :size="24" aria-hidden="true" class="text-ink-3" />
      <span :id="hintId"><slot>{{ t('z.uploadDrop') }}</slot></span>
    </div>
    <ZButton
      v-else
      ref="control"
      v-bind="{ ...innerAttrs, ...fieldAttrs }"
      :variant="buttonVariant"
      :size="buttonSize"
      :loading="loading"
      :disabled="disabled"
      @click="open"
    >
      <template #icon><slot name="icon"><PhUploadSimple :size="buttonSize === 'sm' ? 14 : 16" aria-hidden="true" /></slot></template>
      <slot>{{ t('z.uploadChoose') }}</slot>
    </ZButton>
  </div>
</template>
