<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhKey } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import { extractServerText } from '@/api/client'
import type { DeclarantProfileDto } from '@/api/declarantProfile'
import { permissionsApi } from '@/api/permissions'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/ui/confirm'
import { formatDateText } from '@/ui/date'
import { message } from '@/ui/message'
import { formatDay } from '@/views/broker/list'
import type { TeamMemberDto } from '@/types/api'
import MemberClients from './MemberClients.vue'
import TempPasswordDialog from './TempPasswordDialog.vue'
import { STAFF_ROLES, isAdminMember, memberName, orderRoles } from './team'
import { useTeamRoleLabels } from './useTeamRoleLabels'

// Панель сотрудника (редизайн, волна 5б, доска Team): роли, профиль декларанта, клиенты (МПП), доступ, удаление.
// Роли и клиенты сохраняются кнопкой «Сохранить» (роли — одним PUT); переключатель представителя, временный пароль
// и удаление — действия на месте. Несохранённое при закрытии — вопрос (canLeave: его же зовёт страница при смене строки).
// Ошибки сервера (403 «нельзя себе / администратора», 409 «последний администратор») показываются внутри панели.
const props = defineProps<{
  member: TeamMemberDto | null
  /** Все клиенты для привязки сотруднику (id и подпись). */
  clientOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  /** Попытка закрыть (после вопроса о несохранённом). */
  close: []
  /** Данные сотрудника изменились (список надо перечитать), панель остаётся. */
  changed: []
  /** Сохранено — перечитать список и закрыть. */
  saved: []
  /** Сотрудник удалён — перечитать список и закрыть. */
  deleted: []
}>()

const { t } = useI18n()
const auth = useAuthStore()
const { confirm } = useConfirm()
const { roleLabel, roleScope } = useTeamRoleLabels()

// Панель закрывается с анимацией: пока она уезжает, содержимое остаётся от последнего сотрудника.
const shown = ref<TeamMemberDto | null>(props.member)
watch(() => props.member, (m) => { if (m) shown.value = m })
const m = computed(() => shown.value)

const isAdmin = computed(() => (auth.role ?? '').trim().toLowerCase() === 'administrator')
const isSelf = computed(() => !!m.value && !!auth.userId && m.value.id === auth.userId)
const targetIsAdmin = computed(() => !!m.value && isAdminMember(m.value))

// ---- Роли ----
const catalog = ref<{ code: string; scope: string }[]>([])
let catalogLoaded = false
const loadCatalog = async () => {
  if (catalogLoaded) return
  try {
    const items = await permissionsApi.catalog({ silent: true })
    catalog.value = items.filter((r) => r.code !== 'client' && r.code !== 'expeditor').map((r) => ({ code: r.code, scope: r.scope }))
    catalogLoaded = true
  } catch { /* запасной список ролей */ }
}
const baseOrder = computed<string[]>(() => (catalog.value.length ? catalog.value.map((r) => r.code) : [...STAFF_ROLES]))
// Роли сотрудника, которых нет в каталоге, тоже показываем — иначе их нельзя ни увидеть, ни снять.
const roleOrder = computed<string[]>(() => [...baseOrder.value, ...(m.value?.businessRoles ?? []).filter((r) => !baseOrder.value.includes(r))])
const roleOptions = computed(() => roleOrder.value.map((code) => ({
  code,
  label: roleLabel(code),
  scope: roleScope(code, catalog.value.find((r) => r.code === code)?.scope ?? ''),
})))

const draftRoles = ref<string[]>([])
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
const rolesDirty = computed(() => !!m.value && !sameSet(draftRoles.value, m.value.businessRoles))
const rolesInvalid = computed(() => rolesDirty.value && !draftRoles.value.length)

// Почему флажки недоступны: нет права / себе (кроме администратора) / администратора меняет только администратор.
const rolesLock = computed<'right' | 'self' | 'admin' | null>(() => {
  if (!auth.hasPermission('users.assign_role')) return 'right'
  if (isSelf.value && !isAdmin.value) return 'self'
  if (targetIsAdmin.value && !isAdmin.value) return 'admin'
  return null
})
const toggleRole = (code: string, on: boolean) => {
  draftRoles.value = on ? [...draftRoles.value, code] : draftRoles.value.filter((r) => r !== code)
}

