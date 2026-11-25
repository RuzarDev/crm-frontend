<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { Party } from '@/api/autoTransit'
import type { ActionResult } from './useTruck'

// «ПИ подана» (очередь 3, спека 2026-11-25, 4.1): номер предварительной информации из КЕДЕН обязателен, до 64 знаков.
const MAX = 64
const props = defineProps<{ open: boolean; party: Party | null; save: (piNumber: string) => Promise<ActionResult> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const M = 'broker.autoTransit.party.piModal'

const number = ref('')
const error = ref('')
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  number.value = props.party?.piNumber ?? ''
  error.value = ''
})

const onOk = async () => {
  const n = number.value.trim()
  if (!n) { error.value = t(`${M}.required`); return }
  if (n.length > MAX) { error.value = t(`${M}.tooLong`, { max: MAX }); return }
  saving.value = true
  try {
    const res = await props.save(n)
    if (res.ok) emit('update:open', false)
    else error.value = res.fieldErrors.piNumber ?? ''
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="party ? t(`${M}.title`, { n: party.number }) : ''"
    :ok-text="t('broker.autoTransit.truck.save')"
    :confirm-loading="saving"
    :width="440"
    data-pi-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <ZField :label="t(`${M}.number`)" required :error="error || undefined" :extra="t(`${M}.hint`)">
      <ZInput v-model:value="number" mono :maxlength="MAX" data-pi-number />
    </ZField>
  </ZModal>
</template>
