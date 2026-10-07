<script setup lang="ts">
import { AccordionContent, AccordionHeader, AccordionItem, AccordionTrigger } from 'reka-ui'
import { PhCaretRight } from '@phosphor-icons/vue'

// Пункт ZCollapse. Слот extra — сосед заголовка (h3), а не его часть: имя заголовка не включает extra,
// клики по extra шапку не переключают. Внутри h3 только кнопка со span-ами (div в заголовке недопустим).
defineProps<{ value: string; header?: string; disabled?: boolean }>()
</script>

<template>
  <AccordionItem :value="value" :disabled="disabled" class="border-b border-line">
    <div class="flex items-center gap-3">
      <AccordionHeader class="m-0 min-w-0 flex-1">
        <AccordionTrigger
          class="group flex w-full cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent py-3 text-left text-sm font-semibold text-ink outline-hidden focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PhCaretRight
            :size="14"
            aria-hidden="true"
            class="shrink-0 text-ink-3 transition-transform duration-180 ease-out group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
          <span class="min-w-0"><slot name="header">{{ header }}</slot></span>
        </AccordionTrigger>
      </AccordionHeader>
      <span v-if="$slots.extra" class="shrink-0 text-sm font-normal text-ink-3">
        <slot name="extra" />
      </span>
    </div>
    <AccordionContent
      class="overflow-hidden text-sm text-ink data-[state=closed]:animate-acc-close data-[state=open]:animate-acc-open motion-reduce:animate-none"
    >
      <div class="pb-3">
        <slot />
      </div>
    </AccordionContent>
  </AccordionItem>
</template>