// ---- Профиль декларанта ----
const showProfile = computed(() => draftRoles.value.includes('declarant'))
const profile = ref<DeclarantProfileDto | null>(null)
const profileState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let profileFor: string | null = null
const loadProfile = async () => {
  const id = m.value?.id
  if (!id) return
  profileFor = id
  profileState.value = 'loading'
  try {
    const p = await usersApi.declarantProfile(id, { silent: true })
    if (profileFor !== id) return
    profile.value = p
    profileState.value = 'ready'
  } catch {
    if (profileFor !== id) return
    profileState.value = 'error'
  }
}
const poaLine = computed(() => {
  const p = profile.value
  if (!p?.powerOfAttorneyNumber && !p?.powerOfAttorneyValidUntil) return ''
  const num = p.powerOfAttorneyNumber ? `№ ${p.powerOfAttorneyNumber}` : ''
  const until = p.powerOfAttorneyValidUntil ? t('broker.settings.team.drawer.poaUntil', { date: formatDateText(p.powerOfAttorneyValidUntil) }) : ''
  return [num, until].filter(Boolean).join(' ')
})
const poa = ref(false)
const poaBusy = ref(false)
const setPoa = async (on: boolean) => {
  if (!m.value || poaBusy.value) return
  const prev = poa.value
  poa.value = on
  poaBusy.value = true
  serverError.value = ''
  try {
    await permissionsApi.setPoaRepresentative(m.value.id, on, { silent: true })
    message.success(t('broker.settings.team.drawer.poaSaved'))
    emit('changed')
  } catch (err) {
    poa.value = prev
    serverError.value = errText(err)
  } finally {
    poaBusy.value = false
  }
}

// ---- Клиенты (МПП / брокер) ----
// Сервер принимает привязку для любого сотрудника: брокер из таблицы Broker — PUT users/brokers/{id}, остальные (администратор,
// importer, продажи) — PUT users/staff/{id}/clients. Показываем блок брокеру и тому, у кого есть (или только что отмечена) роль МПП.
const showClients = computed(() => !!m.value && auth.hasPermission('clients.manage')
  && (draftRoles.value.includes('mpp') || (m.value.systemRole || '').toLowerCase() === 'broker'))
// Черновик — id клиентов; подписи считаются на месте из справочника (он мог прийти позже), иначе — логин из привязки.
const clientIds = ref<string[]>([])
const loginById = ref<Record<string, string>>({})
const clientsBase = ref<string[]>([])
const clients = computed(() => clientIds.value.map((id) => ({
  id,
  label: props.clientOptions.find((o) => o.value === id)?.label ?? loginById.value[id] ?? id,
})))
const clientsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let clientsFor: string | null = null
const loadClients = async () => {
  const mem = m.value
  if (!mem) return
  clientsFor = mem.id
  clientsState.value = 'loading'
  try {
    const rows = await usersApi.linkedClients(mem.id, mem.systemRole, { silent: true })
    if (clientsFor !== mem.id) return
    loginById.value = Object.fromEntries(rows.map((c) => [c.id, c.username]))
    clientIds.value = rows.map((c) => c.id)
    clientsBase.value = rows.map((c) => c.id)
    clientsState.value = 'ready'
  } catch {
    if (clientsFor !== mem.id) return
    clientsState.value = 'error'
  }
}
const clientsDirty = computed(() => showClients.value && clientsState.value === 'ready' && !sameSet(clientIds.value, clientsBase.value))

