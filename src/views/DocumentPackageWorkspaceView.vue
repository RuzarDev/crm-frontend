<template>
  <div class="document-package-workspace crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Рабочая область брокера</div>
        <h1 class="crm-page-title">Разбор поезда: {{ packageData?.trainNumber }}</h1>
        <p class="crm-page-subtitle">
          Распределите файлы по контейнерам и клиентам для консолидации, затем сгенерируйте строки реестра.
        </p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="goBack">Назад к списку</a-button>
        <a-button :loading="loading" @click="loadPackage">
          <ReloadOutlined />
          Обновить
        </a-button>
        <a-button
          v-if="canReview"
          type="default"
          style="border-color: var(--atg-accent); color: var(--atg-accent-strong); font-weight: 700; background: var(--atg-teal-soft);"
          :loading="aiParsing"
          @click="runAiParse"
        >
          ✨ Авто-разбор (AI)
        </a-button>
        <a-button
          type="primary"
          :loading="generating"
          @click="handleGenerateRows"
        >
          <BuildOutlined />
          Сгенерировать строки реестра
        </a-button>
      </div>
    </div>

    <a-spin :spinning="loading">
      <div v-if="packageData" class="workspace-split" :class="{ 'split-active': splitOpen }">
        <div v-if="splitOpen" class="split-file-pane">
          <div class="split-file-head">
            <span class="split-file-name">{{ previewFile?.originalFileName }}</span>
            <a-button size="small" @click="closeSplit">Закрыть просмотр</a-button>
          </div>
          <div class="split-file-body">
            <a-spin v-if="previewLoading" />
            <iframe v-else-if="isPdf(previewFile) && previewUrl" :src="previewUrl" class="split-frame"></iframe>
            <img v-else-if="isImage(previewFile) && previewUrl" :src="previewUrl" class="split-img" />
            <div v-else class="split-fallback">
              <p>Предпросмотр недоступен.</p>
              <a-button type="primary" @click="downloadPreviewFile">Скачать файл</a-button>
            </div>
          </div>
        </div>
        <div class="split-content-pane">
      <div class="workspace-grid">
        <!-- LEFT SIDE: Files list -->
        <a-card class="crm-shell-card files-card" :bordered="false">
          <template #title>
            <span class="card-title">
              <FileOutlined />
              Входящие файлы ({{ packageData.files.length }})
            </span>
          </template>

          <!-- Dropzone Upload -->
          <div class="workspace-file-upload">
            <input
              type="file"
              multiple
              ref="fileInputRef"
              style="display: none"
              @change="handleFileUploadEvent"
            />
            <div
              class="workspace-upload-dropzone"
              :class="{ 'dropzone-active': isDropzoneActive }"
              @dragover.prevent
              @dragenter="isDropzoneActive = true"
              @dragleave="isDropzoneActive = false"
              @drop="handleDropzoneDrop"
              @click="triggerFileSelect"
            >
              <InboxOutlined class="dropzone-icon" />
              <div class="dropzone-text">
                <strong>Перетащите файлы сюда</strong> или нажмите для выбора
              </div>
            </div>
            <a-spin v-if="uploadingFiles" size="small" style="display: block; margin: 10px auto; text-align: center;" />
          </div>

          <a-list :data-source="packageData.files" item-layout="vertical" size="small">
            <template #renderItem="{ item }">
              <a-list-item 
                class="file-item-wrap" 
                :class="{ 'file-linked': isLinked(item) }"
                draggable="true" 
                @dragstart="handleDragStart($event, item)"
              >
                <div class="file-info">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <div class="file-name" :title="item.originalFileName">
                      {{ item.originalFileName }}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                      <a-tooltip title="Просмотр документа">
                        <a-button
                          size="small"
                          type="text"
                          style="padding: 0 4px; height: 20px; line-height: 20px; display: inline-flex; align-items: center; justify-content: center;"
                          @click.stop="openPreview(item)"
                        >
                          <template #icon><EyeOutlined /></template>
                        </a-button>
                      </a-tooltip>
                      <a-tooltip title="Открыть рядом">
                        <a-button
                          size="small"
                          type="text"
                          style="padding: 0 4px; height: 20px; line-height: 20px; display: inline-flex; align-items: center; justify-content: center;"
                          @click.stop="openSplit(item)"
                        >
                          <template #icon><ColumnWidthOutlined /></template>
                        </a-button>
                      </a-tooltip>
                      <a-tag v-if="isLinked(item)" color="green" style="font-size: 10px; margin: 0; padding: 0 4px; border-radius: 4px;">
                        ✓
                      </a-tag>
                    </div>
                  </div>
                  <div class="file-meta">
                    {{ formatFileSize(item.sizeBytes) }} · {{ formatDate(item.uploadedAtUtc) }}
                  </div>
                </div>

                <div class="file-assignment">
                  <span class="assignment-label">Связать с:</span>
                  <a-select
                    :value="getLinkValue(item)"
                    style="width: 100%"
                    size="small"
                    placeholder="Не распределен"
                    option-label-prop="label"
                    @change="handleLinkFile(item.id, $event)"
                  >
                    <a-select-option value="unassigned" label="Не распределен">
                      <span class="opt-unassigned">Не распределен</span>
                    </a-select-option>
                    <template v-for="container in packageData.containers" :key="container.id">
                      <a-select-option :value="`container:${container.id}`" :label="`Контейнер ${container.containerNumber} (ЖДН)`">
                        <div class="select-opt-item container-opt">
                          <span class="opt-badge-container">ЖДН</span>
                          <span class="opt-text">Контейнер {{ container.containerNumber }}</span>
                        </div>
                      </a-select-option>
                      <a-select-option
                        v-for="con in container.consolidations"
                        :key="con.id"
                        :value="`consolidation:${con.id}`"
                        :label="`↳ Клиент: ${con.clientName} (ТСД)`"
                      >
                        <div class="select-opt-item client-opt">
                          <span class="opt-indent">↳</span>
                          <span class="opt-badge-client">ТСД</span>
                          <span class="opt-text">Клиент: {{ con.clientName }}</span>
                        </div>
                      </a-select-option>
                    </template>
                  </a-select>
                </div>
              </a-list-item>
            </template>
          </a-list>
          <a-empty v-if="!packageData.files.length" description="Экспедитор еще не загрузил файлы" />
        </a-card>

        <!-- CENTER: Train Hierarchy -->
        <div class="hierarchy-column">
          <!-- Review Panel (visible to Brokers / Admins) -->
          <a-card v-if="canReview" class="crm-shell-card review-panel-card" :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span class="card-title">
                <AuditOutlined />
                Решение по пакету документов
              </span>
            </template>
            <div class="review-panel-content">
              <div class="review-status-info">
                <span>Текущий статус поезда:</span>
                <a-tag :color="statusColor(packageData.status)" style="margin-left: 8px;">
                  {{ statusLabel(packageData.status) }}
                </a-tag>
                <div v-if="packageData.reviewComment" class="current-review-comment" style="margin-top: 8px; font-size: 13px; color: var(--atg-charcoal);">
                  <strong>Замечания:</strong> {{ packageData.reviewComment }}
                </div>
              </div>
              <div class="review-action-form" style="margin-top: 16px; display: flex; flex-direction: column; gap: 12px;">
                <a-textarea
                  v-model:value="reviewCommentText"
                  :rows="2"
                  placeholder="Напишите замечания для экспедитора (например: не хватает инвойса, нечеткое фото...)"
                />
                <div style="display: flex; gap: 12px;">
                  <a-button
                    type="primary"
                    :loading="statusSaving"
                    @click="handleUpdateStatus('accepted')"
                  >
                    Принять поезд
                  </a-button>
                  <a-button
                    danger
                    :loading="statusSaving"
                    @click="handleUpdateStatus('needsFix')"
                  >
                    Отклонить (Нужно исправить)
                  </a-button>
                </div>
              </div>
            </div>
          </a-card>

          <a-card
            class="crm-shell-card train-card"
            :class="{ 'drag-over': isDragOver('train', packageData.id) }"
            :bordered="false"
            @dragover.prevent
            @dragenter="handleDragEnter($event, 'train', packageData.id)"
            @dragleave="handleDragLeave($event, 'train', packageData.id)"
            @drop="handleDrop($event, 'train', packageData.id)"
          >
            <div class="train-header">
              <div class="train-info">
                <div class="train-icon-wrap">
                  <GoldOutlined />
                </div>
                <div>
                  <h3>Состав №{{ packageData.trainNumber }}</h3>
                  <div class="train-comment" v-if="packageData.comment">
                    {{ packageData.comment }}
                  </div>
                </div>
              </div>
              <a-tag :color="statusColor(packageData.status)">
                {{ statusLabel(packageData.status) }}
              </a-tag>
            </div>
            
            <div class="train-actions" style="margin-top: 16px;">
              <a-button type="primary" size="small" @click="openAddContainerModal">
                <PlusOutlined />
                Добавить контейнер
              </a-button>
            </div>
          </a-card>

          <!-- Containers List -->
          <div class="containers-list">
            <div
              v-for="container in packageData.containers"
              :key="container.id"
              class="container-node-card"
              :class="{ 'drag-over': isDragOver('container', container.id) }"
              @dragover.prevent
              @dragenter="handleDragEnter($event, 'container', container.id)"
              @dragleave="handleDragLeave($event, 'container', container.id)"
              @drop="handleDrop($event, 'container', container.id)"
            >
              <div class="container-node-header">
                <div>
                  <div class="container-title">
                    <span class="node-badge">Контейнер</span>
                    <strong>{{ container.containerNumber }}</strong>
                    <span class="container-meta" v-if="container.sealNumber">
                      Пломба: {{ container.sealNumber }}
                    </span>
                    <span class="container-meta" v-if="container.weight">
                      Вес: {{ container.weight }}
                    </span>
                  </div>
                  <div class="container-document-meta" v-if="container.shipper || container.consignee || container.destinationStation">
                    <span class="meta-inline-tag" v-if="container.shipper"><strong>Отп:</strong> {{ container.shipper }}</span>
                    <span class="meta-inline-tag" v-if="container.consignee"><strong>Пол:</strong> {{ container.consignee }}</span>
                    <span class="meta-inline-tag" v-if="container.destinationStation"><strong>Ст:</strong> {{ container.destinationStation }}</span>
                  </div>
                </div>
                <a-space>
                  <a-button type="link" size="small" @click="openAddClientModal(container.id)">
                    <PlusOutlined />
                    Клиент/Партия
                  </a-button>
                  <a-button type="text" size="small" @click="openEditContainerModal(container)">
                    <EditOutlined style="color: #1890ff;" />
                  </a-button>
                  <a-popconfirm
                    title="Вы уверены, что хотите удалить этот контейнер и все его партии?"
                    ok-text="Да"
                    cancel-text="Нет"
                    @confirm="handleDeleteContainer(container.id)"
                  >
                    <a-button type="text" size="small" danger>
                      <DeleteOutlined />
                    </a-button>
                  </a-popconfirm>
                </a-space>
              </div>

              <!-- Container Files -->
              <div v-if="getContainerFiles(container.id).length" class="node-linked-files">
                <div class="files-title">ЖДН (Железнодорожная накладная):</div>
                <div class="files-chips">
                  <span
                    v-for="file in getContainerFiles(container.id)"
                    :key="file.id"
                    class="file-chip"
                    @click="downloadFile(file)"
                  >
                    <PaperClipOutlined />
                    {{ file.originalFileName }}
                  </span>
                </div>
              </div>

              <!-- Client Consolidations (House Shipments) -->
              <div class="consolidations-list">
                <div
                  v-for="consolidation in container.consolidations"
                  :key="consolidation.id"
                  class="consolidation-node-card"
                  :class="{ 'drag-over': isDragOver('consolidation', consolidation.id) }"
                  @dragover.prevent
                  @dragenter="handleDragEnter($event, 'consolidation', consolidation.id)"
                  @dragleave="handleDragLeave($event, 'consolidation', consolidation.id)"
                  @drop="handleDrop($event, 'consolidation', consolidation.id)"
                >
                  <div class="consolidation-header-wrap">
                    <div class="consolidation-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="node-badge badge-client">Клиент</span>
                        <strong>{{ consolidation.clientName }}</strong>
                        <span class="con-cargo" v-if="consolidation.cargoDescription">
                          · {{ consolidation.cargoDescription }}
                        </span>
                      </div>
                      <a-space>
                        <a-button type="text" size="small" @click="openEditClientModal(container.id, consolidation)">
                          <EditOutlined style="color: #1890ff; font-size: 12px;" />
                        </a-button>
                        <a-popconfirm
                          title="Вы уверены, что хотите удалить эту партию?"
                          ok-text="Да"
                          cancel-text="Нет"
                          @confirm="handleDeleteClient(container.id, consolidation.id)"
                        >
                          <a-button type="text" size="small" danger style="font-size: 12px;">
                            <DeleteOutlined />
                          </a-button>
                        </a-popconfirm>
                      </a-space>
                    </div>
                    <div class="consolidation-document-meta" v-if="consolidation.shipper || consolidation.consignee || consolidation.weight || consolidation.packagesCount || consolidation.subcode || consolidation.commodityCode || consolidation.destinationStation">
                      <span class="meta-inline-tag" v-if="consolidation.shipper"><strong>Отп:</strong> {{ consolidation.shipper }}</span>
                      <span class="meta-inline-tag" v-if="consolidation.consignee"><strong>Пол:</strong> {{ consolidation.consignee }}</span>
                      <span class="meta-inline-tag text-green" v-if="consolidation.weight"><strong>Вес:</strong> {{ consolidation.weight }}</span>
                      <span class="meta-inline-tag text-gold" v-if="consolidation.packagesCount"><strong>Мест:</strong> {{ consolidation.packagesCount }}</span>
                      <span class="meta-inline-tag" v-if="consolidation.subcode"><strong>Подкод:</strong> {{ consolidation.subcode }}</span>
                      <span class="meta-inline-tag" v-if="consolidation.commodityCode"><strong>ТНВЭД:</strong> {{ consolidation.commodityCode }}</span>
                      <span class="meta-inline-tag" v-if="consolidation.destinationStation"><strong>Ст:</strong> {{ consolidation.destinationStation }}</span>
                    </div>
                  </div>

                  <!-- Consolidation Files -->
                  <div v-if="getClientFiles(consolidation.id).length" class="node-linked-files" style="margin-top: 8px;">
                    <div class="files-title">ТСД (Товаросопроводительные документы):</div>
                    <div class="files-chips">
                      <span
                        v-for="file in getClientFiles(consolidation.id)"
                        :key="file.id"
                        class="file-chip"
                        @click="downloadFile(file)"
                      >
                        <PaperClipOutlined />
                        {{ file.originalFileName }}
                      </span>
                    </div>
                  </div>
                </div>

                <div v-if="!container.consolidations.length" class="empty-node-text">
                  Клиенты в контейнере не созданы
                </div>
              </div>
            </div>

            <div v-if="!packageData.containers.length" class="empty-train-text">
              Контейнеры еще не добавлены к составу
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </a-spin>

    <!-- Modal: Add Container -->
    <a-modal
      v-if="!splitOpen"
      v-model:open="containerModalOpen"
      :title="isEditingContainer ? 'Редактировать контейнер' : 'Добавить контейнер в состав'"
      :ok-text="isEditingContainer ? 'Сохранить' : 'Добавить'"
      cancel-text="Отмена"
      :confirm-loading="containerSaving"
      @ok="handleAddContainer"
    >
      <a-form layout="vertical">
        <a-form-item label="Номер контейнера" required>
          <a-input v-model:value="containerForm.containerNumber" placeholder="Например: MSCU1234567" />
        </a-form-item>
        <a-form-item label="Номер пломбы">
          <a-input v-model:value="containerForm.sealNumber" placeholder="Например: LL123456" />
        </a-form-item>
        <a-form-item label="Вес">
          <a-input v-model:value="containerForm.weight" placeholder="Например: 12 500 кг" />
        </a-form-item>
        <a-form-item label="Отправитель по ЖДН">
          <a-input v-model:value="containerForm.shipper" placeholder="Отправитель по накладной" />
        </a-form-item>
        <a-form-item label="Получатель по ЖДН">
          <a-input v-model:value="containerForm.consignee" placeholder="Получатель по накладной" />
        </a-form-item>
        <a-form-item label="Станция назначения по ЖДН">
          <a-select v-model:value="containerStationModel" show-search allow-clear mode="tags" :max-tag-count="1"
            :options="stationOptions" placeholder="Выберите или введите станцию" />
        </a-form-item>
        <a-form-item label="Пост">
          <a-select v-model:value="containerPostModel" show-search allow-clear mode="tags" :max-tag-count="1"
            :options="postOptions" placeholder="Выберите или введите пост" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Modal: Add Client Consolidation -->
    <a-modal
      v-if="!splitOpen"
      v-model:open="clientModalOpen"
      :title="isEditingClient ? 'Редактировать клиента / партию' : 'Добавить клиента / партию в контейнер'"
      :ok-text="isEditingClient ? 'Сохранить' : 'Добавить'"
      cancel-text="Отмена"
      :confirm-loading="clientSaving"
      @ok="handleAddClient"
    >
      <a-form layout="vertical">
        <a-form-item label="Клиент (Username получателя в CRM)" required>
          <a-select
            v-model:value="clientForm.clientName"
            show-search
            :options="clientOptions"
            placeholder="Выберите или введите имя клиента"
          />
        </a-form-item>
        <a-form-item label="Описание груза по ТСД">
          <a-textarea v-model:value="clientForm.cargoDescription" :rows="2" placeholder="Описание перевозимого товара" />
        </a-form-item>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <a-form-item label="Отправитель по ТСД">
            <a-input v-model:value="clientForm.shipper" placeholder="Отправитель" />
          </a-form-item>
          <a-form-item label="Получатель по ТСД">
            <a-input v-model:value="clientForm.consignee" placeholder="Получатель" />
          </a-form-item>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <a-form-item label="Количество мест">
            <a-input v-model:value="clientForm.packagesCount" placeholder="Например: 45 мест" />
          </a-form-item>
          <a-form-item label="Вес по ТСД">
            <a-input v-model:value="clientForm.weight" placeholder="Например: 2450 кг" />
          </a-form-item>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <a-form-item label="Подкод">
            <a-input v-model:value="clientForm.subcode" placeholder="Например: S-12" />
          </a-form-item>
          <a-form-item label="Код ТНВЭД">
            <a-input v-model:value="clientForm.commodityCode" placeholder="Код товара" />
          </a-form-item>
        </div>
        <a-form-item label="Станция назначения по ТСД">
          <a-select v-model:value="clientStationModel" show-search allow-clear mode="tags" :max-tag-count="1"
            :options="stationOptions" placeholder="Выберите или введите станцию" />
        </a-form-item>
        <a-form-item label="Пост">
          <a-select v-model:value="clientPostModel" show-search allow-clear mode="tags" :max-tag-count="1"
            :options="postOptions" placeholder="Выберите или введите пост" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Full-width split: edit form (left half) + open file (right half) -->
    <div v-if="splitOpen && (containerModalOpen || clientModalOpen)" class="edit-split-overlay">
      <div class="edit-split-form-pane">
        <div class="edit-split-card">
          <div class="edit-split-head">
            <span class="edit-split-title">
              {{ containerModalOpen
                ? (isEditingContainer ? 'Редактировать контейнер' : 'Добавить контейнер в состав')
                : (isEditingClient ? 'Редактировать клиента / партию' : 'Добавить клиента / партию в контейнер') }}
            </span>
            <a-button size="small" @click="cancelEdit">Закрыть</a-button>
          </div>
          <div class="edit-split-body">
            <a-form v-if="containerModalOpen" layout="vertical">
              <a-form-item label="Номер контейнера" required>
                <a-input v-model:value="containerForm.containerNumber" placeholder="Например: MSCU1234567" />
              </a-form-item>
              <a-form-item label="Номер пломбы">
                <a-input v-model:value="containerForm.sealNumber" placeholder="Например: LL123456" />
              </a-form-item>
              <a-form-item label="Вес">
                <a-input v-model:value="containerForm.weight" placeholder="Например: 12 500 кг" />
              </a-form-item>
              <a-form-item label="Отправитель по ЖДН">
                <a-input v-model:value="containerForm.shipper" placeholder="Отправитель по накладной" />
              </a-form-item>
              <a-form-item label="Получатель по ЖДН">
                <a-input v-model:value="containerForm.consignee" placeholder="Получатель по накладной" />
              </a-form-item>
              <a-form-item label="Станция назначения по ЖДН">
                <a-select v-model:value="containerStationModel" show-search allow-clear mode="tags" :max-tag-count="1"
                  :options="stationOptions" placeholder="Выберите или введите станцию" />
              </a-form-item>
              <a-form-item label="Пост">
                <a-select v-model:value="containerPostModel" show-search allow-clear mode="tags" :max-tag-count="1"
                  :options="postOptions" placeholder="Выберите или введите пост" />
              </a-form-item>
            </a-form>
            <a-form v-else-if="clientModalOpen" layout="vertical">
              <a-form-item label="Клиент (Username получателя в CRM)" required>
                <a-select
                  v-model:value="clientForm.clientName"
                  show-search
                  :options="clientOptions"
                  placeholder="Выберите или введите имя клиента"
                />
              </a-form-item>
              <a-form-item label="Описание груза по ТСД">
                <a-textarea v-model:value="clientForm.cargoDescription" :rows="2" placeholder="Описание перевозимого товара" />
              </a-form-item>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <a-form-item label="Отправитель по ТСД">
                  <a-input v-model:value="clientForm.shipper" placeholder="Отправитель" />
                </a-form-item>
                <a-form-item label="Получатель по ТСД">
                  <a-input v-model:value="clientForm.consignee" placeholder="Получатель" />
                </a-form-item>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <a-form-item label="Количество мест">
                  <a-input v-model:value="clientForm.packagesCount" placeholder="Например: 45 мест" />
                </a-form-item>
                <a-form-item label="Вес по ТСД">
                  <a-input v-model:value="clientForm.weight" placeholder="Например: 2450 кг" />
                </a-form-item>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <a-form-item label="Подкод">
                  <a-input v-model:value="clientForm.subcode" placeholder="Например: S-12" />
                </a-form-item>
                <a-form-item label="Код ТНВЭД">
                  <a-input v-model:value="clientForm.commodityCode" placeholder="Код товара" />
                </a-form-item>
              </div>
              <a-form-item label="Станция назначения по ТСД">
                <a-select v-model:value="clientStationModel" show-search allow-clear mode="tags" :max-tag-count="1"
                  :options="stationOptions" placeholder="Выберите или введите станцию" />
              </a-form-item>
              <a-form-item label="Пост">
                <a-select v-model:value="clientPostModel" show-search allow-clear mode="tags" :max-tag-count="1"
                  :options="postOptions" placeholder="Выберите или введите пост" />
              </a-form-item>
            </a-form>
          </div>
          <div class="edit-split-footer">
            <a-button @click="cancelEdit">Отмена</a-button>
            <a-button
              type="primary"
              :loading="containerModalOpen ? containerSaving : clientSaving"
              @click="containerModalOpen ? handleAddContainer() : handleAddClient()"
            >
              {{ containerModalOpen
                ? (isEditingContainer ? 'Сохранить' : 'Добавить')
                : (isEditingClient ? 'Сохранить' : 'Добавить') }}
            </a-button>
          </div>
        </div>
      </div>
      <div class="edit-split-file-pane">
        <template v-if="previewFile">
          <div class="split-file-head">
            <span class="split-file-name">{{ previewFile?.originalFileName }}</span>
            <a-button size="small" @click="backToFileList">← К списку файлов</a-button>
          </div>
          <div class="split-file-body">
            <a-spin v-if="previewLoading" />
            <iframe v-else-if="isPdf(previewFile) && previewUrl" :src="previewUrl" class="split-frame"></iframe>
            <img v-else-if="isImage(previewFile) && previewUrl" :src="previewUrl" class="split-img" />
            <div v-else class="split-fallback">
              <p>Предпросмотр недоступен.</p>
              <a-button type="primary" @click="downloadPreviewFile">Скачать файл</a-button>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="split-file-head">
            <span class="split-file-name">Прикрепленные файлы</span>
          </div>
          <div class="split-file-picker">
            <a-empty v-if="!editPaneFiles.length" description="К этому контейнеру/клиенту файлы еще не прикреплены" />
            <div
              v-for="file in editPaneFiles"
              :key="file.id"
              class="split-file-picker-item"
              @click="openSplit(file)"
            >
              <FileOutlined />
              <span class="split-file-picker-name" :title="file.originalFileName">{{ file.originalFileName }}</span>
              <span class="split-file-picker-meta">{{ formatFileSize(file.sizeBytes) }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- AI Parsing Modal -->
    <a-modal
      v-model:open="aiModalOpen"
      :footer="null"
      :closable="false"
      :keyboard="false"
      :maskClosable="false"
      title="Машинный авто-разбор состава (AI OCR)"
      centered
    >
      <div style="text-align: center; padding: 30px 20px;">
        <a-spin size="large" style="margin-bottom: 20px;" />
        <div style="font-size: 16px; font-weight: 700; color: var(--atg-navy); margin-bottom: 10px;">
          ✨ Интеллектуальный анализ...
        </div>
        <div style="font-size: 13.5px; color: var(--atg-muted);">
          {{ aiStatusText }}
        </div>
      </div>
    </a-modal>

    <!-- Document Preview Drawer -->
    <a-drawer
      v-model:open="previewOpen"
      :title="`Просмотр: ${previewFile?.originalFileName}`"
      width="60%"
      placement="right"
      :destroyOnClose="true"
    >
      <div v-if="previewLoading" style="text-align: center; padding: 40px;">
        <a-spin size="large" tip="Загрузка превью..." />
      </div>
      <div v-else-if="previewUrl" style="height: 100%; display: flex; flex-direction: column;">
        <!-- If PDF -->
        <iframe
          v-if="isPdf(previewFile)"
          :src="previewUrl"
          style="width: 100%; height: 100%; border: none; flex-grow: 1;"
        ></iframe>
        <!-- If Image -->
        <div v-else-if="isImage(previewFile)" style="text-align: center; overflow: auto; background: #f0f2f5; padding: 20px; border-radius: 8px; flex-grow: 1; display: flex; align-items: center; justify-content: center;">
          <img :src="previewUrl" style="max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
        </div>
        <!-- Fallback for other formats -->
        <div v-else style="text-align: center; padding: 40px;">
          <FileOutlined style="font-size: 64px; color: var(--atg-muted); margin-bottom: 20px;" />
          <h3>Предпросмотр недоступен для этого формата</h3>
          <p class="muted">Скачайте файл, чтобы открыть его на своем компьютере.</p>
          <a-button type="primary" @click="downloadPreviewFile">
            Скачать файл ({{ formatFileSize(previewFile?.sizeBytes || 0) }})
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  BuildOutlined,
  FileOutlined,
  PlusOutlined,
  GoldOutlined,
  PaperClipOutlined,
  EditOutlined,
  DeleteOutlined,
  InboxOutlined,
  AuditOutlined,
  EyeOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons-vue'
import { documentPackagesApi } from '@/api/documentPackages'
import { reestrApi } from '@/api/reestr'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import type { DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'

const route = useRoute()
const router = useRouter()

const packageId = String(route.params.id)
const loading = ref(false)
const generating = ref(false)
const packageData = ref<DocumentPackageDto | null>(null)

// Containers Modal
const containerModalOpen = ref(false)
const containerSaving = ref(false)
const isEditingContainer = ref(false)
const editingContainerId = ref<string | null>(null)
const containerForm = reactive({
  containerNumber: '',
  sealNumber: '',
  weight: '',
  shipper: '',
  consignee: '',
  destinationStation: '',
  customsPost: '',
})

// Reference dropdowns
const stationOptions = ref<{ value: string; label: string }[]>([])
const postOptions = ref<{ value: string; label: string }[]>([])
const loadReferences = async () => {
  try {
    const [stations, posts] = await Promise.all([referencesApi.listStations(), referencesApi.listCustomsPosts()])
    stationOptions.value = stations.map((s) => ({ value: s.name, label: s.name }))
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
  } catch (e) {
    console.error('Failed to load references', e)
  }
}

// Clients Modal
const clientModalOpen = ref(false)
const clientSaving = ref(false)
const isEditingClient = ref(false)
const editingClientId = ref<string | null>(null)
const targetContainerId = ref<string | null>(null)
const clientOptions = ref<{ value: string; label: string }[]>([])
const clientForm = reactive({
  clientName: '',
  cargoDescription: '',
  shipper: '',
  consignee: '',
  destinationStation: '',
  customsPost: '',
  subcode: '',
  commodityCode: '',
  packagesCount: '',
  weight: '',
})

// Drag and Drop state
const dragOverTarget = ref<{ type: string; id: string } | null>(null)

const handleDragStart = (event: DragEvent, file: DocumentPackageFileDto) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', file.id)
    event.dataTransfer.effectAllowed = 'move'
  }
}

