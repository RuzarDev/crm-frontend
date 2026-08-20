<template>
  <a-config-provider :theme="zirconTheme">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { zirconTheme } from '@/theme/antdTheme'

const authStore = useAuthStore()

onMounted(() => {
  authStore.checkAuth()
})
</script>
