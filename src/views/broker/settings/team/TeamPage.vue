<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { clientsOnboardingApi } from '@/api/clientsOnboarding'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { matchesQuery } from '@/views/broker/list'
import AddMemberModal from './AddMemberModal.vue'
import ClientsTab from './ClientsTab.vue'
import ExpeditorsTab from './ExpeditorsTab.vue'
import MemberDrawer from './MemberDrawer.vue'
import StaffTab from './StaffTab.vue'
import { ADMIN_FILTER, STAFF_ROLES, clientRowName, filterClients, filterTeam, mergeClients } from './team'
import { useTeamRoleLabels } from './useTeamRoleLabels'

// «Команда» раздела «Настройки» (редизайн, волна 5б, доска Team): сотрудники, клиенты и экспедиторы одной страницей.
// Три списка грузятся независимо (ошибка одного не трогает остальные); поиск и фильтр по роли считаются на месте.
// Выбранный сотрудник лежит в адресе (?member=<id>), строка подсвечена; справа — панель сотрудника (MemberDrawer).
// Смена строки и закрытие панели спрашивают про несохранённые правки (drawer.canLeave).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { roleLabel } = useTeamRoleLabels()

type Tab = 'staff' | 'clients' | 'expeditors'
const canAdd = computed(() => auth.hasPermission('users.write'))
// Компания и статус клиента есть только в онбординге (clients.read); справочник users.read их не отдаёт.
const canSeeOnboarding = computed(() => auth.hasPermission('clients.read'))

const team = useBlock(true, () => usersApi.team({ silent: true }))
const clients = useBlock(true, () => usersApi.getCatalogClients({ silent: true }))
const expeditors = useBlock(true, () => usersApi.getCatalogExpeditors({ silent: true }))
const onboarding = useBlock(canSeeOnboarding.value, () => clientsOnboardingApi.list({ silent: true }))
const reloadAll = () => Promise.all([team.load(), clients.load(), expeditors.load(), onboarding.load()])
onMounted(() => { void reloadAll() })

const memberParam = computed(() => {
  const m = route.query.member
  return typeof m === 'string' && m ? m : null
})
const tab = ref<Tab>('staff')
const query = ref('')
const role = ref<string | null>(null)

// ---- Строки ----
const staffAll = computed(() => team.data ?? [])
const staffRows = computed(() => filterTeam(staffAll.value, query.value, role.value))
const clientAll = computed(() => mergeClients(clients.data ?? [], onboarding.data))
const clientRows = computed(() => filterClients(clientAll.value, query.value))
const expeditorAll = computed(() => expeditors.data ?? [])
const expeditorRows = computed(() => expeditorAll.value.filter((e) => matchesQuery(query.value, [e.username])))

// Счётчики на вкладках — по найденному (поиск учтён): видно, где совпадения. Пока список не загрузился — без цифры.
const q = computed(() => query.value.trim())
const counts = computed(() => ({
  staff: team.data ? filterTeam(staffAll.value, query.value, null).length : undefined,
  clients: clients.data ? clientRows.value.length : undefined,
  expeditors: expeditors.data ? expeditorRows.value.length : undefined,
}))
const tabOptions = computed(() => (['staff', 'clients', 'expeditors'] as const).map((k) => ({
  value: k,
  label: t(`broker.settings.team.tab.${k}`),
  count: counts.value[k],
})))

const roleOptions = computed(() => [
  ...STAFF_ROLES.map((r) => ({ value: r, label: roleLabel(r) })),
  { value: ADMIN_FILTER, label: roleLabel(ADMIN_FILTER) },
])
const filteredStaff = computed(() => !!q.value || !!role.value)
const filteredClients = computed(() => !!q.value)
const searchPlaceholder = computed(() => t(tab.value === 'clients' ? 'broker.settings.team.searchClients' : 'broker.settings.team.search'))
const resetFilters = () => { query.value = ''; role.value = null }

