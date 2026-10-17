<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileText, PhX } from '@phosphor-icons/vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { REGISTRY_CATEGORIES, type RegistryCategory, type RegistryFields } from '@/api/clientRegistry'
import { DOC_ACCEPT, DOC_MAX_MB } from '@/views/client/wizard/useShipmentFiles'
import { emptyFields, fieldErrors } from './registry'

// Окно документа реестра: новый (поля + файлы), правка (только поля) или «Сохранить в реестр клиента»
// из файла заявки (поля, файл — уже есть). Сохраняет переданная функция save; окно закрывается после успеха,
// ошибку сервера показывает общий перехватчик — окно остаётся открытым с введёнными значениями.
const props = withDefaults(defineProps<{
  open: boolean
  mode: 'create' | 'edit' | 'fromFile'
  initial?: RegistryFields | null
  /** Имя файла заявки (режим fromFile). */
  fileName?: string
  save: (fields: RegistryFields, files: File[]) => Promise<void>
}>(), { initial: null, fileName: '' })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const fields = ref<RegistryFields>(emptyFields())
const files = ref<File[]>([])
const touched = ref(false)
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  fields.value = { ...(props.initial ?? emptyFields()) }
  files.value = []
  touched.value = false
}, { immediate: true })

const categoryOptions = computed(() => REGISTRY_CATEGORIES.map((c) => ({ value: c, label: t(`clientRegistry.category.${c}`) })))
const errors = computed(() => (touched.value ? fieldErrors(fields.value) : {}))
const filesError = computed(() => (touched.value && props.mode === 'create' && !files.value.length ? t('clientRegistry.form.fileRequired') : undefined))
const title = computed(() => t(`clientRegistry.form.${props.mode === 'edit' ? 'editTitle' : props.mode === 'fromFile' ? 'fromFileTitle' : 'createTitle'}`))

const onFiles = (picked: File[]) => {
  const names = new Set(files.value.map((f) => f.name))
  files.value = [...files.value, ...picked.filter((f) => !names.has(f.name))]
}
const removeFile = (f: File) => { files.value = files.value.filter((x) => x !== f) }

const submit = async () => {
  if (saving.value) return
  touched.value = true
  if (Object.keys(fieldErrors(fields.value)).length || filesError.value) return
  saving.value = true
  try {
    await props.save({ ...fields.value }, files.value)
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
    :width="560"
    :ok-text="t('clientRegistry.form.save')"
    :cancel-text="t('clientRegistry.form.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    data-registry-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <p v-if="mode === 'fromFile'" class="m-0 flex items-center gap-1.5 text-sm text-ink-2" data-registry-source-file>
        <PhFileText :size="16" class="shrink-0 text-muted" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ fileName }}</span>
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ZField :label="t('clientRegistry.form.category')" required class="sm:col-span-2">
          <ZSelect
            :value="fields.category"
            :options="categoryOptions"
            class="max-sm:h-11"
            data-registry-category
            @update:value="fields.category = $event as RegistryCategory"
          />
        </ZField>
        <ZField :label="t('clientRegistry.form.number')" :required="fields.category !== 'other'" :error="errors.number ? t(errors.number) : undefined">
          <ZInput v-model:value="fields.number" mono :maxlength="100" class="max-sm:h-11" data-registry-number />
        </ZField>
        <ZField :label="t('clientRegistry.form.title')" :error="errors.title ? t(errors.title) : undefined">
          <ZInput v-model:value="fields.title" :maxlength="300" :placeholder="t('clientRegistry.form.titlePlaceholder')" class="max-sm:h-11" data-registry-title />
        </ZField>
        <ZField :label="t('clientRegistry.form.issuedOn')">
          <ZDate v-model:value="fields.issuedOn" class="max-sm:h-11" data-registry-issued />
        </ZField>
        <ZField
          :label="t('clientRegistry.form.validUntil')"
          :error="errors.validUntil ? t(errors.validUntil) : undefined"
          :help="errors.validUntil ? undefined : t('clientRegistry.form.validUntilHelp')"
        >
          <ZDate v-model:value="fields.validUntil" :min="fields.issuedOn" class="max-sm:h-11" data-registry-until />
        </ZField>
        <ZField :label="t('clientRegistry.form.counterparty')" class="sm:col-span-2">
          <ZInput v-model:value="fields.counterparty" :maxlength="300" :placeholder="t('clientRegistry.form.counterpartyPlaceholder')" class="max-sm:h-11" data-registry-counterparty />
        </ZField>
        <ZField :label="t('clientRegistry.form.tnved')" :help="t('clientRegistry.form.tnvedHelp')" class="sm:col-span-2">
          <ZInput v-model:value="fields.tnvedCodes" mono :maxlength="1000" class="max-sm:h-11" data-registry-tnved />
        </ZField>
        <ZField :label="t('clientRegistry.form.note')" class="sm:col-span-2">
          <ZTextarea v-model:value="fields.note" :rows="2" :maxlength="2000" data-registry-note />
        </ZField>
      </div>

      <ZField v-if="mode === 'create'" :label="t('clientRegistry.form.files')" required :error="filesError">
        <div class="flex w-full flex-col gap-2">
          <ZUpload type="drag" multiple :accept="DOC_ACCEPT.join(',')" :max-size-mb="DOC_MAX_MB" data-registry-drop @select="onFiles">
            <span class="flex flex-col gap-1">
              <span class="text-[14.5px] font-semibold text-ink">{{ t('clientRegistry.form.drop') }}</span>
              <span class="text-[13px] text-muted">{{ t('clientRegistry.form.formats', { mb: DOC_MAX_MB }) }}</span>
            </span>
          </ZUpload>
          <ul v-if="files.length" role="list" class="m-0 flex list-none flex-col gap-0.5 p-0" data-registry-files>
            <li v-for="f in files" :key="f.name" class="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-2" data-registry-file>
              <PhFileText :size="15" class="shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 truncate" :title="f.name">{{ f.name }}</span>
              <button
                type="button"
                class="ml-auto inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-field border-0 bg-transparent px-1.5 text-ink-3 outline-hidden hover:text-danger focus-visible:shadow-focus sm:min-h-7"
                :aria-label="t('clientRegistry.form.removeFile', { name: f.name })"
                data-registry-file-remove
                @click="removeFile(f)"
              ><PhX :size="14" aria-hidden="true" /></button>
            </li>
          </ul>
        </div>
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
