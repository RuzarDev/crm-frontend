<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { DocumentPackageContainerDto } from '@/types/api'
import type { ContainerInput } from './useWorkspace'
import { formatContainerNumber } from './workspace'

// Окно контейнера: «Номер контейнера»* и «Второй номер» (прицеп, китайский или внутренний). container = null — новый.
// Окно только собирает значения (submit), запрос шлёт страница и закрывает окно после успеха; при отказе
// сервера окно остаётся открытым (текст ошибки — тост перехватчика). Лимиты — колонки сервера (100 знаков).
const props = defineProps<{ open: boolean; container: DocumentPackageContainerDto | null; saving: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [data: ContainerInput] }>()
const { t } = useI18n()

const MAX = 100
const number = ref('')
const secondary = ref('')
const touched = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  number.value = props.container?.containerNumber ?? ''
  secondary.value = props.container?.secondaryContainerNumber ?? ''
  touched.value = false
}, { immediate: true })

const numberError = computed(() => {
  if (!touched.value) return ''
  if (!number.value.trim()) return t('broker.packageWorkspace.containerModal.required')
  if (number.value.trim().length > MAX) return t('broker.packageWorkspace.containerModal.tooLong', { n: MAX })
  return ''
})
const secondaryError = computed(() => (secondary.value.trim().length > MAX ? t('broker.packageWorkspace.containerModal.tooLong', { n: MAX }) : ''))

const title = computed(() => (props.container
  ? t('broker.packageWorkspace.containerModal.editTitle', { number: formatContainerNumber(props.container.containerNumber) })
  : t('broker.packageWorkspace.containerModal.addTitle')))

const submit = () => {
  touched.value = true
  if (props.saving || numberError.value || secondaryError.value) return
  emit('submit', { containerNumber: number.value.trim(), secondaryContainerNumber: secondary.value.trim() || null })
}
</script>

<template>
  <ZModal
    :open="open"
    :title="title"
    :width="440"
    :ok-text="container ? t('broker.packageWorkspace.containerModal.save') : t('broker.packageWorkspace.containerModal.add')"
    :cancel-text="t('broker.packageWorkspace.containerModal.cancel')"
    :confirm-loading="saving"
    data-ws-container-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2">
      <ZField :label="t('broker.packageWorkspace.containerModal.number')" required :error="numberError">
        <ZInput
          :value="number"
          mono
          :placeholder="t('broker.packageWorkspace.containerModal.numberPh')"
          autocomplete="off"
          class="max-sm:h-11"
          data-ws-modal-number
          @update:value="number = $event"
          @blur="touched = true"
          @press-enter="submit"
        />
      </ZField>
      <ZField
        :label="t('broker.packageWorkspace.containerModal.secondary')"
        :help="secondaryError ? undefined : t('broker.packageWorkspace.containerModal.secondaryHelp')"
        :error="secondaryError"
      >
        <ZInput
          :value="secondary"
          mono
          autocomplete="off"
          class="max-sm:h-11"
          data-ws-modal-secondary
          @update:value="secondary = $event"
          @press-enter="submit"
        />
      </ZField>
    </div>
  </ZModal>
</template>
