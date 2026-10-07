<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; width?: string; height?: string }>(), { lines: 1, width: '100%', height: '14px' })
</script>

<template>
  <div aria-busy="true" class="flex flex-col gap-2">
    <span
      v-for="i in lines"
      :key="i"
      data-z-line
      class="block animate-pulse rounded-[6px] bg-sunken motion-reduce:animate-none"
      :style="{ width: lines > 1 && i === lines ? '62%' : width, height }"
    />
  </div>
</template>
