<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { TruckFile } from '@/api/autoTransit'
import type { ActionResult } from './useTruck'

// «Вернуть с причиной» (очередь 3, спека 5.3): файл, присланный по ссылке, помечается возвращённым (не удаляется),
// причина (обязательна, до 300 знаков) видна загружающему на странице ссылки. Повторный возврат меняет причину.
const MAX = 300
const props = defineProps<{
  open: boolean
  file: TruckFile | null
  save: (reason: string) => Promise<ActionResult>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const M = 'broker.autoTransit.file.returnModal'

const reason = ref('')
const error = ref('')
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  reason.value = props.file?.returnReason ?? ''
  error.value = ''
})
watch(reason, () => { error.value = '' })

const onOk = async () => {
  const text = reason.value.trim()
  if (!text) { error.value = t(`${M}.required`); return }
  if (text.length > MAX) { error.value = t(`${M}.tooLong`, { max: MAX }); return }
  saving.value = true
  try {
    const res = await props.save(text)
    if (res.ok) emit('update:open', false)
    else if (res.fieldErrors.reason) error.value = res.fieldErrors.reason
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t(`${M}.title`)"
    :ok-text="t(`${M}.ok`)"
    :confirm-loading="saving"
    data-return-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <p v-if="file" class="m-0 mb-3 text-sm [overflow-wrap:anywhere] text-ink-2">{{ t(`${M}.file`, { name: file.fileName }) }}</p>
    <ZField :label="t(`${M}.reason`)" required :error="error || undefined" :extra="t(`${M}.hint`)">
      <ZTextarea v-model:value="reason" :rows="3" :maxlength="MAX" auto-grow data-return-reason />
    </ZField>
  </ZModal>
</template>
