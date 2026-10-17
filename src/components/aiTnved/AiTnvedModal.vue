<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZModal from '@/components/z/ZModal.vue'
import type { AiTnvedSource } from '@/api/aiTnved'
import AiTnvedPanel from './AiTnvedPanel.vue'

// Окно «Подобрать с ИИ»: панель подбора; «Выбрать» закрывает окно и отдаёт код.
defineProps<{ open: boolean; description?: string; source: AiTnvedSource; caseId?: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [payload: { code: string; name: string }] }>()
const { t } = useI18n()
const onSelect = (p: { code: string; name: string }) => {
  emit('select', p)
  emit('update:open', false)
}
</script>

<template>
  <ZModal :open="open" :title="t('aiTnved.title')" :width="760" :footer="null" destroy-on-close data-ai-modal @update:open="emit('update:open', $event)">
    <AiTnvedPanel :initial-description="description ?? ''" :source="source" :case-id="caseId" @select="onSelect" />
  </ZModal>
</template>
