<template>
  <div v-if="activeCase" class="case-page">
    <PageHeader :kicker="t('import40Case.kicker')" :title="activeCase.cargo || t('import40Case.caseTitleFallback')">
      <template #meta>
        <span>{{ t('import40Case.client') }}: <strong>{{ activeCase.clientName }}</strong></span>
        <span>{{ t('import40Case.post') }}: <strong>{{ activeCase.post || '—' }}</strong></span>
        <span v-if="activeCase.assignedKppId">{{ t('import40Case.kpp') }}: <a-tag>{{ staffName(activeCase.assignedKppId) }}</a-tag></span>
        <span v-if="activeCase.assignedDeclarantId">{{ t('import40Case.declarant') }}: <a-tag>{{ staffName(activeCase.assignedDeclarantId) }}</a-tag></span>
        <a-tag v-if="isCompleted(activeCase.status)" color="success">{{ t('import40Case.completed') }}</a-tag>
        <template v-else>
          <a-tag color="processing">{{ t('import40Case.stepOf', { step: currentStep, total: TOTAL_STEPS, title: stepTitle(currentStep) }) }}</a-tag>
        </template>
        <a-tag v-if="assignedTag === 'me'" color="success">{{ t('import40Case.assignedMe') }}</a-tag>
        <a-tag v-else-if="assignedTag === 'other'" color="warning">{{ t('import40Case.assignedOther') }}</a-tag>
      </template>
      <template #actions>
        <a-button
          v-if="(can('kpp') || can('declarant')) && !activeCase.isProblem && activeCase.status < 8"
          danger size="small" @click="promptProblem"
        >{{ t('import40Case.problemBtn') }}</a-button>

        <div v-if="roleMode === 'admin'" class="assign-inline">
          <a-select v-model:value="assignForm.kppId" allow-clear :placeholder="t('import40Case.kppNotAssigned')" :options="kppOptions" size="small" style="min-width: 170px" />
          <a-select v-model:value="assignForm.declarantId" allow-clear :placeholder="t('import40Case.declarantNotAssigned')" :options="declarantOptions" size="small" style="min-width: 170px" />
          <a-button size="small" :loading="assignSaving" @click="saveAssignment">{{ t('import40Case.assign') }}</a-button>
        </div>
      </template>
    </PageHeader>

    <!-- Баннеры -->
    <a-alert
      v-if="activeCase.isProblem"
      type="error"
      show-icon
      class="case-banner"
      :message="t('import40Case.problemTitle')"
      :description="activeCase.problemNote || undefined"
    >
      <template #action>
        <a-button v-if="can('kpp') || can('declarant')" size="small" @click="runAction('clear-problem')">
          {{ t('import40Case.clearProblem') }}
        </a-button>
      </template>
    </a-alert>
    <a-alert
      v-if="activeCase.returnReason && activeCase.status === 0"
      type="warning"
      show-icon
      class="case-banner"
      :message="t('import40Case.returnedTitle')"
      :description="activeCase.returnReason"
    />

    <!-- Лестница шагов -->
    <div class="steps">
      <Import40Step :index="1" :title="stepTitle(1)" :state="stepState(1)" :executor="t('enum.role.client')" :summary="step1Summary">
        <div class="grid-2">
          <label><span>{{ t('import40Case.cargo') }}</span>
            <a-input :value="activeCase.cargo" :disabled="!canEditStep1" @change="(e: any) => saveField({ cargo: e.target.value })" />
          </label>
          <label><span>{{ t('import40Case.post') }}</span>
            <a-input :value="activeCase.post" :disabled="!canEditStep1" @change="(e: any) => saveField({ post: e.target.value })" />
          </label>
        </div>
        <div class="grid-2">
          <label><span>{{ t('import40Case.transportMode') }}</span>
            <a-select :value="activeCase.transportMode" :options="transportModeOptions" :disabled="!canEditStep1"
              style="width: 100%" @change="(v: number) => saveField({ transportMode: v })" />
          </label>
        </div>
        <div class="grid-2">
          <template v-if="activeCase.transportMode === 0">
            <label><span>{{ t('import40Case.wagon') }}</span><a-input :value="activeCase.wagonNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ wagonNumber: e.target.value })" /></label>
            <label><span>{{ t('import40Case.station') }}</span><a-input :value="activeCase.station" :disabled="!canEditStep1" @change="(e: any) => saveField({ station: e.target.value })" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 1">
            <label><span>{{ t('import40Case.vehicle') }}</span><a-input :value="activeCase.vehicleNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ vehicleNumber: e.target.value })" /></label>
            <label><span>{{ t('import40Case.trailer') }}</span><a-input :value="activeCase.trailerNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ trailerNumber: e.target.value })" /></label>
            <label><span>{{ t('import40Case.driverPhone') }}</span><a-input :value="activeCase.driverPhone" :disabled="!canEditStep1" @change="(e: any) => saveField({ driverPhone: e.target.value })" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 2">
            <label><span>{{ t('import40Case.flight') }}</span><a-input :value="activeCase.flightNumber" :disabled="!canEditStep1" @change="(e: any) => saveField({ flightNumber: e.target.value })" /></label>
            <label><span>{{ t('import40Case.awb') }}</span><a-input :value="activeCase.airWaybill" :disabled="!canEditStep1" @change="(e: any) => saveField({ airWaybill: e.target.value })" /></label>
          </template>
          <template v-else>
            <label><span>{{ t('import40Case.vessel') }}</span><a-input :value="activeCase.vesselName" :disabled="!canEditStep1" @change="(e: any) => saveField({ vesselName: e.target.value })" /></label>
            <label><span>{{ t('import40Case.bl') }}</span><a-input :value="activeCase.billOfLading" :disabled="!canEditStep1" @change="(e: any) => saveField({ billOfLading: e.target.value })" /></label>
          </template>
        </div>

        <div class="sub-label">{{ t('import40Case.containers') }}</div>
        <div v-for="c in activeCase.containers" :key="c.id" class="container-row">
          <strong>{{ c.containerNumber }}</strong><span class="muted">{{ c.containerType }}</span>
          <a-button v-if="canEditStep1" type="text" danger size="small" @click="removeContainer(c.id)"><CloseOutlined /></a-button>
        </div>
        <div v-if="canEditStep1" class="container-add">
          <a-input v-model:value="newContainer.number" :placeholder="t('import40Case.containerNumberPh')" style="max-width: 220px" />
          <a-input v-model:value="newContainer.type" :placeholder="t('import40Case.containerTypePh')" style="max-width: 140px" />
          <a-button :disabled="!newContainer.number.trim()" @click="addContainer">{{ t('import40Case.add') }}</a-button>
        </div>

        <template v-if="hasClientPrefill">
          <div class="sub-label">{{ t('import40Case.clientDataTitle') }}</div>
          <div class="client-prefill">
            <div v-if="activeCase.clientSenderName" class="prefill-row"><span>{{ t('import40Case.sender') }}</span><b>{{ activeCase.clientSenderName }}<template v-if="activeCase.clientSenderCountryCode"> · {{ activeCase.clientSenderCountryCode }}</template></b></div>
            <div v-if="activeCase.clientReceiverName" class="prefill-row"><span>{{ t('import40Case.receiver') }}</span><b>{{ activeCase.clientReceiverName }}<template v-if="activeCase.clientReceiverBin"> · {{ t('import40Case.binShort') }} {{ activeCase.clientReceiverBin }}</template><template v-if="activeCase.clientReceiverCountryCode"> · {{ activeCase.clientReceiverCountryCode }}</template></b></div>
            <div v-if="activeCase.clientCurrencyCode || activeCase.clientEstimatedValue != null" class="prefill-row"><span>{{ t('import40Case.value') }}</span><b>{{ activeCase.clientEstimatedValue != null ? localeNum(activeCase.clientEstimatedValue) : '—' }} {{ activeCase.clientCurrencyCode }}</b></div>
          </div>
        </template>

        <div class="sub-label">{{ t('import40Case.docsTitle') }}</div>
        <Import40FilesBlock
          :files="filesBySection('documents')"
          :can-upload="canEditStep1 || roleMode === 'admin'"
          :can-remove="roleMode === 'admin'"
          :uploading="uploading"
          :empty-text="t('import40Case.docsEmpty')"
          @upload="(f: File) => uploadTo('documents', f)"
          @download="download"
          @remove="removeFile"
        />

        <div v-if="stepState(1) === 'current'" class="step-actions">
          <a-tooltip :title="can('client') ? '' : hintFor('client')">
            <a-button type="primary" :disabled="!can('client')" @click="runAction('submit-for-processing')">
              {{ t('import40Case.submitForProcessing') }}
            </a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="2" :title="stepTitle(2)" :state="stepState(2)" :executor="t('enum.role.kpp')"
        :summary="stepState(2) === 'done' ? t('import40Case.passed') : undefined">
        <p class="muted">{{ t('import40Case.transportPrefix', { summary: transportSummary }) }}</p>
        <div v-if="stepState(2) === 'current'" class="step-actions">
          <a-button v-if="roleMode === 'kpp' && !activeCase.assignedKppId" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
          <a-tooltip :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="runAction('border-passed')">{{ t('import40Case.borderPassed') }}</a-button>
          </a-tooltip>
          <a-tooltip :title="can('kpp') || can('declarant') ? '' : hintFor('kpp')">
            <a-button danger :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">{{ t('import40Case.returnToClient') }}</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="3" :title="stepTitle(3)" :state="stepState(3)" :executor="t('enum.role.declarant')"
        :summary="stepState(3) === 'done' ? t('import40Case.dtCount', { n: activeCase.declarations.length }) : undefined">
        <div v-if="!activeCase.declarations.length" class="muted">{{ t('import40Case.noDt') }}</div>

        <a-input
          v-if="activeCase.declarations.length > 1"
          v-model:value="dtSearch"
          allow-clear
          :placeholder="t('import40Case.searchDt')"
          style="max-width: 320px; margin-bottom: 8px"
        />

        <div v-for="(dt, i) in filteredDeclarations" :key="dt.id" class="dt-row">
          <div class="dt-row-main">
            <strong>{{ dt.declarationNumber || t('import40Case.dtFallback', { n: i + 1 }) }}</strong>
            <a-tooltip :title="splitTagTooltip(dt)">
              <a-tag v-if="splitTagLabel(dt)" :color="splitTagColor(dt)">{{ splitTagLabel(dt) }}</a-tag>
            </a-tooltip>
            <span class="muted">{{ t('import40Case.goodsCount', { n: dt.goodsItems.length }) }}</span>
            <a-tag v-if="readiness[dt.id]" :color="readiness[dt.id].missing.length ? 'warning' : 'success'">
              {{ t('import40Case.fieldsFilled', { filled: readiness[dt.id].filled, total: readiness[dt.id].total }) }}
            </a-tag>
          </div>
          <div class="dt-row-actions">
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" @click="$router.push(`/import-40/${activeCase.id}/dt/${dt.id}`)">{{ t('import40Case.fill') }}</a-button>
            </a-tooltip>
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" :loading="xmlLoading === dt.id" @click="exportXml(dt.id)">{{ t('import40Case.xmlForKeden') }}</a-button>
            </a-tooltip>
            <a-popconfirm v-if="can('declarant')" :title="t('import40Case.deleteDt')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" @confirm="removeDt(dt.id)">
              <a-button size="small" type="text" danger><CloseOutlined /></a-button>
            </a-popconfirm>
          </div>
        </div>

        <div v-if="activeCase.declarations.length && can('declarant')" class="keden-batch-row">
          <a-tag :color="readyDtCount > 0 ? 'success' : 'default'">
            {{ t('import40Case.readyCount', { ready: readyDtCount, total: totalDtCount }) }}
          </a-tag>
          <a-button
            size="small"
            type="primary"
            :loading="batchXmlLoading"
            :disabled="readyDtCount === 0"
            @click="exportBatchXml"
          >
            {{ t('import40Case.exportAllReady') }}
          </a-button>
        </div>

        <a-alert v-if="kedenMissing.length" type="warning" show-icon class="keden-missing">
          <template #message>{{ t('import40Case.xmlMissingTitle') }}</template>
          <template #description><ul><li v-for="m in kedenMissing" :key="m">{{ m }}</li></ul></template>
        </a-alert>

        <div v-if="stepState(3) === 'current'" class="step-actions">
          <template v-if="activeCase.status === 2">
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button :disabled="!can('declarant')" @click="addDt">{{ t('import40Case.addDt') }}</a-button>
            </a-tooltip>
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button :disabled="!can('declarant')" :loading="batchUploading" @click="triggerBatchUpload">
                {{ t('import40Case.uploadBatch') }}
              </a-button>
            </a-tooltip>
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button :disabled="!can('declarant')" @click="openImportQuote">{{ t('import40Case.importQuote') }}</a-button>
            </a-tooltip>
            <input
              ref="batchFileInput"
              type="file"
              multiple
              style="display: none"
              @change="handleBatchFilesSelected"
            />
          </template>
          <a-button v-if="roleMode === 'declarant' && !activeCase.assignedDeclarantId" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
          <a-tooltip v-if="activeCase.status === 2" :title="can('declarant') ? '' : hintFor('declarant')">
            <a-button type="primary" :disabled="!can('declarant') || !activeCase.declarations.length" @click="runAction('submit-declaration')">{{ t('import40Case.submitDt') }}</a-button>
          </a-tooltip>
          <a-tooltip :title="can('kpp') || can('declarant') ? '' : hintFor('declarant')">
            <a-button danger :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">{{ t('import40Case.returnToClient') }}</a-button>
          </a-tooltip>
        </div>
        <div v-if="activeCase.status === 3" class="step-actions">
          <p class="muted">{{ t('import40Case.status3Note') }}</p>
          <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
            <a-button type="primary" :disabled="!can('declarant')" @click="runAction('release-declaration')">{{ t('import40Case.fixRelease') }}</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="4" :title="stepTitle(4)" :state="stepState(4)" :executor="t('enum.role.kpp')"
        :summary="stepState(4) === 'done' ? (activeCase.svhInvoiceNote ? t('import40Case.invoicePrefix', { note: activeCase.svhInvoiceNote }) : t('import40Case.closed')) : undefined">
        <div class="sub-label">{{ t('import40Case.stampTitle') }}</div>
        <Import40FilesBlock :files="filesBySection('declaration-stamp')" :can-upload="stepState(4) === 'current' && can('kpp')"
          :uploading="uploading" :empty-text="t('import40Case.stampEmpty')"
          @upload="(f: File) => uploadTo('declaration-stamp', f)" @download="download" />
        <div class="sub-label">{{ t('import40Case.svhInvoiceTitle') }} <a-tag v-if="activeCase.svhInvoiceNote">{{ activeCase.svhInvoiceNote }}</a-tag></div>
        <Import40FilesBlock :files="filesBySection('svh-invoice')" :can-upload="stepState(4) === 'current' && can('kpp')"
          :uploading="uploading" :empty-text="t('import40Case.svhInvoiceEmpty')"
          @upload="(f: File) => uploadTo('svh-invoice', f)" @download="download" />
        <div v-if="stepState(4) === 'current'" class="step-actions">
          <a-tooltip v-if="activeCase.status === 4" :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="runAction('close-svh')">{{ t('import40Case.closeSvh') }}</a-button>
          </a-tooltip>
          <a-tooltip v-if="activeCase.status === 5" :title="can('kpp') ? '' : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp')" @click="promptInvoice">{{ t('import40Case.issueInvoice') }}</a-button>
          </a-tooltip>
          <a-button v-if="roleMode === 'kpp' && !activeCase.assignedKppId" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
        </div>
      </Import40Step>
      <Import40Step :index="5" :title="stepTitle(5)" :state="stepState(5)" :executor="t('enum.role.clientKpp')"
        :summary="stepState(5) === 'done' ? t('import40Case.paid') : undefined">
        <div class="sub-label">{{ t('import40Case.paymentCheckTitle') }}
          <a-tag v-if="activeCase.paymentConfirmed" color="success">{{ t('import40Case.paymentConfirmed') }}</a-tag>
          <a-tag v-else-if="filesBySection('payment-check').length" color="processing">{{ t('import40Case.paymentChecking') }}</a-tag>
        </div>
        <Import40FilesBlock :files="filesBySection('payment-check')" :can-upload="stepState(5) === 'current' && can('client')"
          :uploading="uploading" :empty-text="t('import40Case.paymentEmpty')"
          @upload="(f: File) => uploadTo('payment-check', f)" @download="download" />
        <div v-if="stepState(5) === 'current'" class="step-actions">
          <a-tooltip :title="can('kpp') ? (filesBySection('payment-check').length ? '' : t('import40Case.clientNoCheck')) : hintFor('kpp')">
            <a-button type="primary" :disabled="!can('kpp') || !filesBySection('payment-check').length"
              @click="runAction('confirm-payment-and-complete')">{{ t('import40Case.confirmPayment') }}</a-button>
          </a-tooltip>
          <a-button v-if="roleMode === 'kpp' && !activeCase.assignedKppId" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
        </div>
      </Import40Step>
    </div>

    <!-- Низ: все файлы + история -->
    <a-collapse ghost class="case-bottom">
      <a-collapse-panel key="files" :header="t('import40Case.allFiles', { n: files.length })">
        <Import40FilesBlock :files="files" :can-upload="false" @download="download" />
      </a-collapse-panel>
      <a-collapse-panel key="history" :header="t('import40Case.history')">
        <div v-for="l in activeCase.logs" :key="l.id" class="log-row">
          <span class="log-date">{{ new Date(l.createdAtUtc).toLocaleString(INTL_LOCALE[locale] ?? 'ru-RU') }}</span>
          <span>{{ l.text }}</span>
          <a-tag>{{ l.changedByBusinessRole }}</a-tag>
        </div>
      </a-collapse-panel>
    </a-collapse>

    <a-modal v-model:open="returnOpen" :title="t('import40Case.returnTitle')" :ok-text="t('import40Case.returnOk')" :cancel-text="t('common.cancel')" @ok="confirmReturn">
      <a-textarea v-model:value="returnReason" :rows="3" :placeholder="t('import40Case.returnPh')" />
    </a-modal>

    <a-modal v-model:open="problemOpen" :title="t('import40Case.problemTitle')" :ok-text="t('import40Case.problemOk')" :cancel-text="t('common.cancel')" @ok="confirmProblem">
      <a-textarea v-model:value="problemNote" :rows="3" :placeholder="t('import40Case.problemPh')" />
    </a-modal>

    <a-modal v-model:open="invoiceOpen" :title="t('import40Case.invoiceTitle')" :ok-text="t('import40Case.invoiceOk')" :cancel-text="t('common.cancel')" @ok="confirmInvoice">
      <a-input v-model:value="invoiceAmount" :placeholder="t('import40Case.invoicePh')" />
    </a-modal>

    <a-modal
      v-model:open="importQuoteOpen"
      :title="t('import40Case.importTitle')"
      :ok-text="t('import40Case.importOk')"
      :cancel-text="t('common.cancel')"
      :confirm-loading="importQuoteLoading"
      :ok-button-props="{ disabled: !imp.quoteId || (imp.target === 'existing' && !imp.declarationId) }"
      @ok="doImportQuote"
    >
      <div class="import-quote-form">
        <label><span>{{ t('import40Case.quoteLabel') }}</span>
          <a-select
            v-model:value="imp.quoteId"
            show-search
            :placeholder="t('import40Case.quotePh')"
            style="width: 100%"
            :options="quoteOptions"
            :filter-option="filterQuoteOption"
            :loading="quotesLoading"
          />
        </label>
        <label><span>{{ t('import40Case.targetLabel') }}</span>
          <a-radio-group v-model:value="imp.target">
            <a-radio value="new">{{ t('import40Case.targetNew') }}</a-radio>
            <a-radio value="existing" :disabled="!activeCase.declarations.length">{{ t('import40Case.targetExisting') }}</a-radio>
          </a-radio-group>
        </label>
        <label v-if="imp.target === 'existing'"><span>{{ t('import40Case.declarationLabel') }}</span>
          <a-select
            v-model:value="imp.declarationId"
            style="width: 100%"
            :placeholder="t('import40Case.selectDt')"
            :options="declarationOptions"
          />
        </label>
      </div>
    </a-modal>

    <a-modal :open="issuesOpen" :title="t('import40Case.issuesTitle')"
      :width="640" :ok-text="t('import40Case.issuesOk')" :cancel-button-props="{ style: { display: 'none' } }"
      @ok="closeIssuesDialog" @update:open="onIssuesOpenChange" @after-close="issues = null">
      <div v-if="issues?.conflicts.length">
        <p>{{ t('import40Case.conflictsIntro') }}</p>
        <ul style="padding-left: 20px">
          <li v-for="(c, i) in issues.conflicts" :key="`c${i}`">
            <strong>{{ c.fieldLabel }}</strong>: "{{ c.value ?? '—' }}"{{ c.sourceDocument ? ` (${c.sourceDocument})` : '' }} —
            {{ c.alternatives.map((a) => `"${a.value ?? '—'}"${a.sourceDocument ? ` (${a.sourceDocument})` : ''}`).join(', ') }}
          </li>
        </ul>
      </div>
      <div v-if="issues?.warnings.length">
        <p>{{ t('import40Case.warningsIntro') }}</p>
        <ul style="padding-left: 20px">
          <li v-for="(w, i) in issues.warnings" :key="`w${i}`">{{ w }}</li>
        </ul>
      </div>
    </a-modal>
  </div>
  <a-spin v-else class="case-loading" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import {
  IMPORT40_TRANSPORT_MODES,
  import40Api,
  type Import40Action,
  type Import40CaseDto,
  type Import40DeclarationDto,
  type Import40DeclarationUpsert,
  type Import40ExtractionPreview,
  type Import40ExtractionResult,
  type Import40FileDto,
  type Import40FileSection,
  type KedenReadinessDto,
} from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { salesApi, type SalesQuoteListItem } from '@/api/sales'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/api/users'
import Import40Step from '@/components/Import40Step.vue'
import Import40FilesBlock from '@/components/Import40FilesBlock.vue'
import PageHeader from '@/components/PageHeader.vue'
import { TOTAL_STEPS, isCompleted, stepForStatus } from '@/utils/import40Steps'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { t, locale } = useI18n()