// ---- Состояние сотрудника: сброс при смене / появлении данных ----
const serverError = ref('')
const saving = ref(false)
const resetState = () => {
  draftRoles.value = [...(m.value?.businessRoles ?? [])]
  poa.value = !!m.value?.isPoaRepresentative
  serverError.value = ''
}
watch(() => props.member?.id, (id) => {
  // Панель закрыли: правки не переносим на следующее открытие (иначе «несохранённое» остаётся без панели).
  if (!id) {
    draftRoles.value = [...(shown.value?.businessRoles ?? [])]
    clientIds.value = [...clientsBase.value]
    serverError.value = ''
    return
  }
  profile.value = null; profileState.value = 'idle'; profileFor = null
  clientIds.value = []; loginById.value = {}; clientsBase.value = []; clientsState.value = 'idle'; clientsFor = null
  resetState()
  void loadCatalog()
}, { immediate: true })
// Список перечитали и роли на сервере другие — черновик ролей обновляем (правку клиентов это не трогает).
watch(() => props.member?.businessRoles.join(','), () => { if (props.member) draftRoles.value = [...props.member.businessRoles] })
watch(() => props.member?.isPoaRepresentative, (v) => { if (!poaBusy.value) poa.value = !!v })
watch([() => props.member?.id, showProfile], ([id, show]) => { if (id && show && profileFor !== id) void loadProfile() }, { immediate: true })
watch([() => props.member?.id, showClients], ([id, show]) => { if (id && show && clientsFor !== id) void loadClients() }, { immediate: true })

const dirty = computed(() => rolesDirty.value || clientsDirty.value)
const canSave = computed(() => dirty.value && !rolesInvalid.value && !saving.value && !(rolesDirty.value && !!rolesLock.value))

const errText = (err: unknown): string =>
  extractServerText((err as { response?: { data?: unknown } })?.response?.data) ?? t('broker.settings.team.drawer.failed')

const save = async () => {
  const mem = m.value
  if (!mem || !canSave.value) return
  saving.value = true
  serverError.value = ''
  let rolesSaved = false
  try {
    if (rolesDirty.value) {
      await permissionsApi.setUserRoles(mem.id, orderRoles(draftRoles.value, roleOrder.value), { silent: true })
      rolesSaved = true
    }
    if (clientsDirty.value) {
      const ids = [...clientIds.value]
      if ((mem.systemRole || '').toLowerCase() === 'broker') await usersApi.editBroker(mem.id, { username: null, clientIds: ids }, { silent: true })
      else await usersApi.editStaffClients(mem.id, { clientIds: ids }, { silent: true })
      clientsBase.value = ids
    }
  } catch (err) {
    serverError.value = errText(err)
    saving.value = false
    // Роли уже на сервере: перечитываем список, повторное сохранение повторит только неудавшееся.
    if (rolesSaved) emit('changed')
    return
  }
  saving.value = false
  message.success(t('broker.settings.team.drawer.saved'))
  emit('saved')
}

// ---- Закрытие с вопросом ----
const canLeave = async (): Promise<boolean> => {
  if (!props.member || !dirty.value) return true
  return confirm({
    title: t('broker.settings.team.drawer.unsavedTitle'),
    content: t('broker.settings.team.drawer.unsavedBody'),
    okText: t('broker.settings.team.drawer.discard'),
    cancelText: t('broker.settings.team.drawer.keepEditing'),
    danger: true,
  })
}
const requestClose = async () => { if (await canLeave()) emit('close') }
defineExpose({ canLeave })

// ---- Доступ: временный пароль (только администратор, не себе) ----
const canReset = computed(() => isAdmin.value && !isSelf.value)
const temp = ref<{ username: string; password: string } | null>(null)
const tempOpen = computed(() => !!temp.value)
const resetting = ref(false)
const resetPassword = async () => {
  const mem = m.value
  if (!mem || resetting.value) return
  const ok = await confirm({
    title: t('broker.settings.team.drawer.tempConfirmTitle', { name: memberName(mem) }),
    content: t('broker.settings.team.drawer.tempConfirmBody'),
    okText: t('broker.settings.team.drawer.tempIssue'),
    cancelText: t('admin.otmena'),
    danger: true,
  })
  if (!ok) return
  resetting.value = true
  serverError.value = ''
  try {
    const r = await usersApi.resetPassword(mem.id, { silent: true })
    temp.value = { username: r.username, password: r.temporaryPassword }
  } catch (err) {
    serverError.value = errText(err)
  } finally {
    resetting.value = false
  }
}

