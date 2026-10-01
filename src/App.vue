<template>
  <a-config-provider :theme="zirconTheme" :locale="antdLocale" :render-empty="renderEmpty">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, h, onMounted } from 'vue'
import { InboxOutlined } from '@ant-design/icons-vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { zirconTheme } from '@/theme/antdTheme'
import { antdLocaleFor } from '@/i18n/antdLocale'
import { setLocale, getStoredLocale, type AppLocale } from '@/i18n'

const authStore = useAuthStore()
const { locale, t } = useI18n()

// Одно пустое состояние на всё приложение (аудит дизайна 01.10): у 23 экранов при пустых данных было
// белое место или голое «Нет данных». Таблицы со своим emptyText показывают его, как и раньше.
const renderEmpty = (componentName?: string) =>
  componentName === 'Table' || componentName === 'List'
    ? h(EmptyState, { icon: InboxOutlined, title: t('common.emptyTitle'), hint: t('common.emptyHint') })
    : h('div', { class: 'z-empty-inline' }, t('common.emptyInline'))

// Локаль AntD-компонентов следует за выбранным языком приложения.
const antdLocale = computed(() => antdLocaleFor(locale.value as AppLocale))

onMounted(() => {
  authStore.checkAuth()
  setLocale(getStoredLocale()) // проставить <html lang> и синхронизировать хранилище
})
</script>