// Индекс шага (1..5) → переведённый заголовок; заменяет STEP_TITLES из utils.
const stepTitle = (n: number) => t(`enum.step.s${n}`)
const INTL_LOCALE: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const localeNum = (n?: number | null) => (n ?? 0).toLocaleString(INTL_LOCALE[locale.value] ?? 'ru-RU')

const activeCase = ref<Import40CaseDto | null>(null)
const files = ref<Import40FileDto[]>([])
const uploading = ref(false)

// Диалоги объявлены в шаблоне, а не собраны через Modal.confirm + h():
// программные модалки не подхватывают стили CRM и живут в скрипте строками.
const returnOpen = ref(false)
const returnReason = ref('')

const problemOpen = ref(false)
const problemNote = ref('')

const invoiceOpen = ref(false)
const invoiceAmount = ref('')

const issuesOpen = ref(false)
const issues = ref<Import40ExtractionResult | null>(null)
const pendingDtNavigation = ref<string | null>(null)

type RoleMode = 'client' | 'kpp' | 'declarant' | 'admin' | 'other'
const roleMode = computed<RoleMode>(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  if (sys === 'administrator') return 'admin'
  if (sys === 'client' || biz === 'client') return 'client'
  if (biz === 'kpp') return 'kpp'
  if (biz === 'declarant' || biz === 'rop') return 'declarant'
  return 'other'
})
const can = (role: RoleMode) => roleMode.value === 'admin' || roleMode.value === role

