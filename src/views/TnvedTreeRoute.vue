<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'

// /tnved/tree: клиенту и сотруднику — отдельные ветки (как Import40Route), каждый экран грузится лениво.
// Пока клиент видит прежний экран: клиентский экран редизайна (волна 2b) подменит ClientView.
const StaffView = defineAsyncComponent(() => import('@/views/TnvedTreeView.vue'))
const ClientView = StaffView
const auth = useAuthStore()
</script>

<template>
  <ClientView v-if="auth.isClient" />
  <StaffView v-else />
</template>
