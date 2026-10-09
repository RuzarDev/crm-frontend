<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { declarantProfileApi, type DeclarantProfileDto } from '@/api/declarantProfile'
import { extractServerText } from '@/api/client'
import { useClassifiersStore } from '@/stores/classifiers'
import { useProfileStore } from '@/stores/profile'
import { message } from '@/ui/message'
import { declarantChanged, emptyDeclarant, iinError } from './profileForms'
import ProfileCard from './ProfileCard.vue'

// «Профиль декларанта · графа 54» (гр.54 ДТ и КЕДЕН-XML берут его отсюда). Грузится сама; не загрузился —
// состояние ошибки с «Повторить», а не пустая форма: сохранение пустой формы стёрло бы настоящие данные.
// Поля профиля, которых на доске нет (должность, кем выдан, страна, телефон), при сохранении уходят как загружены.
const { t } = useI18n()
const classifiers = useClassifiersStore()
const profile = useProfileStore()

type State = 'loading' | 'error' | 'ready'
const state = ref<State>('loading')
const saved = shallowRef<DeclarantProfileDto>(emptyDeclarant())
const draft = reactive<DeclarantProfileDto>(emptyDeclarant())
const saving = ref(false)
const saveError = ref<string | null>(null)
const iinTouched = ref(false)

const load = async () => {
  state.value = 'loading'
  try {
    const dto = { ...emptyDeclarant(), ...(await declarantProfileApi.get({ silent: true })) }
    saved.value = dto
    Object.assign(draft, dto)
    // Пустой профиль — подставим имя и телефон аккаунта, чтобы не вводить заново (сохранить их — по кнопке).
    if (!draft.fullName && profile.profile?.displayName) draft.fullName = profile.profile.displayName
    if (!draft.phone && profile.profile?.phone) draft.phone = profile.profile.phone
    iinTouched.value = false
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(() => {
  classifiers.loadMany(['id-doc-types']).catch(() => { /* список документов не загрузился — в поле останется код */ })
  void load()
})
watch(draft, () => { saveError.value = null }, { deep: true })

const docOptions = computed(() => classifiers.options('id-doc-types'))
const dirty = computed(() => declarantChanged(saved.value, draft))
const iinErr = computed(() => (iinTouched.value && iinError(draft.iin) ? t('personal.profile.declarant.iinError') : undefined))

const iinInput = ref<InstanceType<typeof ZInput>>()
const save = async () => {
  if (!dirty.value || saving.value) return
  if (iinError(draft.iin)) {
    iinTouched.value = true
    await nextTick()
    iinInput.value?.focus()
    return
  }
  saving.value = true
  saveError.value = null
  try {
    const res = { ...emptyDeclarant(), ...(await declarantProfileApi.update({ ...draft }, { silent: true })) }
    saved.value = res
    Object.assign(draft, res)
    message.success(t('personal.profile.declarant.saved'))
  } catch (e) {
    saveError.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('personal.profile.declarant.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ProfileCard
    :title="t('personal.profile.declarant.title')"
    :save-text="state === 'ready' ? t('personal.profile.declarant.save') : undefined"
    :can-save="dirty"
    :saving="saving"
    data-profile-card="declarant"
    @save="save"
  >
    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3 rounded-row bg-sunken px-4 py-3" data-declarant-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('personal.profile.declarant.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-declarant-retry @click="load()">{{ t('personal.profile.retry') }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" data-declarant-skeleton>
      <ZSkeleton :lines="5" height="36px" />
    </div>
    <template v-else>
      <p v-if="saveError" role="alert" class="m-0 rounded-row bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg [overflow-wrap:anywhere]" data-declarant-save-error>{{ saveError }}</p>
      <div class="grid grid-cols-3 gap-x-3.5 gap-y-4 max-sm:grid-cols-1">
        <ZField class="col-span-2 max-sm:col-span-1" :label="t('personal.profile.declarant.fullName')">
          <ZInput v-model:value="draft.fullName" autocomplete="name" data-declarant="fullName" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.iin')" :error="iinErr">
          <ZInput
            ref="iinInput"
            v-model:value="draft.iin"
            mono
            inputmode="numeric"
            :maxlength="12"
            data-declarant="iin"
            @blur="iinTouched = true"
          />
        </ZField>
        <ZField :label="t('personal.profile.declarant.docType')">
          <ZSelect v-model:value="draft.idDocTypeCode" :options="docOptions" allow-clear data-declarant="idDocTypeCode" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.docNumber')">
          <ZInput v-model:value="draft.idDocNumber" mono data-declarant="idDocNumber" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.docIssued')">
          <ZDate v-model:value="draft.idDocIssueDate" data-declarant="idDocIssueDate" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.poaNumber')">
          <ZInput v-model:value="draft.powerOfAttorneyNumber" mono data-declarant="powerOfAttorneyNumber" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.poaDate')">
          <ZDate v-model:value="draft.powerOfAttorneyDate" data-declarant="powerOfAttorneyDate" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.poaValidUntil')">
          <ZDate v-model:value="draft.powerOfAttorneyValidUntil" data-declarant="powerOfAttorneyValidUntil" />
        </ZField>
      </div>
    </template>
  </ProfileCard>
</template>