const hintFor = (role: string) => {
  const key = role === 'kpp' ? 'kpp' : role === 'declarant' ? 'declarant' : 'client'
  return t('import40Case.hintFor', { role: t(`enum.role.${key}`) })
}

// Виды транспорта с переведёнными подписями (0=ЖД,1=Авто,2=Авиа,3=Море).
const TRANSPORT_MODE_KEYS: Record<number, string> = { 0: 'rail', 1: 'road', 2: 'air', 3: 'sea' }
const transportModeOptions = computed(() =>
  IMPORT40_TRANSPORT_MODES.map((m) => ({ value: m.value, label: t('enum.transportMode.' + TRANSPORT_MODE_KEYS[m.value]) })),
)

// Task 12 (фидбек №17) + follow-ups Task 2/4: после «Разделить на ЕТТ/ВТО»
// бэкенд помечает результат полем splitRole ('ETT' | 'VTO' | null, см.
// Import40Endpoints.SplitDeclaration). Разделение сохраняет исходную
// декларацию без изменений (splitRole = null) и создаёт ДВЕ новые дочерние
// (splitRole = 'ETT' и 'VTO') — в списке видны все три.
//
// follow-ups Task 4: тег теперь ставится по splitRole, а не по rateType —
// Task 2 ставил тег «ЕТТ» на rateType==='ETT', а это одновременно и дефолт
// для ЛЮБОЙ обычной (неразделённой) ДТ, поэтому тег шёл шумом на все
// декларации. splitRole надёжно отличает дочерние ДТ split'а: null у
// исходной/обычных ДТ — тег не показываем вовсе.
//
// Фолбэк: если splitRole не пришёл (null), но rateType === 'EATT' —
// показываем «ВТО» по старому признаку (edge case: самостоятельная ДТ с
// выбранными ВТО-товарами вне split). rateType==='ETT' без splitRole
// фолбэка не имеет — это обычная ДТ, шум специально убран.
const splitTagLabel = (dt: Import40DeclarationDto) => {
  if (dt.splitRole === 'VTO') return 'ВТО'
  if (dt.splitRole === 'ETT') return 'ЕТТ'
  if (!dt.splitRole && dt.rateType === 'EATT') return 'ВТО'
  return null
}
const splitTagColor = (dt: Import40DeclarationDto) => (splitTagLabel(dt) === 'ВТО' ? 'purple' : 'blue')
const splitTagTooltip = (dt: Import40DeclarationDto) => {
  if (!dt.splitSourceDeclarationId) return ''
  const source = activeCase.value?.declarations.find((d) => d.id === dt.splitSourceDeclarationId)
  const num = source?.declarationNumber || dt.splitSourceDeclarationId
  return t('import40Case.splitTooltip', { num })
}

