<template>
  <a-config-provider :theme="zirconTheme" :locale="antdLocale">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { zirconTheme } from '@/theme/antdTheme'
import { antdLocaleFor } from '@/i18n/antdLocale'
import { setLocale, getStoredLocale, type AppLocale } from '@/i18n'

const authStore = useAuthStore()
const { locale } = useI18n()

// Локаль AntD-компонентов следует за выбранным языком приложения.
const antdLocale = computed(() => antdLocaleFor(locale.value as AppLocale))

onMounted(() => {
  authStore.checkAuth()
  setLocale(getStoredLocale()) // проставить <html lang> и синхронизировать хранилище
})
</script>
