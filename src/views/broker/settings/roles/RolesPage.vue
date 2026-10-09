<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhArrowCounterClockwise, PhLock } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { extractServerText } from '@/api/client'
import { permissionsApi, type RoleRow } from '@/api/permissions'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import { useTeamRoleLabels } from '@/views/broker/settings/team/useTeamRoleLabels'
import {
  ADMIN_ROLE, cellLock, changedRoles, diffMatrix, groupKey, isAdminRole, isChecked, orderedPermissions, permissionKey,
  pluralCategory, setCell, toDraft, visibleRoles, type Change, type Draft, type Lock,
} from './matrix'

// «Роли и права» раздела «Настройки» (редизайн, волна 5б, доска Roles): матрица «право × роль» с флажками.
// Правки копятся в черновике и уходят вместе: панель внизу «N изменений · Отменить · Сохранить», по одной роли за запрос
// (PUT system/permissions/{role}). Недоступные ячейки (нет roles.manage, своя роль, права «Администрирования», столбец
// администратора) сверены с серверными правилами; причина — в title ячейки. Права действуют после следующего входа.
const { t, te, locale } = useI18n()
const auth = useAuthStore()
const { confirm } = useConfirm()
const { roleLabel, roleScope } = useTeamRoleLabels()

const canManage = computed(() => auth.hasPermission('roles.manage'))
const isAdmin = computed(() => (auth.role || '').trim().toLowerCase() === ADMIN_ROLE)

const matrix = useBlock(true, () => permissionsApi.matrix({ silent: true }))
// Сохранённое состояние (после каждой удачной роли обновляется) и черновик правок.
const saved = shallowRef<RoleRow[]>([])
const draft = ref<Draft>({})
const saving = ref(false)
const saveError = ref<string | null>(null)
watch(() => matrix.data, (d) => {
  saved.value = d?.roles ?? []
  draft.value = toDraft(saved.value)
  saveError.value = null
}, { immediate: true })
onMounted(() => { void matrix.load() })

const groups = computed(() => matrix.data?.groups ?? [])
const roles = computed(() => visibleRoles(saved.value))
// Править можно только роли сотрудников; столбец «Админ» — только показ.
const editableCodes = computed(() => roles.value.filter((r) => !isAdminRole(r.code)).map((r) => r.code))
const changes = computed<Change[]>(() => diffMatrix(saved.value, groups.value, draft.value, editableCodes.value))
const dirty = computed(() => changes.value.length > 0)
const changeKeys = computed(() => new Set(changes.value.map((c) => `${c.role}|${c.permission}`)))

// ---- Подписи ----
const columnLabel = (r: RoleRow) => (isAdminRole(r.code) ? t('broker.settings.roles.colAdmin') : roleLabel(r.code))
const permissionLabel = (code: string, fallback = ''): string => {
  const key = `enum.permission.${permissionKey(code)}`
  return te(key) ? t(key) : (fallback || code)
}
const groupLabel = (area: string): string => {
  const k = groupKey(area)
  return k && te(`enum.permissionGroup.${k}`) ? t(`enum.permissionGroup.${k}`) : area
}
const roleByCode = (code: string) => saved.value.find((r) => r.code === code)
const describe = (c: Change): string => t(`broker.settings.roles.bar.${c.added ? 'add' : 'remove'}`, {
  role: roleByCode(c.role) ? columnLabel(roleByCode(c.role)!) : c.role,
  permission: permissionLabel(c.permission, groups.value.flatMap((g) => g.permissions).find((p) => p.code === c.permission)?.label),
})
const barText = computed(() => {
  const n = changes.value.length
  if (!n) return ''
  return `${t(`broker.settings.roles.bar.${pluralCategory(n, locale.value)}`, { n })} · ${describe(changes.value[0])}`
})

// ---- Доступность ячеек ----
const lockCtx = computed(() => ({ canManage: canManage.value, isAdmin: isAdmin.value, ownRoles: auth.businessRoles }))
const lockOf = (role: RoleRow, permission: string): Lock | null => cellLock(lockCtx.value, role, permission)
const lockTitle = (role: RoleRow, permission: string): string | undefined => {
  const l = lockOf(role, permission)
  return l ? t(`broker.settings.roles.lock.${l}`) : undefined
}
const checked = (role: RoleRow, permission: string) => (isAdminRole(role.code) ? true : isChecked(draft.value, role.code, permission))
const onToggle = (role: RoleRow, permission: string, on: boolean) => {
  if (lockOf(role, permission) || saving.value) return
  draft.value = setCell(draft.value, role.code, permission, on)
}

