<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { message } from '@/ui/message'
import { authApi } from '@/api/passwordReset'
import type { ZRule } from '@/ui/validation'
import { authLabelClass as labelClass, authLinkClass as linkClass, authPrimaryLinkClass } from '@/components/auth/classes'

// Установка нового пароля по ссылке из письма: проверка ссылки (скелетон) → форма | ссылка недействительна,
// после сохранения — «Пароль изменён». Несовпадение паролей — ошибка под полем повтора (правило), не тост.

const { t } = useI18n()
const route = useRoute()
const token = String(route.params.token ?? '')
const state = ref<'loading' | 'form' | 'invalid' | 'done'>('loading')
const maskedEmail = ref('')
const saving = ref(false)

const uid = useId()
const ids = { password: `${uid}-password`, confirm: `${uid}-confirm` }
const form = reactive({ password: '', confirm: '' })
const rules: Record<string, ZRule[]> = {
  password: [
    { required: true, message: () => t('reset.passwordRequired') },
    { min: 8, message: () => t('reset.passwordMin') },
  ],
  confirm: [
    { required: true, message: () => t('reset.confirmRequired') },
    { validator: (_r, v) => (v && v !== form.password ? t('reset.mismatch') : undefined) },
  ],
}
const formRef = ref<InstanceType<typeof ZForm>>()
watch(() => form.password, () => {
  if (form.confirm) void formRef.value?.validate(['confirm'])
})

const title = computed(() => ({
  loading: t('reset.newTitle'),
  form: t('reset.newTitle'),
  invalid: t('reset.invalidTitle'),
  done: t('reset.doneTitle'),
})[state.value])
const subtitle = computed(() => ({
  loading: undefined,
  form: t('reset.newSub', { email: maskedEmail.value }),
  invalid: t('reset.invalidSub'),
  done: t('reset.doneSub'),
})[state.value])

// После отправки форма с кнопкой в фокусе исчезает — фокус на действие нового состояния.
const actionLink = ref<HTMLAnchorElement>()
const passwordInput = ref<InstanceType<typeof ZInput>>()
const moveTo = async (next: 'invalid' | 'done') => {
  state.value = next
  await nextTick()
  actionLink.value?.focus()
}

onMounted(async () => {
  try {
    const info = await authApi.checkResetToken(token)
    maskedEmail.value = info.email
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
    await authApi.resetPassword(token, form.password)
    await moveTo('done')
  } catch (e: unknown) {
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 404) await moveTo('invalid')
    else message.error(t('reset.error'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AuthLayout
    :title="title"
    :subtitle="subtitle"
    :hero-title="t('auth.heroTitle')"
    :hero-text="t('auth.heroText')"
    :points="[t('auth.point1'), t('auth.point2'), t('auth.point3')]"
  >
    <div v-if="state === 'loading'" class="flex flex-col gap-4">
      <span class="sr-only" role="status">{{ t('common.loading') }}</span>
      <div v-for="i in 2" :key="i" class="flex flex-col gap-1.5">
        <ZSkeleton width="132px" height="14px" />
        <ZSkeleton height="42px" />
      </div>
      <ZSkeleton height="44px" />
    </div>

    <RouterLink v-else-if="state === 'invalid'" v-slot="{ href, navigate }" to="/forgot-password" custom>
      <a ref="actionLink" :href="href" :class="authPrimaryLinkClass" @click="navigate">{{ t('reset.retry') }}</a>
    </RouterLink>

    <RouterLink v-else-if="state === 'done'" v-slot="{ href, navigate }" to="/login" custom>
      <a ref="actionLink" :href="href" :class="authPrimaryLinkClass" @click="navigate">{{ t('login.submit') }}</a>
    </RouterLink>

    <ZForm v-else ref="formRef" :model="form" :rules="rules" @finish="submit">
      <ZField name="password">
        <label :for="ids.password" :class="[labelClass, 'mb-0.5']">{{ t('reset.password') }}</label>
        <ZInput :id="ids.password" ref="passwordInput" v-model:value="form.password" type="password" size="lg" autocomplete="new-password" />
      </ZField>
      <ZField name="confirm">
        <label :for="ids.confirm" :class="[labelClass, 'mb-0.5']">{{ t('reset.confirm') }}</label>
        <ZInput :id="ids.confirm" v-model:value="form.confirm" type="password" size="lg" autocomplete="new-password" />
      </ZField>
      <ZButton variant="primary" html-type="submit" size="lg" block :loading="saving">{{ t('reset.save') }}</ZButton>
    </ZForm>

    <template v-if="state === 'invalid'" #footer>
      <p class="m-0 text-center text-[14px]">
        <RouterLink to="/login" :class="[linkClass, 'font-semibold no-underline']">{{ t('reset.toLogin') }}</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
