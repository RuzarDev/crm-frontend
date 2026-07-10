<template>
  <div v-if="activeCase" class="import40-page crm-page">
    <input ref="fileInputRef" type="file" style="display: none" @change="onFileSelected" />

    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Импорт 40 · Заявка</div>
        <h1 class="crm-page-title">{{ activeCase.clientName }}</h1>
        <p class="crm-page-subtitle">{{ activeCase.cargo }} · {{ activeCase.post }}</p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="router.push('/import-40')"><LeftOutlined /> К списку</a-button>
        <a-button :loading="loading" @click="reload"><ReloadOutlined /> Обновить</a-button>
      </div>
    </div>

    <a-alert
      v-if="activeCase.returnReason && activeCase.status === 0"
      type="warning"
      show-icon
      class="return-banner"
      message="Возвращено на доработку"
      :description="`Причина: ${activeCase.returnReason}`"
    />

    <section class="case-board">
      <a-card class="crm-shell-card case-card" :bordered="false">
        <div class="case-head">
          <div class="case-status-row">
            <span class="status-chip">{{ statusLabel(activeCase.status) }}</span>
            <span class="case-phase">{{ statusPhase(activeCase.status) }}</span>
            <span v-if="activeCase.isProblem" class="problem-chip">Проблема: {{ activeCase.problemNote }}</span>
          </div>
          <span class="role-chip">{{ roleLabel }}</span>
        </div>

        <div class="case-meta">
          <div class="meta-item"><span>Контейнеров</span><strong>{{ activeCase.containers.length }}</strong></div>
          <div class="meta-item"><span>ДТ</span><strong>{{ declCount }}</strong></div>
          <div class="meta-item"><span>Водитель</span><strong>{{ activeCase.driverName || '—' }}</strong></div>
          <div class="meta-item"><span>Доверенность</span><strong>{{ activeCase.powerOfAttorneyGenerated ? 'есть' : '—' }}</strong></div>
        </div>

        <div class="case-progress">
          <a-progress :percent="progress" :show-info="false" stroke-color="#2BBCD4" />
          <span>Этап {{ activeCase.status }} из 8</span>
        </div>

        <div class="pipeline">
          <div
            v-for="s in pipelineStatuses"
            :key="s.id"
            class="pipeline-step"
            :class="{ done: activeCase.status > s.id, active: activeCase.status === s.id }"
          >
            <span class="step-dot">
              <CheckOutlined v-if="activeCase.status > s.id" />
              <template v-else>{{ s.id + 1 }}</template>
            </span>
            <span class="step-label">{{ s.short }}</span>
          </div>
        </div>
      </a-card>

      <a-card class="crm-shell-card actions-card" :bordered="false">
        <template #title><div class="card-title"><ThunderboltOutlined /> Действия — {{ roleLabel }}</div></template>
        <p class="actions-help">{{ roleHelp }}</p>

        <div v-if="assignedTag" class="claim-row">
          <a-tag v-if="assignedTag === 'me'" color="processing">В работе у меня</a-tag>
          <a-tag v-else>Занято коллегой</a-tag>
        </div>

        <div class="quick-actions">
          <div v-for="a in availableActions" :key="a.key" class="action-item">
            <a-button
              :type="a.primary ? 'primary' : 'default'"
              :danger="a.danger"
              :disabled="a.disabled"
              @click="runAction(a.key, a.prompt)"
            >
              {{ a.label }}
            </a-button>
            <span v-if="a.disabled && a.hint" class="action-hint">{{ a.hint }}</span>
          </div>
          <span v-if="!availableActions.length && !canReturnToClient" class="no-actions">Сейчас ход за другой ролью</span>
        </div>

        <a-button v-if="canReturnToClient" class="return-btn" danger @click="openReturnModal">
          Вернуть клиенту
        </a-button>

        <div v-if="canManageAssignments" class="assign-block">
          <div class="assign-title">Назначения</div>
          <template v-if="!staffLoadError">
            <label><span>КПП</span><a-select v-model:value="assignForm.kppId" allow-clear placeholder="Не назначен" :options="kppOptions" /></label>
            <label><span>Декларант</span><a-select v-model:value="assignForm.declarantId" allow-clear placeholder="Не назначен" :options="declarantOptions" /></label>
          </template>
          <template v-else>
            <label><span>КПП (ID)</span><a-input v-model:value="assignForm.kppId" placeholder="ID сотрудника" /></label>
            <label><span>Декларант (ID)</span><a-input v-model:value="assignForm.declarantId" placeholder="ID сотрудника" /></label>
            <span class="assign-hint">Список сотрудников недоступен для вашей роли</span>
          </template>
          <a-button size="small" :loading="assignSaving" @click="saveAssignment">Сохранить назначения</a-button>
        </div>
      </a-card>
    </section>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane v-for="t in visibleTabs" :key="t.key" :tab="t.label" />
    </a-tabs>

    <!-- Контейнеры -->
    <a-card v-if="activeTab === 'containers'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><GoldOutlined /> Контейнеры</div></template>

      <div v-if="canEditContent" class="add-container">
        <a-input v-model:value="newContainer.number" placeholder="Номер контейнера" style="max-width: 240px" />
        <a-input v-model:value="newContainer.type" placeholder="Тип (40HC…)" style="max-width: 160px" />
        <a-button type="primary" :disabled="!newContainer.number.trim()" @click="addContainer">
          <PlusOutlined /> Контейнер
        </a-button>
      </div>

      <a-empty v-if="!activeCase.containers.length" description="Контейнеров пока нет" />

      <div v-for="cont in activeCase.containers" :key="cont.id" class="container-block">
        <div class="container-head">
          <div>
            <strong>{{ cont.containerNumber }}</strong>
            <span v-if="cont.containerType" class="container-type">{{ cont.containerType }}</span>
          </div>
          <div class="container-actions">
            <a-popconfirm v-if="canEditContent" title="Удалить контейнер?" ok-text="Да" cancel-text="Нет" @confirm="removeContainer(cont.id)">
              <a-button size="small" type="text" danger><DeleteOutlined /></a-button>
            </a-popconfirm>
          </div>
        </div>
      </div>
    </a-card>

    <!-- Декларирование (ДТ) -->
    <a-card v-if="activeTab === 'declaring'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><FileProtectOutlined /> Декларирование (ДТ)</div></template>

      <div class="dt-toolbar">
        <a-button v-if="canEditDeclaration" type="primary" @click="addDeclaration">
          <PlusOutlined /> Добавить ДТ
        </a-button>
      </div>

      <a-empty v-if="!activeCase.declarations.length" description="ДТ пока нет" />

      <div v-for="(dt, dtIdx) in activeCase.declarations" :key="dt.id" class="dt-block">
        <div class="dt-row">
          <div class="dt-row-main">
            <strong>{{ dt.declarationNumber || `ДТ ${dtIdx + 1}` }}</strong>
            <span class="dt-meta">товаров: {{ dt.goodsItems.length }}</span>
          </div>
          <div class="dt-row-actions">
            <a-button v-if="canEditDeclaration" size="small" @click="openDtEditor(dt)">Редактировать</a-button>
            <a-popconfirm v-if="canEditDeclaration" title="Удалить ДТ?" ok-text="Да" cancel-text="Нет" @confirm="removeDeclaration(dt.id)">
              <a-button size="small" type="text" danger>Удалить</a-button>
            </a-popconfirm>
          </div>
        </div>

        <div v-if="editingDtId === dt.id" class="dt-editor">
          <a-form layout="vertical">
            <!-- Номер ДТ и коридор присваивает КЕДЕН/таможня — декларант их не заполняет.
                 Поля остаются в модели и ронд-трипятся без изменений. -->
            <div class="dt-grid-2">
              <a-form-item label="Процедура (гр.1)">
                <a-input v-model:value="dtForm.procedureCode" placeholder="40" />
              </a-form-item>
            </div>

            <div class="dt-grid-2">
              <a-form-item label="Страна отправления (ОКСМ)">
                <a-select
                  v-model:value="dtForm.departureCountryCode"
                  show-search
                  allow-clear
                  :options="countryOptions"
                  :filter-option="filterCountry"
                  placeholder="Выберите страну по коду"
                />
              </a-form-item>
              <a-form-item label="Страна назначения (ОКСМ)">
                <a-select
                  v-model:value="dtForm.destinationCountryCode"
                  show-search
                  allow-clear
                  :options="countryOptions"
                  :filter-option="filterCountry"
                  placeholder="Выберите страну по коду"
                />
              </a-form-item>
            </div>

            <div class="dt-grid-3">
              <a-form-item label="Условия поставки">
                <a-input v-model:value="dtForm.incoterms" placeholder="FOB / CIF" />
              </a-form-item>
              <a-form-item label="Валюта">
                <a-input v-model:value="dtForm.currency" placeholder="USD" />
              </a-form-item>
              <a-form-item label="Курс">
                <a-input-number v-model:value="dtForm.exchangeRate" style="width: 100%" :min="0" />
              </a-form-item>
              <a-form-item label="Общая фактурная стоимость (гр.22)">
                <a-input-number v-model:value="dtForm.totalInvoiceValue" style="width: 100%" :min="0" />
              </a-form-item>
            </div>

            <div class="dt-grid-3">
              <a-form-item label="Характер сделки">
                <a-auto-complete v-model:value="dtForm.transactionNatureCode" :options="transactionNatureOptions" placeholder="021" style="width: 100%" />
              </a-form-item>
              <a-form-item label="Особенность сделки">
                <a-input v-model:value="dtForm.transactionFeatureCode" placeholder="000" />
              </a-form-item>
              <a-form-item label="Место Инкотермс">
                <a-input v-model:value="dtForm.incotermsPlace" placeholder="Алматы" />
              </a-form-item>
            </div>

            <div class="dt-grid-2">
              <a-form-item label="Торгующая страна (ОКСМ)">
                <a-select
                  v-model:value="dtForm.tradeCountryCode"
                  show-search
                  allow-clear
                  :options="countryOptions"
                  :filter-option="filterCountry"
                  placeholder="Выберите страну по коду"
                />
              </a-form-item>
              <a-form-item label="Страна происхождения (шапка)">
                <a-select
                  v-model:value="dtForm.originCountryCode"
                  show-search
                  allow-clear
                  :options="countryOptions"
                  :filter-option="filterCountry"
                  placeholder="Выберите страну по коду"
                />
              </a-form-item>
            </div>

            <div class="dt-grid-2">
              <a-checkbox v-model:checked="dtForm.consigneeEqualsDeclarant">Получатель = декларант</a-checkbox>
              <a-checkbox v-model:checked="dtForm.financialSubjectEqualsDeclarant">Лицо, ответственное за фин. урегулирование = декларант</a-checkbox>
            </div>

            <PartyAddressFields v-model="dtForm.sender" title="Отправитель" :country-options="countryOptions" />
            <PartyAddressFields v-model="dtForm.receiver" title="Получатель" :country-options="countryOptions" />

            <a-divider />
            <div class="dt-transport-block">
              <div class="dt-tpin-bar">
                <span class="dt-section-label">ТРАНСПОРТ И ОРГАНЫ</span>
                <a-button size="small" @click="fillTransportFromCase">Заполнить из заявки</a-button>
              </div>

              <div class="dt-grid-2">
                <a-form-item label="Вид транспорта на границе">
                  <a-auto-complete v-model:value="dtForm.borderTransportModeCode" :options="transportModeOptions" placeholder="30" style="width: 100%" />
                </a-form-item>
                <a-form-item label="Страна регистрации ТС (граница)">
                  <a-input v-model:value="dtForm.borderTransportNationality" placeholder="KZ" />
                </a-form-item>
              </div>
              <div class="transport-list">
                <div v-for="(m, i) in dtForm.borderTransportNumbers" :key="i" class="transport-list-row">
                  <a-input v-model:value="m.number" placeholder="Номер ТС" style="max-width: 220px" />
                  <a-input v-model:value="m.typeCode" placeholder="Код типа (319)" style="max-width: 160px" />
                  <a-button type="text" danger size="small" @click="removeBorderTransport(i)">✕</a-button>
                </div>
                <a-button type="dashed" size="small" @click="addBorderTransport"><PlusOutlined /> Номер ТС (граница)</a-button>
              </div>

              <div class="dt-grid-2">
                <a-form-item label="Вид транспорта прибытия">
                  <a-auto-complete v-model:value="dtForm.arrivalTransportModeCode" :options="transportModeOptions" placeholder="30" style="width: 100%" />
                </a-form-item>
                <a-form-item label="Страна регистрации ТС (прибытие)">
                  <a-input v-model:value="dtForm.arrivalTransportNationality" placeholder="KZ" />
                </a-form-item>
              </div>
              <div class="transport-list">
                <div v-for="(m, i) in dtForm.arrivalTransportNumbers" :key="i" class="transport-list-row">
                  <a-input v-model:value="m.number" placeholder="Номер ТС" style="max-width: 220px" />
                  <a-input v-model:value="m.typeCode" placeholder="Код типа (319)" style="max-width: 160px" />
                  <a-button type="text" danger size="small" @click="removeArrivalTransport(i)">✕</a-button>
                </div>
                <a-button type="dashed" size="small" @click="addArrivalTransport"><PlusOutlined /> Номер ТС (прибытие)</a-button>
              </div>

              <div class="dt-grid-2">
                <a-form-item label="Пост на границе (код)">
                  <a-input v-model:value="dtForm.borderCustomsOfficeCode" placeholder="код поста" />
                </a-form-item>
                <a-form-item label="Пост на границе (название)">
                  <a-input v-model:value="dtForm.borderCustomsOfficeName" placeholder="название" />
                </a-form-item>
              </div>
              <a-form-item label="Орган подачи (код)">
                <a-input v-model:value="dtForm.submissionCustomsOfficeCode" placeholder="код органа подачи" style="max-width: 260px" />
              </a-form-item>

              <div class="dt-grid-3">
                <a-form-item label="Место нахождения товаров">
                  <a-auto-complete v-model:value="dtForm.goodsLocationCode" :options="goodsLocationOptions" placeholder="11" style="width: 100%" />
                </a-form-item>
                <a-form-item label="Номер СВХ">
                  <a-input v-model:value="dtForm.goodsLocationRegisterNumber" placeholder="Рег. номер СВХ" />
                </a-form-item>
                <a-form-item label="Страна места товаров">
                  <a-input v-model:value="dtForm.goodsLocationCountryCode" placeholder="KZ" />
                </a-form-item>
              </div>

              <a-form-item label="Тип ставок">
                <a-auto-complete v-model:value="dtForm.rateType" :options="rateTypeOptions" placeholder="ETT" style="max-width: 260px" />
              </a-form-item>
            </div>

            <a-divider />
            <ReestrGoodsSection v-model="dtForm.goodsItems" />

            <Import40GoodsKedenPanel v-model="dtForm.goodsItems" @calc-tpin="calcTpin" />

            <a-divider />
            <ReestrDoc44Section
              v-model="dtForm.doc44Items"
              extended
              :goods-options="dtForm.goodsItems.map((g, i) => ({ value: i, label: `Товар ${i + 1}: ${g.tnvedCode || g.description || ''}` }))"
            />

            <a-divider />
            <Import40FactPaymentsSection v-model="dtForm.factPayments" />

            <div class="dt-editor-actions">
              <a-button type="primary" :loading="dtSaving" @click="saveDt">Сохранить ДТ</a-button>
              <a-button :loading="kedenExporting" @click="exportKedenXml(dt.id)">Сформировать XML для КЕДЕН</a-button>
              <a-button @click="closeDtEditor">Свернуть</a-button>
              <a-popconfirm title="Удалить ДТ?" ok-text="Да" cancel-text="Нет" @confirm="removeDeclaration(dt.id)">
                <a-button danger>Удалить ДТ</a-button>
              </a-popconfirm>
            </div>

            <a-alert v-if="kedenMissing.length" type="warning" show-icon class="keden-missing">
              <template #message>Для XML не хватает данных:</template>
              <template #description>
                <ul><li v-for="m in kedenMissing" :key="m">{{ m }}</li></ul>
              </template>
            </a-alert>
          </a-form>
        </div>
      </div>
    </a-card>

    <!-- Транспорт и доверенность (клиент) -->
    <a-card v-if="activeTab === 'transport'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><CarOutlined /> Транспорт и доверенность</div></template>

      <div class="form-grid">
        <label><span>Вид транспорта</span>
          <a-select v-model:value="transportForm.transportMode" :options="transportModes" :disabled="!isClient && !isAdmin" />
        </label>
        <!-- 0 — ЖД -->
        <template v-if="transportForm.transportMode === 0">
          <label><span>Номер вагона</span><a-input v-model:value="transportForm.wagonNumber" :disabled="!isClient && !isAdmin" /></label>
          <label><span>Станция</span><a-input v-model:value="transportForm.station" :disabled="!isClient && !isAdmin" /></label>
        </template>
        <!-- 1 — Авто -->
        <template v-else-if="transportForm.transportMode === 1">
          <label><span>Машина</span><a-input :value="activeCase.vehicleNumber" :disabled="!isClient" @change="updateField('vehicleNumber', $event)" /></label>
          <label><span>Прицеп</span><a-input v-model:value="transportForm.trailerNumber" :disabled="!isClient && !isAdmin" /></label>
          <label><span>Водитель</span><a-input :value="activeCase.driverName" :disabled="!isClient" @change="updateField('driverName', $event)" /></label>
          <label><span>Телефон водителя</span><a-input :value="activeCase.driverPhone" :disabled="!isClient" @change="updateField('driverPhone', $event)" /></label>
        </template>
        <!-- 2 — Авиа -->
        <template v-else-if="transportForm.transportMode === 2">
          <label><span>Номер рейса</span><a-input v-model:value="transportForm.flightNumber" :disabled="!isClient && !isAdmin" /></label>
          <label><span>Авианакладная (AWB)</span><a-input v-model:value="transportForm.airWaybill" :disabled="!isClient && !isAdmin" /></label>
        </template>
        <!-- 3 — Море -->
        <template v-else-if="transportForm.transportMode === 3">
          <label><span>Название судна</span><a-input v-model:value="transportForm.vesselName" :disabled="!isClient && !isAdmin" /></label>
          <label><span>Коносамент (B/L)</span><a-input v-model:value="transportForm.billOfLading" :disabled="!isClient && !isAdmin" /></label>
        </template>
      </div>
      <div v-if="isClient || isAdmin" class="transport-save">
        <a-button type="primary" :loading="transportSaving" @click="saveTransport">Сохранить транспорт</a-button>
      </div>
      <div class="flow-block">
        <div class="flow-block-head">
          <strong>Доверенность</strong>
          <a-tag v-if="activeCase.powerOfAttorneyGenerated" color="success">Загружена</a-tag>
          <a-tag v-else>Не загружена</a-tag>
        </div>
        <FileChips :items="filesBySection('power-of-attorney')" empty="Доверенность не загружена" @download="downloadFile" />
        <a-button v-if="isClient" type="primary" @click="triggerUpload('power-of-attorney')"><UploadOutlined /> Загрузить доверенность</a-button>
      </div>
    </a-card>

    <!-- СВХ / Оплата -->
    <a-card v-if="activeTab === 'finance'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><DollarOutlined /> СВХ и оплата</div></template>
      <div class="flow-blocks">
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Счёт СВХ</strong>
            <a-tag v-if="hasFile('svh-invoice')" color="processing">Выставлен</a-tag>
            <a-tag v-else>Не выставлен</a-tag>
          </div>
          <p v-if="activeCase.svhInvoiceNote" class="flow-sum">Сумма: <strong>{{ activeCase.svhInvoiceNote }}</strong></p>
          <FileChips :items="filesBySection('svh-invoice')" empty="" @download="downloadFile" />
          <a-button v-if="isKpp" @click="triggerUpload('svh-invoice')"><UploadOutlined /> Загрузить счёт СВХ</a-button>
        </div>
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Чек оплаты</strong>
            <a-tag v-if="activeCase.paymentConfirmed" color="success">Оплата подтверждена</a-tag>
            <a-tag v-else-if="hasFile('payment-check')" color="processing">На проверке</a-tag>
            <a-tag v-else>Ожидается</a-tag>
          </div>
          <FileChips :items="filesBySection('payment-check')" empty="" @download="downloadFile" />
          <a-button v-if="isClient && activeCase.status >= 6" type="primary" @click="triggerUpload('payment-check')"><UploadOutlined /> Загрузить чек</a-button>
        </div>
        <div class="flow-block">
          <div class="flow-block-head">
            <strong>Закрытая ДТ (штамп)</strong>
            <a-tag v-if="hasFile('declaration-stamp')" color="success">Загружена</a-tag>
            <a-tag v-else>Ожидается</a-tag>
          </div>
          <FileChips :items="filesBySection('declaration-stamp')" empty="" @download="downloadFile" />
          <a-button v-if="isKpp" @click="triggerUpload('declaration-stamp')"><UploadOutlined /> Загрузить штамп ДТ</a-button>
        </div>
      </div>
    </a-card>

    <!-- Документы -->
    <a-card v-if="activeTab === 'documents'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><FileProtectOutlined /> Документы заявки</div></template>
      <a-button v-if="isClient" type="primary" style="margin-bottom: 12px" @click="triggerUpload('documents')">
        <UploadOutlined /> Загрузить документ
      </a-button>
      <a-spin :spinning="filesLoading">
        <a-empty v-if="!files.length" description="Файлов нет" />
        <div v-else class="file-list">
          <div v-for="f in files" :key="f.id" class="file-item">
            <span class="file-section-tag">{{ sectionLabels[f.section] || f.section }}</span>
            <span class="file-name">{{ f.originalFileName }}</span>
            <a-button type="link" size="small" @click="downloadFile(f)"><DownloadOutlined /> Скачать</a-button>
            <a-popconfirm v-if="canDeleteFile(f)" title="Удалить файл?" ok-text="Да" cancel-text="Нет" @confirm="removeFile(f)">
              <a-button type="link" danger size="small"><DeleteOutlined /></a-button>
            </a-popconfirm>
          </div>
        </div>
      </a-spin>
    </a-card>

    <!-- История -->
    <a-card v-if="activeTab === 'history'" class="crm-shell-card" :bordered="false">
      <template #title><div class="card-title"><HistoryOutlined /> История заявки</div></template>
      <div class="log-list">
        <div v-for="l in activeCase.logs" :key="l.id" class="log-item">
          <span>{{ formatTime(l.createdAtUtc) }}</span>
          <strong>{{ l.text }}</strong>
        </div>
      </div>
    </a-card>

    <!-- Модалка ввода значения для действия (вместо window.prompt) -->
    <a-modal v-model:open="promptModal.open" :title="promptModal.title" ok-text="Подтвердить" cancel-text="Отмена" @ok="confirmPromptAction">
      <label class="prompt-field">
        <span>{{ promptModal.label }}</span>
        <a-input v-model:value="promptModal.value" autofocus @press-enter="confirmPromptAction" />
      </label>
    </a-modal>

    <!-- Модалка возврата заявки клиенту (причина обязательна) -->
    <a-modal
      v-model:open="returnModal.open"
      title="Вернуть заявку клиенту"
      ok-text="Вернуть"
      cancel-text="Отмена"
      :confirm-loading="returnModal.loading"
      :ok-button-props="{ danger: true }"
      @ok="confirmReturn"
    >
      <label class="prompt-field">
        <span>Причина возврата (обязательно)</span>
        <a-textarea v-model:value="returnModal.value" :rows="3" autofocus />
      </label>
    </a-modal>
  </div>

  <a-spin v-else style="display: block; margin: 80px auto" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  CarOutlined,
  CheckOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownloadOutlined,
  FileProtectOutlined,
  GoldOutlined,
  HistoryOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue'
