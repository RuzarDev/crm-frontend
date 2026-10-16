<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { P } from './eec'

// Окно действия «Обновлений ЕЭК» с комментарием и (если нужно) датой: подтвердить / отклонить редакцию,
// указать дату вступления решения, закрыть код дерева. Сохраняет переданная функция save; окно закрывается
// после успеха, ошибку сервера показывает общий перехватчик — окно остаётся открытым с введёнными значениями.
export interface EecActionValue { date: string | null; note: string }

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** Пояснение над полями. */
  text?: string
  okText: string
  danger?: boolean
  /** Поле даты: подпись; не задано — поля нет. */
  dateLabel?: string
  dateRequired?: boolean
  dateMin?: string | null
  /** Верхняя граница даты, 'YYYY-MM-DD' (сервер будущую дату не проверяет). */
  dateMax?: string | null
  dateHelp?: string
  initialDate?: string | null
  noteLabel: string
  save: (v: EecActionValue) => Promise<void>
}>(), { text: undefined, danger: false, dateLabel: undefined, dateRequired: false, dateMin: null, dateMax: null, dateHelp: undefined, initialDate: null })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const date = ref<string | null>(null)
const note = ref('')
const touched = ref(false)
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  date.value = props.initialDate ?? null
  note.value = ''
  touched.value = false
}, { immediate: true })

const dateError = computed(() => {
  if (!props.dateLabel || !touched.value) return undefined
  if (props.dateRequired && !date.value) return t(`${P}.modal.dateRequired`)
  if (date.value && props.dateMin && date.value < props.dateMin) return t(`${P}.modal.dateTooEarly`)
  if (date.value && props.dateMax && date.value > props.dateMax) return t(`${P}.modal.dateTooLate`)
  return undefined
})

const submit = async () => {
  if (saving.value) return
  touched.value = true
  if (dateError.value) return
  saving.value = true
  try {
    await props.save({ date: props.dateLabel ? date.value : null, note: note.value.trim() })
    emit('update:open', false)
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="480"
    :ok-text="okText"
    :cancel-text="t(`${P}.modal.cancel`)"
    :confirm-loading="saving"
    :ok-button-props="{ danger }"
    data-eec-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <p v-if="text" class="m-0 text-sm text-ink-2 text-pretty" data-eec-modal-text>{{ text }}</p>
      <ZField v-if="dateLabel" :label="dateLabel" :error="dateError" :help="dateError ? undefined : dateHelp" :required="dateRequired">
        <ZDate v-model:value="date" :min="dateMin" :max="dateMax" class="max-sm:h-11" data-eec-modal-date />
      </ZField>
      <ZField :label="noteLabel">
        <ZTextarea v-model:value="note" :rows="3" :maxlength="1000" data-eec-modal-note />
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