const currentStep = computed(() => (activeCase.value ? stepForStatus(activeCase.value.status) : 1))
const stepState = (n: number): 'done' | 'current' | 'future' =>
  n < currentStep.value ? 'done' : n === currentStep.value ? 'current' : 'future'

const step1Summary = computed(() =>
  activeCase.value ? `${activeCase.value.cargo || '—'} · файлов: ${filesBySection('documents').length}` : undefined,
)

const reload = async () => {
  const id = String(route.params.id)
  activeCase.value = await import40Api.get(id)
  files.value = await import40Api.listFiles(id)
  assignForm.kppId = activeCase.value?.assignedKppId ?? null
  assignForm.declarantId = activeCase.value?.assignedDeclarantId ?? null
  void loadReadiness()
}

const filesBySection = (s: Import40FileSection | string) => files.value.filter((f) => f.section === s)

const runAction = async (key: Import40Action, value?: string) => {
  if (!activeCase.value) return
  try {
    await import40Api.action(activeCase.value.id, key, value)
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? t('import40Case.actionFailed'))
  }
}

const uploadTo = async (section: Import40FileSection | string, file: File) => {
  if (!activeCase.value) return
  uploading.value = true
  try {
    await import40Api.uploadFile(activeCase.value.id, section as Import40FileSection, file)
    files.value = await import40Api.listFiles(activeCase.value.id)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? t('import40Case.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

const download = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  const blob = await import40Api.downloadFile(activeCase.value.id, f.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.originalFileName
  a.click()
  URL.revokeObjectURL(url)
}

const removeFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  try {
    await import40Api.deleteFile(activeCase.value.id, f.id)
    files.value = await import40Api.listFiles(activeCase.value.id)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? t('import40Case.deleteFailed'))
  }
}

const canEditStep1 = computed(() => stepState(1) === 'current' && can('client'))

// Текстовые поля шага 1 сохраняются по blur/@change через saveField
const saveField = async (patch: Record<string, unknown>) => {
  if (!activeCase.value || !canEditStep1.value) return
  try {
    await import40Api.update(activeCase.value.id, patch as never)
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? t('import40Case.saveFailed'))
  }
}

