<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/ui/cn'
import { avatarTone, initials, type AvatarTone } from '@/ui/initials'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const TONE: Record<AvatarTone, string> = {
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
  wait: 'bg-tone-wait-bg text-tone-wait-fg',
  submitted: 'bg-tone-submitted-bg text-tone-submitted-fg',
  done: 'bg-tone-done-bg text-tone-done-fg',
  pay: 'bg-tone-pay-bg text-tone-pay-fg',
}
const SIZE = { sm: 'size-6 rounded-[7px] text-[10px]', md: 'size-[30px] rounded-[9px] text-xs', lg: 'size-9 rounded-row text-sm' }

// Декоративный: имя рядом всегда написано текстом, поэтому скрыт от скринридера.
const text = computed(() => initials(props.name))
const tone = computed(() => avatarTone(props.name))
</script>

<template>
  <span
    aria-hidden="true"
    :title="name"
    :class="cn('inline-flex shrink-0 select-none items-center justify-center font-bold tracking-[0.02em]', SIZE[size], TONE[tone])"
  >{{ text }}</span>
</template>
