<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { NavSection } from '@/shell/navModel'
import { cn } from '@/ui/cn'

// Вкладки-ссылки раздела в шапке (родитель рендерит, только если вкладок ≥ 2). aria-current — по activeKey
// родителя (resolveActive), а не RouterLink: у того точное совпадение пути, вложенные страницы не подсвечивались бы.
// Полоса прокручивается по горизонтали и не раздвигает шапку; py-1 px-1 — чтобы overflow не обрезал кольцо фокуса.
// Подпись — с невидимой жирной копией (data-label), как в ZTabs: активная вкладка не сдвигает соседей.
const props = defineProps<{ section: NavSection; activeKey: string }>()
const { t } = useI18n()

// Активная вкладка показывается прокруткой самой полосы: scrollIntoView крутил бы ещё и страницу.
const strip = ref<HTMLElement | null>(null)
const PAD = 4
const revealActive = () => {
  const el = strip.value
  const tab = el?.querySelector<HTMLElement>('a[aria-current="page"]')
  if (!el || !tab) return
  const left = tab.offsetLeft - PAD
  const right = tab.offsetLeft + tab.offsetWidth + PAD
  if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left)
  else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
}
watch(() => [props.activeKey, props.section.key], async () => {
  await nextTick()
  revealActive()
}, { immediate: true })
</script>

<template>
  <nav :aria-label="t(section.labelKey)" class="min-w-0">
    <ul
      ref="strip"
      class="relative m-0 flex min-w-0 max-w-full list-none gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <li v-for="p in section.pages" :key="p.key" class="shrink-0">
        <RouterLink v-slot="{ href, navigate }" :to="p.to" custom>
          <a
            :href="href"
            :aria-current="p.key === activeKey ? 'page' : undefined"
            :class="cn(
              'inline-flex h-8 items-center whitespace-nowrap rounded-field px-3 text-sm no-underline outline-hidden focus-visible:shadow-focus',
              'transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none',
              p.key === activeKey
                ? 'bg-sunken font-semibold text-ink hover:text-ink'
                : 'bg-transparent text-ink-3 hover:bg-sunken hover:text-ink',
            )"
            @click="navigate"
          ><span
            :data-label="t(p.labelKey)"
            class="inline-flex flex-col items-center after:invisible after:block after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
          >{{ t(p.labelKey) }}</span></a>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
