<template>
  <div class="tnved-export-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">ТН ВЭД ЕАЭС</div>
        <h1 class="crm-page-title">Классификатор экспорта</h1>
        <p class="crm-page-subtitle">
          Дерево товарной номенклатуры для экспортных операций.
        </p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <!-- Search -->
      <a-input-search
        v-model:value="searchQuery"
        placeholder="Поиск по коду или наименованию…"
        enter-button="Найти"
        allow-clear
        style="max-width: 480px; margin-bottom: 16px"
        :loading="searchLoading"
        @search="handleSearch"
        @change="onSearchChange"
      />

      <a-row :gutter="16">
        <!-- Left: tree -->
        <a-col :xs="24" :md="10" :lg="9">
          <a-card size="small" class="tree-card" :bordered="true">
            <template v-if="searchResults !== null">
              <!-- Search results list -->
              <div v-if="searchResults.length === 0" class="empty-hint">
                Ничего не найдено
              </div>
              <a-list
                v-else
                size="small"
                :data-source="searchResults"
                :bordered="false"
              >
                <template #renderItem="{ item }">
                  <a-list-item
                    class="search-result-item"
                    :class="{ active: selected?.id === item.id }"
                    @click="selectNode(item)"
                  >
                    <a-typography-text code style="font-size:12px">{{ item.code }}</a-typography-text>
                    <span class="node-name">{{ item.treeName }}</span>
                  </a-list-item>
                </template>
              </a-list>
            </template>

            <template v-else>
              <!-- Tree navigation -->
              <a-spin :spinning="treeLoading">
                <div v-if="breadcrumb.length > 0" class="breadcrumb-bar">
                  <a-breadcrumb separator=">">
                    <a-breadcrumb-item>
                      <a @click="resetToRoot">Разделы</a>
                    </a-breadcrumb-item>
                    <a-breadcrumb-item
                      v-for="(crumb, i) in breadcrumb"
                      :key="crumb.id"
                    >
                      <a
                        v-if="i < breadcrumb.length - 1"
                        @click="navigateToBreadcrumb(i)"
                      >{{ crumb.code }}</a>
                      <span v-else>{{ crumb.code }}</span>
                    </a-breadcrumb-item>
                  </a-breadcrumb>
                </div>

                <div v-if="currentNodes.length === 0 && !treeLoading" class="empty-hint">
                  Нет дочерних элементов
                </div>

                <div
                  v-for="node in currentNodes"
                  :key="node.id"
                  class="tree-node"
                  :class="{ active: selected?.id === node.id, leaf: node.isLast }"
                  @click="handleNodeClick(node)"
                >
                  <span class="node-code">{{ node.code }}</span>
                  <span class="node-label">{{ node.treeName }}</span>
                  <RightOutlined v-if="!node.isLast" class="node-arrow" />
                </div>
              </a-spin>
            </template>
          </a-card>
        </a-col>

        <!-- Right: detail -->
        <a-col :xs="24" :md="14" :lg="15">
          <a-card size="small" class="detail-card" :bordered="true">
            <template v-if="!selected">
              <a-empty description="Выберите позицию в дереве слева" />
            </template>

            <template v-else>
              <div class="detail-header">
                <a-tag color="blue" style="font-family:monospace; font-size:14px">
                  {{ selected.code }}
                </a-tag>
                <a-tag v-if="selected.is10" color="green">10-значный</a-tag>
                <a-tag v-if="selected.unitShort" color="default">{{ selected.unitShort }}</a-tag>
              </div>

              <div class="detail-name">{{ selected.name || selected.treeName }}</div>

              <a-divider style="margin: 12px 0" />

              <a-descriptions :column="1" size="small" bordered>
                <a-descriptions-item label="Код">
                  <a-typography-text code>{{ selected.code }}</a-typography-text>
                </a-descriptions-item>
                <a-descriptions-item label="Полное наименование">
                  {{ selected.name || selected.treeName }}
                </a-descriptions-item>
                <a-descriptions-item v-if="selected.unitShort" label="Единица">
                  {{ selected.unitShort }}
                </a-descriptions-item>
                <a-descriptions-item label="Уровень">
                  {{ selected.nodeLevel }}
                </a-descriptions-item>
                <a-descriptions-item label="Тип">
                  {{ selected.is10 ? '10-значный (листовой)' : 'Группа' }}
                </a-descriptions-item>
              </a-descriptions>

              <!-- Deprecation warning for selected 10-digit code -->
              <template v-if="selected.is10">
                <a-divider style="margin: 12px 0" />
                <a-spin :spinning="transitionLoading">
                  <TnvedDeprecationAlert :warning="transitionWarning" />
                  <a-result
                    v-if="!transitionLoading && transitionWarning === null"
                    status="success"
                    :sub-title="`Код ${selected.code} актуален`"
                    style="padding: 8px 0"
                  >
                    <template #icon>
                      <CheckCircleOutlined style="color: var(--atg-green); font-size: 28px" />
                    </template>
                  </a-result>
                </a-spin>
              </template>
            </template>
          </a-card>
        </a-col>
      </a-row>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { RightOutlined, CheckCircleOutlined } from '@ant-design/icons-vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto, TnvedDeprecationWarningDto } from '@/types/api'
