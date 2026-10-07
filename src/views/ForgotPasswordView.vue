<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import { authApi } from '@/api/passwordReset'
import type { ZRule } from '@/ui/validation'
import { authLabelClass as labelClass, authLinkClass as linkClass, authPrimaryLinkClass } from '@/components/auth/classes'

// «Забыли пароль»: отправка ссылки восстановления на почту (до этого забывший пароль клиент был в тупике —
// аудит 2026-09-22, п.3). Раскладка и герой — как у входа. Ошибку запроса (503 «почта не настроена» и прочие)
// показываем плашкой над формой текстом сервера: честное объяснение, а не «ошибка».

const { t } = useI18n()
const loginId = `${useId()}-login`
const form = reactive({ login: '' })
const rules: Record<string, ZRule[]> = {
  login: [{ required: true, whitespace: true, message: () => t('reset.loginRequired') }],
}

const loading = ref(false)
const sent = ref(false)
const unavailable = ref('')
// Форма вместе с кнопкой в фокусе исчезает — фокус переводим на действие нового состояния.
const backLink = ref<HTMLAnchorElement>()

const submit = async () => {
  loading.value = true
  unavailable.value = ''
  try {
    await authApi.forgotPassword(form.login.trim())
    sent.value = true
    await nextTick()
    backLink.value?.focus()
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    unavailable.value = err.response?.data?.error || t('reset.error')
  } finally {
    loading.value = false
  }
}

// Автофокус — только на широком экране (lg, как у AuthLayout): на телефоне клавиатура закрыла бы форму.
const loginInput = ref<InstanceType<typeof ZInput>>()
onMounted(() => {
  if (window.matchMedia?.('(min-width: 1024px)').matches) loginInput.value?.focus()
})
</script>

<template>
  <AuthLayout
    :title="sent ? t('reset.sentTitle') : t('reset.forgotTitle')"
    :subtitle="sent ? t('reset.sentSub') : t('reset.forgotSub')"
    :hero-title="t('auth.heroTitle')"
    :hero-text="t('auth.heroText')"
    :points="[t('auth.point1'), t('auth.point2'), t('auth.point3')]"
  >
    <RouterLink v-if="sent" v-slot="{ href, navigate }" to="/login" custom>
      <a ref="backLink" :href="href" :class="authPrimaryLinkClass" @click="navigate">{{ t('reset.toLogin') }}</a>
    </RouterLink>

    <template v-else>
      <ZAlert v-if="unavailable" type="error" show-icon>{{ unavailable }}</ZAlert>
      <ZForm :model="form" :rules="rules" @finish="submit">
        <ZField name="login">
          <label :for="loginId" :class="[labelClass, 'mb-0.5']">{{ t('reset.login') }}</label>
          <ZInput
            :id="loginId"
            ref="loginInput"
            v-model:value="form.login"
            size="lg"
            :placeholder="t('reset.loginPh')"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
        </ZField>
        <ZButton variant="primary" html-type="submit" size="lg" block :loading="loading">{{ t('reset.send') }}</ZButton>
      </ZForm>
    </template>

    <template v-if="!sent" #footer>
      <p class="m-0 text-center text-[14px]">
        <RouterLink to="/login" :class="[linkClass, 'font-semibold no-underline']">{{ t('reset.toLogin') }}</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
