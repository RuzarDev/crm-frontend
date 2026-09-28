<template>
  <div class="doc-step">
    <div class="card-title"><FileProtectOutlined /> {{ title }}</div>

    <!-- Многоразовый договор у клиента один: пока он действует, второй такой же сервер
         не выпустит. Разовые (на одну заявку) можно формировать сколько нужно — поэтому
         форма остаётся доступной, просто «разовый» включён принудительно. -->
    <a-alert
      v-if="activeMulti"
      type="info"
      show-icon
      class="generate-blocked"
      :message="t('company.alreadyActive')"
      :description="isAdmin ? t('company.alreadyActiveAdmin') : t('company.alreadyActiveClient')"
    />

    <div class="generate-bar">
      <a-checkbox v-if="allowSingleUse" v-model:checked="singleUse" :disabled="activeMulti">{{ t('company.singleUse') }}</a-checkbox>
      <a-date-picker
        v-model:value="validUntil"
        format="DD.MM.YYYY"
        :placeholder="t('company.validUntilPlaceholder')"
        style="width: 200px"
      />
      <a-button type="primary" :disabled="!profileComplete" :loading="generating" @click="onGenerate">
        <FileAddOutlined /> {{ t('company.generate') }}
      </a-button>
    </div>

    <p v-if="!profileComplete" class="muted">{{ t('company.fillFirst') }}</p>

    <div v-if="!documents.length" class="doc-empty">
      <p class="muted">{{ emptyHint }}</p>
    </div>

    <div v-else class="doc-list">
      <div v-for="doc in documents" :key="doc.id" class="doc-card">
        <div class="doc-head">
          <div>
            <div class="doc-number">№ {{ doc.number }}/{{ doc.year }}</div>
            <div class="muted">{{ t('company.generatedAt', { date: formatDate(doc.generatedAtUtc) }) }}</div>
          </div>
          <div class="doc-tags">
            <a-tag v-if="isEffective(doc)" color="success">{{ t('company.effective') }}</a-tag>
            <a-tag :color="statusColor(doc)">{{ statusLabel(doc) }}</a-tag>
            <a-tag v-if="doc.isSingleUse" color="purple">{{ t('company.singleUseTag') }}{{ doc.consumedByCaseId ? ' · ' + t('company.consumed') : '' }}</a-tag>
            <a-tag v-if="doc.validUntilUtc" :color="isExpired(doc) ? 'error' : 'default'">
              {{ t('company.until', { date: formatDate(doc.validUntilUtc) }) }}
            </a-tag>
          </div>
        </div>

        <div class="doc-actions">
          <a-button size="small" @click="emit('download', doc)"><DownloadOutlined /> {{ t('company.download') }}</a-button>
          <a-popconfirm v-if="isAdmin && doc.status !== 4" :title="t('company.revokeConfirm')" :ok-text="t('company.revoke')" :cancel-text="t('common.cancel')" @confirm="emit('revoke', doc)">
            <a-button size="small" danger>{{ t('company.revoke') }}</a-button>
          </a-popconfirm>
        </div>

        <div class="sign-grid">
          <div class="sign-block">
            <div class="sign-head">
              <strong>{{ t('company.yourSignature') }}</strong>
              <a-tag v-if="doc.clientSigned" color="success">{{ t('company.signed') }}</a-tag>
              <a-tag v-else color="default">{{ t('company.pending') }}</a-tag>
            </div>
            <div v-if="!doc.clientSigned" class="sign-actions">
              <a-button size="small" type="primary" @click="emit('sigex', doc, 'client')">
                <SafetyCertificateOutlined /> {{ t('company.signEgov') }}
              </a-button>
              <a-button size="small" @click="emit('sign', doc, 'client')">
                <UploadOutlined /> {{ t('company.uploadSigned') }}
              </a-button>
            </div>
            <p v-if="!doc.clientSigned" class="muted sign-hint">{{ t('company.uploadSignedHint') }}</p>
          </div>

          <div v-if="providerSignature" class="sign-block">
            <div class="sign-head">
              <strong>{{ t('company.providerSignature') }}</strong>
              <a-tag v-if="doc.providerSigned" color="success">{{ t('company.signed') }}</a-tag>
              <a-tag v-else color="default">{{ t('company.pending') }}</a-tag>
            </div>
            <div v-if="(canSignProvider ?? isAdmin) && !doc.providerSigned" class="sign-actions">
              <a-button size="small" type="primary" @click="emit('sigex', doc, 'provider')">
                <SafetyCertificateOutlined /> {{ t('company.signEgov') }}
              </a-button>
              <a-button size="small" @click="emit('sign', doc, 'provider')">
                <UploadOutlined /> {{ t('company.uploadSigned') }}
              </a-button>
            </div>
            <p v-if="(canSignProvider ?? isAdmin) && !doc.providerSigned" class="muted sign-hint">{{ t('company.uploadSignedHint') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DownloadOutlined,
  FileAddOutlined,
  FileProtectOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue'
import type { Dayjs } from 'dayjs'
import type { Import40DocumentDto } from '@/api/import40Contract'

export interface GenerateOpts {
  isSingleUse: boolean
  validUntilUtc: string | null
}

const props = defineProps<{
  title: string
  profileComplete: boolean
  documents: Import40DocumentDto[]
  generating: boolean
  isAdmin: boolean
  emptyHint: string
  isEffective: (doc: Import40DocumentDto) => boolean
  /** Разовый вариант (на одну заявку) — только для доверенности; договор всегда многоразовый. */
  allowSingleUse?: boolean
  /** Нужна ли подпись брокера (договор — да, доверенность — односторонний документ клиента). */
  providerSignature?: boolean
  /** Может подписать за AQNIET: администратор или руководитель отдела (по умолчанию — isAdmin). */
  canSignProvider?: boolean
  /**
   * Второй действующий документ невозможен (правило сервера для договора: новый нельзя,
   * пока есть действующий или ожидающий подписей). Для доверенности — false: их может
   * быть несколько (в т.ч. разовые под отдельные заявки).
   */
  blockWhenActive?: boolean
}>()

const { t } = useI18n()

// Действует МНОГОРАЗОВЫЙ документ: второй такой же нельзя, но разовый — можно.
const activeMulti = computed(
  () => !!props.blockWhenActive && props.documents.some((d) => props.isEffective(d) && !d.isSingleUse),
)
const emit = defineEmits<{
  (e: 'generate', opts: GenerateOpts): void
  (e: 'download', doc: Import40DocumentDto): void
  (e: 'revoke', doc: Import40DocumentDto): void
  (e: 'sign', doc: Import40DocumentDto, side: 'client' | 'provider'): void
  (e: 'sigex', doc: Import40DocumentDto, side: 'client' | 'provider'): void
}>()

const singleUse = ref(false)
const validUntil = ref<Dayjs | null>(null)

// Пока действует многоразовый договор, доступен только разовый — включаем флажок сами.
watch(activeMulti, (v) => { if (v) singleUse.value = true }, { immediate: true })

const onGenerate = () => {
  emit('generate', {
    isSingleUse: singleUse.value,
    validUntilUtc: validUntil.value ? validUntil.value.endOf('day').toISOString() : null,
  })
}

const formatDate = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v))

