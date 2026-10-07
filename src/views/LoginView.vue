<script setup lang="ts">
import { onMounted, reactive, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZButton from '@/components/z/ZButton.vue'
import { useAuthStore } from '@/stores/auth'
import type { ZRule } from '@/ui/validation'

// Вход брокеров и клиентов. Ошибку входа (неверный пароль, блокировка) показывает перехватчик axios — здесь
// только проверка заполненности. Подписи свои, а не label у ZField: у пароля в строке подписи ссылка
// «Забыли пароль?» (в <label> ей не место — попала бы в имя поля), и обе без звёздочки — по макету
// обязательны все поля входа; aria-required ставит ZField.
// Ссылка «Забыли пароль?» видна в строке подписи, но в DOM стоит после поля пароля (absolute): Tab из логина
// ведёт сразу в пароль, а Enter после Tab не уводит со страницы.

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const uid = useId()
const ids = { username: `${uid}-username`, password: `${uid}-password` }

const form = reactive({ username: '', password: '' })
const rules: Record<string, ZRule[]> = {
  username: [{ required: true, whitespace: true, message: () => t('auth.vLogin') }],
  password: [{ required: true, message: () => t('auth.vPassword') }],
}

const loading = ref(false)
const onFinish = async () => {
  loading.value = true
  try {
    // Пробелы по краям логина — от копирования; пароль передаём как есть.
    const ok = await authStore.login({ username: form.username.trim(), password: form.password })
    if (ok) router.push('/')
  } finally {
    loading.value = false
  }
}

// Автофокус — только на широком экране (lg, как у AuthLayout): на телефоне клавиатура закрыла бы форму.
const usernameInput = ref<InstanceType<typeof ZInput>>()
onMounted(() => {
  if (window.matchMedia?.('(min-width: 1024px)').matches) usernameInput.value?.focus()
})

const labelClass = 'self-start text-sm font-medium text-ink-2'
const linkClass = 'rounded-[4px] text-zircon-ink outline-hidden transition-colors duration-150 ease-out hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
</script>

<template>
  <AuthLayout
    :title="t('auth.loginTitle')"
    :subtitle="t('auth.loginSubtitle')"
    :hero-title="t('auth.heroTitle')"
    :hero-text="t('auth.heroText')"
    :points="[t('auth.point1'), t('auth.point2'), t('auth.point3')]"
  >
    <ZForm :model="form" :rules="rules" @finish="onFinish">
      <ZField name="username">
        <label :for="ids.username" :class="[labelClass, 'mb-0.5']">{{ t('auth.loginLabel') }}</label>
        <ZInput
          :id="ids.username"
          ref="usernameInput"
          v-model:value="form.username"
          size="lg"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
        />
      </ZField>
      <ZField name="password" class="relative">
        <label :for="ids.password" :class="[labelClass, 'mb-0.5']">{{ t('login.password') }}</label>
        <ZInput
          :id="ids.password"
          v-model:value="form.password"
          type="password"
          size="lg"
          autocomplete="current-password"
        />
        <RouterLink
          to="/forgot-password"
          :class="[linkClass, 'absolute right-0 top-0 text-sm font-medium no-underline']"
        >{{ t('login.forgot') }}</RouterLink>
      </ZField>
      <ZButton variant="primary" html-type="submit" size="lg" block :loading="loading">{{ t('login.submit') }}</ZButton>
    </ZForm>

    <template #footer>
      <p class="m-0 text-center text-[14px] text-ink-3">
        {{ t('login.noAccount') }}
        <RouterLink to="/register" :class="[linkClass, 'font-semibold underline underline-offset-2']">{{ t('auth.registerCompany') }}</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
