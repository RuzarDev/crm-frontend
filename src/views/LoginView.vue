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

const usernameInput = ref<InstanceType<typeof ZInput>>()
onMounted(() => usernameInput.value?.focus())

const labelClass = 'text-sm font-medium text-ink-2'
const linkClass = 'rounded-[4px] text-zircon-ink no-underline outline-hidden transition-colors duration-150 ease-out hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
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
      <ZField name="password">
        <div class="mb-0.5 flex items-baseline justify-between gap-3">
          <label :for="ids.password" :class="labelClass">{{ t('login.password') }}</label>
          <RouterLink to="/forgot-password" :class="[linkClass, 'text-sm font-medium']">{{ t('login.forgot') }}</RouterLink>
        </div>
        <ZInput
          :id="ids.password"
          v-model:value="form.password"
          type="password"
          size="lg"
          autocomplete="current-password"
        />
      </ZField>
      <ZButton variant="primary" html-type="submit" size="lg" block :loading="loading">{{ t('login.submit') }}</ZButton>
    </ZForm>

    <template #footer>
      <p class="m-0 text-center text-[14px] text-ink-3">
        {{ t('login.noAccount') }}
        <RouterLink to="/register" :class="[linkClass, 'font-semibold']">{{ t('auth.registerCompany') }}</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