const newContainer = ref({ number: '', type: '' })
const addContainer = async () => {
  if (!activeCase.value) return
  await import40Api.addContainer(activeCase.value.id, {
    containerNumber: newContainer.value.number.trim(),
    containerType: newContainer.value.type.trim() || null,
    notes: null,
  } as never)
  newContainer.value = { number: '', type: '' }
  await reload()
}
const removeContainer = async (containerId: string) => {
  if (!activeCase.value) return
  await import40Api.deleteContainer(activeCase.value.id, containerId)
  await reload()
}

const transportSummary = computed(() => {
  const c = activeCase.value
  if (!c) return ''
  const kind = TRANSPORT_MODE_KEYS[c.transportMode] ? t('enum.transportMode.' + TRANSPORT_MODE_KEYS[c.transportMode]) : '—'
  const detail = [c.wagonNumber, c.vehicleNumber, c.flightNumber, c.vesselName].filter(Boolean).join(', ')
  return `${kind}${detail ? ' · ' + detail : ''}`
})

// Пакет 6 №1: показываем брокеру данные, которые дал клиент при подаче.
const hasClientPrefill = computed(() => {
  const c = activeCase.value
  if (!c) return false
  return !!(c.clientSenderName || c.clientReceiverName || c.clientReceiverBin
    || c.clientCurrencyCode || c.clientEstimatedValue != null)
})

