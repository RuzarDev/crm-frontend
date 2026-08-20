<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="z-page-header">
    <div class="z-page-header__text">
      <h1 class="z-page-header__title">{{ title }}</h1>
      <p v-if="subtitle" class="z-page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="z-page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.z-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}

.z-page-header__text {
  min-width: 0;
}

.z-page-header__title {
  margin: 0;
  color: var(--z-ink);
  font-family: var(--font-heading);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.z-page-header__subtitle {
  margin: 6px 0 0;
  color: var(--z-muted);
  font-size: 13.5px;
  line-height: 1.5;
}

.z-page-header__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
</style>
