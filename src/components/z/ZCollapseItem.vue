<script setup lang="ts">
import { AccordionContent, AccordionHeader, AccordionItem, AccordionTrigger } from 'reka-ui'
import { PhCaretRight } from '@phosphor-icons/vue'

// Пункт ZCollapse. Слот extra лежит рядом с кнопкой-шапкой (не внутри): его клики шапку не переключают.
defineProps<{ value: string; header?: string; disabled?: boolean }>()
</script>

<template>
  <AccordionItem :value="value" :disabled="disabled" class="border-b border-line">
    <AccordionHeader class="m-0 flex items-center gap-3">
      <AccordionTrigger
        class="group flex flex-1 cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent py-3 text-left text-sm font-semibold text-ink outline-hidden focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45"
      >
        <PhCaretRight
          :size="14"
          aria-hidden="true"
          class="shrink-0 text-ink-3 transition-transform duration-180 ease-out group-data-[state=open]:rotate-90 motion-reduce:transition-none"
        />
        <slot name="header">{{ header }}</slot>
      </AccordionTrigger>
      <div v-if="$slots.extra" class="shrink-0 text-sm font-normal text-ink-3">
        <slot name="extra" />
      </div>
    </AccordionHeader>
    <AccordionContent
      class="overflow-hidden text-sm text-ink data-[state=closed]:animate-acc-close data-[state=open]:animate-acc-open motion-reduce:animate-none"
    >
      <div class="pb-3">
        <slot />
      </div>
    </AccordionContent>
  </AccordionItem>
</template>