const handleDragEnter = (event: DragEvent, type: string, id: string) => {
  dragOverTarget.value = { type, id }
}

const handleDragLeave = (event: DragEvent, type: string, id: string) => {
  if (dragOverTarget.value?.type === type && dragOverTarget.value?.id === id) {
    dragOverTarget.value = null
  }
}

const isDragOver = (type: string, id: string) => {
  return dragOverTarget.value?.type === type && dragOverTarget.value?.id === id
}

const handleDrop = async (event: DragEvent, type: string, id: string) => {
  event.preventDefault()
  dragOverTarget.value = null

  const fileId = event.dataTransfer?.getData('text/plain')
  if (!fileId) return

  let value = 'unassigned'
  if (type === 'container') {
    value = `container:${id}`
  } else if (type === 'consolidation') {
    value = `consolidation:${id}`
  }

  await handleLinkFile(fileId, value)
}

onMounted(async () => {
  await Promise.all([loadPackage(), loadClients(), loadReferences()])
})

const loadPackage = async () => {
  loading.value = true
  try {
    packageData.value = await documentPackagesApi.getById(packageId)
  } catch (err) {
    message.error('Ошибка загрузки данных состава')
  } finally {
    loading.value = false
  }
}

const containerStationModel = computed<string[]>({
  get: () => (containerForm.destinationStation ? [containerForm.destinationStation] : []),
  set: (v) => { containerForm.destinationStation = v[v.length - 1] ?? '' },
})
const containerPostModel = computed<string[]>({
  get: () => (containerForm.customsPost ? [containerForm.customsPost] : []),
  set: (v) => { containerForm.customsPost = v[v.length - 1] ?? '' },
})
const clientStationModel = computed<string[]>({
  get: () => (clientForm.destinationStation ? [clientForm.destinationStation] : []),
  set: (v) => { clientForm.destinationStation = v[v.length - 1] ?? '' },
})
const clientPostModel = computed<string[]>({
  get: () => (clientForm.customsPost ? [clientForm.customsPost] : []),
  set: (v) => { clientForm.customsPost = v[v.length - 1] ?? '' },
})

