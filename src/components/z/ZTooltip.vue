<script setup lang="ts">
import { computed, type FunctionalComponent } from 'vue'
import {
  injectTooltipProviderContext, TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger,
} from 'reka-ui'
import { Z_LAYER_FLOATING } from '@/ui/surfaces'

// Замена a-tooltip (41 место). Общий TooltipProvider стоит в App.vue (общая задержка и «пропуск задержки»
// при переходе между подсказками); если выше по дереву провайдера нет (тесты, изолированные окна),
// ZTooltip сам оборачивается в собственный — Reka без него бросает исключение.
// Пустой title — подсказки нет, рендерится только слот (без обёрток и атрибутов Reka).
// Триггер — as-child: aria-describedby и обработчики получает сам элемент слота. Подсказка открывается
// по наведению и по клавиатурному фокусу, закрывается по Escape и при уходе.
// Ограничение Reka: у disabled-кнопки браузер не шлёт pointer/focus-события — подсказка на ней не покажется;
// AntD оборачивал такой элемент в span. Нужна подсказка на выключенной кнопке — обернуть её в <span tabindex="0">.
const props = withDefaults(defineProps<{
  title?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}>(), { title: '', side: 'top' })

// Из пробелов — всё равно пусто.
const hasTitle = computed(() => props.title.trim() !== '')
const hasProvider = injectTooltipProviderContext(null) !== null
const Passthrough: FunctionalComponent = (_, { slots }) => slots.default?.()
const Provider = hasProvider ? Passthrough : TooltipProvider
</script>

<template>
  <component :is="Provider" v-if="hasTitle">
    <TooltipRoot>
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
  </component>
  <slot v-else />
</template>
