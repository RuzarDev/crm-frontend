<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import BrokerShell from '@/layouts/BrokerShell.vue'
import ClientShell from '@/layouts/ClientShell.vue'

// Оболочка по роли (спека редизайна §5): клиент — свой кабинет, все остальные — оболочка брокера.
const auth = useAuthStore()
</script>

<template>
  <ClientShell v-if="auth.isClient" />
  <BrokerShell v-else />
</template>