// ---- Удаление (users.delete, не себе; администратора — только администратор) ----
const canDelete = computed(() => auth.hasPermission('users.delete') && !isSelf.value && !(targetIsAdmin.value && !isAdmin.value))
const deleting = ref(false)
const remove = async () => {
  const mem = m.value
  if (!mem || deleting.value) return
  const ok = await confirm({
    title: t('broker.settings.team.drawer.deleteTitle', { name: memberName(mem) }),
    content: t('broker.settings.team.drawer.deleteBody'),
    okText: t('broker.settings.team.drawer.delete'),
    cancelText: t('admin.otmena'),
    danger: true,
  })
  if (!ok) return
  deleting.value = true
  serverError.value = ''
  try {
    await usersApi.deleteUser(mem.id, { silent: true })
    message.success(t('broker.settings.team.drawer.deleted'))
    emit('deleted')
  } catch (err) {
    serverError.value = errText(err)
  } finally {
    deleting.value = false
  }
}

// Пока идёт сохранение, удаление или выдача пароля, остальное в панели недоступно.
const busy = computed(() => saving.value || deleting.value || resetting.value)
const lockText = computed(() => (rolesLock.value ? t(`broker.settings.team.drawer.rolesLock.${rolesLock.value}`) : ''))
const sinceText = computed(() => (m.value ? `${m.value.username} · ${t('broker.settings.team.drawer.since', { date: formatDay(m.value.createdAtUtc) })}` : ''))
</script>

