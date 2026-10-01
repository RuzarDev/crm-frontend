<template>
  <div v-if="activeCase" class="case-page">
    <PageHeader
      :kicker="isClientView ? t('import40Case.kickerClient', { number: activeCase.number }) : `${t('import40Case.kicker')} · ${activeCase.number}`"
      :title="activeCase.cargo || t('import40Case.caseTitleFallback')">
      <template #meta>
        <!-- Клиенту — без «Клиент: своя же компания» и без КПП, только специалист AQNIET, если
             назначен (аудит 5.6): декларант ведёт заявку, КПП клиенту не о чём не говорит. -->
        <template v-if="isClientView">
          <span v-if="activeCase.assignedDeclarantId">{{ t('import40Case.yourSpecialist') }}: <strong>{{ activeCase.assignedDeclarantName || t('import40Case.staffAssigned') }}</strong></span>
        </template>
        <template v-else>
          <span>{{ t('import40Case.client') }}: <strong>{{ activeCase.clientName }}</strong></span>
          <span>{{ t('import40Case.post') }}: <strong>{{ activeCase.post || '—' }}</strong></span>
          <!-- КПП снова отдельная роль (2026-09-28) — своя строка независимо от декларанта. -->
          <span v-if="activeCase.assignedKppId">{{ t('import40Case.kpp') }}: <a-tag>{{ nameFor(activeCase.assignedKppId, activeCase.assignedKppName) }}</a-tag></span>
          <span v-if="activeCase.assignedDeclarantId">{{ t('import40Case.declarant') }}: <a-tag>{{ nameFor(activeCase.assignedDeclarantId, activeCase.assignedDeclarantName) }}</a-tag></span>
        </template>
        <a-tag v-if="activeCase.status === 9" color="default">{{ t('import40Case.cancelled') }}</a-tag>
        <a-tag v-else-if="isCompleted(activeCase.status)" color="success">{{ t('import40Case.completed') }}</a-tag>
        <template v-else>
          <a-tag color="processing">{{ t('import40Case.stepOf', { step: currentStep, total: TOTAL_STEPS, title: stepTitle(currentStep) }) }}</a-tag>
        </template>
        <a-tag v-if="!isClientView && assignedTag === 'me'" color="success">{{ t('import40Case.assignedMe') }}</a-tag>
        <a-tag v-else-if="!isClientView && assignedTag === 'other'" color="warning">{{ t('import40Case.assignedOther') }}</a-tag>
      </template>
      <template #actions>
        <a-button
          v-if="(can('kpp') || can('declarant')) && !activeCase.isProblem && activeCase.status < 8"
          size="small" class="btn-warn" @click="promptProblem"
        >{{ t('import40Case.problemBtn') }}</a-button>
        <a-button v-if="canSeeBilling" size="small" @click="$router.push(`/billing?caseId=${activeCase.id}`)">{{ t('import40Case.billingBtn') }}</a-button>
        <a-button v-if="canStepBack" size="small" @click="promptStepBack">{{ t('import40Case.stepBackBtn') }}</a-button>
        <a-button v-if="canCancel" type="text" danger size="small" @click="promptCancel">{{ t('import40Case.cancelBtn') }}</a-button>

        <div v-if="canAssign" class="assign-inline">
          <a-select v-model:value="assignForm.declarantId" allow-clear :placeholder="t('import40Case.declarantNotAssigned')" :options="declarantOptions" size="small" style="min-width: 170px" />
          <a-select v-model:value="assignForm.kppId" allow-clear :placeholder="t('import40Case.kppNotAssigned')" :options="kppOptions" size="small" style="min-width: 170px" />
          <a-button size="small" :loading="assignSaving" @click="saveAssignment">{{ t('import40Case.assign') }}</a-button>
        </div>
      </template>
    </PageHeader>

    <!-- Баннеры -->
    <a-alert v-if="activeCase.status === 9" type="warning" show-icon class="case-banner"
      :message="t('import40Case.cancelledTitle')" :description="activeCase.cancelReason || undefined" />
    <!-- Клиент видит только своё сообщение (и баннер вовсе скрыт, если его нет) — внутреннюю
         заметку сотрудников клиенту не показываем (аудит 2.9, задача 2.9). -->
    <a-alert
      v-if="activeCase.isProblem && (!isClientView || activeCase.problemClientMessage)"
      type="error"
      show-icon
      class="case-banner"
      :message="t('import40Case.problemTitle')"
    >
      <template #description>
        <template v-if="isClientView">{{ activeCase.problemClientMessage }}</template>
        <template v-else>
          <div v-if="activeCase.problemNote">{{ activeCase.problemNote }}</div>
          <div v-if="activeCase.problemClientMessage" class="problem-client-msg">
            {{ t('import40Case.problemClientMessageLabel') }}: {{ activeCase.problemClientMessage }}
          </div>
        </template>
      </template>
      <template #action>
        <a-button v-if="can('kpp') || can('declarant')" size="small" @click="runAction('clear-problem')">
          {{ t('import40Case.clearProblem') }}
        </a-button>
      </template>
    </a-alert>
    <!-- «Что нужно от вас» (аудит 5.8): пока заявка «зависла» тупиком без хода для клиента —
         можно приложить недостающий документ и ответить текстом; ответ уходит в историю и
         уведомляет исполнителя заявки. -->
    <a-card v-if="isClientView && activeCase.isProblem && activeCase.problemClientMessage" size="small" class="case-banner client-action-block">
      <div class="sub-label">{{ t('import40Case.problemActionTitle') }}</div>
      <Import40FilesBlock
        :client-view="isClientView"
        :files="filesBySection('documents')"
        :can-upload="true"
        :uploading="uploading"
        :empty-text="t('import40Case.docsEmpty')"
        @upload="(f: File) => uploadTo('documents', f)"
        @download="download"
      />
      <a-textarea v-model:value="clientReplyText" :rows="3" :placeholder="t('import40Case.problemReplyPh')" style="margin-top: 8px" />
      <a-button type="primary" :disabled="!clientReplyText.trim()" :loading="clientReplySaving" style="margin-top: 8px" @click="sendClientReply">
        {{ t('import40Case.problemReplySend') }}
      </a-button>
    </a-card>
    <a-alert
      v-if="activeCase.returnReason && activeCase.status === 0"
      type="warning"
      show-icon
      class="case-banner"
      :message="isClientView ? t('import40Case.returnedTitleClient') : t('import40Case.returnedTitle')"
      :description="activeCase.returnReason"
    />

    <!-- Лестница шагов -->
    <div class="steps">
      <Import40Step :index="1" :title="stepTitle(1)" :state="stepState(1)" :now-label="stepNowLabel(1)" :executor="executorLabel('client')" :summary="step1Summary">
        <div class="grid-2">
          <label><span>{{ t('import40Case.cargo') }}</span>
            <a-input v-model:value="step1.cargo" :disabled="!canEditStep1" @blur="commitField('cargo', step1.cargo)" @press-enter="commitField('cargo', step1.cargo)" />
          </label>
          <label><span>{{ t('import40Case.post') }}</span>
            <a-input v-model:value="step1.post" :disabled="!canEditStep1" @blur="commitField('post', step1.post)" @press-enter="commitField('post', step1.post)" />
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
            <label><span>{{ t('import40Case.wagon') }}</span><a-input v-model:value="step1.wagonNumber" :disabled="!canEditStep1" @blur="commitField('wagonNumber', step1.wagonNumber)" @press-enter="commitField('wagonNumber', step1.wagonNumber)" /></label>
            <label><span>{{ t('import40Case.station') }}</span><a-input v-model:value="step1.station" :disabled="!canEditStep1" @blur="commitField('station', step1.station)" @press-enter="commitField('station', step1.station)" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 1">
            <label><span>{{ t('import40Case.vehicle') }}</span><a-input v-model:value="step1.vehicleNumber" :disabled="!canEditStep1" @blur="commitField('vehicleNumber', step1.vehicleNumber)" @press-enter="commitField('vehicleNumber', step1.vehicleNumber)" /></label>
            <label><span>{{ t('import40Case.trailer') }}</span><a-input v-model:value="step1.trailerNumber" :disabled="!canEditStep1" @blur="commitField('trailerNumber', step1.trailerNumber)" @press-enter="commitField('trailerNumber', step1.trailerNumber)" /></label>
            <label><span>{{ t('import40Case.driverPhone') }}</span><PhoneInput v-model:value="step1.driverPhone" :disabled="!canEditStep1" @blur="commitField('driverPhone', step1.driverPhone)" /></label>
          </template>
          <template v-else-if="activeCase.transportMode === 2">
            <label><span>{{ t('import40Case.flight') }}</span><a-input v-model:value="step1.flightNumber" :disabled="!canEditStep1" @blur="commitField('flightNumber', step1.flightNumber)" @press-enter="commitField('flightNumber', step1.flightNumber)" /></label>
            <label><span>{{ t('import40Case.awb') }}</span><a-input v-model:value="step1.airWaybill" :disabled="!canEditStep1" @blur="commitField('airWaybill', step1.airWaybill)" @press-enter="commitField('airWaybill', step1.airWaybill)" /></label>
          </template>
          <template v-else>
            <label><span>{{ t('import40Case.vessel') }}</span><a-input v-model:value="step1.vesselName" :disabled="!canEditStep1" @blur="commitField('vesselName', step1.vesselName)" @press-enter="commitField('vesselName', step1.vesselName)" /></label>
            <label><span>{{ t('import40Case.bl') }}</span><a-input v-model:value="step1.billOfLading" :disabled="!canEditStep1" @blur="commitField('billOfLading', step1.billOfLading)" @press-enter="commitField('billOfLading', step1.billOfLading)" /></label>
          </template>
        </div>

        <div class="sub-label">{{ t('import40Case.containers') }}</div>
        <div v-for="c in activeCase.containers" :key="c.id" class="container-row">
          <strong>{{ c.containerNumber }}</strong><span class="muted">{{ c.containerType }}</span>
          <a-popconfirm v-if="canEditStep1" :title="t('import40Case.deleteContainerConfirm', { number: c.containerNumber })" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" @confirm="removeContainer(c.id)">
            <a-button type="text" danger size="small" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
          </a-popconfirm>
        </div>
        <div v-if="canEditStep1" class="container-add">
          <a-input v-model:value="newContainer.number" :placeholder="t('import40Case.containerNumberPh')" style="max-width: 220px" />
          <a-input v-model:value="newContainer.type" :placeholder="t('import40Case.containerTypePh')" style="max-width: 140px" />
          <a-button :disabled="!newContainer.number.trim()" @click="addContainer">{{ t('import40Case.add') }}</a-button>
        </div>

        <template v-if="hasClientPrefill">
          <!-- «Данные от клиента» не имеет смысла для самого клиента — это его же данные (аудит 5.9). -->
          <div class="sub-label">{{ isClientView ? t('import40Case.clientDataTitleClient') : t('import40Case.clientDataTitle') }}</div>
          <div class="client-prefill">
            <div v-if="activeCase.clientSenderName" class="prefill-row"><span>{{ t('import40Case.sender') }}</span><b>{{ activeCase.clientSenderName }}<template v-if="activeCase.clientSenderCountryCode"> · {{ countryLabel(activeCase.clientSenderCountryCode) }}</template></b></div>
            <div v-if="activeCase.clientReceiverName" class="prefill-row"><span>{{ t('import40Case.receiver') }}</span><b>{{ activeCase.clientReceiverName }}<template v-if="activeCase.clientReceiverBin"> · {{ t('import40Case.binShort') }} {{ activeCase.clientReceiverBin }}</template><template v-if="activeCase.clientReceiverCountryCode"> · {{ countryLabel(activeCase.clientReceiverCountryCode) }}</template></b></div>
            <div v-if="activeCase.clientCurrencyCode || activeCase.clientEstimatedValue != null" class="prefill-row"><span>{{ t('import40Case.value') }}</span><b>{{ activeCase.clientEstimatedValue != null ? localeNum(activeCase.clientEstimatedValue) : '—' }} {{ activeCase.clientCurrencyCode }}</b></div>
          </div>
        </template>

        <div class="sub-label">{{ t('import40Case.docsTitle') }}</div>
        <Import40FilesBlock
          :client-view="isClientView"
          :files="filesBySection('documents')"
          :can-upload="canEditStep1 || roleMode === 'admin'"
          :can-remove="roleMode === 'admin' || canEditStep1"
          :uploading="uploading"
          :empty-text="t('import40Case.docsEmpty')"
          @upload="(f: File) => uploadTo('documents', f)"
          @download="download"
          @remove="removeFile"
        />

        <div v-if="stepState(1) === 'current'" class="step-actions">
          <!-- Мастер умеет то, чего нет прямо в карточке — отправитель/получатель/стоимость (аудит 5.9). -->
          <a-button v-if="isClientView" @click="continueInWizard">{{ t('import40Case.continueInWizard') }}</a-button>
          <a-tooltip :title="can('client') ? '' : hintFor('client')">
            <a-button type="primary" :disabled="!can('client')" @click="promptSubmitForProcessing">
              {{ t('import40Case.submitForProcessing') }}
            </a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="2" :title="stepTitle(2)" :state="stepState(2)" :now-label="stepNowLabel(2)" :executor="executorLabel('kpp')"
        :summary="stepState(2) === 'done' ? t('import40Case.passed') : undefined">
        <p class="muted">{{ t('import40Case.transportPrefix', { summary: transportSummary }) }}</p>
        <p v-if="isClientView && stepState(2) === 'current'" class="muted client-wait">{{ t('import40Case.clientWaitNote') }}</p>
        <div v-if="stepState(2) === 'current' && !isClientView" class="step-actions">
          <a-button v-if="claimVisible('kpp')" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
          <a-tooltip :title="actionTooltip('kpp')">
            <a-popconfirm :title="t('import40Case.confirmBorderPassed')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" :disabled="actionDisabled('kpp')" @confirm="runAction('border-passed')">
              <a-button type="primary" :disabled="actionDisabled('kpp')">{{ t('import40Case.borderPassed') }}</a-button>
            </a-popconfirm>
          </a-tooltip>
          <a-tooltip :title="can('kpp') || can('declarant') ? '' : hintFor('kpp')">
            <a-button :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">{{ t('import40Case.returnToClient') }}</a-button>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="3" :title="stepTitle(3)" :state="stepState(3)" :now-label="stepNowLabel(3)" :executor="executorLabel('declarant')"
        :summary="stepState(3) === 'done' ? t('import40Case.dtCount', { n: activeCase.declarations.length }) : undefined">
        <div v-if="!activeCase.declarations.length" class="muted">{{ t('import40Case.noDt') }}</div>

        <a-input
          v-if="activeCase.declarations.length > 1"
          v-model:value="dtSearch"
          allow-clear
          :placeholder="t('import40Case.searchDt')"
          style="max-width: 320px; margin-bottom: 8px"
        />

        <div v-for="(dt, i) in filteredDeclarations" :key="dt.id" class="dt-row" :class="{ 'dt-row--replaced': dt.isSplitReplaced }">
          <div class="dt-row-main">
            <strong>{{ dt.declarationNumber || t('import40Case.dtFallback', { n: i + 1 }) }}</strong>
            <a-tooltip :title="splitTagTooltip(dt)">
              <!-- ЕТТ/ВТО — внутренняя классификация декларации, клиенту скрываем (аудит 5.18). -->
              <a-tag v-if="!isClientView && splitTagLabel(dt)" :color="splitTagColor(dt)">{{ splitTagLabel(dt) }}</a-tag>
            </a-tooltip>
            <span class="muted">{{ t('import40Case.goodsCount', { n: dt.goodsItems.length }) }}</span>
            <a-tag v-if="readiness[dt.id] && !isClientView" :color="readiness[dt.id].missing.length ? 'warning' : 'success'">
              {{ t('import40Case.fieldsFilled', { filled: readiness[dt.id].filled, total: readiness[dt.id].total }) }}
            </a-tag>
          </div>
          <div v-if="!isClientView" class="dt-row-actions">
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" @click="$router.push(`/import-40/${activeCase.id}/dt/${dt.id}`)">{{ t('import40Case.fill') }}</a-button>
            </a-tooltip>
            <a-tooltip :title="can('declarant') ? '' : hintFor('declarant')">
              <a-button size="small" :disabled="!can('declarant')" :loading="xmlLoading === dt.id" @click="exportXml(dt.id)">{{ t('import40Case.xmlForKeden') }}</a-button>
            </a-tooltip>
            <a-popconfirm v-if="can('declarant')" :title="t('import40Case.deleteDt')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" @confirm="removeDt(dt.id)">
              <a-button size="small" type="text" danger :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
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

        <a-alert v-if="kedenMissing.length && !isClientView" type="warning" show-icon class="keden-missing">
          <template #message>{{ t('import40Case.xmlMissingTitle') }}</template>
          <template #description><ul><li v-for="m in kedenMissing" :key="m">{{ m }}</li></ul></template>
        </a-alert>

        <p v-if="isClientView && stepState(3) === 'current'" class="muted client-wait">{{ t('import40Case.clientWaitNote') }}</p>
        <div v-if="stepState(3) === 'current' && !isClientView" class="step-actions">
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
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
              style="display: none"
              @change="handleBatchFilesSelected"
            />
          </template>
          <a-button v-if="claimVisible('declarant')" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
          <a-tooltip v-if="activeCase.status === 2" :title="actionTooltip('declarant')">
            <a-button type="primary" :disabled="actionDisabled('declarant') || !activeCase.declarations.length" @click="runAction('submit-declaration')">{{ t('import40Case.submitDt') }}</a-button>
          </a-tooltip>
          <!-- Со статуса «ДТ подана» и дальше возврат в черновик клиента бессмыслен (аудит 3.9/M8):
               кнопка видна только на «Декларирование» (статус 2), пока ДТ ещё не ушла в КЕДЕН. -->
          <a-tooltip v-if="activeCase.status === 2" :title="can('kpp') || can('declarant') ? '' : hintFor('declarant')">
            <a-button :disabled="!(can('kpp') || can('declarant'))" @click="promptReturn">{{ t('import40Case.returnToClient') }}</a-button>
          </a-tooltip>
        </div>
        <div v-if="activeCase.status === 3 && !isClientView" class="step-actions">
          <p class="muted">{{ t('import40Case.status3Note') }}</p>
          <a-tooltip :title="actionTooltip('declarant')">
            <a-popconfirm :title="t('import40Case.confirmRelease')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" :disabled="actionDisabled('declarant')" @confirm="runAction('release-declaration')">
              <a-button type="primary" :disabled="actionDisabled('declarant')">{{ t('import40Case.fixRelease') }}</a-button>
            </a-popconfirm>
          </a-tooltip>
        </div>
      </Import40Step>
      <Import40Step :index="4" :title="stepTitle(4)" :state="stepState(4)" :now-label="stepNowLabel(4)" :executor="executorLabel('kpp')"
        :summary="stepState(4) === 'done' ? step4Summary : undefined">
        <div class="sub-label">{{ t('import40Case.stampTitle') }}</div>
        <Import40FilesBlock :client-view="isClientView" :files="filesBySection('declaration-stamp')" :can-upload="stepState(4) === 'current' && can('kpp')"
          :uploading="uploading" :empty-text="t('import40Case.stampEmpty')"
          @upload="(f: File) => uploadTo('declaration-stamp', f)" @download="download" />
        <div class="sub-label">{{ t('import40Case.svhInvoiceTitle') }}
          <a-tag v-if="activeCase.svhInvoiceAmount != null" color="blue">{{ Math.round(activeCase.svhInvoiceAmount).toLocaleString('ru-RU') }} ₸<template v-if="activeCase.svhInvoiceNumber"> · № {{ activeCase.svhInvoiceNumber }}</template></a-tag>
          <a-tag v-if="activeCase.svhInvoiceNote">{{ activeCase.svhInvoiceNote }}</a-tag>
        </div>
        <Import40FilesBlock :client-view="isClientView" :files="filesBySection('svh-invoice')" :can-upload="stepState(4) === 'current' && can('kpp')"
          :uploading="uploading" :empty-text="t('import40Case.svhInvoiceEmpty')"
          @upload="(f: File) => uploadTo('svh-invoice', f)" @download="download" />
        <p v-if="isClientView && stepState(4) === 'current'" class="muted client-wait">{{ t('import40Case.clientWaitNote') }}</p>
        <div v-if="stepState(4) === 'current' && !isClientView" class="step-actions">
          <a-tooltip v-if="activeCase.status === 4" :title="actionTooltip('kpp')">
            <a-popconfirm :title="t('import40Case.confirmCloseSvh')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')" :disabled="actionDisabled('kpp')" @confirm="runAction('close-svh')">
              <a-button type="primary" :disabled="actionDisabled('kpp')">{{ t('import40Case.closeSvh') }}</a-button>
            </a-popconfirm>
          </a-tooltip>
          <a-tooltip v-if="activeCase.status === 5" :title="actionTooltip('kpp')">
            <a-button type="primary" :disabled="actionDisabled('kpp')" @click="promptInvoice">{{ t('import40Case.issueInvoice') }}</a-button>
          </a-tooltip>
          <a-button v-if="claimVisible('kpp')" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
        </div>
      </Import40Step>
      <Import40Step :index="5" :title="stepTitle(5)" :state="stepState(5)" :now-label="stepNowLabel(5)" :executor="executorLabel('clientKpp')"
        :summary="stepState(5) === 'done' ? t('import40Case.paid') : undefined">
        <div class="sub-label">{{ t('import40Case.paymentCheckTitle') }}
          <a-tag v-if="activeCase.paymentConfirmed" color="success">{{ t('import40Case.paymentConfirmed') }}</a-tag>
          <a-tag v-else-if="filesBySection('payment-check').length" color="processing">{{ t('import40Case.paymentChecking') }}</a-tag>
        </div>
        <p v-if="isClientView && stepState(5) === 'current' && !filesBySection('payment-check').length" class="client-pay-note">{{ t('import40Case.clientPayNote') }}</p>
        <!-- КПП/руководитель может загрузить чек за клиента (аудит 3.7) — can-upload не только для клиента. -->
        <Import40FilesBlock :client-view="isClientView" :files="filesBySection('payment-check')" :can-upload="stepState(5) === 'current' && (can('client') || can('kpp'))"
          :uploading="uploading" :empty-text="isClientView ? t('import40Case.clientPayEmpty') : t('import40Case.paymentEmpty')"
          @upload="(f: File) => uploadTo('payment-check', f)" @download="download" />
        <div v-if="stepState(5) === 'current' && !isClientView" class="step-actions">
          <a-tooltip :title="stepBlockedBy('kpp') ? actionTooltip('kpp') : can('kpp') ? (filesBySection('payment-check').length ? '' : t('import40Case.clientNoCheck')) : hintFor('kpp')">
            <a-popconfirm :title="t('import40Case.confirmSvhPayment')" :ok-text="t('import40Case.yes')" :cancel-text="t('import40Case.no')"
              :disabled="actionDisabled('kpp') || !filesBySection('payment-check').length" @confirm="runAction('confirm-svh-payment')">
              <a-button type="primary" :disabled="actionDisabled('kpp') || !filesBySection('payment-check').length">{{ t('import40Case.confirmPayment') }}</a-button>
            </a-popconfirm>
          </a-tooltip>
          <a-button v-if="claimVisible('kpp')" @click="runAction('claim')">{{ t('import40Case.claim') }}</a-button>
        </div>
      </Import40Step>
      <!-- Шаг 6: оплата услуг AQNIET (задача 2.3) — выставляет и отмечает оплату бухгалтер в /billing. -->
      <Import40Step :index="6" :title="stepTitle(6)" :state="stepState(6)" :now-label="stepNowLabel(6)" :executor="executorLabel('accountant')"
        :summary="stepState(6) === 'done' ? t('import40Case.aqnietPaid') : undefined">
        <div v-if="!caseInvoices.length" class="muted">{{ t('import40Case.invoicesEmpty') }}</div>
        <div v-for="inv in caseInvoices" :key="inv.id" class="invoice-list-row">
          <span>{{ inv.kind === 'act' ? t('billing.act') : t('billing.invoice') }} {{ inv.number ? `№ ${inv.number}/${inv.year}` : t('billing.draftNo') }}</span>
          <a-tag :color="invoiceStatusColor(inv.status)">{{ invoiceStatusLabel(inv.status) }}</a-tag>
          <span class="muted">{{ Math.round(inv.total).toLocaleString('ru-RU') }} ₸</span>
          <a-button size="small" @click="downloadInvoicePdf(inv)"><DownloadOutlined /> PDF</a-button>
        </div>
        <div v-if="stepState(6) === 'current'" class="step-actions">
          <a-button v-if="canIssueAqnietInvoice" type="primary" @click="$router.push(`/billing?caseId=${activeCase.id}`)">
            {{ t('import40Case.issueAqnietInvoice') }}
          </a-button>
          <p v-else class="muted">{{ t('import40Case.awaitingAqnietPayment') }}</p>
          <a-button v-if="roleMode === 'admin'" danger @click="promptCompleteWithoutInvoice">
            {{ t('import40Case.completeWithoutInvoice') }}
          </a-button>
        </div>
      </Import40Step>
    </div>

    <!-- Низ: все файлы + история -->
    <a-collapse ghost class="case-bottom">
      <a-collapse-panel key="files" :header="t('import40Case.allFiles', { n: files.length })">
        <Import40FilesBlock :client-view="isClientView" :files="files" :can-upload="false" @download="download" />
      </a-collapse-panel>
      <a-collapse-panel key="history" :header="t('import40Case.history')">
        <div v-for="l in activeCase.logs" :key="l.id" class="log-row">
          <span class="log-date">{{ new Date(l.createdAtUtc).toLocaleString(INTL_LOCALE[locale] ?? 'ru-RU') }}</span>
          <span>{{ l.text }}</span>
          <!-- Клиенту — только «Вы»/«AQNIET» (бэк уже фильтрует и переводит эти записи, аудит 5.5),
               без роли и кода. Сотруднику — «ФИО · роль» (аудит M2). -->
          <a-tag v-if="isClientView">{{ l.changedByName }}</a-tag>
          <a-tag v-else>{{ l.changedByName ? `${l.changedByName} · ` : '' }}{{ t('enum.businessRole.' + l.changedByBusinessRole, l.changedByBusinessRole) }}</a-tag>
        </div>
      </a-collapse-panel>
    </a-collapse>

    <a-modal v-model:open="returnOpen" :title="t('import40Case.returnTitle')" :ok-text="t('import40Case.returnOk')" :cancel-text="t('common.cancel')" :ok-button-props="{ disabled: !returnReason.trim() }" @ok="confirmReturn">
      <a-textarea v-model:value="returnReason" :rows="3" :placeholder="t('import40Case.returnPh')" />
    </a-modal>

    <!-- Отправка из карточки черновика — то же подтверждение ответственности, что и в мастере
         (аудит 5.11): клиент мог попасть сюда напрямую, минуя мастер (по ссылке/дашборду). -->
    <a-modal
      v-model:open="submitConfirmOpen"
      :title="t('import40List.respTitle')"
      :ok-text="t('import40Case.submitForProcessing')"
      :cancel-text="t('common.cancel')"
      :ok-button-props="{ disabled: !submitResponsibilityAccepted || !filesBySection('documents').length }"
      @ok="confirmSubmitForProcessing"
    >
      <a-alert type="warning" show-icon class="case-banner" :message="t('import40List.respTitle')" :description="t('import40List.respDesc')" />
      <p v-if="!filesBySection('documents').length" class="muted">{{ t('import40Case.docsEmpty') }}</p>
      <a-checkbox v-model:checked="submitResponsibilityAccepted" class="resp-check">{{ t('import40List.respConfirm') }}</a-checkbox>
    </a-modal>

    <a-modal
      v-model:open="problemOpen" :title="t('import40Case.problemTitle')" :ok-text="t('import40Case.problemOk')"
      :cancel-text="t('common.cancel')" :ok-button-props="{ disabled: !problemNote.trim() }" @ok="confirmProblem"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('import40Case.problemNoteLabel')" required>
          <a-textarea v-model:value="problemNote" :rows="3" :placeholder="t('import40Case.problemPh')" />
        </a-form-item>
        <a-form-item :label="t('import40Case.problemClientMessageLabel')">
          <a-textarea v-model:value="problemClientMessage" :rows="3" :placeholder="t('import40Case.problemClientMessagePh')" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="invoiceOpen" :title="t('import40Case.invoiceTitle')" :ok-text="t('import40Case.invoiceOk')" :cancel-text="t('common.cancel')" @ok="confirmInvoice">
      <a-form layout="vertical">
        <a-form-item :label="t('import40Case.invoiceAmount')" required>
          <a-input-number v-model:value="invoiceForm.amount" :min="0" :precision="2" style="width: 100%" :placeholder="t('import40Case.invoicePh')" />
        </a-form-item>
        <div class="invoice-row">
          <a-form-item :label="t('import40Case.invoiceNumber')"><a-input v-model:value="invoiceForm.number" /></a-form-item>
          <a-form-item :label="t('import40Case.invoiceDate')"><a-date-picker v-model:value="invoiceForm.date" format="DD.MM.YYYY" value-format="YYYY-MM-DD" style="width: 100%" /></a-form-item>
        </div>
        <a-form-item :label="t('import40Case.invoiceNote')"><a-input v-model:value="invoiceForm.note" /></a-form-item>
      </a-form>
    </a-modal>
    <a-modal
      v-model:open="stepBackOpen"
      :title="t('import40Case.stepBackTitle')"
      :ok-text="t('import40Case.stepBackOk')"
      :cancel-text="t('common.cancel')"
      :ok-button-props="{ disabled: !stepBackReason.trim() }"
      @ok="confirmStepBack"
    >
      <p class="muted">{{ t('import40Case.stepBackHint') }}</p>
      <a-textarea v-model:value="stepBackReason" :rows="3" :placeholder="t('import40Case.stepBackPh')" />
    </a-modal>

    <a-modal v-model:open="cancelOpen" :title="t('import40Case.cancelTitle')" :ok-text="t('import40Case.cancelOk')" :cancel-text="t('common.cancel')" :ok-button-props="{ danger: true, disabled: !cancelReason.trim() }" @ok="confirmCancel">
      <!-- Клиенту отменять можно только свой черновик — «в работе и статистике» звучит как
           внутренняя кухня сотрудников, ему это ни о чём не говорит (аудит 23/28). -->
      <p class="muted">{{ isClientView ? t('import40Case.cancelHintClient') : t('import40Case.cancelHint') }}</p>
      <a-textarea v-model:value="cancelReason" :rows="3" :placeholder="t('import40Case.cancelPh')" />
    </a-modal>

    <a-modal
      v-model:open="completeWithoutInvoiceOpen"
      :title="t('import40Case.completeWithoutInvoice')"
      :ok-text="t('import40Case.completeWithoutInvoiceOk')"
      :cancel-text="t('common.cancel')"
      :ok-button-props="{ danger: true, disabled: !completeWithoutInvoiceReason.trim() }"
      @ok="confirmCompleteWithoutInvoice"
    >
      <p class="muted">{{ t('import40Case.completeWithoutInvoiceHint') }}</p>
      <a-textarea v-model:value="completeWithoutInvoiceReason" :rows="3" :placeholder="t('import40Case.completeWithoutInvoicePh')" />
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
      :width="760" :ok-text="t('import40Case.issuesOk')" :cancel-button-props="{ style: { display: 'none' } }"
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
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import {
  IMPORT40_TRANSPORT_MODES,
  import40Api,
  type Import40Action,
  type Import40CaseDto,
  type Import40CaseInvoiceDto,
  type Import40DeclarationDto,
  type Import40DeclarationUpsert,
  type Import40ExtractionPreview,
  type Import40ExtractionResult,
  type Import40FileDto,
  type Import40FileSection,
  type KedenReadinessDto,
} from '@/api/import40'
import type { DeclarationReadiness, RefCodeItem } from '@/types/api'
import type { SalesQuoteListItem } from '@/api/sales'
import { useAuthStore } from '@/stores/auth'
import { manageApi, type StaffMember } from '@/api/manage'
import { billingApi } from '@/api/billing'
import { referencesApi } from '@/api/references'
import Import40Step from '@/components/Import40Step.vue'
import Import40FilesBlock from '@/components/Import40FilesBlock.vue'
import PageHeader from '@/components/PageHeader.vue'
import { TOTAL_STEPS, isCompleted, stepForStatus } from '@/utils/import40Steps'
import { countryName } from '@/utils/countries'
import PhoneInput from '@/components/ui/PhoneInput.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { t, locale } = useI18n()