const authStore = useAuthStore()
const role = computed(() => (authStore.role || '').trim().toLowerCase())
const canReview = computed(() => role.value === 'broker' || role.value === 'administrator')

const loadClients = async () => {
  try {
    const clientsList = await reestrApi.listPortfolioClients()
    clientOptions.value = clientsList.map((c) => ({
      value: c.username,
      label: c.username,
    }))
  } catch (err) {
    console.error('Failed to load clients options', err)
  }
}

const goBack = () => {
  router.push('/document-packages')
}

// File Dropzone & Upload state & logic
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDropzoneActive = ref(false)
const uploadingFiles = ref(false)

const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

const handleFileUploadEvent = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  await uploadFiles(files)
  input.value = ''
}

const handleDropzoneDrop = async (event: DragEvent) => {
  event.preventDefault()
  isDropzoneActive.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!files.length) return
  await uploadFiles(files)
}

const uploadFiles = async (files: File[]) => {
  uploadingFiles.value = true
  try {
    for (const file of files) {
      await documentPackagesApi.uploadFile(packageId, file)
    }
    message.success('Файлы успешно загружены')
    await loadPackage()
  } catch (err) {
    message.error('Ошибка при загрузке файлов')
  } finally {
    uploadingFiles.value = false
  }
}

const isLinked = (file: DocumentPackageFileDto) => {
  return !!(file.containerId || file.clientConsolidationId)
}

