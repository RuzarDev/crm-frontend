<template>
  <div class="step" :class="`step--${state}`">
    <div class="step-head" :class="{ clickable: state === 'done' }" @click="state === 'done' && (expanded = !expanded)">
      <span class="step-badge">
        <CheckOutlined v-if="state === 'done'" />
        <template v-else>{{ index }}</template>
      </span>
      <span class="step-title">{{ title }}</span>
      <span v-if="state === 'done' && summary" class="step-summary">{{ summary }}</span>
      <span v-if="state === 'current'" class="step-now">вы здесь</span>
      <span v-if="state === 'future' && executor" class="step-executor">выполняет: {{ executor }}</span>
      <DownOutlined v-if="state === 'done'" class="step-chevron" :class="{ open: expanded }" />
    </div>
    <div v-if="state === 'current' || (state === 'done' && expanded)" class="step-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CheckOutlined, DownOutlined } from '@ant-design/icons-vue'

defineProps<{
  index: number
  title: string
  state: 'done' | 'current' | 'future'
  executor?: string
  summary?: string
}>()

const expanded = ref(false)
</script>

<style scoped>
.step {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-lg);
  background: var(--atg-surface);
}
.step--current {
  border-color: var(--atg-teal);
  box-shadow: var(--atg-shadow);
}
.step--future {
  opacity: 0.6;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}
.step-head.clickable {
  cursor: pointer;
}
.step-badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: var(--atg-line);
  flex-shrink: 0;
}
.step--current .step-badge {
  background: var(--atg-teal);
  color: #fff;
}
.step--done .step-badge {
  background: var(--atg-teal-weak, #d9f0ee);
  color: var(--atg-teal);
}
.step-title {
  font-weight: 600;
}
.step-summary {
  color: var(--atg-muted);
  font-size: 12px;
  margin-left: auto;
}
.step-now {
  color: var(--atg-teal);
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}
.step-executor {
  color: var(--atg-muted);
  font-size: 12px;
  margin-left: auto;
}
.step-chevron {
  color: var(--atg-muted);
  transition: transform 0.2s;
}
.step-chevron.open {
  transform: rotate(180deg);
}
.step-body {
  padding: 4px 16px 16px 52px;
}
</style>