import {
  import40Api,
  IMPORT40_STATUSES,
  IMPORT40_TRANSPORT_MODES,
  type Import40Action,
  type Import40CaseDto,
  type Import40DeclarationDto,
  type Import40DeclarationUpsert,
  type Import40FileDto,
  type Import40FileSection,
  type Import40Party,
} from '@/api/import40'
import { tnvedApi } from '@/api/tnved'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { referencesApi } from '@/api/references'
import FileChips from '@/components/Import40FileChips.vue'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import ReestrDoc44Section from '@/components/ReestrDoc44Section.vue'
import PartyAddressFields from '@/components/PartyAddressFields.vue'
import Import40GoodsKedenPanel from '@/components/Import40GoodsKedenPanel.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'
import type {
  Import40GoodsItemInput,
  Import40Doc44ItemInput,
  Import40FactPayment,
  Import40TransportMeans,
} from '@/types/api'
import {
  KEDEN_TRANSPORT_MODES_2004,
  KEDEN_TRANSACTION_NATURES,
  KEDEN_GOODS_LOCATIONS,
  KEDEN_RATE_TYPES,
  kedenOptions,
} from '@/constants/keden'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const statuses = IMPORT40_STATUSES
// Paid(7) — технический статус, в пайплайне не показываем (оплата+завершение — одним действием)
const pipelineStatuses = statuses.filter((s) => s.id !== 7)
const activeCase = ref<Import40CaseDto | null>(null)
const files = ref<Import40FileDto[]>([])
const filesLoading = ref(false)
const loading = ref(false)
const activeTab = ref('containers')

