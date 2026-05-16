<template>
  <div class="crm-auth-page">
    <section class="crm-auth-brand">
      <div class="crm-auth-lockup">
        <div class="crm-brand-mark">ATG</div>
        <div>
          <strong>Aqniet Trans Group</strong>
          <span>Client Access</span>
        </div>
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
.crm-auth-lockup strong,
.crm-auth-lockup span {
  display: block;
}

.crm-auth-lockup strong {
  font-size: 15px;
  font-weight: 750;
  color: #fff8ea;
}

.crm-auth-lockup span {
  margin-top: 3px;
  color: rgba(255, 248, 234, 0.55);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
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
  color: rgba(255, 248, 234, 0.72);
  font-size: 14px;
  font-weight: 600;
}

.crm-auth-step-num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(245, 211, 141, 0.3);
  border-radius: 6px;
  background: rgba(200, 149, 53, 0.1);
  color: #f5d38d;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

@media (max-width: 900px) {
  .crm-auth-lockup strong {
    color: #fff8ea;
    font-size: 14px;
  }

  .crm-auth-lockup span {
    color: rgba(255, 248, 234, 0.5);
  }

  .crm-auth-hero h1 {
    font-size: 19px;
    line-height: 1.3;
    color: rgba(255, 248, 234, 0.9);
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
