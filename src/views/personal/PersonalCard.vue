<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import { useProfileStore } from '@/stores/profile'
import { buildCompanyFormPayload } from '@/views/profilePayloads'
import ProfileCard from './ProfileCard.vue'

// «Личные данные»: имя для документов и телефон; брокеру и экспедитору ещё компания и БИН.
// Компанию отправляем только когда она показана (buildCompanyFormPayload): иначе пустая строка стёрла бы её.
const props = defineProps<{ companyFields: boolean }>()
const { t } = useI18n()
const store = useProfileStore()

const form = reactive({ displayName: '', phone: '', companyName: '', innBin: '' })
const sync = () => {
  const p = store.profile
  form.displayName = p?.displayName ?? ''
  form.phone = p?.phone ?? ''
  form.companyName = p?.companyName ?? ''
  form.innBin = p?.innBin ?? ''
}
// Профиль обновляет только эта карточка (после сохранения форма берёт ответ сервера).
watch(() => store.profile, sync, { immediate: true })

const dirty = computed(() => {
  const p = store.profile
  if (!p) return false
  const same = (a: string, b: string | null) => a.trim() === (b ?? '').trim()
  return !same(form.displayName, p.displayName)
    || !same(form.phone, p.phone)
    || (props.companyFields && (!same(form.companyName, p.companyName) || !same(form.innBin, p.innBin)))
})

const save = async () => {
  if (!dirty.value || store.saving) return
  await store.update(buildCompanyFormPayload(form, props.companyFields))
}
</script>

<template>
  <ProfileCard :title="t('personal.profile.personal.title')" :save-text="t('personal.profile.personal.save')" :can-save="dirty" :saving="store.saving" data-profile-card="personal" @save="save">
    <div class="grid grid-cols-2 gap-x-3.5 gap-y-4 max-sm:grid-cols-1">
      <ZField :label="t('personal.profile.personal.displayName')">
        <ZInput v-model:value="form.displayName" autocomplete="name" data-profile="displayName" />
      </ZField>
      <ZField :label="t('personal.profile.personal.phone')">
        <ZPhone v-model:value="form.phone" autocomplete="tel" data-profile="phone" />
      </ZField>
      <template v-if="companyFields">
        <ZField :label="t('personal.profile.personal.company')">
          <ZInput v-model:value="form.companyName" autocomplete="organization" data-profile="companyName" />
        </ZField>
        <ZField :label="t('personal.profile.personal.innBin')">
          <ZInput v-model:value="form.innBin" mono inputmode="numeric" data-profile="innBin" />
        </ZField>
      </template>
    </div>
  </ProfileCard>
</template>
