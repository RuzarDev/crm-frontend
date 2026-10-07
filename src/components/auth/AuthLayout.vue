<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import LangSegment from '@/components/auth/LangSegment.vue'

// Каркас страниц входа/регистрации (макет Login.dc.html, спека §4 — здесь допустим «вкус лендинга»):
// слева navy-панель героя (от lg), справа язык и колонка формы. Ниже lg от героя остаётся полоса с логотипом.
// Цвет текста у h1/h2/p — явно: в main.css неслоёные правила h1…h6 и p задают свой цвет и наследование не работает.
defineProps<{
  title: string
  subtitle?: string
  heroTitle: string
  heroText: string
  points: string[]
}>()
defineSlots<{ default?: () => unknown; footer?: () => unknown }>()

const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas font-sans text-[15px] text-ink lg:flex-row">
    <header class="bg-navy px-4 py-3 lg:hidden">
      <ZirconLogo size="md" inverse />
    </header>

    <aside class="hidden rounded-[18px] bg-navy px-12 py-10 text-white lg:m-3 lg:mr-0 lg:flex lg:flex-1 lg:flex-col lg:gap-7">
      <ZirconLogo size="md" inverse class="self-start" />
      <div class="mt-auto max-w-[440px]">
        <h1 class="m-0 text-balance text-white text-[36px] font-semibold leading-[1.15] tracking-[-0.02em]">{{ heroTitle }}</h1>
        <p class="m-0 mt-3.5 text-md leading-[1.55] text-on-navy-2">{{ heroText }}</p>
      </div>
      <ul class="m-0 flex list-none flex-col gap-2.5 p-0 text-[14.5px] leading-[1.4] text-on-navy">
        <li v-for="point in points" :key="point" class="flex items-center gap-2.5">
          <span aria-hidden="true" class="size-1.5 shrink-0 rounded-pill bg-zircon" />{{ point }}
        </li>
      </ul>
      <p class="m-0 text-[12.5px] text-on-navy-3">{{ t('auth.copyright', { year }) }}</p>
    </aside>

    <main class="flex flex-1 flex-col items-center gap-6 px-4 py-8 lg:px-6 lg:py-10">
      <LangSegment class="self-end" />
      <div class="my-auto flex w-full max-w-[380px] flex-col gap-[18px]">
        <div>
          <h2 class="m-0 text-[24px] text-ink font-semibold leading-[1.25] tracking-[-0.015em]">{{ title }}</h2>
          <p v-if="subtitle" class="m-0 mt-1.5 text-[14.5px] leading-[1.45] text-ink-3">{{ subtitle }}</p>
        </div>
        <slot />
        <slot name="footer" />
      </div>
    </main>
  </div>
</template>
