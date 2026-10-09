<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCopy } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import { message } from '@/ui/message'

// Окно с временным паролем: показывается один раз и нигде не хранится — родитель очищает его при закрытии.
defineProps<{ open: boolean; username: string; password: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('broker.settings.team.drawer.tempCopied'))
  } catch { /* нет доступа к буферу — пароль виден на экране */ }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.settings.team.drawer.tempTitle')"
    :width="460"
    :footer="null"
    mask-closable
    data-temp-password-dialog
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3 pb-1">
      <p class="m-0 text-sm text-ink-2">{{ t('broker.settings.team.drawer.tempFor', { name: username }) }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 flex-1 rounded-field bg-sunken px-3 py-2 font-mono text-md font-semibold tracking-wide text-ink [overflow-wrap:anywhere] select-all" data-temp-password>{{ password }}</code>
        <ZButton class="max-sm:h-11" data-temp-copy @click="copy(password)">
          <template #icon><PhCopy :size="16" aria-hidden="true" /></template>
          {{ t('broker.settings.team.drawer.tempCopy') }}
        </ZButton>
      </div>
      <p class="m-0 text-xs text-muted">{{ t('broker.settings.team.drawer.tempNote') }}</p>
      <div class="flex justify-end">
        <ZButton variant="primary" class="max-sm:h-11" data-temp-close @click="emit('update:open', false)">{{ t('broker.settings.team.drawer.tempDone') }}</ZButton>
      </div>
    </div>
  </ZModal>
</template>
