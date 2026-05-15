<template>
  <div class="register-container">
    <a-card class="register-card" title="Регистрация клиента">
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
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.register-card {
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
</style>