// ---- Действия ----
const reasonOf = (e: unknown) =>
  extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? t('broker.settings.roles.saveFailed')

const cancel = () => { draft.value = toDraft(saved.value); saveError.value = null }

async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true
  saveError.value = null
  const todo = changedRoles(changes.value, editableCodes.value)
  let done = 0
  let failed: { role: string; reason: string } | null = null
  for (const code of todo) {
    try {
      await permissionsApi.updateRole(code, orderedPermissions(draft.value, code, groups.value), { silent: true })
      const perms = orderedPermissions(draft.value, code, groups.value)
      saved.value = saved.value.map((r) => (r.code === code ? { ...r, permissions: perms } : r))
      done++
    } catch (e) {
      failed ??= { role: code, reason: reasonOf(e) }
    }
  }
  saving.value = false
  if (failed) {
    const r = roleByCode(failed.role)
    saveError.value = done
      ? t('broker.settings.roles.savePartial', { done, total: todo.length, role: r ? columnLabel(r) : failed.role, reason: failed.reason })
      : failed.reason
    return
  }
  message.success(t('broker.settings.roles.saved'))
}

const refresh = async () => {
  if (dirty.value && !(await confirm({
    title: t('broker.settings.roles.discard.title'),
    content: t('broker.settings.roles.discard.text'),
    okText: t('broker.settings.roles.discard.ok'),
    cancelText: t('broker.settings.roles.discard.cancel'),
    danger: true,
  }))) return
  await matrix.load()
}

const resetting = ref(false)
async function resetDefaults() {
  const ok = await confirm({
    title: t('broker.settings.roles.resetConfirm.title'),
    content: t('broker.settings.roles.resetConfirm.text'),
    okText: t('broker.settings.roles.resetConfirm.ok'),
    cancelText: t('broker.settings.roles.resetConfirm.cancel'),
    danger: true,
  })
  if (!ok) return
  resetting.value = true
  saveError.value = null
  try {
    await permissionsApi.reset({ silent: true })
    await matrix.load()
    message.success(t('broker.settings.roles.resetDone'))
  } catch (e) {
    saveError.value = reasonOf(e)
  } finally {
    resetting.value = false
  }
}

