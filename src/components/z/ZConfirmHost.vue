<script setup lang="ts">
import { confirmState } from '@/ui/confirm'
import ZModal from './ZModal.vue'

// Одно окно подтверждения на приложение (App.vue) — показывает useConfirm().confirm(...), замена Modal.confirm.
// Отмена, Escape, крестик, клик по фону — false; «ОК» — true. Текст — описание окна (aria-describedby).
// Слой confirm: подтверждение, спрошенное из открытого окна или шторки, показывается поверх них (раньше — под ними:
// у всех окон один z-index, и выше оказывалось то, чей портал позже в DOM).
</script>

<template>
  <ZModal
    :open="confirmState.open"
    :width="420"
    destroy-on-close
    layer="confirm"
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
