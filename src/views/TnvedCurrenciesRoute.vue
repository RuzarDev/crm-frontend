<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /tnved/currencies: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиенту — «Курсы валют» кабинета (волна 2b), сотруднику — «Курсы» с «Обновить» (волна 5а); таблица общая.
const StaffView = defineAsyncComponent(() => import('@/views/broker/references/RatesPage.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientRatesView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
