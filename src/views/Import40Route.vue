<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40: клиенту — «Мои поставки» (редизайн, волна 2a), сотруднику — прежний список заявок.
// Оба экрана грузятся лениво: клиент не тянет код списка сотрудника и наоборот.
const ClientShipmentsView = defineAsyncComponent(() => import('@/views/client/ClientShipmentsView.vue'))
const Import40ListView = defineAsyncComponent(() => import('@/views/Import40ListView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientShipmentsView v-if="auth.isClient" />
  <Import40ListView v-else />
</template>
