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
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const formState = reactive({
  username: '',
  password: '',
  confirmPassword: '',
})

const rules = {
  username: [{ required: true, message: 'Введите логин' }],
  password: [{ required: true, message: 'Введите пароль' }],
  confirmPassword: [{ required: true, message: 'Повторите пароль' }],
}

const handleRegister = async () => {
  if (formState.password !== formState.confirmPassword) {
    message.error('Пароли не совпадают')
    return
  }

  loading.value = true
  try {
    const success = await authStore.registerClient({
      username: formState.username.trim(),
      password: formState.password,
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
