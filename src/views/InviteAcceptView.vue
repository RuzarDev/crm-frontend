<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { clientsOnboardingApi, type InviteInfo } from '@/api/clientsOnboarding'
import { useAuthStore } from '@/stores/auth'
import type { ZRule } from '@/ui/validation'
import { authLabelClass as labelClass, authPrimaryLinkClass } from '@/components/auth/classes'

// Приглашение клиента сотрудником: проверка ссылки (скелетон) → форма пароля | ссылка недействительна.
// После установки пароля — авто-вход и «Моя компания»; если авто-вход не удался — запасное «Пароль задан».
// Герой — регистрации: приглашённый проходит тот же путь клиента. Несовпадение паролей — правило поля повтора.

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const token = String(route.params.token ?? '')
const state = ref<'loading' | 'form' | 'invalid' | 'done'>('loading')
const info = ref<InviteInfo | null>(null)
const saving = ref(false)

const uid = useId()
const ids = { password: `${uid}-password`, confirm: `${uid}-confirm` }
const form = reactive({ password: '', confirm: '' })
const rules: Record<string, ZRule[]> = {
  password: [
    { required: true, message: () => t('invite.vPassword') },
    { min: 8, message: () => t('invite.vPasswordMin') },
  ],
  confirm: [
    { required: true, message: () => t('invite.vConfirm') },
    { validator: (_r, v) => (v && v !== form.password ? t('invite.mismatch') : undefined) },
  ],
}
const formRef = ref<InstanceType<typeof ZForm>>()
watch(() => form.password, () => {
  if (form.confirm) void formRef.value?.validate(['confirm'])
})

const email = computed(() => info.value?.email ?? '')
const title = computed(() => ({
  loading: t('invite.title'),
  form: t('invite.title'),
  invalid: t('invite.invalidTitle'),
  done: t('invite.doneTitle'),
})[state.value])
const subtitle = computed(() => {
  if (state.value === 'invalid') return t('invite.invalidSub')
  if (state.value === 'done') return t('invite.doneSub', { email: email.value })
  if (state.value === 'form') {
    const to = info.value?.companyName ? t('invite.invitedTo', { company: info.value.companyName }) : t('invite.invited')
    return `${to} ${t('invite.loginIs', { email: email.value })}`
  }
  return undefined
})

// После отправки форма с кнопкой в фокусе исчезает — фокус на действие нового состояния.
const actionLink = ref<HTMLAnchorElement>()
const moveTo = async (next: 'invalid' | 'done') => {
  state.value = next
  await nextTick()
  actionLink.value?.focus()
}

const passwordInput = ref<InstanceType<typeof ZInput>>()
onMounted(async () => {
  try {
    info.value = await clientsOnboardingApi.inviteInfo(token)
    state.value = 'form'
    // Автофокус — только на широком экране (lg, как у AuthLayout): на телефоне клавиатура закрыла бы форму.
    await nextTick()
    if (window.matchMedia?.('(min-width: 1024px)').matches) passwordInput.value?.focus()
  } catch {
    state.value = 'invalid'
  }
})

const submit = async () => {
  saving.value = true
  try {
    const response = await clientsOnboardingApi.acceptInvite(token, form.password)
    // Аудит 5.22: пароль задан — сразу авто-вход, ведём на старт клиента, а не на форму логина.
    const loggedIn = authStore.loginFromResponse(response, email.value)
    if (loggedIn) await router.push('/import-40/company')
    else await moveTo('done')
  } catch (e: unknown) {
    // Прочие ошибки показывает перехватчик axios.
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 404) await moveTo('invalid')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AuthLayout
    :title="title"
    :subtitle="subtitle"
    :hero-title="t('register.heroTitle')"
    :hero-text="t('register.heroDesc')"
    :points="[t('register.step1'), t('register.step2'), t('register.step3')]"
  >
    <div v-if="state === 'loading'" class="flex flex-col gap-4">
      <span class="sr-only" role="status">{{ t('common.loading') }}</span>
      <div v-for="i in 2" :key="i" class="flex flex-col gap-1.5">
        <ZSkeleton width="132px" height="14px" />
        <ZSkeleton height="42px" />
      </div>
      <ZSkeleton height="44px" />
    </div>

    <RouterLink v-else-if="state === 'invalid'" v-slot="{ href, navigate }" to="/login" custom>
      <a ref="actionLink" :href="href" :class="authPrimaryLinkClass" @click="navigate">{{ t('invite.toLogin') }}</a>
    </RouterLink>

    <RouterLink v-else-if="state === 'done'" v-slot="{ href, navigate }" to="/login" custom>
      <a ref="actionLink" :href="href" :class="authPrimaryLinkClass" @click="navigate">{{ t('invite.login') }}</a>
    </RouterLink>

    <ZForm v-else ref="formRef" :model="form" :rules="rules" @finish="submit">
      <!-- Логин для менеджера паролей: без него новый пароль сохранился бы без адреса. -->
      <input type="email" name="username" autocomplete="username" :value="email" readonly hidden>
      <ZField name="password">
        <label :for="ids.password" :class="[labelClass, 'mb-0.5']">{{ t('invite.password') }}</label>
        <ZInput
          :id="ids.password"
          ref="passwordInput"
          v-model:value="form.password"
          type="password"
          size="lg"
          :placeholder="t('invite.passwordPlaceholder')"
          autocomplete="new-password"
        />
      </ZField>
      <ZField name="confirm">
        <label :for="ids.confirm" :class="[labelClass, 'mb-0.5']">{{ t('invite.confirm') }}</label>
        <ZInput
          :id="ids.confirm"
          v-model:value="form.confirm"
          type="password"
          size="lg"
          :placeholder="t('invite.confirmPlaceholder')"
          autocomplete="new-password"
        />
      </ZField>
      <ZButton variant="primary" html-type="submit" size="lg" block :loading="saving">{{ t('invite.submit') }}</ZButton>
    </ZForm>
  </AuthLayout>
</template>
