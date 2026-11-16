<script setup lang="ts">
// Госномер машины или прицепа: моноширинный, в рамке — как номерной знак.
defineProps<{ plate: string }>()
</script>

<template>
  <span
    data-plate
    class="inline-block max-w-full truncate whitespace-nowrap rounded-[6px] border border-line-strong bg-surface px-2 py-0.5 font-mono text-sm leading-5 font-medium tabular-nums text-ink"
  >{{ plate }}</span>
</template>
