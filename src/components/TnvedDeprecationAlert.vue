<template>
  <a-alert
    v-if="warning"
    type="warning"
    show-icon
    class="tnved-deprecation-alert"
  >
    <template #message>
      Код ТН ВЭД <strong>{{ warning.deprecatedCode }}</strong> устарел с
      <template v-if="warning.sourceVersion">{{ warning.sourceVersion }}</template>.
      <template v-if="warning.replacementCodes.length">
        Актуальные коды:
        <a-space :size="4" wrap style="display:inline-flex">
          <a-tag
            v-for="code in warning.replacementCodes"
            :key="code"
            color="orange"
            style="cursor:default; font-family:monospace"
          >{{ code }}</a-tag>
        </a-space>
      </template>
    </template>
  </a-alert>
</template>

<script setup lang="ts">
import type { TnvedDeprecationWarningDto } from '@/types/api'

defineProps<{
  warning: TnvedDeprecationWarningDto | null | undefined
}>()
</script>

<style scoped>
.tnved-deprecation-alert {
  margin-bottom: 12px;
}
</style>
