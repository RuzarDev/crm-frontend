<script setup lang="ts">
import { useId } from 'vue'
import type { SectionKey } from '../recordModel'
import { sectionDomId } from './sectionId'

// Каркас раздела вкладки «Данные» (доска TransitRecord): заголовок h2, счётчик-пилюля, действия справа,
// разделитель сверху (кроме первого раздела). id = sec-<key> — к нему прокручивает меню разделов.
const props = withDefaults(defineProps<{ id: SectionKey; title: string; count?: number | null }>(), { count: null })
const titleId = `${sectionDomId(props.id)}-title-${useId()}`
</script>

<template>
  <section
    :id="sectionDomId(id)"
    :aria-labelledby="titleId"
    :data-record-section="id"
    class="flex min-w-0 scroll-mt-4 flex-col gap-3.5 border-t border-line pt-5 first:border-t-0 first:pt-0"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <h2 :id="titleId" class="m-0 text-base leading-6 font-semibold text-ink">{{ title }}</h2>
      <span
        v-if="count !== null && count !== undefined"
        class="rounded-pill bg-sunken px-1.5 text-xs font-normal text-ink-2 tabular-nums"
        data-section-count
      >{{ count }}</span>
      <div v-if="$slots.actions" class="ml-auto flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:[&_button]:min-h-11" data-section-actions>
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