type RoleMode = 'client' | 'kpp' | 'declarant' | 'admin'
const roleMode = computed<RoleMode>(() => {
  const sys = (authStore.role || '').toLowerCase()
  const biz = (authStore.businessRole || '').toLowerCase()
  if (sys === 'administrator') return 'admin'
  if (sys === 'client' || biz === 'client') return 'client'
  if (biz === 'kpp') return 'kpp'
  if (biz === 'declarant') return 'declarant'
  return 'admin'
})
const isClient = computed(() => roleMode.value === 'client')
const isKpp = computed(() => roleMode.value === 'kpp')
const isAdmin = computed(() => roleMode.value === 'admin')

const roleLabel = computed(
  () => ({ client: 'Клиент', kpp: 'Менеджер КПП', declarant: 'Декларант', admin: 'Администратор' })[roleMode.value],
)
const roleHelp = computed(
  () =>
    ({
      client: 'Заполните контейнеры/ДТ, транспорт, доверенность и отправьте заявку. Позже — оплата СВХ.',
      kpp: 'Проверка на границе, закрытие ДТ на СВХ, счёт клиенту, штамп закрытой ДТ.',
      declarant: 'Заполните ДТ (ТНВЭД, стоимость, ТПиН, коридор), подайте и зафиксируйте выпуск.',
      admin: 'Полный доступ ко всем действиям заявки.',
    })[roleMode.value],
)

