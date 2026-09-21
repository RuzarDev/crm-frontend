<template>
  <div class="roles-view crm-page">
    <PageHeader
      kicker="Безопасность"
      title="Роли и права"
      subtitle="Что может каждая бизнес-роль. Галочка — право. У сотрудника может быть несколько ролей: права складываются. Изменения применяются при следующем входе."
    >
      <template #actions>
        <a-popconfirm v-if="canManage" title="Вернуть матрицу к настройкам по умолчанию?" ok-text="Сбросить" cancel-text="Отмена" @confirm="resetAll">
          <a-button danger>Сбросить к дефолту</a-button>
        </a-popconfirm>
        <a-button :loading="loading" @click="load">Обновить</a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <a-spin :spinning="loading">
        <div v-if="matrix" class="matrix-wrapper">
          <table class="perm-matrix">
            <thead>
              <tr>
                <th class="perm-col">Право</th>
                <th v-for="role in matrix.roles" :key="role.code" class="role-col" :class="{ 'role-col--locked': !role.editable }">
                  <div class="role-col-name">{{ role.label }}</div>
                  <div class="role-col-slug">{{ role.scope }}</div>
                  <a-button
                    v-if="canManage && role.editable && dirty.has(role.code)"
                    type="primary" size="small" class="role-save" :loading="saving === role.code" @click="save(role)"
                  >Сохранить</a-button>
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in matrix.groups" :key="group.area">
                <tr class="group-row"><td :colspan="matrix.roles.length + 1">{{ group.area }}</td></tr>
                <tr v-for="perm in group.permissions" :key="perm.code" class="perm-row">
                  <td class="perm-name">
                    <span class="perm-label">{{ perm.label }}</span>
                    <span class="perm-slug">{{ perm.code }}</span>
                  </td>
                  <td v-for="role in matrix.roles" :key="role.code" class="perm-cell" :class="{ 'has-perm': has(role, perm.code) }">
                    <a-checkbox
                      :checked="has(role, perm.code)"
                      :disabled="!canManage || !role.editable"
                      @change="toggle(role, perm.code)"
                    />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </a-spin>
      <p class="hint">
        Администратор всегда имеет все права — его колонка не редактируется. Роли <b>Клиент</b> и <b>Экспедитор</b> соответствуют типу аккаунта и назначаются автоматически.
      </p>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { permissionsApi, type PermissionMatrix, type RoleRow } from '@/api/permissions'

const auth = useAuthStore()
const canManage = computed(() => auth.hasPermission('roles.manage'))

const loading = ref(false)
const saving = ref<string | null>(null)
const matrix = ref<PermissionMatrix | null>(null)
// Локальные правки: role → Set(permissions). Сохраняются по кнопке у колонки.
const edits = reactive(new Map<string, Set<string>>())
const dirty = reactive(new Set<string>())

const load = async () => {
  loading.value = true
  try {
    matrix.value = await permissionsApi.matrix()
    edits.clear(); dirty.clear()
    for (const r of matrix.value.roles) edits.set(r.code, new Set(r.permissions))
  } catch {
    message.error('Не удалось загрузить матрицу прав')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const has = (role: RoleRow, perm: string) => edits.get(role.code)?.has(perm) ?? role.permissions.includes(perm)
const toggle = (role: RoleRow, perm: string) => {
  const set = edits.get(role.code) ?? new Set(role.permissions)
  if (set.has(perm)) set.delete(perm); else set.add(perm)
  edits.set(role.code, set)
  dirty.add(role.code)
}
const save = async (role: RoleRow) => {
  saving.value = role.code
  try {
    await permissionsApi.updateRole(role.code, [...(edits.get(role.code) ?? [])])
    dirty.delete(role.code)
    message.success(`Права роли «${role.label}» сохранены. Сотрудникам нужно перезайти.`)
  } catch {
    message.error('Не удалось сохранить')
  } finally {
    saving.value = null
  }
}
const resetAll = async () => {
  try { await permissionsApi.reset(); message.success('Матрица сброшена к дефолту'); await load() } catch { message.error('Не удалось сбросить') }
}
</script>

<style scoped>
.roles-view { display: flex; flex-direction: column; gap: 18px; }
.matrix-wrapper { overflow-x: auto; }
.perm-matrix { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 900px; }
.perm-matrix th, .perm-matrix td { padding: 8px 10px; border-bottom: 1px solid var(--z-line-2, #eff2f8); }
.perm-col { text-align: left; min-width: 260px; }
.role-col { text-align: center; min-width: 120px; vertical-align: top; }
.role-col--locked { opacity: .7; }
.role-col-name { font-weight: 700; color: var(--atg-ink, #182640); font-size: 13px; }
.role-col-slug { font-size: 11px; color: var(--atg-muted, #95a1b7); margin-top: 2px; }
.role-save { margin-top: 6px; }
.group-row td { background: var(--atg-surface-muted, #f5f7fb); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--atg-muted, #6b7891); }
.perm-name { display: flex; flex-direction: column; }
.perm-label { font-size: 13px; color: var(--atg-ink, #182640); }
.perm-slug { font-size: 11px; color: var(--atg-muted, #95a1b7); font-family: ui-monospace, monospace; }
.perm-cell { text-align: center; }
.perm-cell.has-perm { background: rgba(43, 188, 212, 0.06); }
.hint { margin: 14px 0 0; font-size: 12.5px; color: var(--atg-muted, #6b7891); }
</style>