// Индекс шага (1..5) → переведённый заголовок; заменяет STEP_TITLES из utils.
// Клиентский словарь шагов (аудит 5.6/5.18): без жаргона «Граница»/«СВХ», отдельно от
// сотрудничьего enum.step, который менять нельзя — им пользуется весь процесс.
const stepTitle = (n: number) => t(roleMode.value === 'client' ? `enum.stepClient.s${n}` : `enum.step.s${n}`)
// «вы здесь» ошибочно на шагах, которые делает AQNIET (аудит 5.17): клиенту — «сейчас» на своём
// шаге (1) и «сейчас у AQNIET» на остальных; сотруднику — обычное «вы здесь» (nowLabel не передан).
const stepNowLabel = (n: number) => (roleMode.value === 'client' ? (n === 1 ? t('import40Case.stepNowClient') : t('import40Case.stepNowClientUs')) : undefined)
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
const problemClientMessage = ref('')

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
// Мультироли: действие доступно, если у пользователя есть соответствующая бизнес-роль
// (любая из нескольких) или он руководитель отдела/админ.
// …и по правам из матрицы: шаги КПП — import40.kpp, ДТ — import40.declarant.
const PERM_FOR: Record<string, string> = { kpp: 'import40.kpp', declarant: 'import40.declarant' }
const can = (role: RoleMode) =>
  roleMode.value === 'admin' || roleMode.value === role
  || (role !== 'client' && role !== 'other' && (authStore.hasBusinessRole(role) || authStore.hasBusinessRole('rop')
      || (PERM_FOR[role] ? authStore.hasPermission(PERM_FOR[role]) : false)))