// ---- Выбранный сотрудник (?member=) ----
const selected = computed(() => staffAll.value.find((m) => m.id === memberParam.value) ?? null)
const setMember = async (id: string | null) => {
  const next = { ...route.query }
  if (id) next.member = id
  else delete next.member
  await router.replace({ query: next })
}
const drawer = ref<InstanceType<typeof MemberDrawer> | null>(null)
const leaveOk = async () => (await drawer.value?.canLeave()) ?? true
const selectMember = async (id: string) => {
  if (!(await leaveOk())) return
  await setMember(id === memberParam.value ? null : id)
}
const closeMember = () => { void setMember(null) }
const onMemberSaved = async () => { await team.load(); closeMember() }
// С несохранёнными правками в панели смену вкладки подтверждают (тот же вопрос, что при закрытии панели).
const switchTab = async (v: Tab) => {
  if (v === tab.value) return
  if (tab.value === 'staff' && !(await leaveOk())) return
  tab.value = v
}
// Вкладка клиентов или экспедиторов — выбранного сотрудника нет: адрес чистим.
watch(tab, (v) => { if (v !== 'staff' && memberParam.value) closeMember() })

// ---- Добавление ----
const addOpen = ref(false)
const onCreated = async (m: { id: string | null; username: string }) => {
  await team.load()
  tab.value = 'staff'
  query.value = ''
  role.value = null
  const id = m.id ?? team.data?.find((x) => x.username.toLowerCase() === m.username.toLowerCase())?.id ?? null
  if (id) await setMember(id)
}

const clientOptions = computed(() => clientAll.value.map((c) => ({ value: c.id, label: clientRowName(c) })))
const refreshing = computed(() => (team.loading && !!team.data) || (clients.loading && !!clients.data) || (expeditors.loading && !!expeditors.data))
defineExpose({ selected, closeMember })
</script>

<template>
  <div class="flex flex-col gap-4" data-team>
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div class="min-w-0">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.settings.team.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted" data-team-hint>{{ t('broker.settings.team.hint') }}</p>
      </div>
      <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="refreshing" class="max-sm:h-11 max-sm:flex-1" data-team-refresh @click="reloadAll()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.settings.team.refresh') }}
        </ZButton>
        <ZButton v-if="canAdd" variant="primary" class="max-sm:h-11 max-sm:flex-1" data-team-add @click="addOpen = true">
          <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
          {{ t('broker.settings.team.add') }}
        </ZButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ZSegmented
        :value="tab"
        :options="tabOptions"
        :aria-label="t('broker.settings.team.tabsLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-team-tabs
        @update:value="switchTab($event as Tab)"
      />
      <ListSearch :value="query" :placeholder="searchPlaceholder" @update:value="query = $event" />
      <FilterChip
        v-if="tab === 'staff'"
        :label="t('broker.settings.team.roleFilter')"
        :options="roleOptions"
        :value="role"
        :all-label="t('broker.settings.team.roleAll')"
        data-team-role-filter
        @update:value="role = $event"
      />
    </div>

    <StaffTab
      v-if="tab === 'staff'"
      :rows="staffRows"
      :loading="team.loading"
      :error="team.error"
      :filtered="filteredStaff"
      :can-add="canAdd"
      :selected-id="selected?.id ?? null"
      @select="selectMember"
      @retry="team.load()"
      @reset="resetFilters"
      @add="addOpen = true"
    />
    <ClientsTab
      v-else-if="tab === 'clients'"
      :rows="clientRows"
      :loading="clients.loading"
      :error="clients.error"
      :filtered="filteredClients"
      :with-status="!!onboarding.data"
      @retry="clients.load()"
      @reset="resetFilters"
    />
    <ExpeditorsTab
      v-else
      :rows="expeditorRows"
      :loading="expeditors.loading"
      :error="expeditors.error"
      :filtered="filteredClients"
      :client-options="clientOptions"
      @retry="expeditors.load()"
      @reset="resetFilters"
      @saved="expeditors.load()"
    />

    <MemberDrawer
      ref="drawer"
      :member="selected"
      :client-options="clientOptions"
      @close="closeMember"
      @changed="team.load()"
      @saved="onMemberSaved"
      @deleted="onMemberSaved"
    />
    <AddMemberModal v-if="canAdd" v-model:open="addOpen" @created="onCreated" />
  </div>
</template>
