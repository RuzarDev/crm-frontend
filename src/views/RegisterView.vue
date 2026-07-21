<template>
  <div class="auth-page">

    <!-- ══ LEFT PANEL ══════════════════════════════════════════ -->
    <section class="auth-left">
      <div class="auth-grid-pattern" aria-hidden="true"></div>
      <div class="auth-orb auth-orb-1" aria-hidden="true"></div>
      <div class="auth-orb auth-orb-2" aria-hidden="true"></div>
      <div class="auth-orb auth-orb-3" aria-hidden="true"></div>

      <div class="auth-left-inner">
        <div class="auth-hero">
          <div class="auth-eyebrow">
            <span class="auth-eyebrow-dot"></span>
            Регистрация клиента
          </div>
          <h1 class="auth-headline">
            Начните работу<br>с Zircon CRM
          </h1>
          <p class="auth-desc">
            Создайте аккаунт клиента,<br>
            выберите экспедитора и получите<br>
            доступ к реестру и документам.
          </p>
        </div>

        <!-- Steps -->
        <div class="auth-steps">
          <div class="auth-step">
            <div class="auth-step-num">01</div>
            <div class="auth-step-body">
              <div class="auth-step-title">Создайте аккаунт</div>
              <div class="auth-step-sub">Логин и надёжный пароль</div>
            </div>
          </div>
          <div class="auth-step-line"></div>
          <div class="auth-step">
            <div class="auth-step-num">02</div>
            <div class="auth-step-body">
              <div class="auth-step-title">Выберите экспедитора</div>
              <div class="auth-step-sub">Привяжитесь к вашему менеджеру</div>
            </div>
          </div>
          <div class="auth-step-line"></div>
          <div class="auth-step">
            <div class="auth-step-num">03</div>
            <div class="auth-step-body">
              <div class="auth-step-title">Войдите и работайте</div>
              <div class="auth-step-sub">Реестр, документы, статусы</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ RIGHT PANEL ═════════════════════════════════════════ -->
    <main class="auth-right">
      <div class="auth-form-wrap">
        <div class="auth-form-header">
          <div class="auth-form-badge">Zircon CRM</div>
          <h2 class="auth-form-title">Регистрация</h2>
          <p class="auth-form-sub">Заполните данные для создания аккаунта</p>
        </div>

        <a-form
          :model="formState"
          :rules="rules"
          @finish="handleRegister"
          layout="vertical"
          class="auth-form"
        >
          <a-form-item label="Логин" name="username">
            <a-input v-model:value="formState.username" placeholder="Придумайте логин" size="large">
              <template #prefix><UserOutlined class="auth-input-icon" /></template>
            </a-input>
          </a-form-item>

          <a-form-item label="Ваш экспедитор" name="expeditorId">
            <a-select
              v-model:value="formState.expeditorId"
              placeholder="Выберите экспедитора"
              size="large"
              :loading="expeditorsLoading"
              :options="expeditorOptions"
            />
          </a-form-item>

          <div class="auth-form-row">
            <a-form-item label="Пароль" name="password">
              <a-input-password v-model:value="formState.password" placeholder="Пароль" size="large">
                <template #prefix><LockOutlined class="auth-input-icon" /></template>
              </a-input-password>
            </a-form-item>

            <a-form-item label="Повторите пароль" name="confirmPassword">
              <a-input-password v-model:value="formState.confirmPassword" placeholder="Повтор" size="large">
                <template #prefix><LockOutlined class="auth-input-icon" /></template>
              </a-input-password>
            </a-form-item>
          </div>

          <a-form-item class="auth-submit-item">
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              block
              :loading="loading"
              class="auth-submit-btn"
            >
              <span v-if="!loading">Создать аккаунт</span>
            </a-button>
          </a-form-item>
        </a-form>

        <div class="auth-footer-link">
          Уже есть аккаунт?
          <a @click="goToLogin">Войти</a>
        </div>
      </div>
    </main>

  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const expeditorsLoading = ref(false)
const expeditorOptions = ref<{ value: string; label: string }[]>([])

const formState = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  expeditorId: undefined as string | undefined,
})

const rules = {
  username: [{ required: true, message: 'Введите логин' }],
  password: [{ required: true, message: 'Введите пароль' }],
  expeditorId: [{ required: true, message: 'Выберите экспедитора' }],
  confirmPassword: [{ required: true, message: 'Повторите пароль' }],
}

onMounted(async () => {
  expeditorsLoading.value = true
  try {
    const items = await authApi.listExpeditorsForRegistration()
    expeditorOptions.value = items.map((x) => ({ value: x.id, label: x.username }))
  } finally {
    expeditorsLoading.value = false
  }
})

const handleRegister = async () => {
  if (formState.password !== formState.confirmPassword) {
    message.error('Пароли не совпадают')
    return
  }
  loading.value = true
  try {
    if (!formState.expeditorId) { message.error('Выберите экспедитора'); return }
    const success = await authStore.registerClient({
      username: formState.username.trim(),
      password: formState.password,
      expeditorId: formState.expeditorId,
    })
    if (success) router.push('/login')
  } finally {
    loading.value = false
  }
}

const goToLogin = () => router.push('/login')
</script>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────── */
.auth-page {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  overflow: hidden;
}

/* ── LEFT ───────────────────────────────────────────────────── */
.auth-left {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #0f1d36 0%, #1B2A4A 45%, #1a3050 100%);
  overflow: hidden;
}