// Task 5: поиск ДТ по номеру внутри заявки — декларации уже в памяти
// (activeCase.declarations), отдельный API-параметр не нужен.
const dtSearch = ref('')
const filteredDeclarations = computed(() => {
  const q = dtSearch.value.trim().toLowerCase()
  const list = activeCase.value?.declarations ?? []
  if (!q) return list
  return list.filter((dt) => (dt.declarationNumber || '').toLowerCase().includes(q))
})

const readiness = ref<Record<string, KedenReadinessDto>>({})
const xmlLoading = ref<string | null>(null)
const kedenMissing = ref<string[]>([])

// Сводка готовности всех ДТ к пакетной выгрузке KEDEN-XML (P6)
const readinessSummary = ref<DeclarationReadiness[]>([])
const readyDtCount = computed(() => readinessSummary.value.filter((r) => r.isReady).length)
const totalDtCount = computed(
  () => readinessSummary.value.length || (activeCase.value?.declarations.length ?? 0),
)
const batchXmlLoading = ref(false)

// readiness виден только сотрудникам (эндпоинт клиенту 404) — молча пропускаем
const loadReadiness = async () => {
  const c = activeCase.value
  if (!c || roleMode.value === 'client' || roleMode.value === 'other') return
  for (const dt of c.declarations) {
    try {
      readiness.value[dt.id] = await import40Api.kedenReadiness(c.id, dt.id)
    } catch {
      /* нет прав или сеть — тег просто не показываем */
    }
  }
  try {
    readinessSummary.value = await import40Api.kedenReadinessSummary(c.id)
  } catch {
    readinessSummary.value = []
  }
}

const exportBatchXml = async () => {
  if (!activeCase.value) return
  batchXmlLoading.value = true
  try {
    const res = await import40Api.downloadKedenBatch(activeCase.value.id)
    if ('error' in res) {
      message.warning(res.error)
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('import40Case.batchExported'))
  } catch {
    message.error(t('import40Case.batchExportFailed'))
  } finally {
    batchXmlLoading.value = false
  }
}

const addDt = async () => {
  if (!activeCase.value) return
  await import40Api.createDeclaration(activeCase.value.id, {})
  await reload()
}

// --- батч-загрузка пакета документов (автозаполнение ДТ через Aqniet) ---
const batchUploading = ref(false)
const batchFileInput = ref<HTMLInputElement | null>(null)

const triggerBatchUpload = () => {
  batchFileInput.value?.click()
}

