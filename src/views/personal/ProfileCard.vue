<script setup lang="ts">
import { useId } from 'vue'
import ZButton from '@/components/z/ZButton.vue'

// Карточка страницы «Профиль»: заголовок, своя кнопка справа и форма внутри (Enter отправляет её). Без кнопки
// (saveText не задан) — просто карточка. Кнопка «Сохранить» доступна, пока есть что сохранять; на телефоне 44px.
defineProps<{
  title: string
  saveText?: string
  canSave?: boolean
  saving?: boolean
}>()
const emit = defineEmits<{ save: [] }>()
const titleId = `profile-card-${useId()}`
</script>

<template>
  <form
    class="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-surface p-5 max-sm:p-4"
    :aria-labelledby="titleId"
    novalidate
    @submit.prevent="emit('save')"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 :id="titleId" class="m-0 min-w-0 flex-1 text-base font-semibold text-ink">{{ title }}</h2>
      <slot name="action">
        <ZButton
          v-if="saveText"
          html-type="submit"
          :loading="saving"
          :disabled="!canSave"
          class="max-sm:h-11 max-sm:px-4"
          data-card-save
        >{{ saveText }}</ZButton>
      </slot>
    </div>
    <slot />
  </form>
</template>
