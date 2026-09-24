<!-- Установка нового пароля по ссылке из письма. -->
<template>
  <div class="reset-page">
    <div class="reset-card">
      <div class="reset-top"><div class="reset-badge">Zircon CRM</div><LanguageSwitcher /></div>

      <template v-if="state === 'loading'"><a-spin /></template>

      <template v-else-if="state === 'invalid'">
        <h2 class="reset-title">{{ t('reset.invalidTitle') }}</h2>
        <p class="reset-sub">{{ t('reset.invalidSub') }}</p>
        <a-button type="primary" size="large" block @click="router.push('/forgot-password')">{{ t('reset.retry') }}</a-button>
      </template>

      <template v-else-if="state === 'done'">
        <h2 class="reset-title">{{ t('reset.doneTitle') }}</h2>
        <p class="reset-sub">{{ t('reset.doneSub') }}</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">{{ t('reset.toLogin') }}</a-button>
      </template>

      <template v-else>
        <h2 class="reset-title">{{ t('reset.newTitle') }}</h2>
        <p class="reset-sub">{{ t('reset.newSub', { email: maskedEmail }) }}</p>
        <a-form layout="vertical" :model="form" @finish="submit">
          <a-form-item :label="t('reset.password')" name="password"
            :rules="[{ required: true, message: t('reset.passwordRequired') }, { min: 8, message: t('reset.passwordMin') }]">
            <a-input-password v-model:value="form.password" size="large" autocomplete="new-password" />
          </a-form-item>
          <a-form-item :label="t('reset.confirm')" name="confirm" :rules="[{ required: true, message: t('reset.confirmRequired') }]">
            <a-input-password v-model:value="form.confirm" size="large" autocomplete="new-password" />
          </a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="saving">{{ t('reset.save') }}</a-button>
        </a-form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { authApi } from '@/api/passwordReset'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const token = String(route.params.token ?? '')
const state = ref<'loading' | 'form' | 'invalid' | 'done'>('loading')
const maskedEmail = ref('')
const saving = ref(false)
const form = reactive({ password: '', confirm: '' })

onMounted(async () => {
  try {
    const info = await authApi.checkResetToken(token)
    maskedEmail.value = info.email
    state.value = 'form'
  } catch {
    state.value = 'invalid'
  }
})

const submit = async () => {
  if (form.password !== form.confirm) {
    message.error(t('reset.mismatch'))
    return
  }
  saving.value = true
  try {
    await authApi.resetPassword(token, form.password)
    state.value = 'done'
  } catch (e: unknown) {
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 404) state.value = 'invalid'
    else message.error(t('reset.error'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.reset-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f6fa; padding: 24px; }
.reset-card { width: 100%; max-width: 420px; background: #fff; border-radius: 18px; padding: 28px; box-shadow: 0 18px 50px rgba(16, 36, 61, .08); }
.reset-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.reset-badge { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--atg-teal, #22b8d0); }
.reset-title { font-size: 20px; margin: 0 0 6px; }
.reset-sub { color: var(--atg-muted, #95a1b7); font-size: 13px; margin-bottom: 18px; }
</style>