const previewToUpsert = (preview: Import40ExtractionPreview): Import40DeclarationUpsert => ({
  declarationNumber: preview.declarationNumber ?? null,
  corridor: preview.corridor ?? null,
  procedureCode: preview.procedureCode ?? null,
  sender: preview.sender ?? null,
  receiver: preview.receiver ?? null,
  departureCountryCode: preview.departureCountryCode ?? null,
  destinationCountryCode: preview.destinationCountryCode ?? null,
  incoterms: preview.incoterms ?? null,
  incotermsPlace: preview.incotermsPlace ?? null,
  originCountryCode: preview.originCountryCode ?? null,
  currency: preview.currency ?? null,
  totalInvoiceValue: preview.totalInvoiceValue ?? null,
  exchangeRate: preview.exchangeRate ?? null,
  borderTransportNumbers: preview.borderTransportNumbers?.length ? preview.borderTransportNumbers : undefined,
  arrivalTransportNumbers: preview.arrivalTransportNumbers?.length ? preview.arrivalTransportNumbers : undefined,
  goodsItems: preview.goodsItems?.length
    ? preview.goodsItems.map((g) => ({
        description: g.description ?? null,
        tnvedCode: g.tnvedCode ?? null,
        tnvedDescription: null,
        countryOfOrigin: g.countryOfOrigin ?? null,
        quantity: g.quantity ?? null,
        unit: null,
        unitCode: null,
        grossWeightKg: g.grossWeightKg ?? null,
        netWeightKg: g.netWeightKg ?? null,
        packagesCount: g.packagesCount ?? null,
        quantityTypeCode: null,
        invoiceValue: g.invoiceValue ?? null,
        currency: g.currency ?? null,
        tradeMarkName: g.tradeMarkName ?? null,
        productMarkName: g.productMarkName ?? null,
        manufacturerName: g.manufacturerName ?? null,
      }))
    : undefined,
})

// Documents in one batch can disagree (e.g. two files giving different receiver BINs) —
// the server keeps the picked value plus the alternatives instead of silently choosing.
// Shown before the redirect so the broker knows which fields to double-check in the form,
// rather than trusting a pre-filled value that was actually a coin flip between sources.
// The redirect to the DT page is deferred until the dialog actually closes (any way —
// button, cross, or backdrop) since this view unmounts on navigation and would take a
// programmatic Modal.warning-style dialog with it otherwise.
const showExtractionIssues = (result: Import40ExtractionResult, dtId: string): boolean => {
  if (result.conflicts.length === 0 && result.warnings.length === 0) return false
  issues.value = result
  pendingDtNavigation.value = dtId
  issuesOpen.value = true
  return true
}

// Единая точка закрытия диалога — вызывается и из @ok, и из @update:open (крестик/фон),
// поэтому переход на ДТ гарантированно случится один раз, каким бы способом ни закрыли.
const closeIssuesDialog = () => {
  issuesOpen.value = false
  const dtId = pendingDtNavigation.value
  if (!dtId) return
  pendingDtNavigation.value = null
  if (activeCase.value) void router.push(`/import-40/${activeCase.value.id}/dt/${dtId}`)
}

const onIssuesOpenChange = (open: boolean) => {
  if (!open) closeIssuesDialog()
}

const handleBatchFilesSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const selected = input.files ? Array.from(input.files) : []
  input.value = '' // разрешаем повторный выбор тех же файлов
  if (!activeCase.value || selected.length === 0) return

  batchUploading.value = true
  try {
    const result = await import40Api.extractBatch(activeCase.value.id, selected)
    const created = await import40Api.createDeclaration(activeCase.value.id, previewToUpsert(result.declaration))
    message.success(t('import40Case.batchProcessed'))
    const hasIssues = showExtractionIssues(result, created.id)
    if (!hasIssues) {
      await router.push(`/import-40/${activeCase.value.id}/dt/${created.id}`)
    }
  } catch {
    message.error(t('import40Case.batchFailed'))
  } finally {
    batchUploading.value = false
  }
}

const removeDt = async (dtId: string) => {
  if (!activeCase.value) return
  await import40Api.deleteDeclaration(activeCase.value.id, dtId)
  await reload()
}

const exportXml = async (dtId: string) => {
  if (!activeCase.value) return
  xmlLoading.value = dtId
  kedenMissing.value = []
  try {
    const res = await import40Api.downloadKedenXml(activeCase.value.id, dtId)
    if ('errors' in res) {
      kedenMissing.value = res.errors
      message.warning(t('import40Case.xmlNotFormed'))
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('import40Case.xmlFormed'))
  } finally {
    xmlLoading.value = null
  }
}

const promptReturn = () => {
  returnReason.value = ''
  returnOpen.value = true
}
const confirmReturn = async () => {
  returnOpen.value = false
  await runAction('return-to-client', returnReason.value)
}

const promptProblem = () => {
  problemNote.value = ''
  problemOpen.value = true
}
const confirmProblem = async () => {
  problemOpen.value = false
  await runAction('set-problem', problemNote.value)
}

// Бейдж «в работе у меня / занято коллегой» (kpp/declarant)
const assignedTag = computed<'me' | 'other' | null>(() => {
  const c = activeCase.value
  const uid = authStore.userId
  if (!c || !uid) return null
  if (roleMode.value === 'kpp') {
    if (!c.assignedKppId) return null
    return c.assignedKppId === uid ? 'me' : 'other'
  }
  if (roleMode.value === 'declarant') {
    if (!c.assignedDeclarantId) return null
    return c.assignedDeclarantId === uid ? 'me' : 'other'
  }
  return null
})

