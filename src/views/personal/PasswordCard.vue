<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import { authApi } from '@/api/auth'
import { extractServerText } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import { passwordErrors, type PasswordForm } from './profileForms'
import ProfileCard from './ProfileCard.vue'

// «Пароль»: сервер закрывает остальные сеансы и отвечает новым токеном — auth его принимает (иначе текущий
// сеанс оборвался бы) и снимает «смените временный пароль». Вынужденная смена → после неё на Главную.
// Ошибки — на месте под полями; отказ сервера («Текущий пароль неверный») — под полем текущего пароля.
const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const form = reactive<PasswordForm>({ current: '', next: '', repeat: '' })
const touched = reactive({ current: false, next: false, repeat: false })
const submitted = ref(false)
const saving = ref(false)
const serverError = ref<string | null>(null)

const errors = computed(() => passwordErrors(form))
// Ушли из непустого поля — ругаемся сразу; пустое молчит до «Сменить пароль» (прошли Tab-ом — не повод).
const show = (k: keyof PasswordForm) => (submitted.value || (touched[k] && form[k] !== '')) && errors.value[k]
const text = (k: keyof PasswordForm) => {
  const code = show(k)
  if (code) return t(({ required: 'personal.profile.password.errCurrent', min: 'personal.profile.password.errMin', mismatch: 'personal.profile.password.errMismatch' })[code])
  return k === 'current' ? serverError.value ?? undefined : undefined
}
const canSave = computed(() => !!(form.current || form.next || form.repeat))

const save = async () => {
  if (saving.value) return
  submitted.value = true
  if (Object.keys(errors.value).length) return
  saving.value = true
  serverError.value = null
  try {
    const wasForced = auth.mustChangePassword
    auth.passwordChanged(await authApi.changePassword(form.current, form.next, { silent: true }))
    form.current = form.next = form.repeat = ''
    submitted.value = false
    touched.current = touched.next = touched.repeat = false
    message.success(t('personal.profile.password.changed'))
    if (wasForced) void router.replace('/')
  } catch (e) {
    serverError.value = extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('personal.profile.password.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ProfileCard
    :title="t('personal.profile.password.title')"
    :save-text="t('personal.profile.password.change')"
    :can-save="canSave"
    :saving="saving"
    data-profile-card="password"
    @save="save"
  >
    <div class="grid grid-cols-3 gap-x-3.5 gap-y-4 max-sm:grid-cols-1">
      <ZField :label="t('personal.profile.password.current')" :error="text('current')">
        <ZInput
          v-model:value="form.current"
          type="password"
          autocomplete="current-password"
          data-password="current"
          @update:value="serverError = null"
          @blur="touched.current = true"
        />
      </ZField>
      <ZField :label="t('personal.profile.password.next')" :error="text('next')">
        <ZInput
          v-model:value="form.next"
          type="password"
          autocomplete="new-password"
          :placeholder="t('personal.profile.password.nextPlaceholder')"
          data-password="next"
          @blur="touched.next = true"
        />
      </ZField>
      <ZField :label="t('personal.profile.password.repeat')" :error="text('repeat')">
        <ZInput
          v-model:value="form.repeat"
          type="password"
          autocomplete="new-password"
          data-password="repeat"
          @blur="touched.repeat = true"
        />
      </ZField>
    </div>
    <p class="m-0 text-[13px] text-muted">{{ t('personal.profile.password.hint') }}</p>
  </ProfileCard>
</template>
