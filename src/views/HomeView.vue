<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import BrokerHomeView from '@/views/home/BrokerHomeView.vue'
import ClientHomeView from '@/views/home/ClientHomeView.vue'

// /home: у клиента — его Главная (сводка поставок), у сотрудника — Главная брокера.
const auth = useAuthStore()
</script>

<template>
  <ClientHomeView v-if="auth.isClient" />
  <BrokerHomeView v-else />
</template>