// Назначать сотрудников — право import40.assign (руководитель отдела, админ).
const canAssign = computed(() => roleMode.value === 'admin' || authStore.hasPermission('import40.assign'))

// Кто выполняет шаг — словами зрителя. Клиенту «КПП»/«декларант» ни о чём не говорят:
// для него это «вы» и «AQNIET».
const executorLabel = (role: 'client' | 'kpp' | 'declarant' | 'clientKpp' | 'accountant') => {
  if (roleMode.value === 'client') {
    return role === 'client' ? t('enum.role.you') : role === 'clientKpp' ? t('enum.role.youAndUs') : t('enum.role.us')
  }
  return t(`enum.role.${role}`)
}
const hintFor = (role: string) => {
  const key = role === 'kpp' ? 'kpp' : role === 'declarant' ? 'declarant' : 'client'
  return t('import40Case.hintFor', { role: executorLabel(key) })
}

// Право именно на роль шага, без «руководитель/админ может всё» (3.1): у руководителя вместо
// кнопки «Взять в работу» — селекты назначения (canAssign), claim ему не нужен.
const hasStepPermission = (role: 'kpp' | 'declarant') => authStore.hasBusinessRole(role) || authStore.hasPermission(PERM_FOR[role])
const claimVisible = (role: 'kpp' | 'declarant') => {
  if (canAssign.value || !activeCase.value) return false
  const assignedId = role === 'kpp' ? activeCase.value.assignedKppId : activeCase.value.assignedDeclarantId
  return hasStepPermission(role) && !assignedId
}

