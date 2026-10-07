<script setup lang="ts">
import { TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { cn } from '@/ui/cn'

// Замена a-tabs: только полоса вкладок, содержимое рендерит родитель по activeKey.
// Пустая строка вместо undefined: Reka решает «управляемый ли» по modelValue === undefined (null по типам нельзя).
// Активация по стрелкам автоматическая (как у AntD). change — один раз на реальную смену вкладки.
export interface ZTabItem { key: string; label: string; count?: number; disabled?: boolean }

const props = defineProps<{ activeKey?: string | null; items: ZTabItem[] }>()
const emit = defineEmits<{
  'update:activeKey': [key: string]
  change: [key: string]
}>()

const onUpdate = (v: unknown) => {
  if (typeof v !== 'string' || v === props.activeKey) return
  emit('update:activeKey', v)
  emit('change', v)
}
</script>

<template>
  <TabsRoot :model-value="activeKey ?? ''" activation-mode="automatic" @update:model-value="onUpdate">
    <TabsList class="relative flex gap-5 border-b border-line">
      <TabsTrigger
        v-for="it in items"
        :key="it.key"
        :value="it.key"
        :disabled="it.disabled"
        :class="cn(
          'inline-flex h-9 items-center rounded-field px-1 text-sm outline-hidden whitespace-nowrap cursor-pointer',
          'transition-colors duration-150 ease-out motion-reduce:transition-none',
          'focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45',
          'data-[state=inactive]:text-ink-3 data-[state=inactive]:enabled:hover:text-ink',
          'data-[state=active]:font-semibold data-[state=active]:text-ink',
        )"
      >
        {{ it.label }}<span
          v-if="it.count !== undefined"
          class="ml-1.5 rounded-pill bg-sunken px-1.5 text-xs font-normal tabular-nums text-ink-2"
        >{{ it.count }}</span>
      </TabsTrigger>
      <TabsIndicator
        class="absolute bottom-0 left-0 h-0.5 w-(--reka-tabs-indicator-size) translate-x-(--reka-tabs-indicator-position) bg-zircon transition-[width,transform] duration-180 ease-out motion-reduce:transition-none"
      />
    </TabsList>
  </TabsRoot>
</template>