const declCount = computed(() => activeCase.value?.declarations.length ?? 0)
const progress = computed(() => Math.round(((activeCase.value?.status ?? 0) / 8) * 100))

const statusLabel = (s: number) => statuses.find((x) => x.id === s)?.short || '—'
const statusPhase = (s: number) => statuses.find((x) => x.id === s)?.phase || ''

const sectionLabels: Record<Import40FileSection, string> = {
  documents: 'Документ',
  'power-of-attorney': 'Доверенность',
  'svh-invoice': 'Счёт СВХ',
  'payment-check': 'Чек оплаты',
  'declaration-stamp': 'Штамп ДТ',
}

const visibleTabs = computed(() => {
  const tabs = [{ key: 'containers', label: 'Контейнеры' }]
  if (isClient.value || isAdmin.value) tabs.push({ key: 'transport', label: 'Транспорт и доверенность' })
  if (canSeeDeclaring.value) tabs.push({ key: 'declaring', label: 'Декларирование' })
  tabs.push({ key: 'finance', label: 'СВХ / Оплата' })
  tabs.push({ key: 'documents', label: 'Документы' })
  tabs.push({ key: 'history', label: 'История' })
  return tabs
})

// клиент редактирует контент только в черновике
const canEditContent = computed(
  () => isAdmin.value || (isClient.value && (activeCase.value?.status ?? 0) === 0),
)
const canEditDeclaration = computed(
  () => isAdmin.value || roleMode.value === 'declarant' || canEditContent.value,
)
// Кому показывать раздел декларирования (ДТ)
const canSeeDeclaring = computed(
  () => isAdmin.value || roleMode.value === 'declarant' || roleMode.value === 'kpp',
)

const availableActions = computed(() => {
  const c = activeCase.value
  if (!c) return []
  const r = roleMode.value
  const list: {
    key: Import40Action
    label: string
    primary?: boolean
    danger?: boolean
    disabled?: boolean
    hint?: string
    prompt?: string
  }[] = []
  const can = (role: RoleMode) => r === 'admin' || r === role

  if (can('client') && c.status === 0)
    list.push({ key: 'submit-for-processing', label: 'Отправить на оформление', primary: true })
  if (can('kpp') && c.status === 1)
    list.push({ key: 'border-passed', label: 'Граница пройдена', primary: true })
  if (can('declarant') && c.status === 2)
    list.push({ key: 'submit-declaration', label: 'Подать ДТ', primary: true })
  if (can('declarant') && c.status === 3)
    list.push({ key: 'release-declaration', label: 'Зафиксировать выпуск', primary: true })
  if (can('kpp') && c.status === 4)
    list.push({ key: 'close-svh', label: 'Закрыть ДТ на СВХ', primary: true })
  if (can('kpp') && c.status === 5)
    list.push({ key: 'issue-invoice', label: 'Выставить счёт СВХ', primary: true, prompt: 'Сумма счёта СВХ' })
  if (can('kpp') && c.status === 6)
    list.push({
      key: 'confirm-payment-and-complete',
      label: 'Подтвердить оплату и завершить',
      primary: true,
      disabled: !hasFile('payment-check'),
      hint: 'Клиент ещё не загрузил чек',
    })

  // самозахват — только реальные kpp/declarant (не админ), заявка ещё не в пуле "своя"
  if (r === 'kpp' && [1, 4, 5, 6].includes(c.status) && !c.assignedKppId)
    list.push({ key: 'claim', label: 'Взять в работу' })
  if (r === 'declarant' && [2, 3].includes(c.status) && !c.assignedDeclarantId)
    list.push({ key: 'claim', label: 'Взять в работу' })

  // проблема — КПП/декларант/админ, на активной заявке
  if ((r === 'kpp' || r === 'declarant' || r === 'admin') && c.status < 8) {
    if (c.isProblem) list.push({ key: 'clear-problem', label: 'Снять проблему' })
    else list.push({ key: 'set-problem', label: 'Запрос таможни / проблема', danger: true, prompt: 'Опишите проблему' })
  }
  return list
})

