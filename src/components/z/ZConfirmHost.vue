<script setup lang="ts">
import { confirmState } from '@/ui/confirm'
import ZModal from './ZModal.vue'

// Одно окно подтверждения на приложение (App.vue) — показывает useConfirm().confirm(...), замена Modal.confirm.
// Отмена, Escape, крестик, клик по фону — false; «ОК» — true. Текст — описание окна (aria-describedby).
</script>

<template>
  <ZModal
    :open="confirmState.open"
    :width="420"
    :title="confirmState.title"
    :ok-text="confirmState.okText"
    :cancel-text="confirmState.cancelText"
    :ok-button-props="{ danger: confirmState.danger }"
    @ok="confirmState.resolve(true)"
    @cancel="confirmState.resolve(false)"
  >
    <template v-if="confirmState.content" #description>{{ confirmState.content }}</template>
  </ZModal>
</template>
