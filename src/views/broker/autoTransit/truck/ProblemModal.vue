<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { ActionResult } from './useTruck'

// «Проблема»: комментарий обязателен, до 1000 знаков (машину развернули, отказ…).
const MAX = 1000
const props = defineProps<{ open: boolean; save: (note: string) => Promise<ActionResult> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const M = 'broker.autoTransit.truck.problemModal'

const note = ref('')
const error = ref('')
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  note.value = ''
  error.value = ''
})
watch(note, () => { error.value = '' })
const tooLong = computed(() => note.value.trim().length > MAX)

const onOk = async () => {
  const text = note.value.trim()
  if (!text) { error.value = t(`${M}.required`); return }
  if (tooLong.value) { error.value = t(`${M}.tooLong`, { max: MAX }); return }
  saving.value = true
  try {
    const res = await props.save(text)
    if (res.ok) emit('update:open', false)
    else if (res.fieldErrors.note) error.value = res.fieldErrors.note
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
    :ok-button-props="{ danger: true }"
    data-problem-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <ZField :label="t(`${M}.note`)" required :error="error || undefined" :extra="t(`${M}.hint`)">
      <ZTextarea v-model:value="note" :rows="4" :maxlength="MAX" auto-grow data-problem-note />
    </ZField>
  </ZModal>
</template>