// «В работе у меня» / «Занято коллегой» — бейдж рядом с действиями (kpp/declarant)
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

// «Вернуть клиенту» — любой сотрудник (kpp/declarant/rop/admin), не в Draft и не в Done
const canReturnToClient = computed(() => {
  const c = activeCase.value
  if (!c) return false
  return roleMode.value !== 'client' && c.status !== 0 && c.status !== 8
})

// --- Возврат клиенту (модалка с обязательной причиной) ---
const returnModal = reactive({ open: false, value: '', loading: false })
const openReturnModal = () => {
  returnModal.value = ''
  returnModal.open = true
}
const confirmReturn = async () => {
  const reason = returnModal.value.trim()
  if (!reason) {
    message.warning('Укажите причину возврата')
    return
  }
  returnModal.loading = true
  try {
    await executeAction('return-to-client', reason)
    returnModal.open = false
  } finally {
    returnModal.loading = false
  }
}

// --- Назначение КПП/декларанта (administrator/importer/rop) ---
type StaffOption = { id: string; username: string; businessRole: string }
const canManageAssignments = computed(() => isAdmin.value)
const staffList = ref<StaffOption[]>([])
const staffLoadError = ref(false)
const loadStaffOptions = async () => {
  if (!canManageAssignments.value) return
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
    staffLoadError.value = true
  }
}
const kppOptions = computed(() =>
  staffList.value.filter((u) => u.businessRole === 'kpp').map((u) => ({ value: u.id, label: u.username })),
)
const declarantOptions = computed(() =>
  staffList.value.filter((u) => u.businessRole === 'declarant').map((u) => ({ value: u.id, label: u.username })),
)
const assignForm = reactive<{ kppId: string | null; declarantId: string | null }>({
  kppId: null,
  declarantId: null,
})
const syncAssignForm = () => {
  const c = activeCase.value
  if (!c) return
  assignForm.kppId = c.assignedKppId
  assignForm.declarantId = c.assignedDeclarantId
}
const assignSaving = ref(false)
const saveAssignment = async () => {
  if (!activeCase.value) return
  assignSaving.value = true
  try {
    activeCase.value = await import40Api.update(activeCase.value.id, {
      assignedKppId: assignForm.kppId || '00000000-0000-0000-0000-000000000000',
      assignedDeclarantId: assignForm.declarantId || '00000000-0000-0000-0000-000000000000',
    })
    message.success('Назначения сохранены')
  } catch {
    message.error('Не удалось сохранить назначения')
  } finally {
    assignSaving.value = false
  }
}

const reload = async () => {
  loading.value = true
  try {
    const id = String(route.params.id || '')
    activeCase.value = await import40Api.get(id)
    await loadFiles()
  } finally {
    loading.value = false
  }
}

const loadFiles = async () => {
  if (!activeCase.value) return
  filesLoading.value = true
  try {
    files.value = await import40Api.listFiles(activeCase.value.id)
  } finally {
    filesLoading.value = false
  }
}

const filesBySection = (s: Import40FileSection) => files.value.filter((f) => f.section === s)
const hasFile = (s: Import40FileSection) => filesBySection(s).length > 0

const roleBiz: Record<RoleMode, string> = { client: 'client', kpp: 'kpp', declarant: 'declarant', admin: '' }
const canDeleteFile = (f: Import40FileDto) =>
  isAdmin.value || f.uploadedByBusinessRole === roleBiz[roleMode.value]

const promptModal = reactive({
  open: false,
  title: '',
  label: '',
  value: '',
  action: null as Import40Action | null,
})

const runAction = async (action: Import40Action, prompt?: string) => {
  if (!activeCase.value) return
  if (prompt) {
    // действия, требующие ввода — через CRM-модалку, не window.prompt
    promptModal.action = action
    promptModal.title = prompt
    promptModal.label = prompt
    promptModal.value = ''
    promptModal.open = true
    return
  }
  await executeAction(action)
}

const confirmPromptAction = async () => {
  if (!promptModal.action) return
  const action = promptModal.action
  const value = promptModal.value.trim()
  promptModal.open = false
  await executeAction(action, value || undefined)
}

const executeAction = async (action: Import40Action, value?: string) => {
  if (!activeCase.value) return
  try {
    activeCase.value = await import40Api.action(activeCase.value.id, action, value)
    await loadFiles()
    message.success('Готово')
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Действие недоступно')
  }
}

const updateField = async (field: 'vehicleNumber' | 'driverName' | 'driverPhone', e: Event) => {
  if (!activeCase.value) return
  const value = (e.target as HTMLInputElement).value
  activeCase.value = await import40Api.update(activeCase.value.id, { [field]: value })
}

// контейнеры
const newContainer = reactive({ number: '', type: '' })
const addContainer = async () => {
  if (!activeCase.value || !newContainer.number.trim()) return
  activeCase.value = await import40Api.addContainer(activeCase.value.id, {
    containerNumber: newContainer.number.trim(),
    containerType: newContainer.type.trim(),
  })
  newContainer.number = ''
  newContainer.type = ''
}
const removeContainer = async (cid: string) => {
  if (!activeCase.value) return
  activeCase.value = await import40Api.deleteContainer(activeCase.value.id, cid)
}

// Перезагрузка кейса после мутаций ДТ/транспорта (методы ДТ возвращают одну ДТ, не кейс)
const reloadCase = async () => {
  if (!activeCase.value) return
  activeCase.value = await import40Api.get(activeCase.value.id)
}

// Справочник стран (ОКСМ)
const countryOptions = ref<{ value: string; label: string }[]>([])
function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

// --- Транспорт ---
const transportModes = IMPORT40_TRANSPORT_MODES
const transportForm = reactive({
  transportMode: 1,
  wagonNumber: '',
  station: '',
  trailerNumber: '',
  flightNumber: '',
  airWaybill: '',
  vesselName: '',
  billOfLading: '',
})
const transportSaving = ref(false)
const syncTransportForm = () => {
  const c = activeCase.value
  if (!c) return
  transportForm.transportMode = c.transportMode ?? 1
  transportForm.wagonNumber = c.wagonNumber ?? ''
  transportForm.station = c.station ?? ''
  transportForm.trailerNumber = c.trailerNumber ?? ''
  transportForm.flightNumber = c.flightNumber ?? ''
  transportForm.airWaybill = c.airWaybill ?? ''
  transportForm.vesselName = c.vesselName ?? ''
  transportForm.billOfLading = c.billOfLading ?? ''
}
const saveTransport = async () => {
  if (!activeCase.value) return
  transportSaving.value = true
  try {
    activeCase.value = await import40Api.update(activeCase.value.id, {
      transportMode: transportForm.transportMode,
      wagonNumber: transportForm.wagonNumber,
      station: transportForm.station,
      trailerNumber: transportForm.trailerNumber,
      flightNumber: transportForm.flightNumber,
      airWaybill: transportForm.airWaybill,
      vesselName: transportForm.vesselName,
      billOfLading: transportForm.billOfLading,
    })
    await reloadCase()
    message.success('Транспорт сохранён')
  } catch {
    message.error('Не удалось сохранить транспорт')
  } finally {
    transportSaving.value = false
  }
}

// --- ДТ редактор ---
const emptyParty = (): Import40Party => ({
  name: null,
  countryCode: null,
  region: null,
  city: null,
  street: null,
})

