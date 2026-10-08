<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { TabsContent, TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { cn } from '@/ui/cn'

// Замена a-tabs. Два режима:
// — без слота: только полоса вкладок, содержимое рендерит родитель по activeKey. aria-controls у вкладок нет
//   (Reka 2.11 ставит его, только когда зарегистрирован TabsContent с этим value) — висячих ссылок нет;
// — слот #default="{ key }": панель активной вкладки рендерится внутри Reka TabsContent (role=tabpanel,
//   aria-labelledby на вкладку, aria-controls вкладки — на неё). Неактивные панели — пустые hidden-узлы.
// Пустая строка вместо undefined: Reka решает «управляемый ли» по modelValue === undefined (null по типам нельзя).
// Активация по стрелкам автоматическая (как у AntD). change — один раз на реальную смену вкладки.
export interface ZTabItem { key: string; label: string; count?: number; disabled?: boolean }

// variant="line" — вкладки списков (волна 3а): активная — акцентным цветом zircon-ink под подчёркиванием, подпись 13.5px.
const props = withDefaults(defineProps<{ activeKey?: string | null; items: ZTabItem[]; variant?: 'default' | 'line' }>(), { variant: 'default' })
defineSlots<{ default?: (p: { key: string }) => unknown }>()
const emit = defineEmits<{
  'update:activeKey': [key: string]
  change: [key: string]
}>()

// Подпись — span с невидимой жирной копией в ::after (data-label): ширина резервируется под bold,
// активная вкладка не раздвигает соседей. Пробел перед счётчиком нужен имени вкладки («Все 38»).
// Полоса прокручивается по горизонтали (на узком экране не раздвигает контейнер, полоса прокрутки скрыта —
// все вкладки достижимы стрелками). Отступы py-1 px-1: overflow иначе обрезал бы кольцо фокуса (4px).
// Активная вкладка (при монтировании и смене activeKey) показывается прокруткой только самой полосы:
// scrollIntoView крутил бы ещё и страницу. Триггеры позиционируются от полосы (она relative).
const list = ref<{ $el: HTMLElement } | null>(null)
const PAD = 4
const revealActive = () => {
  const strip = list.value?.$el
  const tab = strip?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
  if (!strip || !tab) return
  const left = tab.offsetLeft - PAD
  const right = tab.offsetLeft + tab.offsetWidth + PAD
  if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left)
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth
}
watch(() => props.activeKey, async () => {
  await nextTick()
  revealActive()
}, { immediate: true })

const onUpdate = (v: unknown) => {
  if (typeof v !== 'string' || v === props.activeKey) return
  emit('update:activeKey', v)
  emit('change', v)
}
</script>

<template>
  <TabsRoot :model-value="activeKey ?? ''" activation-mode="automatic" @update:model-value="onUpdate">
    <TabsList ref="list" class="relative flex min-w-0 max-w-full gap-5 overflow-x-auto border-b border-line px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          'data-[state=active]:font-semibold',
          variant === 'line' ? 'text-[13.5px] max-sm:h-11 data-[state=active]:text-zircon-ink' : 'data-[state=active]:text-ink',
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
    <template v-if="$slots.default">
      <TabsContent
        v-for="it in items"
        :key="it.key"
        :value="it.key"
        class="rounded-field pt-4 outline-hidden focus-visible:shadow-focus"
      >
        <slot :key="it.key" />
      </TabsContent>
    </template>
  </TabsRoot>
</template>