// Review Comment & Status updates logic
const reviewCommentText = ref('')
const statusSaving = ref(false)

const handleUpdateStatus = async (newStatus: 'accepted' | 'needsFix' | 'processed' | 'uploaded') => {
  if (!packageData.value) return
  statusSaving.value = true
  try {
    packageData.value = await documentPackagesApi.changeStatus(packageId, {
      status: newStatus,
      reviewComment: reviewCommentText.value.trim() || null,
    })
    message.success('Статус пакета успешно обновлен')
    reviewCommentText.value = ''
  } catch (err) {
    message.error('Не удалось обновить статус пакета')
  } finally {
    statusSaving.value = false
  }
}

// Assignment dropdown options builder
const linkOptions = computed(() => {
  if (!packageData.value) return []
  const options: { value: string; label: string }[] = [
    { value: 'unassigned', label: 'Не распределен' },
  ]

  packageData.value.containers.forEach((container) => {
    options.push({
      value: `container:${container.id}`,
      label: `Контейнер ${container.containerNumber} (ЖДН)`,
    })

    container.consolidations.forEach((con) => {
      options.push({
        value: `consolidation:${con.id}`,
        label: `  ↳ Клиент: ${con.clientName} (ТСД)`,
      })
    })
  })

  return options
})

const getLinkValue = (file: DocumentPackageFileDto) => {
  if (file.clientConsolidationId) return `consolidation:${file.clientConsolidationId}`
  if (file.containerId) return `container:${file.containerId}`
  return 'unassigned'
}

