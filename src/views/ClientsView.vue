<template>
  <div class="clients-view crm-page">
    <PageHeader
      :kicker="t('admin.klientskiyPortfel')"
      :title="t('admin.klienty')"
      :subtitle="t('admin.vseKlientyStatusAkkaunta')"
    >
      <template #actions>
        <a-button v-if="canInvite" type="primary" @click="openInvite"><UserAddOutlined /> {{ t('admin.priglasitKlienta') }}</a-button>
        <a-button :disabled="!filtered.length" @click="exportXlsx"><DownloadOutlined /> Excel</a-button>
        <a-button :loading="loading" @click="load">{{ t('admin.obnovit') }}</a-button>
        <span v-if="!loading" class="crm-stat-badge">
          <SolutionOutlined /> {{ t('admin.vsegoNbsp') }}<span class="crm-stat-badge-count">{{ clients.length }}</span>
        </span>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <div class="filters">
        <a-input v-model:value="search" allow-clear :placeholder="t('admin.poiskPoKompaniiEmail')" style="max-width: 320px">
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
        :custom-row="(r: ClientOnboardingRow) => ({ onClick: () => router.push(`/clients/${r.id}`), style: 'cursor:pointer' })"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'company'">
            <div class="client-name-cell">
              <div class="client-avatar">{{ getInitial(record.companyName || record.username) }}</div>
              <div>
                <div class="client-company">{{ record.companyName || '—' }}</div>
                <div class="client-sub">{{ record.email || record.username }}<span v-if="record.bin"> · {{ t('admin.bin') }} {{ record.bin }}</span></div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            <a-tag v-if="record.status === 'Invited' && record.inviteExpiresAtUtc" :color="isExpired(record.inviteExpiresAtUtc) ? 'error' : 'default'">
              {{ isExpired(record.inviteExpiresAtUtc) ? t('admin.ssylkaIstekla') : t('admin.doDate', { date: fmtDate(record.inviteExpiresAtUtc) }) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'docs'">
            <a class="docs-cell" @click.stop="openDocs(record)">
              <a-tag :color="record.hasContract ? 'success' : 'default'">{{ t('admin.dogovor') }}</a-tag>
              <a-tag :color="record.hasPoa ? 'success' : 'default'">{{ t('admin.doverennost') }}</a-tag>
            </a>
          </template>
          <template v-else-if="column.key === 'created'">
            {{ fmtDate(record.createdAtUtc) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click.stop="openDocs(record)"><FileTextOutlined /> {{ t('admin.dokumenty') }}</a-button>
              <a-button v-if="canInvite && record.status === 'Invited'" size="small" @click.stop="reissue(record)">{{ t('admin.novayaSsylka') }}</a-button>
              <a-popconfirm v-if="canManage && record.status !== 'Blocked'" @click.stop :title="t('admin.zablokirovatKlientaOnNe')" :ok-text="t('admin.zablokirovat')" :cancel-text="t('admin.otmena')" @confirm="block(record)">
                <a-button size="small" danger>{{ t('admin.zablokirovat') }}</a-button>
              </a-popconfirm>
              <a-button v-if="canManage && record.status === 'Blocked'" size="small" @click.stop="unblock(record)">{{ t('admin.razblokirovat') }}</a-button>
            </a-space>
          </template>
        </template>
        <template #emptyText><a-empty :description="t('admin.klientovPokaNet')" /></template>
      </a-table>
    </a-card>

    <!-- Документы клиента: сгенерированный бланк + подписанные файлы обеих сторон -->
    <a-drawer
      v-model:open="docsOpen"
      :title="t('admin.dokumentyKlienta', { name: docsClient?.companyName || docsClient?.username || '' })"
      width="640"
    >
      <a-spin :spinning="docsLoading">
        <a-empty v-if="!docsLoading && !docs.length" :description="t('admin.uKlientaPokaNetDokumentov')" />
        <div v-for="doc in docs" :key="doc.id" class="doc-card">
          <div class="doc-head">
            <div>
              <div class="doc-title">{{ doc.kind === 'contract' ? t('admin.dogovor') : t('admin.doverennost') }} № {{ doc.number }}/{{ doc.year }}</div>
              <div class="doc-sub">{{ t('admin.sformirovanDate', { date: fmtDate(doc.generatedAtUtc) }) }}</div>
            </div>
            <div>
              <a-tag :color="docStatusColor(doc.status)">{{ docStatusLabel(doc.status) }}</a-tag>
              <a-tag v-if="doc.validUntilUtc" :color="isExpired(doc.validUntilUtc) ? 'error' : 'default'">
                {{ t('admin.doDate', { date: fmtDate(doc.validUntilUtc) }) }}
              </a-tag>
              <a-tag v-if="doc.isSingleUse" color="purple">{{ t('admin.razovyy') }}</a-tag>
            </div>
          </div>

          <div class="doc-signs">
            <a-tag :color="doc.clientSigned ? 'success' : 'default'">
              {{ t('admin.podpisKlienta') }}: {{ doc.clientSigned ? fmtDate(doc.clientSignedAtUtc) + ' · ' + signMethodLabel(doc.clientSignMethod) : t('admin.netPodpisi') }}
            </a-tag>
            <a-tag v-if="doc.kind === 'contract'" :color="doc.providerSigned ? 'success' : 'default'">
              {{ t('admin.podpisBrokera') }}: {{ doc.providerSigned ? fmtDate(doc.providerSignedAtUtc) + ' · ' + signMethodLabel(doc.providerSignMethod) : t('admin.netPodpisi') }}
            </a-tag>
          </div>

          <a-space wrap>
            <a-button size="small" @click="downloadBlank(doc)"><DownloadOutlined /> {{ t('admin.skachatBlank') }}</a-button>
            <a-button
              v-for="f in doc.files" :key="f.id" size="small" type="link"
              @click="downloadSigned(doc, f)"
            >
              <PaperClipOutlined /> {{ f.originalFileName }}
            </a-button>
            <span v-if="!doc.files.length" class="doc-sub">{{ t('admin.podpisannyhFaylovNet') }}</span>
          </a-space>
        </div>
      </a-spin>
    </a-drawer>

    <!-- Приглашение -->
    <a-modal v-model:open="inviteOpen" :title="t('admin.priglasitKlienta')" :footer="null" :width="520" @cancel="resetInvite">
      <template v-if="!inviteResult">
        <p class="hint">{{ t('admin.klientPoluchitSsylkuPo') }}</p>
        <a-form layout="vertical">
          <a-form-item :label="t('admin.emailKlienta')" required>
            <a-input v-model:value="invite.email" placeholder="client@company.kz" />
          </a-form-item>
          <a-form-item :label="t('admin.bin')" required>
            <div class="bin-row">
              <a-input v-model:value="invite.bin" placeholder="12 цифр" :maxlength="12" />
              <BinLookupButton :bin="invite.bin" size="middle" @found="(c) => { invite.companyName = c.nameRu ?? c.nameKz ?? invite.companyName }" />
            </div>
          </a-form-item>
          <a-form-item :label="t('admin.naimenovanieKompanii')">
            <a-input v-model:value="invite.companyName" placeholder="ТОО «…»" />
          </a-form-item>
          <a-form-item :label="t('admin.telefon')">
            <PhoneInput v-model:value="invite.phone" />
          </a-form-item>
          <a-button type="primary" :loading="inviting" :disabled="!invite.email || invite.bin.replace(/\D/g, '').length !== 12" @click="sendInvite"> {{ t('admin.sozdatPriglashenie') }} </a-button>
        </a-form>
      </template>
      <template v-else>
        <a-alert type="success" show-icon :message="inviteResult.reissued ? t('admin.ssylkaPerevypuschena') : t('admin.priglashenieSozdano')"
          :description="t('admin.skopiruyteSsylkuIOtpravte')" />
        <div class="invite-link">
          <a-input :value="inviteUrl" readonly />
          <a-button type="primary" @click="copyLink"><CopyOutlined /> {{ t('admin.skopirovat') }}</a-button>
        </div>
        <a-button type="link" @click="resetInvite">{{ t('admin.priglasitEsche') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  SolutionOutlined, SearchOutlined, UserAddOutlined, CopyOutlined,
  FileTextOutlined, DownloadOutlined, PaperClipOutlined,
} from '@ant-design/icons-vue'
import * as XLSX from 'xlsx'
import PageHeader from '@/components/PageHeader.vue'
import BinLookupButton from '@/components/BinLookupButton.vue'
import { useAuthStore } from '@/stores/auth'
import { clientsOnboardingApi, type ClientOnboardingRow, type ClientStatus, type InviteClientResponse } from '@/api/clientsOnboarding'
import { import40ContractApi, type Import40DocumentDto, type Import40DocumentFileDto } from '@/api/import40Contract'
import PhoneInput from '@/components/ui/PhoneInput.vue'

const { t } = useI18n()

const router = useRouter()
const authStore = useAuthStore()
const canInvite = computed(() => authStore.hasPermission('clients.invite'))
const canManage = computed(() => authStore.hasPermission('clients.manage'))

const loading = ref(false)
const clients = ref<ClientOnboardingRow[]>([])

// ─── Документы клиента (для сотрудника): просмотр и скачивание ───
const docsOpen = ref(false)
const docsLoading = ref(false)
const docsClient = ref<ClientOnboardingRow | null>(null)
const docs = ref<Import40DocumentDto[]>([])

const openDocs = async (row: ClientOnboardingRow) => {
  docsClient.value = row
  docs.value = []
  docsOpen.value = true
  docsLoading.value = true
  try {
    docs.value = await import40ContractApi.listDocuments(row.id)
  } catch {
    message.error(t('admin.neUdalosZagruzitDokumenty'))
  } finally {
    docsLoading.value = false
  }
}

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// Бланк генерируется сервером по данным клиента на момент запроса (файл не хранится).
const downloadBlank = async (doc: Import40DocumentDto) => {
  if (!docsClient.value) return
  try {
    const blob = await import40ContractApi.downloadDocument(docsClient.value.id, doc.id)
    const prefix = doc.kind === 'contract' ? 'Договор' : 'Доверенность'
    saveBlob(blob, `${prefix}-${doc.number}-${doc.year}.docx`)
  } catch {
    message.error(t('admin.neUdalosSkachatDokument'))
  }
}

const downloadSigned = async (doc: Import40DocumentDto, file: Import40DocumentFileDto) => {
  if (!docsClient.value) return
  try {
    const blob = await import40ContractApi.downloadDocumentSignedFile(docsClient.value.id, doc.id, file.id)
    saveBlob(blob, file.originalFileName)
  } catch {
    message.error(t('admin.neUdalosSkachatDokument'))
  }
}

// Чем подписано: ЭЦП eGov, загруженный файл или отметка администратора.
const signMethodLabel = (method: string | null) =>
  method === 'egov' ? t('admin.ecpEgov')
    : method === 'upload' ? t('admin.zagruzhenFayl')
      : t('admin.otmetkaVSisteme')

// Выгрузка текущего (отфильтрованного) списка клиентов.
const exportXlsx = () => {
  const data = filtered.value.map((c) => ({
    [t('admin.klient')]: c.companyName || c.username,
    [t('admin.email')]: c.email || '',
    [t('admin.bin')]: c.bin || '',
    [t('clientCard.phone')]: c.phone || '',
    [t('admin.status')]: statusLabel(c.status),
    [t('admin.dogovor')]: c.hasContract ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('admin.doverennost')]: c.hasPoa ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('admin.sozdan')]: fmtDate(c.createdAtUtc),
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('admin.klienty'))
  XLSX.writeFile(wb, `clients_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const docStatusLabel = (status: number) =>
  status === 2 ? t('admin.deystvuet')
    : status === 1 ? t('admin.zhdetPodpisi')
      : status === 3 ? t('admin.istek')
        : status === 4 ? t('admin.otozvan')
          : t('admin.chernovik')

const docStatusColor = (status: number) =>
  status === 2 ? 'success' : status === 1 ? 'warning' : status === 4 ? 'error' : 'default'
const search = ref('')
const statusFilter = ref<'all' | ClientStatus | 'nodocs'>('all')
const statusFilterOptions = computed(() => ([

  { label: t('admin.vse'), value: 'all' },
  { label: t('admin.aktivnye'), value: 'Active' },
  { label: t('admin.priglasheny'), value: 'Invited' },
  { label: t('admin.bezDokumentov'), value: 'nodocs' },
  { label: t('admin.zablokirovany'), value: 'Blocked' },
]))
const columns = computed(() => ([

  { title: t('admin.klient'), key: 'company', width: 320 },
  { title: t('admin.status'), key: 'status', width: 220 },
  { title: t('admin.dokumenty'), key: 'docs', width: 200 },
  { title: t('admin.sozdan'), key: 'created', width: 110 },
  { title: '', key: 'actions', width: 260 },
]))
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

const statusLabel = (s: ClientStatus) => ({ Invited: t('admin.priglashen'), Active: t('admin.aktiven'), Blocked: t('admin.zablokirovan') })[s] ?? s
const statusColor = (s: ClientStatus) => ({ Invited: 'processing', Active: 'success', Blocked: 'error' })[s] ?? 'default'
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now()
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—')
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
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
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
  try { await navigator.clipboard.writeText(inviteUrl.value); message.success(t('admin.ssylkaSkopirovana')) } catch { message.warning(t('admin.skopiruyteSsylkuVruchnuyu')) }
}

const block = async (row: ClientOnboardingRow) => { await clientsOnboardingApi.block(row.id); message.success(t('admin.klientZablokirovan')); await load() }
const unblock = async (row: ClientOnboardingRow) => { await clientsOnboardingApi.unblock(row.id); message.success(t('admin.klientRazblokirovan')); await load() }
</script>

<style scoped>
.docs-cell { cursor: pointer; }
.doc-card {
  border: 1px solid var(--z-line, #e8ecf4);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.doc-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.doc-title { font-weight: 600; }
.doc-sub { font-size: 12px; color: var(--atg-muted, #95a1b7); }
.doc-signs { display: flex; gap: 6px; flex-wrap: wrap; }
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
