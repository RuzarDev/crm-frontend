<template>
  <div class="login-container">
    <a-card class="login-card" title="CRM Login">
      <a-form
        :model="formState"
        :rules="rules"
        @finish="handleLogin"
        layout="vertical"
      >
        <a-form-item label="Username" name="username">
          <a-input
            v-model:value="formState.username"
            placeholder="Enter username"
            size="large"
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item label="Password" name="password">
          <a-input-password
            v-model:value="formState.password"
            placeholder="Enter password"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="loading"
          >
            Login
          </a-button>
        </a-form-item>
      </a-form>

      <a-divider />

      <div class="login-info">
        <p><strong>Demo Accounts:</strong></p>
        <ul>
          <li>User: <code>user / user123</code></li>
          <li>Admin: <code>admin / admin123</code></li>
          <li>Super Admin: <code>superadmin / super123</code></li>
        </ul>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const formState = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: 'Please enter username' }],
  password: [{ required: true, message: 'Please enter password' }],
}

const handleLogin = async () => {
  loading.value = true
  try {
    const success = await authStore.login(formState)
    if (success) {
      router.push('/')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.login-info {
  font-size: 12px;
  color: #666;
}

.login-info ul {
  list-style: none;
  padding: 0;
  margin: 8px 0 0 0;
}

.login-info li {
  margin: 4px 0;
}

.login-info code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
