<template>
  <TooltipProvider :delay-duration="300">
    <router-view />
  </TooltipProvider>
  <!-- Тосты: не перекрывают шапку (offset), не больше трёх сразу — как было в message.config. -->
  <Toaster position="top-center" :offset="72" :visible-toasts="3" :duration="4000" />
  <!-- Окно подтверждения useConfirm() — одно на приложение (замена Modal.confirm). -->
  <ZConfirmHost />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { Toaster } from 'vue-sonner'
import { TooltipProvider } from 'reka-ui'
import ZConfirmHost from '@/components/z/ZConfirmHost.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  authStore.checkAuth()
  // Язык уже выставлен в main.ts до монтирования (словари kk/en грузятся отдельно).
})
</script>
