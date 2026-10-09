<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /tnved/tree: клиенту и сотруднику — отдельные экраны (как Import40Route), каждый грузится лениво.
// Клиенту — «Подбор кода ТН ВЭД» (волна 2b), сотруднику — справочник «ТН ВЭД» с деревом и карточкой кода (волна 5а).
const StaffView = defineAsyncComponent(() => import('@/views/broker/references/tnved/TnvedPage.vue'))
const ClientView = defineAsyncComponent(() => import('@/views/client/ClientTnvedView.vue'))
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
