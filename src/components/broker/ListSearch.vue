<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import ZInput from '@/components/z/ZInput.vue'

// Поле поиска над списком. update:value — на каждый ввод; search — через debounce мс после последнего ввода,
// сразу по Enter и при очистке (крестик).
const props = withDefaults(defineProps<{ value: string; placeholder: string; debounce?: number }>(), { debounce: 0 })
const emit = defineEmits<{ 'update:value': [value: string]; search: [value: string] }>()

let timer: ReturnType<typeof setTimeout> | undefined
const cancel = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined } }

const onValue = (v: string) => {
  emit('update:value', v)
  cancel()
  timer = setTimeout(() => { timer = undefined; emit('search', v) }, props.debounce)
}
// Enter и очистка ZInput сообщает событием search — не ждём таймера.
const onSearch = (v: string) => {
  cancel()
  emit('search', v)
}
onBeforeUnmount(cancel)
</script>

<template>
  <ZInput
    type="search"
    allow-clear
    :value="value"
    :placeholder="placeholder"
    :aria-label="placeholder"
    class="h-[34px] w-full min-w-0 text-[13px] max-sm:h-11 max-sm:basis-full sm:max-w-[360px] sm:flex-[1_1_15rem]"
    @update:value="onValue"
    @search="onSearch"
  />
</template>
