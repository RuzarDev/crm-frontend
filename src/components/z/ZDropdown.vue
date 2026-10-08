<script setup lang="ts">
import type { Component } from 'vue'
import {
  DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuItemIndicator, DropdownMenuLabel, DropdownMenuPortal,
  DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'reka-ui'
import { PhCheck } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import { floatingSurface, listItem } from '@/ui/surfaces'
import { ZFieldBoundary } from '@/ui/form'

// Замена a-dropdown (6 мест): меню действий по клику на триггер (слот).
// Клавиатура — Reka: Enter/Space/ArrowDown на триггере открывают, стрелки ходят по пунктам, Escape закрывает,
// фокус возвращается на триггер. Не модальное: страница не блокируется и не теряет прокрутку (как у меню строк AntD). divider: true — линия-разделитель НАД этим пунктом.
// Слот header — подпись вверху меню (кто вошёл, роль): не пункт, стрелки по нему не ходят; под ним линия.
// checked (true/false) — пункт-переключатель (menuitemcheckbox, галочка слева): выбор не закрывает меню,
// состояние ведёт родитель по select.
export interface ZDropdownItem {
  key: string
  label: string
  danger?: boolean
  disabled?: boolean
  icon?: Component
  divider?: boolean
  checked?: boolean
}

defineProps<{ items: ZDropdownItem[] }>()
const emit = defineEmits<{ select: [key: string] }>()
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent :class="cn(floatingSurface, 'min-w-44')" :side-offset="6" align="end">
        <ZFieldBoundary>
          <template v-if="$slots.header">
            <DropdownMenuLabel data-z-dropdown-header class="px-3 pt-2 pb-1.5 text-xs text-muted">
              <slot name="header" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator class="my-1 h-px bg-line" />
          </template>
          <template v-for="it in items" :key="it.key">
            <DropdownMenuSeparator v-if="it.divider" class="my-1 h-px bg-line" />
            <DropdownMenuCheckboxItem
              v-if="it.checked !== undefined"
              :model-value="it.checked"
              :disabled="it.disabled"
              :class="cn(listItem, 'pl-8 data-[state=checked]:font-normal')"
              @select="(e: Event) => { e.preventDefault(); emit('select', it.key) }"
            >
              <DropdownMenuItemIndicator class="absolute left-2.5 inline-flex text-zircon-ink">
                <PhCheck :size="14" weight="bold" aria-hidden="true" />
              </DropdownMenuItemIndicator>
              {{ it.label }}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem
              v-else
              :disabled="it.disabled"
              :class="cn(listItem, it.danger && 'text-danger data-[highlighted]:bg-tone-danger-bg data-[highlighted]:text-tone-danger-fg')"
              @select="emit('select', it.key)"
            >
              <component :is="it.icon" v-if="it.icon" class="size-4 shrink-0" aria-hidden="true" />
              {{ it.label }}
            </DropdownMenuItem>
          </template>
        </ZFieldBoundary>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
