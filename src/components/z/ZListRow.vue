<script setup lang="ts">
import { useAttrs } from 'vue'
import { RouterLink } from 'vue-router'
import { cn } from '@/ui/cn'
import ZAvatar from './ZAvatar.vue'

// Строка списка стиля C: аватар, заголовок + подзаголовок, теги, значение справа.
// Когда строка сама ссылка или кнопка, внутри meta/trailing нельзя класть интерактивное (кнопки, ссылки, поля): вложенное интерактивное в <a>/<button> невалидно.
// Кликабельность определяется по входным данным: to → RouterLink, href → <a>, слушатель click → <button>.
const props = defineProps<{
  title: string
  subtitle?: string
  avatarName?: string
  to?: string | Record<string, unknown>
  href?: string
}>()

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

type Kind = 'link' | 'anchor' | 'button' | 'div'
// Функции, а не computed: $attrs не реактивен, и слушатель/класс от родителя должны подхватываться при каждом рендере.
const kind = (): Kind => {
  if (props.to !== undefined && props.to !== '') return 'link'
  if (props.href) return 'anchor'
  return attrs.onClick ? 'button' : 'div'
}

const BASE = 'flex items-center gap-3 rounded-row px-3 py-2.5 font-sans text-base text-ink no-underline'
const CLICKABLE = 'cursor-pointer outline-hidden transition-colors duration-150 hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none'
const BUTTON_RESET = 'w-full border-0 bg-transparent text-left'

const bind = () => {
  const k = kind()
  const { class: extra, ...others } = attrs
  return {
    ...others,
    ...(k === 'link' ? { to: props.to } : {}),
    ...(k === 'anchor' ? { href: props.href } : {}),
    ...(k === 'button' ? { type: 'button' } : {}),
    class: cn(BASE, k !== 'div' && CLICKABLE, k === 'button' && BUTTON_RESET, extra as string),
  }
}
const tag = () => {
  const k = kind()
  return k === 'link' ? RouterLink : k === 'anchor' ? 'a' : k === 'button' ? 'button' : 'div'
}
</script>

<template>
  <component :is="tag()" v-bind="bind()">
    <ZAvatar v-if="!$slots.leading && avatarName" :name="avatarName" size="lg" />
    <slot name="leading" />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-semibold">{{ title }}</span>
      <span v-if="subtitle" class="truncate text-sm text-ink-3">{{ subtitle }}</span>
    </span>
    <span v-if="$slots.meta" class="flex shrink-0 items-center gap-1.5"><slot name="meta" /></span>
    <span v-if="$slots.trailing" class="shrink-0 tabular-nums"><slot name="trailing" /></span>
  </component>
</template>