const editingDtId = ref<string | null>(null)
const dtSaving = ref(false)
const dtForm = reactive<{
  id: string
  declarationNumber: string
  corridor: string
  procedureCode: string
  departureCountryCode: string | null
  destinationCountryCode: string | null
  incoterms: string
  currency: string
  exchangeRate: number | null
  totalInvoiceValue: number | null
  sender: Import40Party
  receiver: Import40Party
  goodsItems: Import40GoodsItemInput[]
  doc44Items: Import40Doc44ItemInput[]
  transactionNatureCode: string
  transactionFeatureCode: string
  tradeCountryCode: string
  originCountryCode: string
  incotermsPlace: string
  consigneeEqualsDeclarant: boolean
  financialSubjectEqualsDeclarant: boolean
  goodsLocationCode: string
  goodsLocationRegisterNumber: string
  goodsLocationCountryCode: string
  borderCustomsOfficeCode: string
  borderCustomsOfficeName: string
  submissionCustomsOfficeCode: string
  borderTransportModeCode: string
  borderTransportNationality: string
  borderTransportNumbers: Import40TransportMeans[]
  arrivalTransportModeCode: string
  arrivalTransportNationality: string
  arrivalTransportNumbers: Import40TransportMeans[]
  rateType: string
  factPayments: Import40FactPayment[]
}>({
  id: '',
  declarationNumber: '',
  corridor: 'green',
  procedureCode: '',
  departureCountryCode: null,
  destinationCountryCode: null,
  incoterms: '',
  currency: '',
  exchangeRate: null,
  totalInvoiceValue: null,
  sender: emptyParty(),
  receiver: emptyParty(),
  goodsItems: [],
  doc44Items: [],
  transactionNatureCode: '',
  transactionFeatureCode: '',
  tradeCountryCode: '',
  originCountryCode: '',
  incotermsPlace: '',
  consigneeEqualsDeclarant: true,
  financialSubjectEqualsDeclarant: true,
  goodsLocationCode: '',
  goodsLocationRegisterNumber: '',
  goodsLocationCountryCode: 'KZ',
  borderCustomsOfficeCode: '',
  borderCustomsOfficeName: '',
  submissionCustomsOfficeCode: '',
  borderTransportModeCode: '',
  borderTransportNationality: 'KZ',
  borderTransportNumbers: [],
  arrivalTransportModeCode: '',
  arrivalTransportNationality: 'KZ',
  arrivalTransportNumbers: [],
  rateType: 'ETT',
  factPayments: [],
})

// Классификаторы КЕДЕН — селекты этого редактора
const transactionNatureOptions = kedenOptions(KEDEN_TRANSACTION_NATURES)
const transportModeOptions = kedenOptions(KEDEN_TRANSPORT_MODES_2004)
const goodsLocationOptions = kedenOptions(KEDEN_GOODS_LOCATIONS)
const rateTypeOptions = kedenOptions(KEDEN_RATE_TYPES)

// Редактируемые списки номеров ТС (border/arrival) — по паттерну контейнеров этого view
const addBorderTransport = () => {
  dtForm.borderTransportNumbers.push({ number: '', typeCode: null })
}
const removeBorderTransport = (idx: number) => {
  dtForm.borderTransportNumbers.splice(idx, 1)
}
const addArrivalTransport = () => {
  dtForm.arrivalTransportNumbers.push({ number: '', typeCode: null })
}
const removeArrivalTransport = (idx: number) => {
  dtForm.arrivalTransportNumbers.splice(idx, 1)
}

// Заполнение вида/номеров транспорта из данных заявки (шапка кейса)
const fillTransportFromCase = () => {
  const c = activeCase.value
  if (!c) return
  const modeCodeByMode: Record<number, string> = { 0: '20', 1: '31', 2: '40', 3: '10' }
  const modeCode = modeCodeByMode[c.transportMode] ?? ''
  const numbers: Import40TransportMeans[] = []
  if (c.transportMode === 0) {
    if (c.wagonNumber) numbers.push({ number: c.wagonNumber, typeCode: null })
  } else if (c.transportMode === 1) {
    if (c.vehicleNumber) numbers.push({ number: c.vehicleNumber, typeCode: null })
    if (c.trailerNumber) numbers.push({ number: c.trailerNumber, typeCode: '319' })
  } else if (c.transportMode === 2) {
    if (c.flightNumber) numbers.push({ number: c.flightNumber, typeCode: null })
  } else if (c.transportMode === 3) {
    if (c.vesselName) numbers.push({ number: c.vesselName, typeCode: null })
  }
  dtForm.borderTransportModeCode = modeCode
  dtForm.borderTransportNumbers = numbers.map((n) => ({ ...n }))
  dtForm.arrivalTransportModeCode = modeCode
  dtForm.arrivalTransportNumbers = numbers.map((n) => ({ ...n }))
}

const tpinCalculating = ref(false)
const calcTpin = async () => {
  tpinCalculating.value = true
  try {
    for (const g of dtForm.goodsItems) {
      const code = (g.tnvedCode || '').trim()
      if (!code || g.customsValue == null) continue
      try {
        const { data: r } = await tnvedApi.calculate({
          code,
          customsValue: g.customsValue,
          currencyCode: (g.currency || dtForm.currency || 'USD').trim(),
          weightKg: g.grossWeightKg ?? undefined,
          quantity: g.quantity ?? undefined,
        })
        g.customsValueKzt = g.customsValueKzt ?? r.customsValueKzt
        const today = new Date().toISOString().slice(0, 10)
        g.payments = [
          { taxModeCode: '1010', taxBase: null, rateKindCode: 'S', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.customsFeeKzt },
          { taxModeCode: '2010', taxBase: r.customsValueKzt, rateKindCode: '%', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.importDutyKzt },
          ...(r.exciseKzt > 0 ? [{ taxModeCode: '4010', taxBase: null, rateKindCode: 'S' as const, rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.exciseKzt }] : []),
          { taxModeCode: '5060', taxBase: r.customsValueKzt + r.importDutyKzt + r.exciseKzt, rateKindCode: '%', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: today, paymentFeatureCode: 'ИУ', amountKzt: r.vatKzt },
        ]
      } catch {
        // товар не посчитался — пропускаем
      }
    }
    message.success('ТПиН рассчитан по товарам — проверьте ставки и суммы')
  } finally {
    tpinCalculating.value = false
  }
}

