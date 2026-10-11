<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40/company: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиент — «Моя компания» (волна 2b); сотрудник — «Компания клиента» (волна 7).
const StaffView = defineAsyncComponent(() => import('@/views/broker/company/StaffCompanyPage.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientCompanyView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
