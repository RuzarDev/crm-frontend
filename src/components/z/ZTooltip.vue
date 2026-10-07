<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { Z_LAYER_FLOATING } from '@/ui/surfaces'

// Замена a-tooltip (41 место). Нужен TooltipProvider выше по дереву (стоит в App.vue).
// Пустой title — подсказки нет, рендерится только слот (без обёрток и атрибутов Reka).
// Триггер — as-child: aria-describedby и обработчики получает сам элемент слота. Подсказка открывается
// по наведению и по клавиатурному фокусу, закрывается по Escape и при уходе.
// Ограничение Reka: у disabled-кнопки браузер не шлёт pointer/focus-события — подсказка на ней не покажется;
// AntD оборачивал такой элемент в span. Нужна подсказка на выключенной кнопке — обернуть её в <span tabindex="0">.
withDefaults(defineProps<{
  title?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}>(), { title: '', side: 'top' })
</script>

<template>
  <TooltipRoot v-if="title">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="6"
        :class="`${Z_LAYER_FLOATING} max-w-72 rounded-[7px] bg-navy px-2 py-1 text-xs text-white text-pretty shadow-float data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in data-[state=closed]:animate-pop-out motion-reduce:animate-none`"
      >
        {{ title }}
        <TooltipArrow class="fill-navy" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
  <slot v-else />
</template>