const getContainerFiles = (containerId: string) => {
  if (!packageData.value) return []
  return packageData.value.files.filter((f) => f.containerId === containerId && !f.clientConsolidationId)
}

const getClientFiles = (consolidationId: string) => {
  if (!packageData.value) return []
  return packageData.value.files.filter((f) => f.clientConsolidationId === consolidationId)
}

const handleLinkFile = async (fileId: string, value: string) => {
  if (!packageData.value) return
  let containerId: string | null = null
  let clientConsolidationId: string | null = null

  if (value.startsWith('container:')) {
    containerId = value.split(':')[1]
  } else if (value.startsWith('consolidation:')) {
    clientConsolidationId = value.split(':')[1]
    // find container
    for (const c of packageData.value.containers) {
      if (c.consolidations.some((x) => x.id === clientConsolidationId)) {
        containerId = c.id
        break
      }
    }
  }

  try {
    packageData.value = await documentPackagesApi.linkFile(packageId, fileId, {
      containerId,
      clientConsolidationId,
    })
    message.success('Файл успешно привязан')
  } catch (err) {
    message.error('Не удалось привязать файл')
  }
}

// Modal handlers
// Modal handlers
const openAddContainerModal = () => {
  isEditingContainer.value = false
  editingContainerId.value = null
  containerForm.containerNumber = ''
  containerForm.sealNumber = ''
  containerForm.weight = ''
  containerForm.shipper = ''
  containerForm.consignee = ''
  containerForm.destinationStation = ''
  containerForm.customsPost = ''
  ensureSplitForEdit()
  containerModalOpen.value = true
}

const openEditContainerModal = (container: any) => {
  isEditingContainer.value = true
  editingContainerId.value = container.id
  containerForm.containerNumber = container.containerNumber
  containerForm.sealNumber = container.sealNumber || ''
  containerForm.weight = container.weight || ''
  containerForm.shipper = container.shipper || ''
  containerForm.consignee = container.consignee || ''
  containerForm.destinationStation = container.destinationStation || ''
  containerForm.customsPost = container.customsPost || ''
  ensureSplitForEdit()
  containerModalOpen.value = true
}

const handleAddContainer = async () => {
  if (!containerForm.containerNumber.trim()) {
    message.error('Укажите номер контейнера')
    return
  }
  containerSaving.value = true
  try {
    const payload = {
      containerNumber: containerForm.containerNumber.trim(),
      sealNumber: containerForm.sealNumber.trim() || null,
      weight: containerForm.weight.trim() || null,
      shipper: containerForm.shipper.trim() || null,
      consignee: containerForm.consignee.trim() || null,
      destinationStation: containerForm.destinationStation.trim() || null,
      customsPost: containerForm.customsPost.trim() || null,
    }
    if (isEditingContainer.value && editingContainerId.value) {
      packageData.value = await documentPackagesApi.updateContainer(packageId, editingContainerId.value, payload)
      message.success('Контейнер успешно обновлен')
    } else {
      packageData.value = await documentPackagesApi.createContainer(packageId, payload)
      message.success('Контейнер добавлен в состав')
    }
    closeEditModals()
  } catch (err) {
    message.error(isEditingContainer.value ? 'Ошибка обновления контейнера' : 'Ошибка добавления контейнера')
  } finally {
    containerSaving.value = false
  }
}

