<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { formatDay } from '@/views/broker/list'
import type { TeamMemberDto } from '@/types/api'
import type { ZColumn } from '@/ui/table'
import { isAdminMember, memberName } from './team'
import { useTeamRoleLabels } from './useTeamRoleLabels'

// Вкладка «Сотрудники»: строка — аватар-инициалы, имя и логин, роли чипами. Клик (или Enter на имени) выбирает
// сотрудника: родитель кладёт его в адрес (?member=) и открывает боковую панель; выбранная строка подсвечена.
const props = defineProps<{
  rows: TeamMemberDto[]
  loading: boolean
  error: boolean
  /** Список пуст из-за поиска или фильтра, а не сам по себе. */
  filtered: boolean
  canAdd: boolean
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string]; retry: []; reset: []; add: [] }>()

const { t } = useI18n()
const { roleLabel } = useTeamRoleLabels()

// До 640px строка — компактная: аватар · имя над логином, роли чипами под именем, без подписей полей («Сотрудник», «Роли»).
// Это классы колонок и таблицы поверх карточного режима ZTable (как у списка справочника): подписи скрыты, значения слева.
const MOBILE_CELL = 'max-sm:[&>[data-z-value]]:ml-0 max-sm:[&>[data-z-value]]:text-left'
const columns = computed<ZColumn<TeamMemberDto>[]>(() => [
  { key: 'member', title: t('broker.settings.team.col.member'), minWidth: 260, className: `${MOBILE_CELL} max-sm:pb-0` },
  // Чипы под именем: отступ = аватар (32px) + зазор (10px).
  { key: 'roles', title: t('broker.settings.team.col.roles'), minWidth: 260, className: `${MOBILE_CELL} max-sm:pt-0.5 max-sm:pl-[42px]` },
  { key: 'clients', title: t('broker.settings.team.col.clients'), width: 110, align: 'right', className: 'max-sm:hidden' },
  { key: 'since', title: t('broker.settings.team.col.since'), width: 130, align: 'right', className: 'max-sm:hidden' },
])

const customRow = (m: TeamMemberDto) => ({
  class: 'cursor-pointer',
  'data-member-row': m.id,
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    emit('select', m.id)
  },
})
const rowClass = (m: TeamMemberDto) => (m.id === props.selectedId ? 'bg-tone-info-bg' : '')
const emptyTitle = computed(() => (props.filtered ? t('broker.settings.team.nothing') : t('broker.settings.team.emptyStaff')))
</script>

<template>
  <div v-if="error && !rows.length && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-team-error>
    <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.team.loadError') }}</p>
    <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-team-retry @click="emit('retry')">{{ t('broker.settings.team.retry') }}</ZButton>
  </div>
  <ZTable
    v-else
    :columns="columns"
    :data-source="rows"
    row-key="id"
    :loading="loading"
    :custom-row="customRow"
    :row-class-name="rowClass"
    :pagination="{ pageSize: 25 }"
    :scroll="{ x: 640 }"
    :aria-label="t('broker.settings.team.tableStaff')"
    class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent max-sm:[&_[data-z-label]]:hidden"
    data-team-table="staff"
  >
    <template #bodyCell="{ column, record }">
      <button
        v-if="column.key === 'member'"
        type="button"
        class="flex min-w-0 max-w-full cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
        :aria-label="t('broker.settings.team.member', { name: memberName(record) })"
        :aria-pressed="record.id === selectedId"
        data-member-open
        @click="emit('select', record.id)"
      >
        <ZAvatar :name="memberName(record)" class="size-8" />
        <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 max-sm:flex-col max-sm:items-start max-sm:gap-x-0">
          <span class="truncate text-sm font-semibold text-ink" data-member-name>{{ memberName(record) }}</span>
          <span class="truncate font-mono text-xs text-muted" data-member-login>{{ record.username }}</span>
        </span>
      </button>
      <span v-else-if="column.key === 'roles'" class="flex flex-wrap gap-1" data-member-roles>
        <ZTag v-for="r in record.businessRoles" :key="r" size="sm" data-member-role>{{ roleLabel(r) }}</ZTag>
        <ZTag v-if="isAdminMember(record)" tone="submitted" size="sm" data-member-admin>{{ roleLabel('administrator') }}</ZTag>
      </span>
      <span v-else-if="column.key === 'clients'" class="text-sm tabular-nums text-ink-3">{{ record.clientCount || '—' }}</span>
      <span v-else-if="column.key === 'since'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ formatDay(record.createdAtUtc) }}</span>
    </template>
    <template #emptyText>
      <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.settings.team.nothingHint') : (canAdd ? t('broker.settings.team.emptyStaffHint') : undefined)">
        <template v-if="filtered || canAdd" #action>
          <ZButton v-if="filtered" data-team-reset @click="emit('reset')">{{ t('broker.settings.team.resetFilters') }}</ZButton>
          <ZButton v-else variant="primary" data-team-empty-add @click="emit('add')">{{ t('broker.settings.team.add') }}</ZButton>
        </template>
      </ZEmpty>
    </template>
  </ZTable>
</template>
