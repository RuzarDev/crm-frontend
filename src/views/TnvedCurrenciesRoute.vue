<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /tnved/currencies: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиенту — упрощённый экран редизайна «Курсы валют» (волна 2b); сотрудники остаются на прежнем.
const StaffView = defineAsyncComponent(() => import('@/views/TnvedCurrenciesView.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientRatesView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