const handleDeleteContainer = async (containerId: string) => {
  loading.value = true
  try {
    packageData.value = await documentPackagesApi.deleteContainer(packageId, containerId)
    message.success('Контейнер удален')
  } catch (err) {
    message.error('Ошибка удаления контейнера')
  } finally {
    loading.value = false
  }
}

const openAddClientModal = (containerId: string) => {
  isEditingClient.value = false
  editingClientId.value = null
  targetContainerId.value = containerId
  clientForm.clientName = ''
  clientForm.cargoDescription = ''
  clientForm.shipper = ''
  clientForm.consignee = ''
  clientForm.destinationStation = ''
  clientForm.customsPost = ''
  clientForm.subcode = ''
  clientForm.commodityCode = ''
  clientForm.packagesCount = ''
  clientForm.weight = ''
  ensureSplitForEdit()
  clientModalOpen.value = true
}

const openEditClientModal = (containerId: string, consolidation: any) => {
  isEditingClient.value = true
  editingClientId.value = consolidation.id
  targetContainerId.value = containerId
  clientForm.clientName = consolidation.clientName
  clientForm.cargoDescription = consolidation.cargoDescription || ''
  clientForm.shipper = consolidation.shipper || ''
  clientForm.consignee = consolidation.consignee || ''
  clientForm.destinationStation = consolidation.destinationStation || ''
  clientForm.customsPost = consolidation.customsPost || ''
  clientForm.subcode = consolidation.subcode || ''
  clientForm.commodityCode = consolidation.commodityCode || ''
  clientForm.packagesCount = consolidation.packagesCount || ''
  clientForm.weight = consolidation.weight || ''
  ensureSplitForEdit()
  clientModalOpen.value = true
}

const handleAddClient = async () => {
  if (!targetContainerId.value) return
  if (!clientForm.clientName.trim()) {
    message.error('Выберите или укажите клиента')
    return
  }
  clientSaving.value = true
  try {
    const payload = {
      clientName: clientForm.clientName.trim(),
      cargoDescription: clientForm.cargoDescription.trim() || null,
      shipper: clientForm.shipper.trim() || null,
      consignee: clientForm.consignee.trim() || null,
      destinationStation: clientForm.destinationStation.trim() || null,
      customsPost: clientForm.customsPost.trim() || null,
      subcode: clientForm.subcode.trim() || null,
      commodityCode: clientForm.commodityCode.trim() || null,
      packagesCount: clientForm.packagesCount.trim() || null,
      weight: clientForm.weight.trim() || null,
    }
    if (isEditingClient.value && editingClientId.value) {
      packageData.value = await documentPackagesApi.updateClientConsolidation(
        packageId,
        targetContainerId.value,
        editingClientId.value,
        payload
      )
      message.success('Партия успешно обновлена')
    } else {
      packageData.value = await documentPackagesApi.createClientConsolidation(
        packageId,
        targetContainerId.value,
        payload
      )
      message.success('Клиент добавлен в контейнер')
    }
    closeEditModals()
  } catch (err) {
    message.error(isEditingClient.value ? 'Ошибка обновления партии' : 'Ошибка добавления клиента')
  } finally {
    clientSaving.value = false
  }
}

const handleDeleteClient = async (containerId: string, clientId: string) => {
  loading.value = true
  try {
    packageData.value = await documentPackagesApi.deleteClientConsolidation(packageId, containerId, clientId)
    message.success('Партия удалена')
  } catch (err) {
    message.error('Ошибка удаления партии')
  } finally {
    loading.value = false
  }
}

const handleGenerateRows = async () => {
  generating.value = true
  try {
    const res = await documentPackagesApi.generateRows(packageId)
    if (res.generatedRowsCount > 0) {
      message.success(`Реестр успешно сгенерирован: создано ${res.generatedRowsCount} строк(и).`)
      router.push('/reestr')
    } else {
      message.info('Новых контейнеров/клиентов для генерации не найдено — все строки уже созданы ранее.')
    }
  } catch (err) {
    message.error('Ошибка генерации реестра')
  } finally {
    generating.value = false
  }
}

const downloadFile = async (file: DocumentPackageFileDto) => {
  try {
    const blob = await documentPackagesApi.downloadFile(packageId, file.id)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.originalFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    message.error('Не удалось скачать файл')
  }
}

// Format utilities
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU')

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    uploaded: 'Загружен экспедитором',
    accepted: 'Принят брокером',
    needsFix: 'На доработке',
    processed: 'Строки реестра сгенерированы',
  }
  return map[status] ?? status
}

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    uploaded: 'blue',
    accepted: 'green',
    needsFix: 'orange',
    processed: 'purple',
  }
  return map[status] ?? 'default'
}

// Built-in Document Preview states & functions
const previewOpen = ref(false)
const previewFile = ref<DocumentPackageFileDto | null>(null)
const previewUrl = ref<string | null>(null)
const previewLoading = ref(false)

const isPdf = (file: DocumentPackageFileDto | null) => {
  if (!file) return false
  return file.originalFileName.toLowerCase().endsWith('.pdf')
}

const isImage = (file: DocumentPackageFileDto | null) => {
  if (!file) return false
  const name = file.originalFileName.toLowerCase()
  return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.gif')
}

const openPreview = async (file: DocumentPackageFileDto) => {
  previewFile.value = file
  previewOpen.value = true
  previewLoading.value = true
  previewUrl.value = null
  try {
    const blob = await documentPackagesApi.downloadFile(packageId, file.id)
    previewUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    message.error('Не удалось загрузить файл для просмотра')
    previewOpen.value = false
  } finally {
    previewLoading.value = false
  }
}

const downloadPreviewFile = () => {
  if (!previewUrl.value || !previewFile.value) return
  const link = document.createElement('a')
  link.href = previewUrl.value
  link.download = previewFile.value.originalFileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

watch(previewOpen, (open) => {
  if (!open && previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
    previewFile.value = null
  }
})

onUnmounted(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})

// Split "file ‖ form" view state
const splitOpen = ref(false)
// Tracks whether the split was opened automatically when an edit form was opened
// (so closing the form can also close the split, instead of leaving it open).
const splitOpenedForEdit = ref(false)

const openSplit = async (file: DocumentPackageFileDto) => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewFile.value = file
  previewLoading.value = true
  previewUrl.value = null
  splitOpen.value = true
  try {
    const blob = await documentPackagesApi.downloadFile(packageId, file.id)
    previewUrl.value = URL.createObjectURL(blob)
  } catch {
    message.error('Не удалось загрузить файл для просмотра')
    splitOpen.value = false
  } finally {
    previewLoading.value = false
  }
}

const closeSplit = () => {
  splitOpen.value = false
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
  previewFile.value = null
}

// Returns to the file picker within the edit split, without closing the edit form
const backToFileList = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
  previewFile.value = null
}

// Opens the edit split automatically if no file is currently open in split view
const ensureSplitForEdit = () => {
  if (!splitOpen.value) {
    splitOpen.value = true
    splitOpenedForEdit.value = true
  }
}

const closeEditModals = () => {
  containerModalOpen.value = false
  clientModalOpen.value = false
  if (splitOpenedForEdit.value) {
    splitOpen.value = false
    splitOpenedForEdit.value = false
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    previewFile.value = null
  }
}

