<template>
  <div class="crm-auth-page">
    <section class="crm-auth-brand">
      <div class="crm-auth-lockup">
        <AtgLogo :dark="true" :height="42" /></div>
      <div class="crm-auth-hero">
        <h1>Операционная CRM для таможенной логистики</h1>
        <p>
          Реестр, документы, роли брокеров, экспедиторов и клиентов собраны в одном рабочем контуре.
        </p>
      </div>
      <div class="crm-auth-features">
        <div class="crm-auth-feature">
          <DatabaseOutlined class="crm-auth-feature-icon" />
          <span>Реестр деклараций</span>
        </div>
        <div class="crm-auth-feature">
          <FolderOpenOutlined class="crm-auth-feature-icon" />
          <span>Управление документами</span>
        </div>
        <div class="crm-auth-feature">
          <SafetyCertificateOutlined class="crm-auth-feature-icon" />
          <span>Роли и права доступа</span>
        </div>
        <div class="crm-auth-feature">
          <FileExcelOutlined class="crm-auth-feature-icon" />
          <span>Загрузка из Excel</span>
        </div>
      </div>
    </section>

    <main class="crm-auth-form-wrap">
      <a-card class="crm-auth-card" title="Вход в CRM">
        <a-form
          :model="formState"
          :rules="rules"
          @finish="handleLogin"
          layout="vertical"
        >
          <a-form-item label="Логин" name="username">
            <a-input
              v-model:value="formState.username"
              placeholder="Введите логин"
              size="large"
            >
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

          <a-form-item>
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              block
              :loading="loading"
            >
              Войти
            </a-button>
          </a-form-item>
          <a-form-item>
            <a-button type="link" block @click="goToRegister">
              Зарегистрироваться
            </a-button>
          </a-form-item>
        </a-form>
      </a-card>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  UserOutlined,
  LockOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  SafetyCertificateOutlined,
  FileExcelOutlined,
} from '@ant-design/icons-vue'
import AtgLogo from '@/components/AtgLogo.vue'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const formState = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: 'Введите логин' }],
  password: [{ required: true, message: 'Введите пароль' }],
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

const goToRegister = () => {
  router.push('/register')
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

.crm-auth-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.crm-auth-feature {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid rgba(245, 231, 201, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 248, 234, 0.7);
  font-size: 13px;
  font-weight: 600;
}

.crm-auth-feature-icon {
  font-size: 15px;
  flex-shrink: 0;
  color: #2BBCD4;
  opacity: 0.9;
}

@media (max-width: 900px) {
  /* Заголовок — компактный, 2 строки максимум */
  .crm-auth-hero h1 {
    font-size: 19px;
    line-height: 1.3;
    margin-bottom: 0;
    color: rgba(255, 248, 234, 0.9);
  }

  /* Описание убираем — лишнее на мобиле */
  .crm-auth-hero p {
    display: none !important;
  }

  /* Фичи — оставляем, адаптируем под мобилку */
  .crm-auth-features {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 4px;
  }

  .crm-auth-feature {
    font-size: 12px;
    padding: 9px 10px;
    gap: 7px;
  }

  .crm-auth-feature-icon {
    font-size: 13px;
  }
}

/* legacy class kept for older browser snapshots */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.login-card {
  width: 100%;
  max-width: 400px;
}
</style>
