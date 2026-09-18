<template>
  <div class="profile-view crm-page">
    <PageHeader kicker="Аккаунт" title="Профиль" subtitle="Личные данные и контактная информация." />

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

        <!-- Профиль декларанта (гр.54): подставляется в ДТ кнопкой «Подставить из профиля» -->
        <a-card class="crm-shell-card profile-card" :bordered="false">
          <template #title><div class="card-title-row"><IdcardOutlined class="card-title-icon" />Профиль декларанта (для гр.54)</div></template>
          <p class="card-hint">Заполните один раз — данные подставятся в гр.54 декларации кнопкой «Подставить из профиля».</p>
          <a-form layout="vertical">
            <div class="form-grid">
              <a-form-item label="ФИО (полностью)"><a-input v-model:value="decl.fullName" allow-clear /></a-form-item>
              <a-form-item label="Должность"><a-input v-model:value="decl.position" allow-clear /></a-form-item>
              <a-form-item label="Телефон"><a-input v-model:value="decl.phone" allow-clear /></a-form-item>
              <a-form-item label="Вид документа (удостоверение)">
                <a-select v-model:value="decl.idDocTypeCode" :options="classifiers.options('id-doc-types')" show-search allow-clear placeholder="21 — Удостоверение личности" style="width:100%" />
              </a-form-item>
              <a-form-item label="№ удостоверения"><a-input v-model:value="decl.idDocNumber" allow-clear /></a-form-item>
              <a-form-item label="Дата выдачи удостоверения"><a-date-picker v-model:value="decl.idDocIssueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" style="width:100%" /></a-form-item>
              <a-form-item label="Кем выдан"><a-input v-model:value="decl.idDocIssuedBy" allow-clear /></a-form-item>
              <a-form-item label="Страна (код)"><a-input v-model:value="decl.idDocCountryCode" :maxlength="3" allow-clear /></a-form-item>
              <a-form-item label="№ доверенности (от Aqniet)"><a-input v-model:value="decl.powerOfAttorneyNumber" allow-clear /></a-form-item>
              <a-form-item label="Дата выдачи доверенности"><a-date-picker v-model:value="decl.powerOfAttorneyDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" style="width:100%" /></a-form-item>
              <a-form-item label="Срок действия доверенности"><a-date-picker v-model:value="decl.powerOfAttorneyValidUntil" format="DD.MM.YYYY" value-format="YYYY-MM-DD" style="width:100%" /></a-form-item>
            </div>
            <div class="form-actions">
              <a-button type="primary" :loading="declSaving" @click="saveDeclarant"><SaveOutlined /> Сохранить профиль</a-button>
            </div>
          </a-form>
        </a-card>

        <!-- Смена пароля -->
        <a-card class="crm-shell-card profile-card" :bordered="false">
          <template #title><div class="card-title-row"><LockOutlined class="card-title-icon" />Смена пароля</div></template>
          <a-form layout="vertical">
            <div class="form-grid">
              <a-form-item label="Текущий пароль"><a-input-password v-model:value="pwd.current" autocomplete="current-password" /></a-form-item>
              <a-form-item label="Новый пароль (мин. 6)"><a-input-password v-model:value="pwd.next" autocomplete="new-password" /></a-form-item>
              <a-form-item label="Повторите новый пароль"><a-input-password v-model:value="pwd.repeat" autocomplete="new-password" /></a-form-item>
            </div>
            <div class="form-actions">
              <a-button type="primary" :loading="pwdSaving" @click="changePassword"><LockOutlined /> Сменить пароль</a-button>
            </div>
          </a-form>
        </a-card>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useProfileStore } from '@/stores/profile'
import { useClassifiersStore } from '@/stores/classifiers'
import { declarantProfileApi, type DeclarantProfileDto } from '@/api/declarantProfile'
import { authApi } from '@/api/auth'
import { formatRole } from '@/utils/labels'
import { SaveOutlined, UserOutlined, IdcardOutlined, LockOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'

const store = useProfileStore()
const classifiers = useClassifiersStore()

// Профиль декларанта (гр.54)
const decl = reactive<DeclarantProfileDto>({
  fullName: null, position: null, phone: null,
  powerOfAttorneyNumber: null, powerOfAttorneyDate: null, powerOfAttorneyValidUntil: null,
  idDocTypeCode: null, idDocNumber: null, idDocIssueDate: null, idDocIssuedBy: null, idDocCountryCode: null,
})
const declSaving = ref(false)
const saveDeclarant = async () => {
  declSaving.value = true
  try {
    const saved = await declarantProfileApi.update({ ...decl })
    Object.assign(decl, saved)
    message.success('Профиль декларанта сохранён')
  } catch {
    message.error('Не удалось сохранить профиль декларанта')
  } finally {
    declSaving.value = false
  }
}

// Смена пароля
const pwd = reactive({ current: '', next: '', repeat: '' })
const pwdSaving = ref(false)
const changePassword = async () => {
  if (pwd.next.length < 6) { message.warning('Новый пароль — минимум 6 символов'); return }
  if (pwd.next !== pwd.repeat) { message.warning('Пароли не совпадают'); return }
  pwdSaving.value = true
  try {
    await authApi.changePassword(pwd.current, pwd.next)
    pwd.current = ''; pwd.next = ''; pwd.repeat = ''
    message.success('Пароль изменён')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    message.error(err.response?.data?.error ?? 'Не удалось сменить пароль')
  } finally {
    pwdSaving.value = false
  }
}

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
  classifiers.loadMany(['id-doc-types'])
  try {
    Object.assign(decl, await declarantProfileApi.get())
  } catch {
    /* профиль декларанта не загрузился — форма остаётся пустой */
  }
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

.card-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--atg-muted);
}

.profile-layout > .profile-card { margin-bottom: 16px; }

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .meta-label {
    width: 120px;
  }
}
</style>