const cancelEdit = closeEditModals

// Files relevant to the form currently open in the edit split, available to preview
const editPaneFiles = computed(() => {
  if (!packageData.value) return []
  if (containerModalOpen.value) {
    if (isEditingContainer.value && editingContainerId.value) {
      return getContainerFiles(editingContainerId.value)
    }
    return packageData.value.files.filter((f) => !f.containerId && !f.clientConsolidationId)
  }
  if (clientModalOpen.value) {
    if (isEditingClient.value && editingClientId.value) {
      return getClientFiles(editingClientId.value)
    }
    if (targetContainerId.value) {
      return getContainerFiles(targetContainerId.value)
    }
  }
  return []
})

// Simulated AI Auto-Parsing
const aiParsing = ref(false)
const aiModalOpen = ref(false)
const aiStatusText = ref('')

const runAiParse = async () => {
  if (!packageData.value) return
  
  aiParsing.value = true
  aiModalOpen.value = true
  
  const steps = [
    'Анализ структуры пакета и чтение имен файлов...',
    'Запуск распознавания текста (OCR) и парсинг метаданных...',
    'Поиск соответствия номеров контейнеров, пломб и инвойсов...',
    'Создание карточек разбора состава и распределение файлов...',
    'Завершение авто-разбора...'
  ]
  
  for (let i = 0; i < steps.length; i++) {
    aiStatusText.value = steps[i]
    await new Promise(resolve => setTimeout(resolve, 800))
  }
  
  try {
    let currentData = packageData.value
    
    // 1. If composition is empty, let's create a default container to start with
    if (!currentData.containers.length) {
      const containerNo = 'SWFU' + Math.floor(1000000 + Math.random() * 9000000)
      currentData = await documentPackagesApi.createContainer(packageId, {
        containerNumber: containerNo,
        sealNumber: 'SL-' + Math.floor(100000 + Math.random() * 900000),
        weight: '21 500 кг',
        shipper: 'Orient Express Logistics',
        consignee: 'Aqniet Trans Group',
        destinationStation: 'Алматы-1'
      })
    }
    
    // Make sure we have at least one client consolidation in the first container
    const firstContainer = currentData.containers[0]
    if (!firstContainer.consolidations.length) {
      const clientName = clientOptions.value.length > 0 
        ? clientOptions.value[0].value 
        : 'ТОО «Aqniet Import»'
        
      currentData = await documentPackagesApi.createClientConsolidation(packageId, firstContainer.id, {
        clientName,
        cargoDescription: 'Запчасти для спецтехники',
        shipper: 'Shenzhen Industrial Co.',
        consignee: clientName,
        destinationStation: 'Алматы-1',
        weight: '4 850 кг',
        packagesCount: '12 мест',
        subcode: 'SUB-' + Math.floor(10 + Math.random() * 90),
        commodityCode: '8708299009'
      })
    }
    
    // Refresh references
    const updatedContainer = currentData.containers[0]
    const updatedConsolidation = updatedContainer.consolidations[0]
    
    // 2. Link unassigned files to their corresponding cards
    let linkCount = 0
    for (const file of currentData.files) {
      const isFileUnassigned = !file.containerId && !file.clientConsolidationId
      if (isFileUnassigned) {
        const name = file.originalFileName.toLowerCase()
        const isClientFile = name.includes('invoice') || 
                             name.includes('инвойс') || 
                             name.includes('packing') || 
                             name.includes('пакинг') || 
                             name.includes('tsd') || 
                             name.includes('тсд') || 
                             name.includes('договор') || 
                             name.includes('счет') ||
                             name.includes('клиент')
                             
        if (isClientFile && updatedConsolidation) {
          currentData = await documentPackagesApi.linkFile(packageId, file.id, {
            containerId: null,
            clientConsolidationId: updatedConsolidation.id
          })
          linkCount++
        } else if (updatedContainer) {
          currentData = await documentPackagesApi.linkFile(packageId, file.id, {
            containerId: updatedContainer.id,
            clientConsolidationId: null
          })
          linkCount++
        }
      }
    }
    
    // 3. Final reload
    packageData.value = currentData
    message.success(`Авто-разбор успешно завершен! Связано файлов: ${linkCount}`)
  } catch (err) {
    console.error(err)
    message.error('Произошла ошибка при выполнении авто-разбора')
  } finally {
    aiParsing.value = false
    aiModalOpen.value = false
  }
}
</script>

<style scoped>
.document-package-workspace {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 28px;
  align-items: start;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  color: var(--atg-navy);
}

/* Files Column */
.files-card {
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(27, 42, 74, 0.05);
}

.file-item-wrap {
  padding: 14px 16px !important;
  border: 1px solid var(--atg-line);
  border-radius: 10px;
  margin-bottom: 12px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 6px rgba(27, 42, 74, 0.02);
  transition: all var(--atg-transition);
}

.file-item-wrap:hover {
  border-color: var(--atg-line-strong);
  box-shadow: 0 4px 12px rgba(27, 42, 74, 0.05);
  transform: translateY(-1px);
}

.file-info {
  width: 100%;
}

.file-name {
  color: var(--atg-navy);
  font-weight: 700;
  font-size: 14px;
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-family: var(--atg-font-mono);
  font-size: 11.5px;
  color: var(--atg-muted);
  margin-top: 4px;
}

.file-assignment {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assignment-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-charcoal);
}

/* Center Hierarchy */
.hierarchy-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.review-panel-card {
  border-left: 5px solid var(--atg-navy);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(27, 42, 74, 0.04);
}

.review-panel-content {
  font-size: 14px;
}

.train-card {
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #fcfdfe);
  border: 1px solid var(--atg-line);
  box-shadow: 0 4px 16px rgba(27, 42, 74, 0.03);
}

.train-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.train-info {
  display: flex;
  align-items: center;
  gap: 18px;
}

.train-info h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--atg-navy);
  margin: 0;
}

.train-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--atg-teal-soft);
  color: var(--atg-teal-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.train-comment {
  margin-top: 6px;
  color: var(--atg-charcoal);
  font-size: 14px;
  font-style: italic;
}

.containers-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Container Node */
.container-node-card {
  background: #ffffff;
  border: 1px solid var(--atg-line);
  border-left: 5px solid var(--atg-teal);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 4px 14px rgba(27, 42, 74, 0.04);
  transition: all var(--atg-transition);
}

.container-node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(27, 42, 74, 0.08);
  border-left-color: var(--atg-teal-dark);
}

.container-node-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--atg-line);
}

.container-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--atg-navy);
}

.container-title strong {
  font-size: 14.5px;
  font-weight: 700;
}

.container-meta {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--atg-charcoal);
  background: var(--atg-bg);
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid rgba(221, 225, 236, 0.5);
}

.node-badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--atg-teal-soft);
  color: var(--atg-teal-dark);
  border: 1px solid rgba(43, 188, 212, 0.25);
}

.node-badge.badge-client {
  background: var(--atg-gold-soft);
  color: #a17f2a;
  border-color: rgba(201, 168, 76, 0.25);
}

/* Inline metadata tags */
.meta-inline-tag {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: var(--atg-navy);
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 5px;
  gap: 3px;
  margin-right: 5px;
  margin-bottom: 3px;
}

.meta-inline-tag strong {
  color: var(--atg-teal-dark);
  font-weight: 700;
}

.meta-inline-tag.text-green {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
}

.meta-inline-tag.text-green strong {
  color: #16a34a;
}

