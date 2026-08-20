<script setup lang="ts">
import { computed, type Component } from 'vue'

type Tone = 'teal' | 'gold' | 'success' | 'danger' | 'neutral'

const props = withDefaults(
  defineProps<{
    icon?: Component
    value: string | number
    label: string
    tone?: Tone
  }>(),
  {
    icon: undefined,
    tone: 'teal',
  },
)

const toneClass = computed(() => `z-stat-tile__icon--${props.tone}`)
</script>

<template>
  <div class="z-stat-tile">
    <div v-if="icon" class="z-stat-tile__icon" :class="toneClass">
      <component :is="icon" />
    </div>
    <div class="z-stat-tile__body">
      <div class="z-stat-tile__value z-num">{{ value }}</div>
      <div class="z-stat-tile__label z-label">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.z-stat-tile {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--z-surface);
  border: 1px solid var(--z-line);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-1);
}

.z-stat-tile__icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-md);
  font-size: 18px;
}

.z-stat-tile__icon--teal {
  color: var(--z-teal-d);
  background: var(--z-teal-soft);
}

.z-stat-tile__icon--gold {
  color: var(--z-gold);
  background: var(--z-gold-soft);
}

.z-stat-tile__icon--success {
  color: var(--z-success);
  background: var(--z-success-soft);
}

.z-stat-tile__icon--danger {
  color: var(--z-danger);
  background: var(--z-danger-soft);
}

.z-stat-tile__icon--neutral {
  color: var(--z-neutral);
  background: var(--z-neutral-soft);
}

.z-stat-tile__body {
  min-width: 0;
}

.z-stat-tile__value {
  font-family: var(--font-heading);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--z-ink);
}

.z-stat-tile__label {
  margin-top: 2px;
}
</style>
