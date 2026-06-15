<template>
  <div class="profile-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Аккаунт</div>
        <h1 class="crm-page-title">Профиль</h1>
        <p class="crm-page-subtitle">Личные данные и контактная информация.</p>
      </div>
    </div>

    <a-spin :spinning="store.loading">
      <div class="profile-layout">
        <a-card class="crm-shell-card profile-card" :bordered="false">
          <template #title>
            <div class="card-title-row">
              <UserOutlined class="card-title-icon" />
              Личные данные
            </div>
          </template>

          <div v-if="store.profile" class="profile-meta">
            <div class="meta-row">
              <span class="meta-label">Логин</span>
              <span class="meta-value meta-value--mono">{{ store.profile.username }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Роль</span>
              <span class="role-tag" :class="`role-tag--${store.profile.role}`">
                {{ formatRole(store.profile.role) }}
              </span>
            </div>
          </div>

          <a-divider />

          <a-form layout="vertical" :model="form" @finish="handleSave">
            <div class="form-grid">
              <a-form-item label="Отображаемое имя">
                <a-input
                  v-model:value="form.displayName"
                  placeholder="Иван Иванов"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="Телефон">
                <a-input
                  v-model:value="form.phone"
                  placeholder="+7 700 000 00 00"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="Компания">
                <a-input
                  v-model:value="form.companyName"
                  placeholder="ТОО «Пример»"
                  allow-clear
                />
              </a-form-item>
              <a-form-item label="ИИН / БИН">
                <a-input
                  v-model:value="form.innBin"
                  placeholder="123456789012"
                  allow-clear
                />
              </a-form-item>
            </div>

            <div class="form-actions">
              <a-button
                type="primary"
                html-type="submit"
                :loading="store.saving"
              >
                <SaveOutlined />
                Сохранить
              </a-button>
              <a-button @click="resetForm">Сбросить</a-button>
            </div>
          </a-form>
        </a-card>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue'
import { useProfileStore } from '@/stores/profile'
import { formatRole } from '@/utils/labels'
import { SaveOutlined, UserOutlined } from '@ant-design/icons-vue'

const store = useProfileStore()

const form = reactive({
  displayName: '' as string | null,
  phone: '' as string | null,
  companyName: '' as string | null,
  innBin: '' as string | null,
})

const syncForm = () => {
  if (!store.profile) return
  form.displayName = store.profile.displayName ?? ''
  form.phone = store.profile.phone ?? ''
  form.companyName = store.profile.companyName ?? ''
  form.innBin = store.profile.innBin ?? ''
}

watch(() => store.profile, syncForm)

onMounted(async () => {
  await store.fetch()
  syncForm()
})

const resetForm = () => syncForm()

const handleSave = async () => {
  await store.update({
    displayName: form.displayName || null,
    phone: form.phone || null,
    companyName: form.companyName || null,
    innBin: form.innBin || null,
  })
}
</script>

<style scoped>
.profile-layout {
  max-width: 720px;
}

.profile-card :deep(.ant-card-head) {
  border-bottom: 1px solid var(--atg-line);
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--atg-ink);
}

.card-title-icon {
  color: var(--atg-teal);
  font-size: 16px;
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-label {
  width: 160px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atg-muted);
}

.meta-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--atg-ink);
}

.meta-value--mono {
  font-family: monospace;
  font-size: 13px;
  background: var(--atg-surface-muted);
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.03em;
}

.role-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  border: 1px solid transparent;
}

.role-tag--administrator {
  background: rgba(17, 20, 19, 0.08);
  border-color: rgba(17, 20, 19, 0.15);
  color: var(--atg-ink);
}

.role-tag--broker {
  background: rgba(37, 95, 143, 0.08);
  border-color: rgba(37, 95, 143, 0.2);
  color: var(--atg-blue);
}

.role-tag--expeditor {
  background: rgba(40, 107, 75, 0.08);
  border-color: rgba(40, 107, 75, 0.2);
  color: var(--atg-green);
}

.role-tag--client {
  background: var(--atg-accent-soft);
  border-color: rgba(200, 149, 53, 0.25);
  color: var(--atg-accent-strong);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .meta-label {
    width: 120px;
  }
}
</style>
