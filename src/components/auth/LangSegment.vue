<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { setLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'

// Язык на страницах входа: три кнопки-переключателя (aria-pressed) — выбор виден сразу, без меню.
// Подпись — короткий код (казахский — «KZ», как в шапке), полное название — во всплывающей подсказке.
const CODE: Record<AppLocale, string> = { ru: 'RU', kk: 'KZ', en: 'EN' }

const { t, locale } = useI18n()
const current = computed<AppLocale>(() => ((SUPPORTED_LOCALES as string[]).includes(locale.value) ? locale.value as AppLocale : 'ru'))

const select = (l: AppLocale) => {
  if (l !== current.value) void setLocale(l)
}
</script>

<template>
  <div role="group" :aria-label="t('lang.label')" class="flex gap-1">
    <button
      v-for="l in SUPPORTED_LOCALES"
      :key="l"
      type="button"
      :aria-pressed="l === current ? 'true' : 'false'"
      :title="t(`lang.${l}`)"
      :class="cn(
        'h-[26px] min-w-[34px] cursor-pointer rounded-[6px] border-0 px-2 font-sans text-[13px] leading-none outline-hidden',
        'transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:shadow-focus',
        l === current ? 'bg-sunken font-semibold text-ink' : 'bg-transparent font-normal text-ink-3 hover:bg-sunken hover:text-ink',
      )"
      @click="select(l)"
    >{{ CODE[l] }}</button>
  </div>
</template>
