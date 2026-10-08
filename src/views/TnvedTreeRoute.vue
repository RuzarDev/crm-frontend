<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /tnved/tree: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Клиенту — упрощённый экран редизайна «Подбор кода ТН ВЭД» (волна 2b); сотрудники остаются на прежнем.
const StaffView = defineAsyncComponent(() => import('@/views/TnvedTreeView.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientTnvedView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
