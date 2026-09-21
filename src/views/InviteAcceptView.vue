<template>
  <div class="invite-page">
    <div class="invite-card">
      <div class="invite-top"><div class="invite-badge">Zircon CRM</div><LanguageSwitcher /></div>
      <template v-if="state === 'loading'">
        <a-spin />
      </template>
      <template v-else-if="state === 'invalid'">
        <h2 class="invite-title">{{ t('invite.invalidTitle') }}</h2>
        <p class="invite-sub">{{ t('invite.invalidSub') }}</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">{{ t('invite.toLogin') }}</a-button>
      </template>
      <template v-else-if="state === 'done'">
        <h2 class="invite-title">{{ t('invite.doneTitle') }}</h2>
        <p class="invite-sub">{{ t('invite.doneSub', { email: info?.email ?? '' }) }}</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">{{ t('invite.login') }}</a-button>
      </template>
      <template v-else>
        <h2 class="invite-title">{{ t('invite.title') }}</h2>
        <p class="invite-sub">
          {{ info?.companyName ? t('invite.invitedTo', { company: info.companyName }) : t('invite.invited') }}
          {{ t('invite.loginIs', { email: info?.email ?? '' }) }}
        </p>
        <a-form layout="vertical" :model="form" @finish="submit">
          <a-form-item :label="t('invite.password')" name="password" :rules="[{ required: true, message: t('invite.vPassword') }, { min: 8, message: t('invite.vPasswordMin') }]">
            <a-input-password v-model:value="form.password" size="large" autocomplete="new-password" :placeholder="t('invite.passwordPlaceholder')" />
          </a-form-item>
          <a-form-item :label="t('invite.confirm')" name="confirm" :rules="[{ required: true, message: t('invite.vConfirm') }]">
            <a-input-password v-model:value="form.confirm" size="large" autocomplete="new-password" :placeholder="t('invite.confirmPlaceholder')" />
          </a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="saving">{{ t('invite.submit') }}</a-button>
        </a-form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { clientsOnboardingApi, type InviteInfo } from '@/api/clientsOnboarding'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const token = String(route.params.token ?? '')
const state = ref<'loading' | 'form' | 'invalid' | 'done'>('loading')
const info = ref<InviteInfo | null>(null)
const saving = ref(false)
const form = reactive({ password: '', confirm: '' })

onMounted(async () => {
  try {
    info.value = await clientsOnboardingApi.inviteInfo(token)
    state.value = 'form'
  } catch {
    state.value = 'invalid'
  }
})

const submit = async () => {
  if (form.password !== form.confirm) { message.error(t('invite.mismatch')); return }
  saving.value = true
  try {
    await clientsOnboardingApi.acceptInvite(token, form.password)
    state.value = 'done'
  } catch (e: unknown) {
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 404) state.value = 'invalid'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.invite-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.invite-page {
  min-height: 100vh; display: grid; place-items: center; padding: 24px;
  background: linear-gradient(145deg, #0f1d36 0%, #1B2A4A 45%, #1a3050 100%);
}
.invite-card {
  width: 100%; max-width: 440px; background: #fff; border-radius: 16px; padding: 32px 28px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
.invite-badge {
  display: inline-flex; align-items: center; height: 26px; padding: 0 10px;
  border: 1px solid rgba(43, 188, 212, 0.3); border-radius: 999px; background: rgba(43, 188, 212, 0.08);
  color: #1FA8C0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.invite-title { margin: 0 0 8px; color: #1B2A4A; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
.invite-sub { margin: 0 0 20px; color: #5b6478; font-size: 14px; line-height: 1.5; }
</style>
