<template>
  <!-- compact — для шапки: кнопка «🌐 RU» той же высоты, что соседние (36px), полный список в меню.
       Без compact — обычный select (страницы входа/регистрации). -->
  <a-dropdown v-if="compact" :trigger="['click']" placement="bottomRight" :get-popup-container="popupContainer">
    <button type="button" class="lang-compact" :class="{ 'lang-compact--dark': dark }" :title="t(`lang.${locale}`)">
      <GlobalOutlined />
      <span class="lang-compact__code">{{ String(locale).toUpperCase() }}</span>
    </button>
    <template #overlay>
      <a-menu :selected-keys="[String(locale)]" @click="onMenuClick">
        <a-menu-item v-for="o in options" :key="o.value">{{ o.label }}</a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
  <a-select
    v-else
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
defineProps<{ bordered?: boolean; dark?: boolean; compact?: boolean }>()

const { t, locale } = useI18n()

const options = computed(() =>
  SUPPORTED_LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) })),
)

const popupContainer = () => document.body
const onChange = (v: unknown) => setLocale(v as AppLocale)
const onMenuClick = ({ key }: { key: string | number }) => onChange(key)
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
  border-color: rgba(35, 181, 211, 0.9) !important;
}
.lang-switcher--dark :deep(.ant-select-selection-item),
.lang-switcher--dark :deep(.ant-select-arrow),
.lang-switcher--dark :deep(.anticon) {
  color: #f0f3ff !important;
}

/* Компактная кнопка шапки — тот же стиль, что у колокольчика и меню профиля. */
.lang-compact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #d9d9d9;
  border-radius: var(--atg-radius, 8px);
  background: #fff;
  color: #0E1B35;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.lang-compact--dark {
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(240, 243, 255, 0.82);
}
.lang-compact:hover {
  color: #0E1B35;
  border-color: #23B5D3;
  background: #23B5D3;
}
.lang-compact__code { line-height: 1; }
</style>
