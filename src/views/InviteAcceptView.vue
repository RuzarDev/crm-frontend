<template>
  <div class="invite-page">
    <div class="invite-card">
      <div class="invite-badge">Zircon CRM</div>
      <template v-if="state === 'loading'">
        <a-spin />
      </template>
      <template v-else-if="state === 'invalid'">
        <h2 class="invite-title">Ссылка недействительна</h2>
        <p class="invite-sub">Приглашение истекло или уже использовано. Попросите вашего менеджера выслать новое.</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">На страницу входа</a-button>
      </template>
      <template v-else-if="state === 'done'">
        <h2 class="invite-title">Пароль задан</h2>
        <p class="invite-sub">Теперь войдите с логином <b>{{ info?.email }}</b>.</p>
        <a-button type="primary" size="large" block @click="router.push('/login')">Войти</a-button>
      </template>
      <template v-else>
        <h2 class="invite-title">Завершите регистрацию</h2>
        <p class="invite-sub">
          Вас пригласили в Zircon CRM<template v-if="info?.companyName"> для <b>{{ info.companyName }}</b></template>.
          Логин — <b>{{ info?.email }}</b>. Задайте пароль.
        </p>
        <a-form layout="vertical" :model="form" @finish="submit">
          <a-form-item label="Пароль" name="password" :rules="[{ required: true, message: 'Введите пароль' }, { min: 8, message: 'Минимум 8 символов' }]">
            <a-input-password v-model:value="form.password" size="large" autocomplete="new-password" placeholder="Минимум 8 символов" />
          </a-form-item>
          <a-form-item label="Повторите пароль" name="confirm" :rules="[{ required: true, message: 'Повторите пароль' }]">
            <a-input-password v-model:value="form.confirm" size="large" autocomplete="new-password" placeholder="Повтор" />
          </a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="saving">Задать пароль и войти</a-button>
        </a-form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { clientsOnboardingApi, type InviteInfo } from '@/api/clientsOnboarding'

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
  if (form.password !== form.confirm) { message.error('Пароли не совпадают'); return }
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
.invite-page {
  min-height: 100vh; display: grid; place-items: center; padding: 24px;
  background: linear-gradient(145deg, #0f1d36 0%, #1B2A4A 45%, #1a3050 100%);
}
.invite-card {
  width: 100%; max-width: 440px; background: #fff; border-radius: 16px; padding: 32px 28px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
.invite-badge {
  display: inline-flex; align-items: center; height: 26px; padding: 0 10px; margin-bottom: 16px;
  border: 1px solid rgba(43, 188, 212, 0.3); border-radius: 999px; background: rgba(43, 188, 212, 0.08);
  color: #1FA8C0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.invite-title { margin: 0 0 8px; color: #1B2A4A; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
.invite-sub { margin: 0 0 20px; color: #5b6478; font-size: 14px; line-height: 1.5; }
</style>