const isExpired = (doc: Import40DocumentDto) => !!doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()

const statusLabel = (doc: Import40DocumentDto) =>
  doc.status === 2 ? t('company.stActive') : doc.status === 1 ? t('company.stAwaiting') : doc.status === 3 ? t('company.stExpired') : doc.status === 4 ? t('company.stRevoked') : t('company.stDraft')

const statusColor = (doc: Import40DocumentDto) =>
  doc.status === 2 ? 'success' : doc.status === 1 ? 'processing' : doc.status === 3 ? 'error' : doc.status === 4 ? 'error' : 'default'
</script>

<style scoped>
.doc-step { display: flex; flex-direction: column; gap: 14px; }
.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; font-size: 15px; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
.generate-blocked { margin-bottom: 12px; }
.generate-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 14px; border: 1px dashed var(--atg-line); border-radius: var(--atg-radius); }
.muted { color: var(--atg-muted); font-size: 13px; line-height: 1.55; margin: 0; }
.doc-empty { padding: 4px 0; }
.doc-list { display: flex; flex-direction: column; gap: 14px; }
.doc-card { border: 1px solid var(--atg-line); border-radius: var(--atg-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.doc-number { font-size: 16px; font-weight: 800; color: var(--atg-ink); }
.doc-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.doc-actions { display: flex; gap: 8px; }
.sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.sign-block { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); align-content: start; }
.sign-head { display: flex; align-items: center; gap: 10px; }
.sign-head strong { color: var(--atg-ink); font-size: 13px; font-weight: 800; }
.sign-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sign-hint { margin: 0; font-size: 12px; }
@media (max-width: 900px) {
  .sign-grid { grid-template-columns: 1fr; }
  .generate-bar { flex-direction: column; align-items: stretch; }
}
</style>
