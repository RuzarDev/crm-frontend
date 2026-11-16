<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { Party, TdBody } from '@/api/autoTransit'
import type { ActionResult } from './useTruck'

// Номер ТД партии (до 50 знаков) и дата (по умолчанию — сегодня). Пустой номер очищает (кроме выпущенной машины — сервер).
const MAX = 50
const props = defineProps<{ open: boolean; party: Party | null; save: (body: TdBody) => Promise<ActionResult> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const M = 'broker.autoTransit.party.tdModal'

const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const number = ref('')
const date = ref<string | null>(null)
const errors = ref<Record<string, string>>({})
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  number.value = props.party?.tdNumber ?? ''
  date.value = props.party?.tdDate ?? todayYmd()
  errors.value = {}
})

const onOk = async () => {
  const n = number.value.trim()
  if (n.length > MAX) { errors.value = { tdNumber: t(`${M}.tooLong`, { max: MAX }) }; return }
  saving.value = true
  try {
    const res = await props.save({ tdNumber: n, tdDate: n ? date.value : null })
    if (res.ok) emit('update:open', false)
    else errors.value = res.fieldErrors
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
    data-td-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ZField :label="t(`${M}.number`)" :error="errors.tdNumber" :extra="t(`${M}.clearHint`)">
        <ZInput v-model:value="number" mono :maxlength="MAX" data-td-number />
      </ZField>
      <ZField :label="t(`${M}.date`)" :error="errors.tdDate">
        <ZDate v-model:value="date" :max="todayYmd()" data-td-date />
      </ZField>
    </div>
  </ZModal>
</template>
