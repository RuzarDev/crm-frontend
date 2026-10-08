<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40/:id: клиенту — карточка поставки (редизайн, волна 2a), сотруднику — прежняя карточка заявки.
// Оба экрана грузятся лениво: клиент не тянет код карточки сотрудника и наоборот.
const ClientShipmentView = defineAsyncComponent(() => import('@/views/client/ClientShipmentView.vue'))
const Import40CaseView = defineAsyncComponent(() => import('@/views/Import40CaseView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientShipmentView v-if="auth.isClient" />
  <Import40CaseView v-else />
</template>
