<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import { responseStatus } from './systemData'

// Окно «Добавить» / «Изменить» записи справочника: у станций и постов — название, у классификатора — код и название.
// Сохраняет переданная функция save; окно закрывается после успеха. 409 (такой код уже есть) — ошибка под полем «Код»,
// прочие ошибки показывает общий перехватчик, окно остаётся открытым с введёнными значениями.
export interface RefItemValue { code: string; name: string }

const props = defineProps<{
  open: boolean
  /** Есть ли поле «Код» (классификатор). */
  withCode: boolean
  /** Правка существующей записи — значения подставляются; null — новая. */
  initial: RefItemValue | null
  save: (value: RefItemValue) => Promise<void>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const code = ref('')
const name = ref('')
const touched = ref(false)
const duplicate = ref(false)
const saving = ref(false)

watch(() => props.open, (v) => {
  if (!v) return
  code.value = props.initial?.code ?? ''
  name.value = props.initial?.name ?? ''
  touched.value = false
  duplicate.value = false
}, { immediate: true })
watch(code, () => { duplicate.value = false })

const title = computed(() => {
  const edit = !!props.initial
  if (props.withCode) return t(edit ? 'broker.references.system.modal.editCodeTitle' : 'broker.references.system.modal.addCodeTitle')
  return t(edit ? 'broker.references.system.modal.editTitle' : 'broker.references.system.modal.addTitle')
})
const codeError = computed(() => {
  if (!props.withCode) return undefined
  if (touched.value && !code.value.trim()) return t('broker.references.system.modal.required')
  return duplicate.value ? t('broker.references.system.modal.duplicate') : undefined
})
const nameError = computed(() => (touched.value && !name.value.trim() ? t('broker.references.system.modal.required') : undefined))

const submit = async () => {
  if (saving.value) return
  touched.value = true
  if ((props.withCode && !code.value.trim()) || !name.value.trim()) return
  saving.value = true
  try {
    await props.save({ code: code.value.trim(), name: name.value.trim() })
    emit('update:open', false)
  } catch (e) {
    if (responseStatus(e) === 409) duplicate.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="460"
    :ok-text="initial ? t('broker.references.system.modal.save') : t('broker.references.system.modal.add')"
    :cancel-text="t('broker.references.system.modal.cancel')"
    :confirm-loading="saving"
    data-ref-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <ZField v-if="withCode" :label="t('broker.references.system.modal.code')" :error="codeError" required>
        <ZInput v-model:value="code" mono autocomplete="off" class="max-sm:h-11" data-ref-modal-code />
      </ZField>
      <ZField :label="withCode ? t('broker.references.system.modal.nameRu') : t('broker.references.system.modal.name')" :error="nameError" required>
        <ZInput v-model:value="name" autocomplete="off" class="max-sm:h-11" data-ref-modal-name />
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