// Назначения (админ): каталог сотрудников + селекты в шапке
type StaffOption = { id: string; username: string; businessRole: string }
const staffList = ref<StaffOption[]>([])
const loadStaffOptions = async () => {
  if (roleMode.value !== 'admin') return
  try {
    const [admins, importers] = await Promise.all([
      usersApi.getCatalogAdministrators(),
      usersApi.getCatalogImporters(),
    ])
    staffList.value = [...admins, ...importers].map((u) => ({
      id: u.id,
      username: u.username,
      businessRole: (u.businessRole || '').toLowerCase(),
    }))
  } catch {
    /* каталог недоступен — селекты будут пустыми, назначение по ID через легаси не переносим */
  }
}
const kppOptions = computed(() =>
  staffList.value.filter((u) => u.businessRole === 'kpp').map((u) => ({ value: u.id, label: u.username })),
)
const declarantOptions = computed(() =>
  staffList.value.filter((u) => u.businessRole === 'declarant').map((u) => ({ value: u.id, label: u.username })),
)
const staffName = (id: string) => staffList.value.find((u) => u.id === id)?.username ?? t('import40Case.staffAssigned')

const assignForm = reactive<{ kppId: string | null; declarantId: string | null }>({ kppId: null, declarantId: null })
const assignSaving = ref(false)
const saveAssignment = async () => {
  if (!activeCase.value) return
  assignSaving.value = true
  try {
    await import40Api.update(activeCase.value.id, {
      assignedKppId: assignForm.kppId || '00000000-0000-0000-0000-000000000000',
      assignedDeclarantId: assignForm.declarantId || '00000000-0000-0000-0000-000000000000',
    } as never)
    message.success(t('import40Case.assignSaved'))
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? t('import40Case.assignFailed'))
  } finally {
    assignSaving.value = false
  }
}

const promptInvoice = () => {
  invoiceAmount.value = ''
  invoiceOpen.value = true
}
const confirmInvoice = async () => {
  invoiceOpen.value = false
  await runAction('issue-invoice', invoiceAmount.value)
}

// --- Импорт из КП (переиспользуем данные принятого коммерческого предложения
// вместо ручного набора товаров в ДТ, см. import40Api.importQuote / Task 4) ---
const importQuoteOpen = ref(false)
const importQuoteLoading = ref(false)
const quotes = ref<SalesQuoteListItem[]>([])
const quotesLoading = ref(false)
const imp = reactive<{
  quoteId: string | null
  target: 'new' | 'existing'
  declarationId: string | null
  force: boolean
}>({ quoteId: null, target: 'new', declarationId: null, force: false })

const quoteOptions = computed(() =>
  quotes.value.map((q) => ({
    value: q.id,
    label: `№${q.number}/${q.year} — ${q.clientName}`,
  })),
)
const filterQuoteOption = (input: string, option: { label?: string }) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const declarationOptions = computed(() =>
  (activeCase.value?.declarations ?? []).map((dt, i) => ({
    value: dt.id,
    label: dt.declarationNumber || `ДТ ${i + 1}`,
  })),
)

const openImportQuote = async () => {
  imp.quoteId = null
  imp.target = 'new'
  imp.declarationId = null
  imp.force = false
  importQuoteOpen.value = true
  quotesLoading.value = true
  try {
    quotes.value = await salesApi.listQuotes()
  } catch {
    message.error(t('import40Case.quoteListFailed'))
  } finally {
    quotesLoading.value = false
  }
}

const doImportQuote = async () => {
  if (!activeCase.value || !imp.quoteId) return
  importQuoteLoading.value = true
  try {
    const { declarationId, addedGoods } = await import40Api.importQuote(activeCase.value.id, {
      quoteId: imp.quoteId,
      targetDeclarationId: imp.target === 'new' ? null : imp.declarationId,
      force: imp.force,
    })
    message.success(t('import40Case.goodsAdded', { n: addedGoods }))
    importQuoteOpen.value = false
    await reload()
    await router.push(`/import-40/${activeCase.value.id}/dt/${declarationId}`)
  } catch (e: any) {
    if (e?.response?.status === 409) {
      Modal.confirm({
        title: t('import40Case.quoteImportedTitle'),
        content: t('import40Case.quoteImportedContent'),
        okText: t('import40Case.add'),
        cancelText: t('common.cancel'),
        onOk: () => {
          imp.force = true
          return doImportQuote()
        },
      })
    } else {
      message.error(e?.response?.data?.error ?? t('import40Case.quoteImportFailed'))
    }
  } finally {
    importQuoteLoading.value = false
  }
}

onMounted(() => {
  void reload()
  void loadStaffOptions()
})
</script>

<style scoped>
.case-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.case-banner {
  border-radius: var(--atg-radius-lg);
}
.assign-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.step-placeholder {
  color: var(--atg-muted);
  font-size: 12px;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin-bottom: 10px;
}
.grid-2 label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--atg-muted);
}
.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-muted);
  margin: 12px 0 6px;
}
.container-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 4px;
}
.client-prefill {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--atg-radius-lg, 10px);
  background: var(--atg-surface-muted, #f5f7fb);
  border: 1px solid var(--atg-line, #eef1f6);
}
.prefill-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
}
.prefill-row > span {
  min-width: 110px;
  color: var(--atg-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.prefill-row > b { color: var(--atg-ink, #182640); }
.container-add {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.muted {
  color: var(--atg-muted);
}
.step-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.dt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--atg-line);
  flex-wrap: wrap;
}
.dt-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dt-row-actions {
  display: flex;
  gap: 6px;
}
.keden-missing {
  margin-top: 10px;
  border-radius: var(--atg-radius-lg);
}
.keden-batch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.case-bottom {
  background: transparent;
}
.log-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 4px;
  align-items: baseline;
}
.log-date {
  color: var(--atg-muted);
  font-size: 12px;
  white-space: nowrap;
}
.case-loading {
  display: block;
  margin: 60px auto;
}
.import-quote-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.import-quote-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--atg-muted);
}
</style>
