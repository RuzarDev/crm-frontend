<template>
  <div class="doc-step">
    <div class="card-title"><FileProtectOutlined /> {{ title }}</div>

    <div class="generate-bar">
      <a-checkbox v-model:checked="singleUse">разовый (используется на одну заявку)</a-checkbox>
      <a-date-picker
        v-model:value="validUntil"
        format="DD.MM.YYYY"
        placeholder="действует до (необяз.)"
        style="width: 200px"
      />
      <a-button type="primary" :disabled="!profileComplete" :loading="generating" @click="onGenerate">
        <FileAddOutlined /> Сформировать
      </a-button>
    </div>

    <p v-if="!profileComplete" class="muted">Сначала заполните реквизиты компании (шаг 1).</p>

    <div v-if="!documents.length" class="doc-empty">
      <p class="muted">{{ emptyHint }}</p>
    </div>

    <div v-else class="doc-list">
      <div v-for="doc in documents" :key="doc.id" class="doc-card">
        <div class="doc-head">
          <div>
            <div class="doc-number">№ {{ doc.number }}/{{ doc.year }}</div>
            <div class="muted">Сформирован {{ formatDate(doc.generatedAtUtc) }}</div>
          </div>
          <div class="doc-tags">
            <a-tag v-if="isEffective(doc)" color="success">Действует</a-tag>
            <a-tag :color="statusColor(doc)">{{ statusLabel(doc) }}</a-tag>
            <a-tag v-if="doc.isSingleUse" color="purple">разовый{{ doc.consumedByCaseId ? ' · использован' : '' }}</a-tag>
            <a-tag v-if="doc.validUntilUtc" :color="isExpired(doc) ? 'error' : 'default'">
              до {{ formatDate(doc.validUntilUtc) }}
            </a-tag>
          </div>
        </div>

        <div class="doc-actions">
          <a-button size="small" @click="emit('download', doc)"><DownloadOutlined /> Скачать (.docx)</a-button>
        </div>

        <div class="sign-grid">
          <div class="sign-block">
            <div class="sign-head">
              <strong>Ваша подпись</strong>
              <a-tag v-if="doc.clientSigned" color="success">Подписано</a-tag>
              <a-tag v-else color="default">Ожидается</a-tag>
            </div>
            <div v-if="!doc.clientSigned" class="sign-actions">
              <a-button size="small" type="primary" @click="emit('sigex', doc, 'client')">
                <SafetyCertificateOutlined /> Подписать через eGov (QR)
              </a-button>
              <a-button size="small" @click="emit('sign', doc, 'client')">
                <UploadOutlined /> Загрузить подписанный файл
              </a-button>
            </div>
          </div>

          <div class="sign-block">
            <div class="sign-head">
              <strong>Подпись AQNIET</strong>
              <a-tag v-if="doc.providerSigned" color="success">Подписано</a-tag>
              <a-tag v-else color="default">Ожидается</a-tag>
            </div>
            <div v-if="isAdmin && !doc.providerSigned" class="sign-actions">
              <a-button size="small" type="primary" @click="emit('sigex', doc, 'provider')">
                <SafetyCertificateOutlined /> Подписать через eGov (QR)
              </a-button>
              <a-button size="small" @click="emit('sign', doc, 'provider')">
                <UploadOutlined /> Загрузить подписанный файл
              </a-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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

defineProps<{
  title: string
  profileComplete: boolean
  documents: Import40DocumentDto[]
  generating: boolean
  isAdmin: boolean
  emptyHint: string
  isEffective: (doc: Import40DocumentDto) => boolean
}>()

const emit = defineEmits<{
  (e: 'generate', opts: GenerateOpts): void
  (e: 'download', doc: Import40DocumentDto): void
  (e: 'sign', doc: Import40DocumentDto, side: 'client' | 'provider'): void
  (e: 'sigex', doc: Import40DocumentDto, side: 'client' | 'provider'): void
}>()

const singleUse = ref(false)
const validUntil = ref<Dayjs | null>(null)

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
  doc.status === 2 ? 'Активен' : doc.status === 1 ? 'Ожидает подписей' : doc.status === 3 ? 'Истёк' : doc.status === 4 ? 'Отозван' : 'Черновик'

const statusColor = (doc: Import40DocumentDto) =>
  doc.status === 2 ? 'success' : doc.status === 1 ? 'processing' : doc.status === 3 ? 'error' : doc.status === 4 ? 'error' : 'default'
</script>

<style scoped>
.doc-step { display: flex; flex-direction: column; gap: 14px; }
.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; font-size: 15px; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
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
@media (max-width: 900px) {
  .sign-grid { grid-template-columns: 1fr; }
  .generate-bar { flex-direction: column; align-items: stretch; }
}
</style>
