<script setup lang="ts">
import { computed, h, type FunctionalComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import { setLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'

// Язык в шапке: короткий код (RU/KZ/EN) — подпись кнопки, полное название — в меню; в aria-label — оба
// (видимая подпись должна входить в доступное имя, WCAG 2.5.3).
// Казахский — «KZ», как привыкли пользователи (код языка kk ничего им не говорит).
const CODE: Record<AppLocale, string> = { ru: 'RU', kk: 'KZ', en: 'EN' }

const { t, locale } = useI18n()

const current = computed<AppLocale>(() => ((SUPPORTED_LOCALES as string[]).includes(locale.value) ? locale.value as AppLocale : 'ru'))
// Текущий язык отмечен галочкой; у остальных — пустое место того же размера, чтобы названия стояли ровно.
const Blank: FunctionalComponent = () => h('span')
const items = computed<ZDropdownItem[]>(() =>
  SUPPORTED_LOCALES.map((l) => ({ key: l, label: t(`lang.${l}`), icon: l === current.value ? PhCheck : Blank })))

const onSelect = (key: string) => {
  if (key !== current.value) void setLocale(key as AppLocale)
}
</script>

<template>
  <ZDropdown :items="items" @select="onSelect">
    <button
      type="button"
      :aria-label="t('shell.lang.label', { lang: t(`lang.${current}`), code: CODE[current] })"
      class="h-[30px] shrink-0 cursor-pointer rounded-field border-0 bg-transparent px-2 font-sans text-[12.5px] font-semibold text-ink-2 outline-hidden transition-colors duration-150 ease-out hover:bg-sunken hover:text-ink focus-visible:shadow-focus data-[state=open]:bg-sunken data-[state=open]:text-ink motion-reduce:transition-none"
    >{{ CODE[current] }}</button>
  </ZDropdown>
</template>