import TnvedDeprecationAlert from '@/components/TnvedDeprecationAlert.vue'

const searchQuery = ref('')
const searchLoading = ref(false)
const searchResults = ref<TnvedNodeDto[] | null>(null)

const treeLoading = ref(false)
const currentNodes = ref<TnvedNodeDto[]>([])
const breadcrumb = ref<TnvedNodeDto[]>([])

const selected = ref<TnvedNodeDto | null>(null)
const transitionLoading = ref(false)
const transitionWarning = ref<TnvedDeprecationWarningDto | null | undefined>(undefined)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

async function loadSections() {
  treeLoading.value = true
  try {
    const { data } = await tnvedApi.exportSections()
    currentNodes.value = data
  } finally {
    treeLoading.value = false
  }
}

async function loadChildren(parentId: number) {
  treeLoading.value = true
  try {
    const { data } = await tnvedApi.exportChildren(parentId)
    currentNodes.value = data
  } finally {
    treeLoading.value = false
  }
}

async function handleNodeClick(node: TnvedNodeDto) {
  selectNode(node)
  if (!node.isLast) {
    breadcrumb.value.push(node)
    await loadChildren(node.id)
  }
}

function selectNode(node: TnvedNodeDto) {
  selected.value = node
  transitionWarning.value = undefined
  if (node.is10) {
    loadTransition(node.code)
  }
}

async function loadTransition(code: string) {
  transitionLoading.value = true
  try {
    const { data } = await tnvedApi.getTransition(code)
    transitionWarning.value = data.isDeprecated
      ? { deprecatedCode: data.oldCode, replacementCodes: data.newCodes, sourceVersion: data.sourceVersion }
      : null
  } catch {
    transitionWarning.value = null
  } finally {
    transitionLoading.value = false
  }
}

function resetToRoot() {
  breadcrumb.value = []
  selected.value = null
  searchResults.value = null
  searchQuery.value = ''
  loadSections()
}

function navigateToBreadcrumb(index: number) {
  const crumb = breadcrumb.value[index]
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
  selected.value = null
  loadChildren(crumb.id)
}

async function handleSearch(q: string) {
  if (!q.trim()) {
    searchResults.value = null
    return
  }
  searchLoading.value = true
  try {
    const { data } = await tnvedApi.exportSearch(q.trim())
    searchResults.value = data
  } finally {
    searchLoading.value = false
  }
}

function onSearchChange() {
  if (!searchQuery.value.trim()) {
    searchResults.value = null
    return
  }
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => handleSearch(searchQuery.value), 400)
}

watch(searchQuery, (val) => {
  if (!val) searchResults.value = null
})

loadSections()
</script>

<style scoped>
.tree-card,
.detail-card {
  min-height: 480px;
}

.breadcrumb-bar {
  padding: 0 0 10px;
  border-bottom: 1px solid var(--atg-line);
  margin-bottom: 8px;
}

.breadcrumb-bar a {
  color: var(--atg-accent);
  cursor: pointer;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--atg-radius-sm);
  cursor: pointer;
  transition: background var(--atg-transition);
  border-bottom: 1px solid var(--atg-line);
}

.tree-node:last-child {
  border-bottom: none;
}

.tree-node:hover {
  background: var(--atg-accent-soft);
}

.tree-node.active {
  background: var(--atg-accent-soft);
  border-left: 3px solid var(--atg-accent);
}

.tree-node.leaf {
  opacity: 0.85;
}

.node-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--atg-accent-strong);
  min-width: 80px;
  flex-shrink: 0;
}

.node-label {
  font-size: 13px;
  color: var(--atg-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-arrow {
  color: var(--atg-muted);
  flex-shrink: 0;
  font-size: 10px;
}

.empty-hint {
  color: var(--atg-muted);
  text-align: center;
  padding: 32px 0;
  font-size: 13px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
  border-radius: var(--atg-radius-sm);
  transition: background var(--atg-transition);
}

.search-result-item:hover,
.search-result-item.active {
  background: var(--atg-accent-soft);
}

.search-result-item .node-name {
  font-size: 12px;
  color: var(--atg-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.detail-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--atg-ink);
  line-height: 1.4;
}
</style>
