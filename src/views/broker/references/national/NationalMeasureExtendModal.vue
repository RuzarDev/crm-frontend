<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import { fieldErrors, type NationalMeasure, type NationalMeasureExtendRequest } from '@/api/nationalLists'
import { serverErrorText } from '@/utils/serverError'
import { d, P } from './national'

// Окно «Продлить меру»: новый последний день (позже прежнего) и акт продления — продление остаётся в истории меры.
const props = defineProps<{ open: boolean; measure: NationalMeasure | null; save: (value: NationalMeasureExtendRequest) => Promise<void> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`${P}.extend.${key}`, p ?? {})

const form = reactive<NationalMeasureExtendRequest>({ validTo: null, actName: '', actNumber: '', actDate: null, actUrl: null })
const touched = ref(false)
const server = ref<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, { validTo: null, actName: props.measure?.actName ?? '', actNumber: '', actDate: null, actUrl: null })
  touched.value = false
  server.value = {}
  serverError.value = ''
}, { immediate: true })

const minDate = computed(() => {
  const to = props.measure?.validTo
  if (!to) return null
  const dt = new Date(`${to}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
})
const local = computed<Record<string, string>>(() => {
  if (!touched.value) return {}
  const e: Record<string, string> = {}
  if (!form.validTo) e.validTo = tm('error.required')
  else if (props.measure?.validTo && form.validTo <= props.measure.validTo) e.validTo = tm('error.notLater')
  if (!form.actName.trim()) e.actName = tm('error.required')
  if (!form.actNumber.trim()) e.actNumber = tm('error.required')
  if (form.actUrl?.trim() && !/^https?:\/\//i.test(form.actUrl.trim())) e.actUrl = tm('error.url')
  return e
})
const err = (f: string) => server.value[f] ?? local.value[f]

const submit = async () => {
  if (saving.value) return
  touched.value = true
  if (Object.keys(local.value).length) return
  saving.value = true
  server.value = {}
  serverError.value = ''
  try {
    await props.save({ ...form, actName: form.actName.trim(), actNumber: form.actNumber.trim(), actUrl: form.actUrl?.trim() || null })
    emit('update:open', false)
  } catch (e) {
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
    :title="tm('title')"
    :width="520"
    :ok-text="tm('ok')"
    :cancel-text="tm('cancel')"
    :confirm-loading="saving"
    data-national-extend-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <p v-if="measure" class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]" data-extend-current>
        {{ tm('current', { goods: measure.goods, to: d(measure.validTo) }) }}
      </p>
      <ZField :label="tm('validTo')" :error="err('validTo')" required>
        <ZDate :value="form.validTo" :min="minDate" class="max-sm:h-11" data-extend-to @update:value="form.validTo = $event" />
      </ZField>
      <ZField :label="tm('actName')" :error="err('actName')" required>
        <ZInput v-model:value="form.actName" :maxlength="300" class="max-sm:h-11" data-extend-act-name />
      </ZField>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ZField :label="tm('actNumber')" :error="err('actNumber')" required>
          <ZInput v-model:value="form.actNumber" :maxlength="50" class="max-sm:h-11" data-extend-act-number />
        </ZField>
        <ZField :label="tm('actDate')">
          <ZDate :value="form.actDate" allow-clear class="max-sm:h-11" data-extend-act-date @update:value="form.actDate = $event" />
        </ZField>
      </div>
      <ZField :label="tm('actUrl')" :error="err('actUrl')">
        <ZInput v-model:value="form.actUrl" :maxlength="500" placeholder="https://adilet.zan.kz/rus/docs/…" class="max-sm:h-11" data-extend-act-url />
      </ZField>
      <p v-if="serverError" role="alert" class="m-0 text-sm text-tone-danger-fg" data-extend-error>{{ serverError }}</p>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
