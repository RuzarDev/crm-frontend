<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /billing: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиент — «Счета» редизайна (волна 2b); сотрудники — «Счета и акты» (волна 3б).
const StaffView = defineAsyncComponent(() => import('@/views/broker/finance/BillingDocsView.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientInvoicesView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
