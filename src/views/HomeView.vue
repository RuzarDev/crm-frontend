<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BrokerHomeView from '@/views/home/BrokerHomeView.vue'
import ClientHomeView from '@/views/home/ClientHomeView.vue'

// /home: у клиента — «Мои поставки», у сотрудника — Главная брокера.
const auth = useAuthStore()
const isClient = computed(() => (auth.role || '').trim().toLowerCase() === 'client')
</script>

<template>
  <ClientHomeView v-if="isClient" />
  <BrokerHomeView v-else />
</template>
