<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /import-40/:id: клиенту — карточка поставки (редизайн, волна 2a), сотруднику — карточка заявки (волна 4а).
// Оба экрана грузятся лениво: клиент не тянет код карточки сотрудника и наоборот.
const ClientShipmentView = defineAsyncComponent(() => import('@/views/client/ClientShipmentView.vue'))
const CaseView = defineAsyncComponent(() => import('@/views/broker/case/CaseView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientShipmentView v-if="auth.isClient" />
  <CaseView v-else />
</template>
