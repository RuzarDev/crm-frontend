<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BrokerHomeView from '@/views/home/BrokerHomeView.vue'

// /home: у клиента — «Мои поставки» (Task 9), у сотрудника — Главная брокера.
const auth = useAuthStore()
const isClient = computed(() => (auth.role || '').trim().toLowerCase() === 'client')
</script>

<template>
  <div v-if="isClient" />
  <BrokerHomeView v-else />
</template>