// ---- Защита правок ----
const askLeave = () => confirm({
  title: t('broker.settings.roles.leave.title'),
  content: t('broker.settings.roles.leave.text'),
  okText: t('broker.settings.roles.leave.leave'),
  cancelText: t('broker.settings.roles.leave.stay'),
  danger: true,
})
onBeforeRouteLeave(() => (dirty.value ? askLeave() : true))
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const refreshing = computed(() => matrix.loading && !!matrix.data)
const showSkeleton = computed(() => matrix.loading && !matrix.data)
const showError = computed(() => matrix.error && !matrix.data && !matrix.loading)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 overflow-x-clip" data-roles>
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div class="min-w-0">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.settings.roles.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted" data-roles-hint>{{ t('broker.settings.roles.hint') }}</p>
      </div>
      <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="refreshing" :disabled="saving || resetting" class="max-sm:h-11 max-sm:flex-1" data-roles-refresh @click="refresh()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.settings.roles.refresh') }}
        </ZButton>
        <ZButton v-if="canManage" variant="ghost" :loading="resetting" :disabled="saving || !matrix.data" class="max-sm:h-11 max-sm:flex-1" data-roles-reset @click="resetDefaults()">
          <template #icon><PhArrowCounterClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.settings.roles.reset') }}
        </ZButton>
      </div>
    </div>

    <p v-if="saveError" role="alert" class="m-0 rounded-panel bg-tone-danger-bg px-4 py-3 text-sm text-tone-danger-fg [overflow-wrap:anywhere]" data-roles-error>{{ saveError }}</p>

    <div v-if="showError" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-roles-load-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.roles.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-roles-retry @click="matrix.load()">{{ t('broker.settings.roles.retry') }}</ZButton>
    </div>
    <div v-else-if="showSkeleton" class="rounded-panel border border-line bg-surface p-5" data-roles-skeleton>
      <ZSkeleton :lines="8" height="18px" />
    </div>
    <div v-else-if="!groups.length" class="rounded-panel border border-line bg-surface" data-roles-empty>
      <ZEmpty :title="t('broker.settings.roles.empty')" />
    </div>
    <div
      v-else
      class="max-h-[calc(100dvh-15rem)] min-h-64 max-w-full overflow-auto overscroll-x-contain rounded-panel border border-line bg-surface"
      data-roles-frame
    >
      <table class="w-full min-w-[920px] border-separate border-spacing-0 text-sm" :aria-label="t('broker.settings.roles.tableLabel')" data-roles-table>
        <thead>
          <tr>
            <th scope="col" class="sticky top-0 left-0 z-[3] h-11 w-[280px] min-w-[220px] border-b border-line bg-surface px-4 text-left text-[12.5px] font-medium text-muted" data-roles-head-permission>
              {{ t('broker.settings.roles.colPermission') }}
            </th>
            <th
              v-for="r in roles"
              :key="r.code"
              scope="col"
              class="sticky top-0 z-[2] h-11 min-w-[104px] border-b border-line bg-surface px-2 text-center text-[12.5px] font-medium whitespace-nowrap text-ink-2"
              :title="roleScope(r.code, '') || undefined"
              :data-roles-head="r.code"
            >
              <span class="inline-flex items-center gap-1">
                {{ columnLabel(r) }}
                <PhLock v-if="isAdminRole(r.code)" :size="12" aria-hidden="true" class="text-muted" />
              </span>
            </th>
          </tr>
        </thead>
        <template v-for="g in groups" :key="g.area">
          <tbody :data-roles-group="groupKey(g.area) ?? g.area">
            <tr>
              <th
                scope="colgroup"
                class="sticky left-0 z-[1] border-b border-line bg-surface px-4 pt-4 pb-2 text-left text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase"
              >{{ groupLabel(g.area) }}</th>
              <td :colspan="roles.length" class="border-b border-line bg-surface" />
            </tr>
            <tr v-for="p in g.permissions" :key="p.code" :data-roles-row="p.code">
              <th scope="row" class="sticky left-0 z-[1] h-11 border-b border-line bg-surface px-4 text-left text-sm font-normal text-ink [overflow-wrap:anywhere]">
                {{ permissionLabel(p.code, p.label) }}
              </th>
              <td
                v-for="r in roles"
                :key="r.code"
                class="h-11 border-b border-line p-0 text-center"
                :class="changeKeys.has(`${r.code}|${p.code}`) ? 'bg-tone-info-bg' : 'bg-surface'"
                :title="lockTitle(r, p.code)"
                :data-roles-cell="`${r.code}|${p.code}`"
                :data-changed="changeKeys.has(`${r.code}|${p.code}`) ? '' : undefined"
              >
                <ZCheckbox
                  :checked="checked(r, p.code)"
                  :disabled="!!lockOf(r, p.code) || saving"
                  :aria-label="t('broker.settings.roles.cell', { permission: permissionLabel(p.code, p.label), role: columnLabel(r) })"
                  class="h-11 w-full min-w-11 justify-center"
                  @change="onToggle(r, p.code, $event)"
                />
              </td>
            </tr>
          </tbody>
        </template>
      </table>
    </div>

    <div
      v-if="dirty || saving"
      class="sticky bottom-0 z-[6] -mx-4 -mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-3 shadow-[0_-12px_24px_-18px_rgb(60_48_30/0.25)] lg:-mx-7 lg:-mb-6 lg:px-7"
      role="region"
      :aria-label="t('broker.settings.roles.bar.label')"
      data-roles-savebar
    >
      <span aria-hidden="true" class="size-2 shrink-0 rounded-pill bg-gold" />
      <span class="min-w-0 flex-1 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]" aria-live="polite" data-roles-bar-text>{{ barText }}</span>
      <div class="flex items-center gap-2 max-sm:w-full">
        <ZButton variant="ghost" :disabled="saving" class="max-sm:h-11 max-sm:flex-1" data-roles-cancel @click="cancel()">
          {{ t('broker.settings.roles.bar.cancel') }}
        </ZButton>
        <ZButton variant="primary" :loading="saving" :disabled="!dirty" class="max-sm:h-11 max-sm:flex-1" data-roles-save @click="save()">
          {{ t('broker.settings.roles.bar.save') }}
        </ZButton>
      </div>
    </div>
  </div>
</template>
