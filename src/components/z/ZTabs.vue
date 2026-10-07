<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
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

// Подпись — span с невидимой жирной копией в ::after (data-label): ширина резервируется под bold,
// активная вкладка не раздвигает соседей. Пробел перед счётчиком нужен имени вкладки («Все 38»).
// Полоса прокручивается по горизонтали (на узком экране не раздвигает контейнер, полоса прокрутки скрыта —
// все вкладки достижимы стрелками). Вертикальный отступ py-1: overflow обрезал бы кольцо фокуса (4px).
// При смене активной вкладка прокручивается в видимую часть (в jsdom scrollIntoView нет).
const list = ref<{ $el: HTMLElement } | null>(null)
watch(() => props.activeKey, async () => {
  await nextTick()
  const tab = list.value?.$el?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
  if (tab && typeof tab.scrollIntoView === 'function') tab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

const onUpdate = (v: unknown) => {
  if (typeof v !== 'string' || v === props.activeKey) return
  emit('update:activeKey', v)
  emit('change', v)
}
</script>

<template>
  <TabsRoot :model-value="activeKey ?? ''" activation-mode="automatic" @update:model-value="onUpdate">
    <TabsList ref="list" class="relative flex min-w-0 max-w-full gap-5 overflow-x-auto border-b border-line py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsTrigger
        v-for="it in items"
        :key="it.key"
        :value="it.key"
        :disabled="it.disabled"
        :class="cn(
          'inline-flex h-9 shrink-0 items-center rounded-field border-0 bg-transparent px-1 font-sans text-sm outline-hidden whitespace-nowrap cursor-pointer',
          'transition-colors duration-150 ease-out motion-reduce:transition-none',
          'focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45',
          'data-[state=inactive]:text-ink-3 data-[state=inactive]:enabled:hover:text-ink',
          'data-[state=active]:font-semibold data-[state=active]:text-ink',
        )"
      >
        <span
          :data-label="it.label"
          class="inline-flex flex-col items-center after:invisible after:block after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
        >{{ it.label }}</span> <span
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
