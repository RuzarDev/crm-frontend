<!-- «Забыли пароль»: отправка ссылки восстановления на почту.
     До этого забывший пароль клиент был в тупике (аудит 2026-09-22, п.3). -->
<template>
  <div class="reset-page">
    <div class="reset-card">
      <div class="reset-top"><div class="reset-badge">Zircon CRM</div><LanguageSwitcher /></div>

      <template v-if="sent">
        <h2 class="reset-title">{{ t('reset.sentTitle') }}</h2>
        <p class="reset-sub">{{ t('reset.sentSub') }}</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">{{ t('reset.toLogin') }}</a-button>
      </template>

      <template v-else>
        <h2 class="reset-title">{{ t('reset.forgotTitle') }}</h2>
        <p class="reset-sub">{{ t('reset.forgotSub') }}</p>
        <a-alert v-if="unavailable" type="warning" show-icon class="reset-alert" :message="unavailable" />
        <a-form layout="vertical" :model="form" @finish="submit">
          <a-form-item :label="t('reset.login')" name="login" :rules="[{ required: true, message: t('reset.loginRequired') }]">
            <a-input v-model:value="form.login" size="large" autocomplete="username" :placeholder="t('reset.loginPh')" />
          </a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="loading">{{ t('reset.send') }}</a-button>
        </a-form>
        <a-button type="link" block @click="router.push('/login')">{{ t('reset.toLogin') }}</a-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { authApi } from '@/api/passwordReset'

const { t } = useI18n()
const router = useRouter()
const form = reactive({ login: '' })
const loading = ref(false)
const sent = ref(false)
const unavailable = ref('')

const submit = async () => {
  loading.value = true
  unavailable.value = ''
  try {
    await authApi.forgotPassword(form.login.trim())
    sent.value = true
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    // 503 — почта ещё не настроена: показываем честное объяснение, а не «ошибка».
    unavailable.value = err.response?.data?.error || t('reset.error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.reset-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f6fa; padding: 24px; }
.reset-card { width: 100%; max-width: 420px; background: #fff; border-radius: 18px; padding: 28px; box-shadow: 0 18px 50px rgba(16, 36, 61, .08); }
.reset-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.reset-badge { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--atg-teal, #23B5D3); }
.reset-title { font-size: 20px; margin: 0 0 6px; }
.reset-sub { color: var(--atg-muted, #95a1b7); font-size: 13px; margin-bottom: 18px; }
.reset-alert { margin-bottom: 14px; }
</style>