// Шаг занят другим исполнителем (3.8) — имя для подсказки и дизейбла кнопки действия.
// Руководитель/админ не блокируются (StepOwnerOk на бэке разрешает им всегда).
const stepBlockedBy = (role: 'kpp' | 'declarant'): string | null => {
  const c = activeCase.value
  if (!c || canAssign.value) return null
  const assignedId = role === 'kpp' ? c.assignedKppId : c.assignedDeclarantId
  if (!assignedId || assignedId === authStore.userId) return null
  const name = role === 'kpp' ? c.assignedKppName : c.assignedDeclarantName
  return name || t('import40Case.staffAssigned')
}
const actionDisabled = (role: 'kpp' | 'declarant') => !can(role) || !!stepBlockedBy(role)
const actionTooltip = (role: 'kpp' | 'declarant') => {
  const blocker = stepBlockedBy(role)
  if (blocker) return t('import40Case.busyBy', { name: blocker })
  return can(role) ? '' : hintFor(role)
}

// Имя исполнителя в шапке заявки — «вы» для себя, иначе имя из DTO (видят все сотрудники, M3).
const nameFor = (id: string | null, name: string | null) => {
  if (!id) return ''
  if (id === authStore.userId) return t('import40Case.you')
  return name || t('import40Case.staffAssigned')
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
// Задача 2.4 (аудит H5/3.3): исходную ДТ после разделения помечает бэк (isSplitReplaced) — она
// заменена дочерними ЕТТ/ВТО и больше не участвует в готовности/выгрузке, показываем её серой.
const splitTagLabel = (dt: Import40DeclarationDto) => {
  if (dt.isSplitReplaced) return t('import40Case.splitReplaced')
  if (dt.splitRole === 'VTO') return 'ВТО'
  if (dt.splitRole === 'ETT') return 'ЕТТ'
  if (!dt.splitRole && dt.rateType === 'EATT') return 'ВТО'
  return null
}
const splitTagColor = (dt: Import40DeclarationDto) => (dt.isSplitReplaced ? 'default' : splitTagLabel(dt) === 'ВТО' ? 'purple' : 'blue')
const splitTagTooltip = (dt: Import40DeclarationDto) => {
  if (dt.isSplitReplaced) return t('import40Case.splitReplacedTooltip')
  if (!dt.splitSourceDeclarationId) return ''
  const source = activeCase.value?.declarations.find((d) => d.id === dt.splitSourceDeclarationId)
  const num = source?.declarationNumber || dt.splitSourceDeclarationId
  return t('import40Case.splitTooltip', { num })
}

// Итог шага 4 показывает сумму счёта СВХ, а не только примечание (аудит L8) — без суммы «закрыт»
// не объяснял, зачем клиент видит счёт на шаге 5.
const step4Summary = computed(() => {
  const c = activeCase.value
  if (!c) return undefined
  if (c.svhInvoiceAmount != null) {
    const amount = `${Math.round(c.svhInvoiceAmount).toLocaleString('ru-RU')} ₸`
    const withNumber = c.svhInvoiceNumber ? `${amount} · № ${c.svhInvoiceNumber}` : amount
    return c.svhInvoiceNote ? `${withNumber} · ${c.svhInvoiceNote}` : withNumber
  }
  return c.svhInvoiceNote ? t('import40Case.invoicePrefix', { note: c.svhInvoiceNote }) : t('import40Case.closed')
})

const currentStep = computed(() => (activeCase.value ? stepForStatus(activeCase.value.status) : 1))
// Отменённая заявка: шаги не «выполнены» — показываем их как не начатые (серые), без галочек.
const stepState = (n: number): 'done' | 'current' | 'future' =>
  activeCase.value?.status === 9 ? 'future'
  : n < currentStep.value ? 'done' : n === currentStep.value ? 'current' : 'future'

const step1Summary = computed(() =>
  activeCase.value ? `${activeCase.value.cargo || '—'} · файлов: ${filesBySection('documents').length}` : undefined,
)

// Счета AQNIET по заявке — шаг 6 (задача 2.3). Клиент видит их и скачивает PDF (аудит 5.2):
// список ниже не гейтится по finance.read — бэк GetBrokerInvoices уже отдаёт клиенту только
// свои выставленные счета.
const caseInvoices = ref<Import40CaseInvoiceDto[]>([])

const downloadInvoicePdf = async (inv: Import40CaseInvoiceDto) => {
  try {
    const blob = await billingApi.pdf(inv.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inv.kind === 'act' ? 'Акт' : 'Счёт'}-${inv.number || 'черновик'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    if (!e?.response) message.error(t('billing.actionError'))
  }
}

const reload = async () => {
  const id = String(route.params.id)
  activeCase.value = await import40Api.get(id)
  files.value = await import40Api.listFiles(id)
  assignForm.declarantId = activeCase.value?.assignedDeclarantId ?? null
  assignForm.kppId = activeCase.value?.assignedKppId ?? null
  syncStep1()
  try {
    caseInvoices.value = await import40Api.listBrokerInvoices(id)
  } catch {
    caseInvoices.value = []
  }
  void loadReadiness()
}

const filesBySection = (s: Import40FileSection | string) => files.value.filter((f) => f.section === s)

const runAction = async (key: Import40Action, value?: string) => {
  if (!activeCase.value) return
  try {
    await import40Api.action(activeCase.value.id, key, value)
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  }
}

const uploadTo = async (section: Import40FileSection | string, file: File) => {
  if (!activeCase.value) return
  uploading.value = true
  try {
    await import40Api.uploadFile(activeCase.value.id, section as Import40FileSection, file)
    files.value = await import40Api.listFiles(activeCase.value.id)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
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
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  }
}

// Клиент видит ход своей заявки и только свои действия (отправка, файлы, чек) — кнопки
// сотрудников ему не показываем вовсе, а не выключенными (владелец, 2026-09-28).
const isClientView = computed(() => roleMode.value === 'client')

const canEditStep1 = computed(() => stepState(1) === 'current' && can('client'))

// Текстовые поля шага 1 (аудит 5.12): локальный черновик + v-model, сохраняем по blur/Enter,
// а не на каждый символ. Ответ сервера мержим в activeCase точечно — без reload() всей заявки
// (файлы/счета/readiness не меняются от правки груза/поста/транспорта).
type Step1Field = 'cargo' | 'post' | 'wagonNumber' | 'station' | 'vehicleNumber' | 'trailerNumber'
  | 'driverPhone' | 'flightNumber' | 'airWaybill' | 'vesselName' | 'billOfLading'
const step1 = reactive<Record<Step1Field, string>>({
  cargo: '', post: '', wagonNumber: '', station: '', vehicleNumber: '', trailerNumber: '',
  driverPhone: '', flightNumber: '', airWaybill: '', vesselName: '', billOfLading: '',
})
const syncStep1 = () => {
  const c = activeCase.value
  if (!c) return
  step1.cargo = c.cargo || ''
  step1.post = c.post || ''
  step1.wagonNumber = c.wagonNumber || ''
  step1.station = c.station || ''
  step1.vehicleNumber = c.vehicleNumber || ''
  step1.trailerNumber = c.trailerNumber || ''
  step1.driverPhone = c.driverPhone || ''
  step1.flightNumber = c.flightNumber || ''
  step1.airWaybill = c.airWaybill || ''
  step1.vesselName = c.vesselName || ''
  step1.billOfLading = c.billOfLading || ''
}

const saveField = async (patch: Record<string, unknown>) => {
  if (!activeCase.value || !canEditStep1.value) return
  try {
    activeCase.value = await import40Api.update(activeCase.value.id, patch as never)
    syncStep1()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — откатываем поле к серверному.
    syncStep1()
  }
}

// Сохраняем поле, только если значение реально изменилось — иначе blur/Enter без правки
// (например, просто прошли табом по полям) слали бы пустой PUT.
const commitField = (field: Step1Field, value: string) => {
  if (!activeCase.value) return
  const current = (activeCase.value[field] as string | null) || ''
  if (value === current) return
  void saveField({ [field]: value })
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

// Черновик умеет больше в мастере (отправитель/получатель/стоимость) — уводим туда (аудит 5.9).
const continueInWizard = () => {
  if (!activeCase.value) return
  router.push(`/import-40?continueId=${activeCase.value.id}`)
}

// Отправка из карточки черновика требует того же подтверждения ответственности, что и мастер
// (аудит 5.11) — клиент мог сюда попасть напрямую, а не через мастер.
const submitConfirmOpen = ref(false)
const submitResponsibilityAccepted = ref(false)
const promptSubmitForProcessing = () => {
  if (!isClientView.value) {
    void runAction('submit-for-processing')
    return
  }
  submitResponsibilityAccepted.value = false
  submitConfirmOpen.value = true
}
const confirmSubmitForProcessing = async () => {
  submitConfirmOpen.value = false
  await runAction('submit-for-processing')
}

const promptProblem = () => {
  problemNote.value = ''
  problemClientMessage.value = ''
  problemOpen.value = true
}
const confirmProblem = async () => {
  if (!problemNote.value.trim()) return
  problemOpen.value = false
  if (!activeCase.value) return
  try {
    // Внутренняя заметка (Value) обязательна и видят её только сотрудники; сообщение клиенту
    // (ClientMessage) — необязательное, уходит клиенту дословно (аудит 2.9, задача 2.9).
    await import40Api.action(activeCase.value.id, 'set-problem', problemNote.value,
      { clientMessage: problemClientMessage.value.trim() || null })
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  }
}

// Ответ клиента на «Что нужно от вас» (аудит 5.8) — уходит в историю сотрудникам и уведомляет
// исполнителя заявки (декларанта/КПП, иначе руководителей).
const clientReplyText = ref('')
const clientReplySaving = ref(false)
const sendClientReply = async () => {
  if (!activeCase.value || !clientReplyText.value.trim()) return
  clientReplySaving.value = true
  try {
    await import40Api.action(activeCase.value.id, 'client-reply', clientReplyText.value.trim())
    clientReplyText.value = ''
    message.success(t('import40Case.problemReplySent'))
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    clientReplySaving.value = false
  }
}

// Бейдж «в работе у меня / занято коллегой» — по роли ТЕКУЩЕГО шага (не по roleMode, чтобы
// не путать мультиролевого сотрудника, который одновременно и декларант, и КПП).
const assignedTag = computed<'me' | 'other' | null>(() => {
  const c = activeCase.value
  const uid = authStore.userId
  if (!c || !uid) return null
  const kppStatuses = [1, 4, 5, 6] // AtBorder, Released, SvhClosing, Invoiced
  const declarantStatuses = [2, 3] // Declaring, Submitted
  if (kppStatuses.includes(c.status)) {
    if (!c.assignedKppId) return null
    return c.assignedKppId === uid ? 'me' : 'other'
  }
  if (declarantStatuses.includes(c.status)) {
    if (!c.assignedDeclarantId) return null
    return c.assignedDeclarantId === uid ? 'me' : 'other'
  }
  return null
})

// Назначения (руководитель/админ): каталог сотрудников + селекты в шапке
const staffList = ref<StaffMember[]>([])
// Сотрудники с бизнес-ролями (мультироли): селекты КПП/декларанта фильтруются по roles.
const loadStaffOptions = async () => {
  if (!canAssign.value) return
  try {
    staffList.value = await manageApi.staff()
  } catch {
    /* каталог недоступен — селекты будут пустыми */
  }
}
const staffLabel = (u: StaffMember) => u.displayName || u.username
const declarantOptions = computed(() =>
  staffList.value.filter((u) => u.roles.includes('declarant')).map((u) => ({ value: u.id, label: staffLabel(u) })),
)
const kppOptions = computed(() =>
  staffList.value.filter((u) => u.roles.includes('kpp')).map((u) => ({ value: u.id, label: staffLabel(u) })),
)

const assignForm = reactive<{ declarantId: string | null; kppId: string | null }>({ declarantId: null, kppId: null })
const assignSaving = ref(false)
const saveAssignment = async () => {
  if (!activeCase.value) return
  assignSaving.value = true
  try {
    // Декларант и КПП назначаются независимо (владелец, 2026-09-28).
    await import40Api.update(activeCase.value.id, {
      assignedDeclarantId: assignForm.declarantId || '00000000-0000-0000-0000-000000000000',
      assignedKppId: assignForm.kppId || '00000000-0000-0000-0000-000000000000',
    } as never)
    message.success(t('import40Case.assignSaved'))
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    assignSaving.value = false
  }
}

const invoiceForm = reactive<{ amount: number | null; number: string; date: string | null; note: string }>({ amount: null, number: '', date: null, note: '' })
const promptInvoice = () => {
  invoiceForm.amount = null; invoiceForm.number = ''; invoiceForm.date = new Date().toISOString().slice(0, 10); invoiceForm.note = ''
  invoiceOpen.value = true
}
const confirmInvoice = async () => {
  if (!invoiceForm.amount || invoiceForm.amount <= 0) { message.warning(t('import40Case.invoiceAmountRequired')); return }
  invoiceOpen.value = false
  if (!activeCase.value) return
  try {
    await import40Api.action(activeCase.value.id, 'issue-invoice', invoiceForm.note || undefined,
      { amount: invoiceForm.amount, number: invoiceForm.number || null, date: invoiceForm.date })
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  }
}

// Отмена заявки: руководитель/админ — любую незавершённую, клиент — свою черновую (п.5 аудита).
const cancelOpen = ref(false)
const cancelReason = ref('')
const canCancel = computed(() => {
  const c = activeCase.value
  if (!c || c.status >= 8) return false
  if (roleMode.value === 'admin' || authStore.hasPermission('import40.assign')) return true
  return roleMode.value === 'client' && c.status === 0
})
const promptCancel = () => { cancelReason.value = ''; cancelOpen.value = true }

// Счета и акты по этой заявке — для тех, кто видит финансы.
const canSeeBilling = computed(() => authStore.hasPermission('finance.read') || roleMode.value === 'admin')

// Шаг 6 (задача 2.3): выставлять счёт AQNIET может только бухгалтер/руководитель (finance.write) или админ.
const canIssueAqnietInvoice = computed(() => roleMode.value === 'admin' || authStore.hasPermission('finance.write'))
const invoiceStatusLabel = (s: number) =>
  s === 2 ? t('billing.paidStatus') : s === 1 ? t('billing.issuedStatus') : s === 3 ? t('billing.cancelled') : t('billing.draftNo')
const invoiceStatusColor = (s: number) => (s === 2 ? 'success' : s === 1 ? 'processing' : s === 3 ? 'error' : 'default')

// Админ: завершить старую заявку без счёта AQNIET — обязательна причина.
const completeWithoutInvoiceOpen = ref(false)
const completeWithoutInvoiceReason = ref('')
const promptCompleteWithoutInvoice = () => { completeWithoutInvoiceReason.value = ''; completeWithoutInvoiceOpen.value = true }
const confirmCompleteWithoutInvoice = async () => {
  completeWithoutInvoiceOpen.value = false
  await runAction('complete-without-invoice', completeWithoutInvoiceReason.value.trim())
}

// Возврат на предыдущий шаг (руководитель/админ): маршрут перестал быть «только вперёд».
const stepBackOpen = ref(false)
const stepBackReason = ref('')
const canStepBack = computed(() => {
  const c = activeCase.value
  if (!c) return false
  if (c.status <= 0 || c.status >= 8) return false
  return roleMode.value === 'admin' || authStore.hasPermission('import40.assign')
})
const promptStepBack = () => { stepBackReason.value = ''; stepBackOpen.value = true }
const confirmStepBack = async () => {
  stepBackOpen.value = false
  await runAction('step-back', stepBackReason.value.trim())
}
const confirmCancel = async () => {
  cancelOpen.value = false
  await runAction('cancel', cancelReason.value.trim())
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
  if (!activeCase.value) return
  imp.quoteId = null
  imp.target = 'new'
  imp.declarationId = null
  imp.force = false
  importQuoteOpen.value = true
  quotesLoading.value = true
  try {
    // КП только клиента этой заявки, через import40.declarant (аудит 3.5/H7) — раньше дёргали
    // GET sales/quotes, куда декларанта не пускает sales.read, и модалка всегда падала.
    quotes.value = await import40Api.caseQuotes(activeCase.value.id)
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
      // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
    }
  } finally {
    importQuoteLoading.value = false
  }
}

// Справочник стран — только для отображения названия вместо кода в блоке данных клиента
// (аудит 5.13); загружаем один раз, лениво (не блокирует основной reload()).
const countriesRaw = ref<RefCodeItem[]>([])
const countryLabel = (code: string | null | undefined) => (code ? countryName(code, countriesRaw.value) : '')
const loadCountries = async () => {
  try {
    countriesRaw.value = await referencesApi.listCountries()
  } catch {
    countriesRaw.value = []
  }
}

onMounted(() => {
  void reload()
  void loadStaffOptions()
  void loadCountries()
})
</script>

<style scoped>
.invoice-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.muted { color: var(--z-muted); font-size: 12.5px; }
.case-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.case-banner {
  border-radius: var(--r-lg);
}
.resp-check {
  margin-top: 10px;
  font-weight: 600;
}
.problem-client-msg {
  margin-top: 4px;
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
  color: var(--z-muted);
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
  color: var(--z-muted);
}
.sub-label {
  margin: 12px 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--z-ink);
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
  border-radius: var(--r-lg);
  background: var(--z-surface-2);
  border: 1px solid var(--z-line);
}
.prefill-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
}
.prefill-row > span {
  min-width: 110px;
  color: var(--z-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.prefill-row > b { color: var(--z-ink); }
.container-add {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.muted {
  color: var(--z-muted);
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
  border-bottom: 1px dashed var(--z-line);
  flex-wrap: wrap;
}
/* Исходная ДТ после разделения ЕТТ/ВТО (аудит H5/3.3) — заменена, показываем тусклой. */
.dt-row--replaced { opacity: 0.55; }
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
  border-radius: var(--r-lg);
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
  color: var(--z-muted);
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
  color: var(--z-muted);
}
.client-wait { margin: 4px 0 0; }
.client-pay-note { margin: 0 0 8px; font-weight: 500; }
.invoice-list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--z-line);
}
</style>
