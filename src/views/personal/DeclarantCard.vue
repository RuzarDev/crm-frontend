<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { declarantProfileApi, type DeclarantProfileDto } from '@/api/declarantProfile'
import { extractServerText } from '@/api/client'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { useClassifiersStore } from '@/stores/classifiers'
import { useProfileStore } from '@/stores/profile'
import { message } from '@/ui/message'
import { declarantChanged, emptyDeclarant, iinError, ISSUER_CHOICES, ISSUER_MVD, issuerChoice, issuerText, type IssuerChoice } from './profileForms'
import ProfileCard from './ProfileCard.vue'

// 30.10.2026: КПП без права декларанта видит карточку ради доверенности — заголовок без «графы 54».
// 02.11.2026 (F3): у КПП нет и полей своей доверенности от организации (они только для гр.54); сохранённые значения не
// стираются — черновик хранит их и отправляет как были.
const props = defineProps<{ poaOnly?: boolean }>()
// saved — профиль сохранён (ИИН мог поменяться: «Мои доверенности» перечитывают список).
const emit = defineEmits<{ saved: [] }>()

// «Профиль декларанта · графа 54» (гр.54 ДТ и КЕДЕН-XML берут его отсюда). Грузится сама; не загрузился —
// состояние ошибки с «Повторить», а не пустая форма: сохранение пустой формы стёрло бы настоящие данные.
// Все поля профиля редактируются здесь (гр.54 и КЕДЕН-XML берут должность, «кем выдан», страну и телефон отсюда).
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
// «Кем выдан»: выбранный пункт списка и текст «другого органа» (см. ниже onIssuer).
const issuer = ref<IssuerChoice | null>(null)
const otherIssuer = ref('')

const load = async () => {
  state.value = 'loading'
  try {
    const dto = { ...emptyDeclarant(), ...(await declarantProfileApi.get({ silent: true })) }
    saved.value = dto
    Object.assign(draft, dto)
    // Пустой профиль — подставим имя и телефон аккаунта, чтобы не вводить заново. Подстановка — не правка: «Сохранить»
    // ждёт настоящей правки пользователя (подставленное уходит вместе с ней), поэтому исходным считаем форму с подстановкой.
    if (!draft.fullName && profile.profile?.displayName) draft.fullName = profile.profile.displayName
    if (!draft.phone && profile.profile?.phone) draft.phone = profile.profile.phone
    // 02.11.2026 (F4): «Кем выдан» не заполнен у документа РК — по умолчанию «МВД РК» (тоже подстановка, не правка).
    if (!draft.idDocIssuedBy && (!draft.idDocCountryCode || draft.idDocCountryCode === 'KZ')) draft.idDocIssuedBy = ISSUER_MVD
    saved.value = { ...draft }
    issuer.value = issuerChoice(draft.idDocIssuedBy)
    otherIssuer.value = issuer.value === 'other' ? draft.idDocIssuedBy ?? '' : ''
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

// Страна выдачи — 2-буквенный код, как в гр.54 ДТ (справочник стран, поиск по коду и названию).
const countryOptions = useCountryAlpha2Options()

// «Кем выдан» (02.11.2026, F4): список «МВД РК» / «МЮ РК» / «Другой орган» + поле для другого. Хранится текстом
// (issuerText): казахская подпись («ҚР ІІМ») — только в списке, в доверенность и гр.54 уходит русский текст.
const issuerOptions = computed(() => ISSUER_CHOICES.map((c) => ({ value: c, label: t(`personal.profile.declarant.issuer.${c}`) })))
const onIssuer = (v: unknown) => {
  issuer.value = v === 'mvd' || v === 'mj' || v === 'other' ? v : null
  draft.idDocIssuedBy = issuerText(issuer.value, otherIssuer.value)
}
const onOtherIssuer = (v: unknown) => {
  otherIssuer.value = typeof v === 'string' ? v : ''
  draft.idDocIssuedBy = issuerText('other', otherIssuer.value)
}
// F3: «Моя доверенность от AQNIET (для графы 54)» — название из реквизитов организации, не из кода.
const poaHeading = computed(() => {
  const org = saved.value.organizationName?.trim()
  return org ? t('personal.profile.declarant.myPoaFrom', { org }) : t('personal.profile.declarant.myPoaFromOrg')
})
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
    issuer.value = issuerChoice(res.idDocIssuedBy)
    if (issuer.value === 'other') otherIssuer.value = res.idDocIssuedBy ?? ''
    // F1: сервер записал ФИО и телефон и в учётную запись — шапка и меню берут их из профиля.
    if (profile.profile) profile.profile = { ...profile.profile, displayName: res.fullName, phone: res.phone }
    message.success(t('personal.profile.declarant.saved'))
    emit('saved')
  } catch (e) {
    saveError.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('personal.profile.declarant.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ProfileCard
    :title="t(props.poaOnly ? 'personal.profile.declarant.titlePoa' : 'personal.profile.declarant.title')"
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
        <ZField :label="t('personal.profile.declarant.fullName')">
          <ZInput v-model:value="draft.fullName" autocomplete="name" data-declarant="fullName" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.position')">
          <ZInput v-model:value="draft.position" autocomplete="organization-title" data-declarant="position" />
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
        <ZField :label="t('personal.profile.declarant.issuedBy')">
          <ZSelect :value="issuer" :options="issuerOptions" allow-clear data-declarant="idDocIssuer" @update:value="onIssuer" />
        </ZField>
        <ZField v-if="issuer === 'other'" :label="t('personal.profile.declarant.issuerOther')">
          <ZInput :value="otherIssuer" :maxlength="300" data-declarant="idDocIssuedBy" @update:value="onOtherIssuer" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.country')">
          <ZSelect v-model:value="draft.idDocCountryCode" :options="countryOptions" show-search allow-clear data-declarant="idDocCountryCode" />
        </ZField>
        <ZField :label="t('personal.profile.declarant.phone')">
          <ZPhone v-model:value="draft.phone" autocomplete="tel" data-declarant="phone" />
        </ZField>
      </div>
      <template v-if="!props.poaOnly">
        <h3 class="m-0 text-sm font-semibold text-ink-2" data-declarant-own-poa>{{ poaHeading }}</h3>
        <div class="grid grid-cols-3 gap-x-3.5 gap-y-4 max-sm:grid-cols-1">
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
    </template>
  </ProfileCard>
</template>
