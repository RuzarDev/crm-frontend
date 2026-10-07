<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BrokerShell from '@/layouts/BrokerShell.vue'
import ClientShell from '@/layouts/ClientShell.vue'

// Оболочка по роли (спека редизайна §5): клиент — свой кабинет, все остальные — оболочка брокера.
const auth = useAuthStore()
const isClient = computed(() => (auth.role || '').trim().toLowerCase() === 'client')
</script>

<template>
  <ClientShell v-if="isClient" />
  <BrokerShell v-else />
</template>
