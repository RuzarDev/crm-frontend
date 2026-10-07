<script setup lang="ts">
import { computed } from 'vue'
import ShellFrame from '@/components/shell/ShellFrame.vue'
import { buildBrokerNav, navAccessFromStore } from '@/shell/navModel'
import { useAuthStore } from '@/stores/auth'

// Оболочка сотрудников брокера: меню по ролям и правам (navModel), плотная раскладка.
const authStore = useAuthStore()
const model = computed(() => buildBrokerNav(navAccessFromStore(authStore, false)))
</script>

<template>
  <ShellFrame :model="model" />
</template>