<template>
  <ZDrawer
    :open="!!member"
    :width="460"
    :aria-label="m ? memberName(m) : t('broker.settings.team.title')"
    data-member-drawer
    @update:open="(v: boolean) => { if (!v) void requestClose() }"
  >
    <template #title>
      <span v-if="m" class="flex min-w-0 items-center gap-3">
        <ZAvatar :name="memberName(m)" size="lg" class="shrink-0" />
        <span class="min-w-0">
          <span class="block truncate text-md font-semibold text-ink" data-drawer-name>{{ memberName(m) }}</span>
          <span class="block truncate text-xs font-normal text-muted" data-member-since>{{ sinceText }}</span>
        </span>
      </span>
    </template>

    <div v-if="m" class="flex flex-col gap-6 pb-2">
      <ZAlert v-if="serverError" type="error" show-icon :message="serverError" data-member-error />

      <section aria-labelledby="member-roles-h" data-member-roles>
        <h3 id="member-roles-h" class="m-0 mb-1 text-sm font-medium text-muted">{{ t('broker.settings.team.drawer.roles') }}</h3>
        <ZCheckbox
          v-for="r in roleOptions"
          :key="r.code"
          :checked="draftRoles.includes(r.code)"
          :disabled="!!rolesLock || busy"
          class="flex min-h-11 w-full items-start gap-2.5 border-b border-line py-2 last:border-b-0"
          :data-member-role="r.code"
          @update:checked="toggleRole(r.code, $event)"
        >
          <span class="block font-semibold text-ink">{{ r.label }}</span>
          <span v-if="r.scope" class="block text-xs font-normal text-muted">{{ r.scope }}</span>
        </ZCheckbox>
        <p v-if="rolesInvalid" role="alert" class="m-0 mt-2 text-xs text-danger" data-member-roles-error>{{ t('broker.settings.team.addModal.rolesRequired') }}</p>
        <p v-if="lockText" class="m-0 mt-2 text-sm text-ink-2" data-member-roles-lock>{{ lockText }}</p>
        <p class="m-0 mt-2 text-sm text-muted" data-member-roles-hint>{{ t('broker.settings.team.drawer.rolesHint') }}</p>
      </section>

      <section v-if="showProfile" aria-labelledby="member-profile-h" data-member-profile>
        <h3 id="member-profile-h" class="m-0 mb-2 text-sm font-medium text-muted">{{ t('broker.settings.team.drawer.profile') }}</h3>
        <ZSkeleton v-if="profileState === 'loading' || profileState === 'idle'" :lines="3" />
        <div v-else-if="profileState === 'error'" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-member-profile-error>
          <span class="min-w-0 flex-1">{{ t('broker.settings.team.drawer.profileError') }}</span>
          <ZButton size="sm" class="max-sm:h-11" data-member-profile-retry @click="loadProfile()">{{ t('broker.settings.team.retry') }}</ZButton>
        </div>
        <p v-else-if="!profile" class="m-0 text-sm text-ink-2" data-member-profile-empty>{{ t('broker.settings.team.drawer.profileEmpty') }}</p>
        <dl v-else class="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 text-sm">
          <dt class="border-b border-line py-2 text-muted">{{ t('broker.settings.team.drawer.iin') }}</dt>
          <dd class="m-0 border-b border-line py-2 font-mono text-ink" data-profile-iin>{{ profile.iin || '—' }}</dd>
          <dt class="border-b border-line py-2 text-muted">{{ t('broker.settings.team.drawer.poa') }}</dt>
          <dd class="m-0 border-b border-line py-2 text-ink" data-profile-poa>{{ poaLine || '—' }}</dd>
          <dt class="py-2 text-muted">{{ t('broker.settings.team.drawer.representative') }}</dt>
          <dd class="m-0 py-2">
            <ZSwitch
              :checked="poa"
              :disabled="!!rolesLock || poaBusy || busy"
              :aria-label="t('broker.settings.team.drawer.representativeLabel')"
              data-member-poa
              @update:checked="setPoa"
            >{{ t('broker.settings.team.drawer.representativeHint') }}</ZSwitch>
            <p v-if="lockText" class="m-0 mt-1.5 text-xs text-muted" data-member-poa-lock>{{ lockText }}</p>
          </dd>
        </dl>
      </section>

      <section v-if="showClients" aria-labelledby="member-clients-h" data-member-clients-section>
        <h3 id="member-clients-h" class="m-0 mb-2 text-sm font-medium text-muted">{{ t('broker.settings.team.drawer.clients') }}</h3>
        <MemberClients
          :value="clients"
          :disabled="busy"
          :options="clientOptions"
          :loading="clientsState === 'loading' || clientsState === 'idle'"
          :error="clientsState === 'error'"
          @update:value="clientIds = $event.map((c) => c.id)"
          @retry="loadClients()"
        />
      </section>

      <section v-if="canReset" aria-labelledby="member-access-h" data-member-access>
        <h3 id="member-access-h" class="m-0 mb-2 text-sm font-medium text-muted">{{ t('broker.settings.team.drawer.access') }}</h3>
        <ZButton block :loading="resetting" :disabled="busy" class="max-sm:h-11" data-member-reset @click="resetPassword">
          <template #icon><PhKey :size="16" aria-hidden="true" /></template>
          {{ t('broker.settings.team.drawer.tempIssue') }}
        </ZButton>
        <p class="m-0 mt-2 text-sm text-muted">{{ t('broker.settings.team.drawer.tempNote') }}</p>
      </section>
    </div>

    <template #footer>
      <ZButton v-if="canDelete" variant="danger-ghost" :loading="deleting" :disabled="busy" class="mr-auto max-sm:h-11" data-member-delete @click="remove">{{ t('broker.settings.team.drawer.delete') }}</ZButton>
      <ZButton :disabled="busy" class="max-sm:h-11" data-member-cancel @click="requestClose">{{ t('admin.otmena') }}</ZButton>
      <ZButton variant="primary" :loading="saving" :disabled="!canSave" class="max-sm:h-11" data-member-save @click="save">{{ t('broker.settings.team.drawer.save') }}</ZButton>
    </template>
  </ZDrawer>

  <TempPasswordDialog
    :open="tempOpen"
    :username="temp?.username ?? ''"
    :password="temp?.password ?? ''"
    @update:open="(v: boolean) => { if (!v) temp = null }"
  />
</template>
