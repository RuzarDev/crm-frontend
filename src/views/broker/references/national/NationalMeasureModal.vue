<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { fieldErrors, type NationalMeasureRequest } from '@/api/nationalLists'
import { serverErrorText } from '@/utils/serverError'
import { emptyRequest, P, validateRequest } from './national'

// Окно «Добавить меру» / «Изменить меру»: вид (запрет / ограничение), направление, коды как в акте («1001», «0407 21»,
// «из 0407», «a–b», «(кроме …)» — сервер их разбирает), товар, что действует, исключения, оговорки, акт и срок
// (пустое окончание — до отмены). Ошибки сервера — под полями; окно закрывается после успеха.
const props = defineProps<{
  open: boolean
  /** Правка — значения подставляются; null — новая мера. */
  initial: NationalMeasureRequest | null
  save: (value: NationalMeasureRequest) => Promise<void>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`${P}.form.${key}`, p ?? {})

const form = reactive<NationalMeasureRequest>(emptyRequest())
const touched = ref(false)
const server = ref<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, props.initial ?? emptyRequest())
  touched.value = false
  server.value = {}
  serverError.value = ''
}, { immediate: true })

const local = computed(() => (touched.value ? validateRequest(form) : {}))
const err = (field: string): string | undefined => {
  if (server.value[field]) return server.value[field]
  const k = local.value[field]
  return k ? tm(`error.${k}`) : undefined
}

const kindOptions = computed(() => [{ value: 'ban', label: tm('kindBan') }, { value: 'restriction', label: tm('kindRestriction') }])
const directionOptions = computed(() => [{ value: 'IN', label: tm('directionIn') }, { value: 'OUT', label: tm('directionOut') }])

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)
const submit = async () => {
  if (saving.value) return
  touched.value = true
  if (Object.keys(validateRequest(form)).length) return
  saving.value = true
  server.value = {}
  serverError.value = ''
  try {
    await props.save({
      ...form,
      codeText: form.codeText.trim(), goods: form.goods.trim(), name: form.name.trim(),
      exceptions: clean(form.exceptions), note: clean(form.note), actName: form.actName.trim(), actNumber: form.actNumber.trim(),
      actUrl: clean(form.actUrl),
    })
    emit('update:open', false)
  } catch (e) {
    // 400 приходит без тоста (silentStatuses): ошибки — под полями или строкой в окне; прочие показал перехватчик.
    server.value = fieldErrors(e)
    const status = (e as { response?: { status?: number } })?.response?.status
    serverError.value = status === 400 && !Object.keys(server.value).length ? serverErrorText(e, tm('saveError')) : ''
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="initial ? tm('editTitle') : tm('addTitle')"
    :width="640"
    :ok-text="initial ? tm('save') : tm('add')"
    :cancel-text="tm('cancel')"
    :confirm-loading="saving"
    data-national-measure-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ZField :label="tm('kind')">
          <ZSegmented :value="form.kind" :options="kindOptions" data-nm-kind @update:value="form.kind = $event as 'ban' | 'restriction'" />
        </ZField>
        <ZField :label="tm('direction')">
          <ZSegmented :value="form.direction" :options="directionOptions" data-nm-direction @update:value="form.direction = $event as 'IN' | 'OUT'" />
        </ZField>
      </div>
      <ZField :label="tm('codeText')" :help="tm('codeTextHelp')" :error="err('codeText')" required>
        <ZInput v-model:value="form.codeText" mono autocomplete="off" :placeholder="tm('codeTextPh')" class="max-sm:h-11" data-nm-codes />
      </ZField>
      <ZField :label="tm('goods')" :error="err('goods')" required>
        <ZInput v-model:value="form.goods" :maxlength="500" :placeholder="tm('goodsPh')" class="max-sm:h-11" data-nm-goods />
      </ZField>
      <ZField :label="tm('name')" :error="err('name')" required>
        <ZInput v-model:value="form.name" :maxlength="500" :placeholder="tm('namePh')" class="max-sm:h-11" data-nm-name />
      </ZField>
      <ZField :label="tm('exceptions')" :error="err('exceptions')">
        <ZTextarea v-model:value="form.exceptions" :rows="2" auto-grow :maxlength="2000" :placeholder="tm('exceptionsPh')" data-nm-exceptions />
      </ZField>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ZField :label="tm('actName')" :error="err('actName')" required>
          <ZInput v-model:value="form.actName" :maxlength="300" :placeholder="tm('actNamePh')" class="max-sm:h-11" data-nm-act-name />
        </ZField>
        <ZField :label="tm('actNumber')" :error="err('actNumber')" required>
          <ZInput v-model:value="form.actNumber" :maxlength="50" class="max-sm:h-11" data-nm-act-number />
        </ZField>
        <ZField :label="tm('actDate')" :error="err('actDate')">
          <ZDate :value="form.actDate" allow-clear class="max-sm:h-11" data-nm-act-date @update:value="form.actDate = $event" />
        </ZField>
      </div>
      <ZField :label="tm('actUrl')" :error="err('actUrl')">
        <ZInput v-model:value="form.actUrl" :maxlength="500" placeholder="https://adilet.zan.kz/rus/docs/…" class="max-sm:h-11" data-nm-act-url />
      </ZField>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ZField :label="tm('validFrom')" :error="err('validFrom')" required>
          <ZDate :value="form.validFrom" class="max-sm:h-11" data-nm-from @update:value="form.validFrom = $event" />
        </ZField>
        <ZField :label="tm('validTo')" :help="tm('validToHelp')" :error="err('validTo')">
          <ZDate :value="form.validTo" :min="form.validFrom" allow-clear class="max-sm:h-11" data-nm-to @update:value="form.validTo = $event" />
        </ZField>
      </div>
      <ZField :label="tm('note')" :help="tm('noteHelp')" :error="err('note')">
        <ZTextarea v-model:value="form.note" :rows="2" auto-grow :maxlength="2000" data-nm-note />
      </ZField>
      <p v-if="serverError" role="alert" class="m-0 text-sm text-tone-danger-fg" data-nm-error>{{ serverError }}</p>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
