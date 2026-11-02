<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import { extractServerText } from '@/api/client'
import { import40ContractApi, reissueDates, type Import40DocumentDto } from '@/api/import40Contract'
import { message } from '@/ui/message'
import { endOfDayUtc } from '@/views/client/company/company'

// «Перевыпустить» доверенность (02.11.2026, пакет I; владелец: «он тоже до конца года всегда должен, либо до выбранной
// даты»): новая доверенность с текущими представителями, срок — до 31.12 (в декабре — следующего года) или выбранная дата
// (с завтрашнего дня, не дальше 3 лет). Дата по умолчанию уходит на сервер как null — срок считает сервер (по Астане).
// Ошибка сервера — его текстом в окне, окно остаётся открытым.
const props = defineProps<{
  open: boolean
  clientId: string
  doc: { id: string; number: string; year: number } | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; reissued: [doc: Import40DocumentDto] }>()

const { t } = useI18n()
const dates = ref(reissueDates())
const until = ref<string | null>(dates.value.def)
const sending = ref(false)
const error = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  dates.value = reissueDates()
  until.value = dates.value.def
  error.value = ''
}, { immediate: true })

const ymdText = (v: string) => v.split('-').reverse().join('.')
const no = computed(() => (props.doc ? `${props.doc.number}/${props.doc.year}` : ''))

const submit = async () => {
  if (sending.value || !props.doc || !until.value) return
  sending.value = true
  error.value = ''
  try {
    const issued = await import40ContractApi.reissueDocument(props.clientId, props.doc.id, {
      validUntilUtc: until.value === dates.value.def ? null : endOfDayUtc(until.value),
    }, { silent: true })
    message.success(t('broker.company.reissue.done', { no: `${issued.number}/${issued.year}` }))
    emit('reissued', issued)
    emit('update:open', false)
  } catch (e) {
    error.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('broker.company.reissue.error')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.company.reissue.title', { no })"
    :width="520"
    :ok-text="t('broker.company.reissue.action')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="sending"
    :ok-button-props="{ disabled: !until }"
    data-poa-reissue-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2">
      <p class="m-0 text-sm text-ink-2" data-reissue-text>{{ t('broker.company.reissue.text', { no }) }}</p>
      <ZField :label="t('broker.company.reissue.until')" :help="t('broker.company.reissue.untilHint', { date: ymdText(dates.def), max: ymdText(dates.max) })" required>
        <ZDate
          v-model:value="until"
          :min="dates.min"
          :max="dates.max"
          class="w-[200px] max-sm:h-11 max-sm:w-full"
          data-reissue-until
        />
      </ZField>
      <ZAlert v-if="error" type="error" show-icon :message="error" data-reissue-error />
    </div>
  </ZModal>
</template>
