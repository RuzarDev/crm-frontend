<template>
  <div class="crm-auth-page">
    <section class="crm-auth-brand">
      <div class="crm-auth-lockup">
        <AtgLogo :dark="true" :height="42" />
      </div>
      <div class="crm-auth-hero">
        <h1>Регистрация клиента в CRM</h1>
        <p>
          Создайте доступ и выберите экспедитора, чтобы работать с реестром и документами через ATG.
        </p>
      </div>
      <div class="crm-auth-steps">
        <div class="crm-auth-step">
          <span class="crm-auth-step-num">01</span>
          <span>Создайте логин и пароль</span>
        </div>
        <div class="crm-auth-step">
          <span class="crm-auth-step-num">02</span>
          <span>Выберите своего экспедитора</span>
        </div>
        <div class="crm-auth-step">
          <span class="crm-auth-step-num">03</span>
          <span>Войдите и работайте с реестром</span>
        </div>
      </div>
    </section>

    <main class="crm-auth-form-wrap">
      <a-card class="crm-auth-card" title="Регистрация клиента">
      <a-form :model="formState" :rules="rules" @finish="handleRegister" layout="vertical">
        <a-form-item label="Логин" name="username">
          <a-input v-model:value="formState.username" placeholder="Введите логин" size="large">
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item label="Пароль" name="password">
          <a-input-password
            v-model:value="formState.password"
            placeholder="Введите пароль"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
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

        <a-form-item label="Повторите пароль" name="confirmPassword">
          <a-input-password
            v-model:value="formState.confirmPassword"
            placeholder="Повторите пароль"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="loading">
            Зарегистрироваться
          </a-button>
        </a-form-item>
        <a-form-item>
          <a-button type="link" block @click="goToLogin"> Уже есть аккаунт? Войти </a-button>
        </a-form-item>
      </a-form>
      </a-card>
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
import AtgLogo from '@/components/AtgLogo.vue'

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
    if (!formState.expeditorId) {
      message.error('Выберите экспедитора')
      return
    }

    const success = await authStore.registerClient({
      username: formState.username.trim(),
      password: formState.password,
      expeditorId: formState.expeditorId,
    })
    if (success) {
      router.push('/login')
    }
  } finally {
    loading.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
.crm-auth-lockup {
  padding-bottom: 4px;
}

.crm-auth-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.crm-auth-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.crm-auth-step {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(240, 243, 255, 0.72);
  font-size: 14px;
  font-weight: 600;
}

.crm-auth-step-num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(43, 188, 212, 0.35);
  border-radius: 6px;
  background: rgba(43, 188, 212, 0.12);
  color: #2BBCD4;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

@media (max-width: 900px) {
  .crm-auth-hero h1 {
    font-size: 19px;
    line-height: 1.3;
    color: rgba(240, 243, 255, 0.9);
  }

  .crm-auth-hero p,
  .crm-auth-steps {
    display: none !important;
  }
}

/* legacy class kept for older browser snapshots */
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.register-card {
  width: 100%;
  max-width: 420px;
}
</style>