const openDtEditor = (decl: Import40DeclarationDto) => {
  dtForm.id = decl.id
  dtForm.declarationNumber = decl.declarationNumber ?? ''
  dtForm.corridor = decl.corridor ?? 'green'
  dtForm.procedureCode = decl.procedureCode ?? ''
  dtForm.departureCountryCode = decl.departureCountryCode ?? null
  dtForm.destinationCountryCode = decl.destinationCountryCode ?? null
  dtForm.incoterms = decl.incoterms ?? ''
  dtForm.currency = decl.currency ?? ''
  dtForm.exchangeRate = decl.exchangeRate ?? null
  dtForm.totalInvoiceValue = decl.totalInvoiceValue ?? null
  dtForm.sender = decl.sender ? { ...emptyParty(), ...decl.sender } : emptyParty()
  dtForm.receiver = decl.receiver ? { ...emptyParty(), ...decl.receiver } : emptyParty()
  dtForm.transactionNatureCode = decl.transactionNatureCode ?? ''
  dtForm.transactionFeatureCode = decl.transactionFeatureCode ?? ''
  dtForm.tradeCountryCode = decl.tradeCountryCode ?? ''
  dtForm.originCountryCode = decl.originCountryCode ?? ''
  dtForm.incotermsPlace = decl.incotermsPlace ?? ''
  dtForm.consigneeEqualsDeclarant = decl.consigneeEqualsDeclarant ?? true
  dtForm.financialSubjectEqualsDeclarant = decl.financialSubjectEqualsDeclarant ?? true
  dtForm.goodsLocationCode = decl.goodsLocationCode ?? ''
  dtForm.goodsLocationRegisterNumber = decl.goodsLocationRegisterNumber ?? ''
  dtForm.goodsLocationCountryCode = decl.goodsLocationCountryCode ?? 'KZ'
  dtForm.borderCustomsOfficeCode = decl.borderCustomsOfficeCode ?? ''
  dtForm.borderCustomsOfficeName = decl.borderCustomsOfficeName ?? ''
  dtForm.submissionCustomsOfficeCode = decl.submissionCustomsOfficeCode ?? ''
  dtForm.borderTransportModeCode = decl.borderTransportModeCode ?? ''
  dtForm.borderTransportNationality = decl.borderTransportNationality ?? 'KZ'
  dtForm.borderTransportNumbers = (decl.borderTransportNumbers ?? []).map((m) => ({ ...m }))
  dtForm.arrivalTransportModeCode = decl.arrivalTransportModeCode ?? ''
  dtForm.arrivalTransportNationality = decl.arrivalTransportNationality ?? 'KZ'
  dtForm.arrivalTransportNumbers = (decl.arrivalTransportNumbers ?? []).map((m) => ({ ...m }))
  dtForm.rateType = decl.rateType ?? 'ETT'
  dtForm.factPayments = (decl.factPayments ?? []).map((p) => ({ ...p }))
  dtForm.goodsItems = (decl.goodsItems ?? []).map((g) => ({
    description: g.description ?? null,
    tnvedCode: g.tnvedCode ?? null,
    tnvedDescription: g.tnvedDescription ?? null,
    countryOfOrigin: g.countryOfOrigin ?? null,
    quantity: g.quantity ?? null,
    unit: g.unit ?? null,
    unitCode: g.unitCode ?? null,
    grossWeightKg: g.grossWeightKg ?? null,
    netWeightKg: g.netWeightKg ?? null,
    packagesCount: g.packagesCount ?? null,
    quantityTypeCode: g.quantityTypeCode ?? null,
    // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
    customsValue: g.invoiceValue ?? null,
    currency: g.currency ?? null,
    procedureCode: g.procedureCode ?? null,
    previousProcedureCode: g.previousProcedureCode ?? null,
    goodsMoveFeatureCode: g.goodsMoveFeatureCode ?? null,
    tradeMarkName: g.tradeMarkName ?? null,
    productMarkName: g.productMarkName ?? null,
    productModelName: g.productModelName ?? null,
    productArticle: g.productArticle ?? null,
    manufacturerName: g.manufacturerName ?? null,
    packageAvailabilityCode: g.packageAvailabilityCode ?? null,
    cargoPlacesQuantity: g.cargoPlacesQuantity ?? null,
    packageKindCode: g.packageKindCode ?? null,
    packageQuantity: g.packageQuantity ?? null,
    prefClearanceCode: g.prefClearanceCode ?? null,
    prefDutyCode: g.prefDutyCode ?? null,
    prefExciseCode: g.prefExciseCode ?? null,
    prefVatCode: g.prefVatCode ?? null,
    customsValueKzt: g.customsValueKzt ?? null,
    statisticValueUsd: g.statisticValueUsd ?? null,
    valuationMethodCode: g.valuationMethodCode ?? null,
    prohibitionCode: g.prohibitionCode ?? null,
    ipoCode: g.ipoCode ?? null,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
  }))
  dtForm.doc44Items = (decl.doc44Items ?? []).map((d) => ({
    docTypeCode: d.docTypeCode ?? null,
    docTypeName: d.docTypeName ?? null,
    docNumber: d.docNumber ?? null,
    docDate: d.docDate ?? null,
    goodsItemIndex: d.goodsItemIndex ?? null,
    docStartDate: d.docStartDate ?? null,
    docValidityDate: d.docValidityDate ?? null,
  }))
  editingDtId.value = decl.id
  kedenMissing.value = []
}

const closeDtEditor = () => {
  editingDtId.value = null
}

const addDeclaration = async () => {
  if (!activeCase.value) return
  try {
    const created = await import40Api.createDeclaration(activeCase.value.id, {})
    await reloadCase()
    const fresh = activeCase.value?.declarations.find((d) => d.id === created.id)
    if (fresh) openDtEditor(fresh)
    else openDtEditor(created)
  } catch {
    message.error('Не удалось создать ДТ')
  }
}

const saveDt = async () => {
  if (!activeCase.value || !dtForm.id) return
  dtSaving.value = true
  try {
    const payload: Import40DeclarationUpsert = {
      declarationNumber: dtForm.declarationNumber || null,
      corridor: dtForm.corridor || null,
      procedureCode: dtForm.procedureCode || null,
      departureCountryCode: dtForm.departureCountryCode || null,
      destinationCountryCode: dtForm.destinationCountryCode || null,
      incoterms: dtForm.incoterms || null,
      currency: dtForm.currency || null,
      exchangeRate: dtForm.exchangeRate,
      totalInvoiceValue: dtForm.totalInvoiceValue,
      sender: dtForm.sender,
      receiver: dtForm.receiver,
      transactionNatureCode: dtForm.transactionNatureCode || null,
      transactionFeatureCode: dtForm.transactionFeatureCode || null,
      tradeCountryCode: dtForm.tradeCountryCode || null,
      originCountryCode: dtForm.originCountryCode || null,
      incotermsPlace: dtForm.incotermsPlace || null,
      consigneeEqualsDeclarant: dtForm.consigneeEqualsDeclarant,
      financialSubjectEqualsDeclarant: dtForm.financialSubjectEqualsDeclarant,
      goodsLocationCode: dtForm.goodsLocationCode || null,
      goodsLocationRegisterNumber: dtForm.goodsLocationRegisterNumber || null,
      goodsLocationCountryCode: dtForm.goodsLocationCountryCode || null,
      borderCustomsOfficeCode: dtForm.borderCustomsOfficeCode || null,
      borderCustomsOfficeName: dtForm.borderCustomsOfficeName || null,
      submissionCustomsOfficeCode: dtForm.submissionCustomsOfficeCode || null,
      borderTransportModeCode: dtForm.borderTransportModeCode || null,
      borderTransportNationality: dtForm.borderTransportNationality || null,
      borderTransportNumbers: dtForm.borderTransportNumbers,
      arrivalTransportModeCode: dtForm.arrivalTransportModeCode || null,
      arrivalTransportNationality: dtForm.arrivalTransportNationality || null,
      arrivalTransportNumbers: dtForm.arrivalTransportNumbers,
      rateType: dtForm.rateType || null,
      factPayments: dtForm.factPayments,
      goodsItems: dtForm.goodsItems.map((g) => {
        // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
        const { customsValue, ...rest } = g
        return { ...rest, invoiceValue: customsValue, payments: g.payments ?? [] }
      }),
      doc44Items: dtForm.doc44Items,
    }
    await import40Api.updateDeclaration(activeCase.value.id, dtForm.id, payload)
    await reloadCase()
    message.success('ДТ сохранена')
    closeDtEditor()
  } catch {
    message.error('Не удалось сохранить ДТ')
  } finally {
    dtSaving.value = false
  }
}

