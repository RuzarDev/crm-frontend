<template>
  <a-config-provider :theme="zirconTheme" :locale="antdLocale" :render-empty="renderEmpty">
    <TooltipProvider :delay-duration="300">
      <router-view />
    </TooltipProvider>
  </a-config-provider>
  <!-- Тосты: не перекрывают шапку (offset), не больше трёх сразу — как было в message.config. -->
  <Toaster position="top-center" :offset="72" :visible-toasts="3" :duration="4000" />
</template>

<script setup lang="ts">
import { computed, h, onMounted } from 'vue'
import { Toaster } from 'vue-sonner'
import { TooltipProvider } from 'reka-ui'
import { InboxOutlined } from '@ant-design/icons-vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { zirconTheme } from '@/theme/antdTheme'
import { antdLocaleFor } from '@/i18n/antdLocale'
import { type AppLocale } from '@/i18n'

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
  // Язык уже выставлен в main.ts до монтирования (словари kk/en грузятся отдельно).
})
</script>
