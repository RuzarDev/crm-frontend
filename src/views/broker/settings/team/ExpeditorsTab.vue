<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTable from '@/components/z/ZTable.vue'
import { usersApi } from '@/api/users'
import { extractServerText } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import type { CatalogExpeditorRow } from '@/types/api'
import type { ZColumn } from '@/ui/table'

// Вкладка «Экспедиторы»: логин, число клиентов; «Изменить» (clients.manage) — окно с логином и привязанными клиентами
// (PUT users/expeditors/{id}, поле clientsId — как у сервера). Ошибка сервера показывается в окне.
const props = defineProps<{
  rows: CatalogExpeditorRow[]
  loading: boolean
  error: boolean
  filtered: boolean
  /** Клиенты для выбора: подпись — компания или логин. Пусто, если справочник клиентов не загрузился. */
  clientOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{ retry: []; reset: []; saved: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const canEdit = computed(() => auth.hasPermission('clients.manage'))

const columns = computed<ZColumn<CatalogExpeditorRow>[]>(() => [
  { key: 'expeditor', title: t('broker.settings.team.col.expeditor'), minWidth: 220 },
  { key: 'clients', title: t('broker.settings.team.col.expeditorClients'), minWidth: 240 },
  ...(canEdit.value ? [{ key: 'actions', title: '', width: 120, align: 'right' } as ZColumn<CatalogExpeditorRow>] : []),
])

// ---- Окно «Изменить» ----
const open = ref(false)
const saving = ref(false)
const serverError = ref('')
const tried = ref(false)
const editing = ref<CatalogExpeditorRow | null>(null)
const draft = reactive({ username: '', clientIds: [] as string[] })

const openEdit = (e: CatalogExpeditorRow) => {
  editing.value = e
  draft.username = e.username
  draft.clientIds = e.clients.map((c) => c.id)
  serverError.value = ''
  tried.value = false
  open.value = true
}
const loginError = computed(() => (tried.value && !draft.username.trim() ? t('broker.settings.team.expeditor.loginRequired') : ''))

const save = async () => {
  if (saving.value || !editing.value) return
  tried.value = true
  const username = draft.username.trim()
  if (!username) return
  saving.value = true
  serverError.value = ''
  try {
    await usersApi.editExpeditor(editing.value.id, { username, clientsId: [...draft.clientIds] }, { silent: true })
    open.value = false
    message.success(t('admin.sohraneno'))
    emit('saved')
  } catch (err) {
    serverError.value = extractServerText((err as { response?: { data?: unknown } })?.response?.data) ?? t('errors.generic')
  } finally {
    saving.value = false
  }
}

const emptyTitle = computed(() => (props.filtered ? t('broker.settings.team.nothing') : t('broker.settings.team.emptyExpeditors')))
const clientNames = (e: CatalogExpeditorRow) => e.clients.map((c) => c.username).join(', ')
</script>

<template>
  <div v-if="error && !rows.length && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-team-error>
    <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.team.loadError') }}</p>
    <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-team-retry @click="emit('retry')">{{ t('broker.settings.team.retry') }}</ZButton>
  </div>
  <template v-else>
    <ZTable
      :columns="columns"
      :data-source="rows"
      row-key="id"
      :loading="loading"
      :pagination="{ pageSize: 25 }"
      :scroll="{ x: 560 }"
      :aria-label="t('broker.settings.team.tableExpeditors')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-team-table="expeditors"
    >
      <template #headerCell="{ column }">
        <span v-if="column.key === 'actions'" class="sr-only">{{ t('broker.settings.team.col.actions') }}</span>
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'expeditor'" class="flex min-w-0 items-center gap-2.5">
          <ZAvatar :name="record.username" class="size-8" />
          <span class="truncate font-mono text-sm font-semibold text-ink" data-expeditor-login>{{ record.username }}</span>
        </span>
        <span v-else-if="column.key === 'clients'" class="text-sm text-ink-3" data-expeditor-clients>
          <span class="font-semibold tabular-nums text-ink" data-expeditor-count>{{ record.clients.length }}</span>
          <template v-if="record.clients.length"> · <span class="break-words">{{ clientNames(record) }}</span></template>
        </span>
        <ZButton
          v-else-if="column.key === 'actions'"
          size="sm"
          class="max-sm:h-11 max-sm:px-4"
          :aria-label="t('broker.settings.team.editExpeditorFor', { name: record.username })"
          data-expeditor-edit
          @click="openEdit(record)"
        >{{ t('broker.settings.team.edit') }}</ZButton>
      </template>
      <template #emptyText>
        <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.settings.team.nothingHint') : undefined">
          <template v-if="filtered" #action>
            <ZButton data-team-reset @click="emit('reset')">{{ t('broker.settings.team.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>

    <ZModal
      v-model:open="open"
      :title="t('broker.settings.team.expeditor.title')"
      :width="520"
      :ok-text="t('broker.settings.team.expeditor.save')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="saving"
      data-expeditor-modal
      @ok="save"
    >
      <div class="flex flex-col gap-4 pb-2">
        <ZAlert v-if="serverError" type="error" show-icon :message="serverError" data-expeditor-error />
        <ZField :label="t('broker.settings.team.expeditor.login')" required :error="loginError">
          <ZInput :value="draft.username" autocomplete="off" class="max-sm:h-11" data-expeditor-username @update:value="draft.username = $event" @press-enter="save" />
        </ZField>
        <ZField :label="t('broker.settings.team.expeditor.clients')" :help="clientOptions.length ? undefined : t('broker.settings.team.expeditor.noClientList')">
          <ZSelect
            mode="multiple"
            :value="draft.clientIds"
            :options="clientOptions"
            :placeholder="t('broker.settings.team.expeditor.clientsPh')"
            class="max-sm:min-h-11"
            data-expeditor-clientsel
            @update:value="draft.clientIds = ($event as string[] | null) ?? []"
          />
        </ZField>
      </div>
    </ZModal>
  </template>
</template>
