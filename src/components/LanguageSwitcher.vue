<template>
  <a-select
    :value="locale"
    size="small"
    class="lang-switcher"
    :class="{ 'lang-switcher--dark': dark }"
    :options="options"
    :get-popup-container="popupContainer"
    @change="onChange"
  >
    <template #suffixIcon><GlobalOutlined /></template>
  </a-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GlobalOutlined } from '@ant-design/icons-vue'
import { setLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'

// dark — вариант для тёмной шапки (светлый текст/иконка на полупрозрачном фоне),
// чтобы контрол не сливался с фоном. По умолчанию — обычный светлый вид (логин).
defineProps<{ bordered?: boolean; dark?: boolean }>()

const { t, locale } = useI18n()

const options = computed(() =>
  SUPPORTED_LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) })),
)

const popupContainer = () => document.body
const onChange = (v: unknown) => setLocale(v as AppLocale)
</script>

<style scoped>
.lang-switcher {
  min-width: 116px;
}

/* Тёмная шапка: светлый текст + иконка глобуса + видимая рамка/фон,
   чтобы переключатель был заметен и очевиден как контрол. */
.lang-switcher--dark :deep(.ant-select-selector) {
  background: rgba(255, 255, 255, 0.12) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
  border-radius: 8px !important;
}
.lang-switcher--dark:hover :deep(.ant-select-selector) {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(43, 188, 212, 0.9) !important;
}
.lang-switcher--dark :deep(.ant-select-selection-item),
.lang-switcher--dark :deep(.ant-select-arrow),
.lang-switcher--dark :deep(.anticon) {
  color: #f0f3ff !important;
}
</style>