.auth-grid-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(43, 188, 212, 0.18) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
  pointer-events: none;
}

.auth-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.auth-orb-1 {
  width: 320px; height: 320px;
  top: -80px; right: -80px;
  background: radial-gradient(circle, rgba(43, 188, 212, 0.12) 0%, transparent 70%);
  animation: orb-float 8s ease-in-out infinite;
}

.auth-orb-2 {
  width: 240px; height: 240px;
  bottom: 80px; left: -60px;
  background: radial-gradient(circle, rgba(201, 168, 76, 0.1) 0%, transparent 70%);
  animation: orb-float 11s ease-in-out infinite reverse;
}

.auth-orb-3 {
  width: 180px; height: 180px;
  top: 45%; right: 15%;
  background: radial-gradient(circle, rgba(43, 188, 212, 0.08) 0%, transparent 70%);
  animation: orb-float 7s ease-in-out infinite 2s;
}

@keyframes orb-float {
  0%, 100% { transform: translateY(0px) scale(1); }
  50%       { transform: translateY(-20px) scale(1.04); }
}

.auth-left-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: clamp(36px, 4vw, 64px);
}

.auth-logo { flex-shrink: 0; margin-bottom: auto; }

.auth-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 0 36px;
}

.auth-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  color: #2BBCD4;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auth-eyebrow-dot {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #2BBCD4;
  box-shadow: 0 0 8px rgba(43, 188, 212, 0.8);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(43, 188, 212, 0.8); }
  50%       { opacity: 0.6; box-shadow: 0 0 16px rgba(43, 188, 212, 0.4); }
}

.auth-headline {
  margin: 0 0 20px;
  color: #ffffff;
  font-size: clamp(34px, 3vw, 50px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.auth-desc {
  color: rgba(180, 210, 255, 0.6);
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
}

/* Steps */
.auth-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}

.auth-step {
  display: flex;
  align-items: center;
  gap: 14px;
}

.auth-step-num {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(43, 188, 212, 0.35);
  border-radius: 8px;
  background: rgba(43, 188, 212, 0.1);
  color: #2BBCD4;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.auth-step-title {
  color: rgba(240, 248, 255, 0.88);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.2;
}

.auth-step-sub {
  color: rgba(180, 210, 255, 0.45);
  font-size: 11.5px;
  margin-top: 2px;
}

.auth-step-line {
  width: 1px;
  height: 18px;
  margin-left: 16px;
  background: rgba(43, 188, 212, 0.2);
}

/* ── RIGHT ──────────────────────────────────────────────────── */
.auth-right {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fb;
  padding: clamp(24px, 4vw, 60px);
}

.auth-form-wrap {
  width: 100%;
  max-width: 440px;
}

.auth-form-header { margin-bottom: 32px; }

.auth-form-badge {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  margin-bottom: 14px;
  border: 1px solid rgba(43, 188, 212, 0.3);
  border-radius: 999px;
  background: rgba(43, 188, 212, 0.08);
  color: #1FA8C0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.auth-form-title {
  margin: 0 0 6px;
  color: #1B2A4A;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.auth-form-sub {
  margin: 0;
  color: #8C8C8C;
  font-size: 13.5px;
}

.auth-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.auth-form :deep(.ant-form-item-label > label) {
  color: #1B2A4A;
  font-size: 13px;
  font-weight: 600;
}

.auth-form :deep(.ant-input-lg),
.auth-form :deep(.ant-input-affix-wrapper-lg),
.auth-form :deep(.ant-select-lg .ant-select-selector) {
  min-height: 48px;
  border-radius: 10px !important;
  border-color: #dde1ec !important;
  background: #ffffff !important;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(27, 42, 74, 0.04);
}

.auth-form :deep(.ant-input-affix-wrapper-lg:focus-within),
.auth-form :deep(.ant-select-focused .ant-select-selector) {
  border-color: #2BBCD4 !important;
  box-shadow: 0 0 0 3px rgba(43, 188, 212, 0.14) !important;
}

.auth-input-icon { color: #8C8C8C; font-size: 15px; }

.auth-submit-item { margin-top: 8px; margin-bottom: 0 !important; }

.auth-submit-btn {
  min-height: 52px !important;
  border-radius: 10px !important;
  background: linear-gradient(135deg, #2BBCD4 0%, #1FA8C0 100%) !important;
  border: none !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 16px rgba(43, 188, 212, 0.35) !important;
  transition: transform 0.16s ease, box-shadow 0.16s ease !important;
}

.auth-submit-btn:not(:disabled):hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 8px 24px rgba(43, 188, 212, 0.45) !important;
}

.auth-footer-link {
  margin-top: 22px;
  text-align: center;
  color: #8C8C8C;
  font-size: 13.5px;
}

.auth-footer-link a {
  margin-left: 4px;
  color: #1FA8C0;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease;
}

.auth-footer-link a:hover { color: #1B2A4A; }

/* ── Responsive ─────────────────────────────────────────────── */
@media (max-width: 860px) {
  .auth-page {
    grid-template-columns: 1fr;
  }

  .auth-left-inner {
    padding: 20px 20px 22px;
    flex-direction: row;
    align-items: center;
  }

  .auth-hero, .auth-steps { display: none; }
  .auth-logo { margin-bottom: 0; }

  .auth-right {
    padding: 28px 16px 40px;
    align-items: flex-start;
  }

  .auth-form-row { grid-template-columns: 1fr; }
}
</style>
