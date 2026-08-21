<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon?: Component
  title: string
  hint?: string
}>()
</script>

<template>
  <div class="z-empty-state">
    <div v-if="icon" class="z-empty-state__icon">
      <component :is="icon" />
    </div>
    <div class="z-empty-state__title">{{ title }}</div>
    <div v-if="hint" class="z-empty-state__hint">{{ hint }}</div>
    <div v-if="$slots.action" class="z-empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.z-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--sp-6) var(--sp-5);
}

.z-empty-state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--sp-4);
  color: var(--z-muted);
  font-size: 40px;
  line-height: 1;
  opacity: 0.7;
}

.z-empty-state__title {
  color: var(--z-ink);
  font-family: var(--font-heading);
  font-size: 16px;
  font-weight: 700;
}

.z-empty-state__hint {
  max-width: 420px;
  margin-top: var(--sp-2);
  color: var(--z-muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.z-empty-state__action {
  margin-top: var(--sp-5);
}
</style>
