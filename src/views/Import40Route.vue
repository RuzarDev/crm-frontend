<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40: клиенту — «Мои поставки» (редизайн, волна 2a), сотруднику — «Заявки» (редизайн, волна 3а).
// Оба экрана грузятся лениво: клиент не тянет код списка сотрудника и наоборот.
const ClientShipmentsView = defineAsyncComponent(() => import('@/views/client/ClientShipmentsView.vue'))
const BrokerRequestsView = defineAsyncComponent(() => import('@/views/broker/requests/BrokerRequestsView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientShipmentsView v-if="auth.isClient" />
  <BrokerRequestsView v-else />
</template>
