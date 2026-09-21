<template>
  <div class="clients-view crm-page">
    <PageHeader
      kicker="Клиентский портфель"
      title="Клиенты"
      subtitle="Все клиенты: статус аккаунта, подписанные документы, приглашения."
    >
      <template #actions>
        <a-button v-if="canInvite" type="primary" @click="openInvite"><UserAddOutlined /> Пригласить клиента</a-button>
        <a-button :loading="loading" @click="load">Обновить</a-button>
        <span v-if="!loading" class="crm-stat-badge">
          <SolutionOutlined />
          Всего:&nbsp;<span class="crm-stat-badge-count">{{ clients.length }}</span>
        </span>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters">
        <a-input v-model:value="search" allow-clear placeholder="Поиск по компании, email, БИН" style="max-width: 320px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-segmented v-model:value="statusFilter" :options="statusFilterOptions" />
      </div>

      <a-table
        :columns="columns"
        :data-source="filtered"
        :loading="loading"
        :pagination="filtered.length > 20 ? { showSizeChanger: false } : false"
        row-key="id"
        :scroll="{ x: 900 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'company'">
            <div class="client-name-cell">
              <div class="client-avatar">{{ getInitial(record.companyName || record.username) }}</div>
              <div>
                <div class="client-company">{{ record.companyName || '—' }}</div>
                <div class="client-sub">{{ record.email || record.username }}<span v-if="record.bin"> · БИН {{ record.bin }}</span></div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            <a-tag v-if="record.status === 'Invited' && record.inviteExpiresAtUtc" :color="isExpired(record.inviteExpiresAtUtc) ? 'error' : 'default'">
              {{ isExpired(record.inviteExpiresAtUtc) ? 'ссылка истекла' : 'до ' + fmtDate(record.inviteExpiresAtUtc) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'docs'">
            <a-tag :color="record.hasContract ? 'success' : 'default'">Договор</a-tag>
            <a-tag :color="record.hasPoa ? 'success' : 'default'">Доверенность</a-tag>
          </template>
          <template v-else-if="column.key === 'created'">
            {{ fmtDate(record.createdAtUtc) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button v-if="canInvite && record.status === 'Invited'" size="small" @click="reissue(record)">Новая ссылка</a-button>
              <a-popconfirm v-if="canManage && record.status !== 'Blocked'" title="Заблокировать клиента? Он не сможет войти." ok-text="Заблокировать" cancel-text="Отмена" @confirm="block(record)">
                <a-button size="small" danger>Заблокировать</a-button>
              </a-popconfirm>
              <a-button v-if="canManage && record.status === 'Blocked'" size="small" @click="unblock(record)">Разблокировать</a-button>
            </a-space>
          </template>
        </template>
        <template #emptyText><a-empty description="Клиентов пока нет" /></template>
      </a-table>
    </a-card>

    <!-- Приглашение -->
    <a-modal v-model:open="inviteOpen" title="Пригласить клиента" :footer="null" :width="520" @cancel="resetInvite">
      <template v-if="!inviteResult">
        <p class="hint">Клиент получит ссылку, по которой сам задаст пароль. Логином будет email.</p>
        <a-form layout="vertical">
          <a-form-item label="Email клиента" required>
            <a-input v-model:value="invite.email" placeholder="client@company.kz" />
          </a-form-item>
          <a-form-item label="БИН" required>
            <div class="bin-row">
              <a-input v-model:value="invite.bin" placeholder="12 цифр" :maxlength="12" />
              <BinLookupButton :bin="invite.bin" size="middle" @found="(c) => { invite.companyName = c.nameRu ?? c.nameKz ?? invite.companyName }" />
            </div>
          </a-form-item>
          <a-form-item label="Наименование компании">
            <a-input v-model:value="invite.companyName" placeholder="ТОО «…»" />
          </a-form-item>
          <a-form-item label="Телефон">
            <a-input v-model:value="invite.phone" placeholder="+7 700 000 00 00" />
          </a-form-item>
          <a-button type="primary" :loading="inviting" :disabled="!invite.email || invite.bin.replace(/\D/g, '').length !== 12" @click="sendInvite">
            Создать приглашение
          </a-button>
        </a-form>
      </template>
      <template v-else>
        <a-alert type="success" show-icon :message="inviteResult.reissued ? 'Ссылка перевыпущена' : 'Приглашение создано'"
          description="Скопируйте ссылку и отправьте клиенту (WhatsApp, почта). Действует 7 дней." />
        <div class="invite-link">
          <a-input :value="inviteUrl" readonly />
          <a-button type="primary" @click="copyLink"><CopyOutlined /> Скопировать</a-button>
        </div>
        <a-button type="link" @click="resetInvite">Пригласить ещё</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { SolutionOutlined, SearchOutlined, UserAddOutlined, CopyOutlined } from '@ant-design/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import BinLookupButton from '@/components/BinLookupButton.vue'
import { useAuthStore } from '@/stores/auth'
import { clientsOnboardingApi, type ClientOnboardingRow, type ClientStatus, type InviteClientResponse } from '@/api/clientsOnboarding'

const authStore = useAuthStore()
const canInvite = computed(() => authStore.hasPermission('clients.invite'))
const canManage = computed(() => authStore.hasPermission('clients.manage'))

const loading = ref(false)
const clients = ref<ClientOnboardingRow[]>([])
const search = ref('')
const statusFilter = ref<'all' | ClientStatus | 'nodocs'>('all')
const statusFilterOptions = [
  { label: 'Все', value: 'all' },
  { label: 'Активные', value: 'Active' },
  { label: 'Приглашены', value: 'Invited' },
  { label: 'Без документов', value: 'nodocs' },
  { label: 'Заблокированы', value: 'Blocked' },
]

const columns = [
  { title: 'Клиент', key: 'company', width: 320 },
  { title: 'Статус', key: 'status', width: 220 },
  { title: 'Документы', key: 'docs', width: 200 },
  { title: 'Создан', key: 'created', width: 110 },
  { title: '', key: 'actions', width: 260 },
]

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return clients.value.filter((c) => {
    if (statusFilter.value === 'nodocs') { if (c.hasContract && c.hasPoa) return false }
    else if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false
    if (!q) return true
    return [c.companyName, c.email, c.username, c.bin].join(' ').toLowerCase().includes(q)
  })
})

const load = async () => {
  loading.value = true
  try { clients.value = await clientsOnboardingApi.list() } finally { loading.value = false }
}
onMounted(load)

const statusLabel = (s: ClientStatus) => ({ Invited: 'Приглашён', Active: 'Активен', Blocked: 'Заблокирован' })[s] ?? s
const statusColor = (s: ClientStatus) => ({ Invited: 'processing', Active: 'success', Blocked: 'error' })[s] ?? 'default'
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now()
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU')
const getInitial = (name: string) => (name || '?').trim().charAt(0).toUpperCase()

// ── приглашение ──
const inviteOpen = ref(false)
const inviting = ref(false)
const invite = reactive({ email: '', bin: '', companyName: '', phone: '' })
const inviteResult = ref<InviteClientResponse | null>(null)
const inviteUrl = computed(() => (inviteResult.value ? `${window.location.origin}${inviteResult.value.invitePath}` : ''))

const openInvite = () => { resetInvite(); inviteOpen.value = true }
const resetInvite = () => { invite.email = ''; invite.bin = ''; invite.companyName = ''; invite.phone = ''; inviteResult.value = null }
const sendInvite = async () => {
  inviting.value = true
  try {
    inviteResult.value = await clientsOnboardingApi.invite({
      email: invite.email.trim(), bin: invite.bin.trim(), companyName: invite.companyName.trim() || null, phone: invite.phone.trim() || null,
    })
    void load()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    if (err.response?.data?.error) message.error(err.response.data.error)
  } finally {
    inviting.value = false
  }
}
const reissue = async (row: ClientOnboardingRow) => {
  invite.email = row.email ?? row.username; invite.bin = row.bin ?? ''; invite.companyName = row.companyName ?? ''; invite.phone = row.phone ?? ''
  inviteResult.value = null
  inviteOpen.value = true
  await sendInvite()
}
const copyLink = async () => {
  try { await navigator.clipboard.writeText(inviteUrl.value); message.success('Ссылка скопирована') } catch { message.warning('Скопируйте ссылку вручную') }
}

const block = async (row: ClientOnboardingRow) => { await clientsOnboardingApi.block(row.id); message.success('Клиент заблокирован'); await load() }
const unblock = async (row: ClientOnboardingRow) => { await clientsOnboardingApi.unblock(row.id); message.success('Клиент разблокирован'); await load() }
</script>

<style scoped>
.clients-view { display: flex; flex-direction: column; gap: 18px; }
.filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.client-name-cell { display: flex; align-items: center; gap: 10px; }
.client-avatar {
  width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto;
  background: var(--z-teal-soft, #e6f7fb); color: var(--atg-teal-dark, #149bb2); font-weight: 700;
}
.client-company { font-weight: 650; color: var(--atg-ink, #182640); }
.client-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.hint { margin: 0 0 12px; color: var(--atg-muted, #6b7891); font-size: 13px; }
.bin-row { display: flex; gap: 8px; align-items: center; }
.bin-row .ant-input { flex: 1; }
.invite-link { display: flex; gap: 8px; margin: 14px 0 6px; }
</style>
