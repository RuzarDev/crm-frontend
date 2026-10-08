<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40/company: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиент — экран редизайна (волна 2b); сотрудник — прежний Import40CompanyView (его перевод — волны 3–5).
const StaffView = defineAsyncComponent(() => import('@/views/Import40CompanyView.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientCompanyView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