const kedenExporting = ref(false)
const kedenMissing = ref<string[]>([])
const exportKedenXml = async (declarationId: string) => {
  if (!activeCase.value) return
  kedenExporting.value = true
  kedenMissing.value = []
  try {
    const res = await import40Api.downloadKedenXml(activeCase.value.id, declarationId)
    if ('errors' in res) {
      kedenMissing.value = res.errors
      message.warning('XML не сформирован: заполните обязательные поля')
      return
    }
    const url = URL.createObjectURL(res.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName
    a.click()
    URL.revokeObjectURL(url)
    message.success('XML для КЕДЕН сформирован')
  } catch {
    message.error('Не удалось сформировать XML')
  } finally {
    kedenExporting.value = false
  }
}

const removeDeclaration = async (declarationId: string) => {
  if (!activeCase.value) return
  try {
    await import40Api.deleteDeclaration(activeCase.value.id, declarationId)
    if (editingDtId.value === declarationId) closeDtEditor()
    await reloadCase()
  } catch {
    message.error('Не удалось удалить ДТ')
  }
}

// файлы
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingSection = ref<Import40FileSection | null>(null)
const triggerUpload = (section: Import40FileSection) => {
  pendingSection.value = section
  fileInputRef.value?.click()
}
const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const section = pendingSection.value
  input.value = ''
  if (!file || !section || !activeCase.value) return
  try {
    await import40Api.uploadFile(activeCase.value.id, section, file)
    message.success(`${sectionLabels[section]}: загружено`)
    activeCase.value = await import40Api.get(activeCase.value.id)
    await loadFiles()
  } catch {
    message.error('Не удалось загрузить файл')
  } finally {
    pendingSection.value = null
  }
}
const downloadFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  const blob = await import40Api.downloadFile(activeCase.value.id, f.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = f.originalFileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
const removeFile = async (f: Import40FileDto) => {
  if (!activeCase.value) return
  await import40Api.deleteFile(activeCase.value.id, f.id)
  await loadFiles()
}

const formatTime = (v: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(v))

watch(visibleTabs, (tabs) => {
  if (tabs.length && !tabs.some((t) => t.key === activeTab.value)) activeTab.value = tabs[0].key
})

// держим форму транспорта и форму назначений в синхроне с кейсом
watch(activeCase, syncTransportForm)
watch(activeCase, syncAssignForm)

onMounted(async () => {
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch (e) {
    console.error('Failed to load countries', e)
  }
  await loadStaffOptions()
  await reload()
})
</script>

<style scoped>
.import40-page { display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }

.case-board { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr); gap: 18px; align-items: start; }
.case-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.case-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.case-phase { color: var(--atg-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.status-chip { display: inline-flex; min-height: 24px; align-items: center; padding: 2px 10px; border-radius: 999px; color: var(--atg-accent-strong); background: var(--atg-accent-soft, rgba(43,188,212,0.12)); font-size: 12px; font-weight: 800; }
.problem-chip { display: inline-flex; padding: 2px 10px; border-radius: 999px; background: rgba(184,74,60,0.12); color: #b84a3c; font-size: 12px; font-weight: 700; }
.role-chip { display: inline-flex; align-items: center; min-height: 32px; padding: 2px 12px; border-radius: 999px; border: 1px solid rgba(43,188,212,0.4); background: rgba(43,188,212,0.1); color: var(--atg-accent-strong); font-size: 13px; font-weight: 800; }

.case-meta { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 16px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); background: var(--atg-surface-muted, #f6f8fb); }
.meta-item { display: grid; gap: 4px; min-width: 0; }
.meta-item span { color: var(--atg-muted); font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
.meta-item strong { color: var(--atg-ink); font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.case-progress { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.case-progress :deep(.ant-progress) { flex: 1; margin: 0; }
.case-progress span { flex-shrink: 0; color: var(--atg-muted); font-size: 12px; font-weight: 700; }

.pipeline { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.pipeline-step { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); background: #fff; }
.step-dot { display: grid; place-items: center; flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; background: var(--atg-surface-muted, #eef1f6); color: var(--atg-muted); font-size: 11px; font-weight: 800; }
.step-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--atg-muted); font-size: 12px; font-weight: 700; }
.pipeline-step.done .step-dot, .pipeline-step.active .step-dot { background: var(--atg-accent); color: #fff; }
.pipeline-step.done .step-label, .pipeline-step.active .step-label { color: var(--atg-ink); }
.pipeline-step.active { border-color: var(--atg-accent); box-shadow: 0 0 0 3px rgba(43,188,212,0.15); }

.card-title { display: flex; align-items: center; gap: 9px; color: var(--atg-ink); font-weight: 800; }
.card-title :deep(.anticon) { color: var(--atg-accent-strong); }
.actions-card { position: sticky; top: 76px; }
.actions-help { margin: 0 0 12px; color: var(--atg-muted); font-size: 13px; line-height: 1.55; }
.quick-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.quick-actions .ant-btn { justify-content: flex-start; }
.no-actions { color: var(--atg-muted); font-size: 13px; }
.action-item { display: flex; flex-direction: column; gap: 3px; }
.action-item .ant-btn { width: 100%; }
.action-hint { color: var(--atg-muted); font-size: 11.5px; }
.claim-row { margin-bottom: 10px; }
.return-btn { width: 100%; justify-content: center; margin-top: 12px; }
.assign-block { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--atg-line); }
.assign-title { color: var(--atg-muted); font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
.assign-block label { display: flex; flex-direction: column; gap: 4px; }
.assign-block label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.assign-block .ant-select { width: 100%; }
.assign-hint { color: var(--atg-muted); font-size: 11.5px; }
.return-banner { margin: 0; }

.add-container { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.container-block { border: 1px solid var(--atg-line); border-radius: var(--atg-radius); padding: 12px 14px; margin-bottom: 12px; }
.container-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.container-head strong { font-size: 14px; font-weight: 800; color: var(--atg-ink); }
.container-type { margin-left: 8px; color: var(--atg-muted); font-size: 12px; }
.container-actions { display: flex; gap: 6px; }

.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-bottom: 16px; }
.form-grid label { display: flex; flex-direction: column; gap: 6px; }
.form-grid label span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }
.transport-save { margin-top: 4px; }

.dt-toolbar { margin-bottom: 14px; }
.dt-block { border: 1px solid var(--atg-line); border-radius: var(--atg-radius); padding: 12px 14px; margin-bottom: 12px; }
.dt-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.dt-row-main { display: flex; align-items: center; gap: 10px; }
.dt-row-main strong { font-size: 14px; font-weight: 800; color: var(--atg-ink); }
.dt-meta { color: var(--atg-muted); font-size: 12px; }
.dt-row-actions { display: flex; gap: 6px; }
.dt-editor { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--atg-line); }
.dt-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dt-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
.dt-editor-actions { display: flex; gap: 10px; margin-top: 12px; }

.flow-blocks { display: grid; gap: 14px; }
.flow-block { display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.flow-block-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.flow-block-head strong { color: var(--atg-ink); font-size: 13.5px; font-weight: 800; }
.flow-sum { margin: 0; font-size: 14px; color: var(--atg-ink); }
.flow-block .ant-btn { justify-self: start; }

.prompt-field { display: flex; flex-direction: column; gap: 6px; }
.prompt-field span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; }

.file-list { display: grid; gap: 8px; }
.file-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.file-section-tag { font-size: 11px; font-weight: 800; color: var(--atg-accent-strong); background: var(--atg-accent-soft, rgba(43,188,212,0.1)); padding: 2px 8px; border-radius: 6px; }
.file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

.log-list { display: grid; gap: 8px; }
.log-item { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 9px 10px; border: 1px solid var(--atg-line); border-radius: var(--atg-radius); }
.log-item span { color: var(--atg-muted); font-size: 12px; font-weight: 700; }
.log-item strong { color: var(--atg-ink); font-size: 13px; font-weight: 700; }

@media (max-width: 1180px) {
  .case-board { grid-template-columns: 1fr; }
  .actions-card { position: static; }
  .pipeline { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .case-meta, .form-grid, .dt-grid-3 { grid-template-columns: repeat(2, minmax(0,1fr)); }
}

.dt-tpin-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dt-section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--atg-muted, #888); }
.dt-transport-block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.transport-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.transport-list-row { display: flex; align-items: center; gap: 8px; }
.keden-missing { margin-top: 12px; }
</style>
