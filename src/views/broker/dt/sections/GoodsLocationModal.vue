<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import { referencesApi } from '@/api/references'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'

// «Добавить в справочник» места нахождения товаров (гр. 30): код и название (русское) — в общий справочник
// goods-locations. Заменяет window.prompt прежнего раздела (C2). Сохранение — POST на сервер (право проверяет он:
// при отказе окно остаётся открытым, ошибку показывает общий перехватчик); успех — справочник перечитывается,
// наружу уходит saved(code), окно закрывается.
const props = defineProps<{
  open: boolean
  /** Код при открытии — введённый в графе (если его ещё нет в справочнике). */
  initialCode?: string
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [code: string] }>()
const { t } = useI18n()
const classifiers = useClassifiersStore()

const code = ref('')
const name = ref('')
const saving = ref(false)
const touched = ref(false)

watch(() => props.open, (on) => {
  if (!on) return
  code.value = (props.initialCode ?? '').trim()
  name.value = ''
  touched.value = false
}, { immediate: true })

const cleanCode = computed(() => code.value.trim())
const cleanName = computed(() => name.value.trim())
const exists = computed(() => !!cleanCode.value && classifiers.options('goods-locations').some((o) => o.value === cleanCode.value))
const codeError = computed(() => {
  if (exists.value) return t('broker.dt.customs.locationExists', { code: cleanCode.value })
  return touched.value && !cleanCode.value ? t('broker.dt.customs.locationCodeRequired') : ''
})
const nameError = computed(() => (touched.value && !cleanName.value ? t('broker.dt.customs.locationNameRequired') : ''))

const submit = async () => {
  touched.value = true
  if (!cleanCode.value || !cleanName.value || exists.value || saving.value) return
  saving.value = true
  try {
    await referencesApi.addGoodsLocation(cleanCode.value, cleanName.value)
    classifiers.invalidate('goods-locations')
    await classifiers.load('goods-locations')
    message.success(t('broker.dt.customs.locationAdded'))
    emit('saved', cleanCode.value)
    emit('update:open', false)
  } catch {
    message.error(t('broker.dt.customs.locationAddFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.dt.customs.modalTitle')"
    :width="440"
    :ok-text="t('broker.dt.customs.locationSave')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4" data-goods-location-modal @keydown.enter.prevent="submit">
      <p class="m-0 text-sm text-ink-2">{{ t('broker.dt.customs.locationHint') }}</p>
      <ZField :label="t('broker.dt.customs.locationCode')" required :error="codeError">
        <ZInput :value="code" mono autofocus data-location-code @update:value="code = $event" />
      </ZField>
      <ZField :label="t('broker.dt.customs.locationName')" required :error="nameError">
        <ZInput :value="name" data-location-name @update:value="name = $event" />
      </ZField>
    </div>
  </ZModal>
</template>