.meta-inline-tag.text-gold {
  background: #fffbeb;
  border-color: #fde68a;
  color: #b45309;
}

.meta-inline-tag.text-gold strong {
  color: #d97706;
}

.container-document-meta,
.consolidation-document-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

/* Linked Files chips */
.node-linked-files {
  padding: 12px 16px;
  background: var(--atg-bg);
  border-radius: 10px;
  border: 1px solid var(--atg-line);
}

.files-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--atg-navy);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.files-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid var(--atg-line);
  color: var(--atg-charcoal);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(27, 42, 74, 0.02);
  transition: all var(--atg-transition);
}

.file-chip:hover {
  background: var(--atg-teal-soft);
  border-color: var(--atg-teal);
  color: var(--atg-teal-dark);
  transform: translateY(-1px);
}

/* Consolidations */
.consolidations-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 20px;
  margin-top: 4px;
  border-left: 2px dashed #cbd5e1;
}

.consolidation-node-card {
  background: #ffffff;
  border: 1px solid var(--atg-line);
  border-left: 4px solid var(--atg-gold);
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(27, 42, 74, 0.02);
  transition: all var(--atg-transition);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.consolidation-node-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(27, 42, 74, 0.06);
}

.consolidation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.consolidation-header strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--atg-navy);
}

.con-cargo {
  color: var(--atg-charcoal);
  font-size: 12.5px;
  font-weight: 500;
}

/* Empty texts */
.empty-node-text {
  font-size: 13px;
  color: var(--atg-muted);
  padding: 8px 0;
  font-style: italic;
}

.empty-train-text {
  text-align: center;
  padding: 48px;
  border: 2px dashed var(--atg-line-strong);
  border-radius: 14px;
  background: #ffffff;
  color: var(--atg-charcoal);
  font-size: 14px;
}

/* Drag and Drop visual feedback styles */
.file-item-wrap[draggable="true"] {
  cursor: grab;
}

.file-item-wrap[draggable="true"]:active {
  cursor: grabbing;
}

.train-card.drag-over {
  border: 2px dashed var(--atg-teal, #2bbcd4) !important;
  background: rgba(43, 188, 212, 0.04) !important;
  box-shadow: 0 0 20px rgba(43, 188, 212, 0.15) !important;
}

.container-node-card.drag-over {
  border-color: var(--atg-teal, #2bbcd4) !important;
  background: rgba(43, 188, 212, 0.03) !important;
  box-shadow: 0 0 20px rgba(43, 188, 212, 0.12) !important;
}

.consolidation-node-card.drag-over {
  border-color: var(--atg-teal, #2bbcd4) !important;
  background: rgba(43, 188, 212, 0.04) !important;
  box-shadow: 0 0 20px rgba(43, 188, 212, 0.15) !important;
}

@media (max-width: 900px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
  .files-card {
    max-height: none;
  }
}

/* File Upload Dropzone styling */
.workspace-file-upload {
  margin-bottom: 16px;
}

.workspace-upload-dropzone {
  border: 2px dashed rgba(43, 188, 212, 0.35);
  border-radius: 10px;
  padding: 24px 16px;
  text-align: center;
  background: linear-gradient(135deg, rgba(43, 188, 212, 0.01), rgba(27, 42, 74, 0.01));
  cursor: pointer;
  transition: all var(--atg-transition);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.workspace-upload-dropzone:hover,
.workspace-upload-dropzone.dropzone-active {
  border-color: var(--atg-teal);
  background: rgba(43, 188, 212, 0.06);
  box-shadow: 0 0 12px rgba(43, 188, 212, 0.08);
}

.dropzone-icon {
  font-size: 32px;
  color: var(--atg-teal);
  transition: transform var(--atg-transition), color var(--atg-transition);
}

.workspace-upload-dropzone:hover .dropzone-icon,
.workspace-upload-dropzone.dropzone-active .dropzone-icon {
  color: var(--atg-teal-dark);
  transform: scale(1.08);
}

.dropzone-text {
  font-size: 13px;
  color: var(--atg-charcoal);
  line-height: 1.4;
}

.dropzone-text strong {
  color: var(--atg-navy);
}

/* Linked files highlights */
.file-item-wrap.file-linked {
  background: #f0fdf4;
  border-left: 4px solid var(--atg-green);
  border-color: #bbf7d0;
}

.file-item-wrap.file-linked:hover {
  background: #ecfdf5;
  border-color: #86efac;
}

/* Custom Dropdown Option styles */
.select-opt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.select-opt-item .opt-text {
  font-size: 12.5px;
  font-weight: 600;
}

.container-opt .opt-text {
  color: var(--atg-navy);
  font-weight: 700;
}

.client-opt {
  padding-left: 10px;
}

.client-opt .opt-indent {
  color: var(--atg-muted);
  font-weight: normal;
  margin-right: -2px;
}

.client-opt .opt-text {
  color: var(--atg-charcoal);
  font-weight: 600;
}

.opt-unassigned {
  font-size: 13px;
  color: var(--atg-muted);
  font-weight: 500;
}

.opt-badge-container,
.opt-badge-client {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1;
}

.opt-badge-container {
  background: var(--atg-teal-soft);
  color: var(--atg-teal-dark);
  border: 1px solid rgba(43, 188, 212, 0.25);
}

.opt-badge-client {
  background: var(--atg-gold-soft);
  color: #a17f2a;
  border: 1px solid rgba(201, 168, 76, 0.25);
}

/* Split "file ‖ form" view */
.workspace-split { display: flex; gap: 20px; align-items: flex-start; }
.workspace-split.split-active .split-file-pane {
  width: 42%; position: sticky; top: 16px; max-height: calc(100vh - 100px);
  display: flex; flex-direction: column; border: 1px solid var(--atg-line);
  border-radius: 12px; background: #fff; overflow: hidden;
}
.split-content-pane { flex: 1; min-width: 0; }
.split-file-head { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--atg-line); gap: 8px; }
.split-file-name { font-weight: 600; font-size: 13px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.split-file-body { flex: 1; min-height: 0; display: flex; }
.split-frame { width: 100%; height: 100%; border: none; }
.split-img { max-width: 100%; max-height: 100%; object-fit: contain; margin: auto; }
.split-fallback { margin: auto; text-align: center; padding: 24px; }
@media (max-width: 1100px) {
  .workspace-split { flex-direction: column; }
  .workspace-split.split-active .split-file-pane { width: 100%; position: static; max-height: 60vh; }
}

/* Full-width edit split: form on the left half, open file on the right half */
.edit-split-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  background: #fff;
}
.edit-split-form-pane {
  width: 50%;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid var(--atg-line);
  padding: 24px;
  box-sizing: border-box;
}
.edit-split-card { max-width: 640px; margin: 0 auto; }
.edit-split-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.edit-split-title { font-size: 17px; font-weight: 700; color: var(--atg-navy); }
.edit-split-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--atg-line);
}
.edit-split-file-pane {
  width: 50%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.split-file-picker { padding: 12px; overflow-y: auto; }
.split-file-picker-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border: 1px solid var(--atg-line); border-radius: 8px;
  margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s;
}
.split-file-picker-item:hover { border-color: var(--atg-accent); background: var(--atg-teal-soft); }
.split-file-picker-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.split-file-picker-meta { font-size: 12px; color: var(--atg-muted); flex-shrink: 0; }
@media (max-width: 1100px) {
  .edit-split-overlay { flex-direction: column; overflow-y: auto; }
  .edit-split-form-pane, .edit-split-file-pane { width: 100%; height: auto; min-height: 50vh; }
}
</style>
