<template>
  <div class="tnved-view">
    <a-layout style="background: #fff; border-radius: 8px; overflow: hidden; min-height: 80vh">
      <a-layout-sider width="320" style="background: #fafafa; border-right: 1px solid #f0f0f0; overflow: hidden; display: flex; flex-direction: column">
        <div style="padding: 12px">
          <a-input-search
            v-model:value="searchQuery"
            placeholder="Поиск по коду или названию..."
            @search="handleSearch"
            allow-clear
            @change="onSearchChange"
          />
        </div>
        <div class="tree-container">
          <div v-if="searching" style="padding: 16px; text-align: center">
            <a-spin />
          </div>

          <div v-else-if="searchResults.length > 0">
            <div
              v-for="node in searchResults"
              :key="node.id"
              class="tree-item"
              :class="{ 'tree-item-selected': selectedNode?.id === node.id }"
              @click="selectNode(node)"
            >
              <span class="tree-code">{{ node.code }}</span>
              <span class="tree-name">{{ node.treeName }}</span>
            </div>
          </div>

          <div v-else-if="searchQuery.length > 0 && !searching" style="padding: 16px; color: #999; text-align: center">
            Ничего не найдено
          </div>

          <div v-else>
            <div v-for="section in treeNodes" :key="section.id">
              <div
                class="tree-item tree-section"
                @click="toggleNode(section)"
              >
                <RightOutlined
                  class="tree-arrow"
                  :class="{ 'tree-arrow-open': expandedIds.has(section.id) }"
                />
                <span class="tree-code">{{ section.code }}</span>
                <span class="tree-name">{{ section.treeName }}</span>
              </div>

              <div v-if="expandedIds.has(section.id)" class="tree-children">
                <div v-if="loadingIds.has(section.id)" style="padding: 8px 16px">
                  <a-spin size="small" />
                </div>
                <template v-else>
                  <div v-for="child in childrenMap[section.id] ?? []" :key="child.id">
                    <div
                      class="tree-item tree-child"
                      :class="{ 'tree-item-selected': selectedNode?.id === child.id && child.isLast }"
                      @click="child.isLast ? selectNode(child) : toggleNode(child)"
                    >
                      <RightOutlined
                        v-if="!child.isLast"
                        class="tree-arrow"
                        :class="{ 'tree-arrow-open': expandedIds.has(child.id) }"
                      />
                      <span v-else class="tree-leaf-dot">•</span>
                      <span class="tree-code">{{ child.code }}</span>
                      <span class="tree-name">{{ child.treeName }}</span>
                    </div>

                    <div v-if="!child.isLast && expandedIds.has(child.id)" class="tree-children tree-children-deep">
                      <div v-if="loadingIds.has(child.id)" style="padding: 8px 16px">
                        <a-spin size="small" />
                      </div>
                      <template v-else>
                        <div v-for="leaf in childrenMap[child.id] ?? []" :key="leaf.id">
                          <div
                            class="tree-item tree-leaf"
                            :class="{ 'tree-item-selected': selectedNode?.id === leaf.id }"
                            @click="leaf.isLast ? selectNode(leaf) : toggleNode(leaf)"
                          >
                            <RightOutlined
                              v-if="!leaf.isLast"
                              class="tree-arrow"
                              :class="{ 'tree-arrow-open': expandedIds.has(leaf.id) }"
                            />
                            <span v-else class="tree-leaf-dot">•</span>
                            <span class="tree-code">{{ leaf.code }}</span>
                            <span class="tree-name">{{ leaf.treeName }}</span>
                          </div>
                          <div v-if="!leaf.isLast && expandedIds.has(leaf.id)" class="tree-children tree-children-deepest">
                            <div v-if="loadingIds.has(leaf.id)" style="padding: 8px 16px">
                              <a-spin size="small" />
                            </div>
                            <div v-for="deepLeaf in childrenMap[leaf.id] ?? []" :key="deepLeaf.id"
                              class="tree-item tree-deepleaf"
                              :class="{ 'tree-item-selected': selectedNode?.id === deepLeaf.id }"
                              @click="selectNode(deepLeaf)"
                            >
                              <span class="tree-leaf-dot">•</span>
                              <span class="tree-code">{{ deepLeaf.code }}</span>
                              <span class="tree-name">{{ deepLeaf.treeName }}</span>
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div v-if="treeLoading" style="padding: 16px; text-align: center">
              <a-spin />
            </div>
          </div>
        </div>
      </a-layout-sider>

      <a-layout-content style="padding: 24px; background: #fff; overflow-y: auto">
        <div v-if="!selectedNode" class="empty-state">
          <FileSearchOutlined style="font-size: 48px; color: #d9d9d9" />
          <div style="margin-top: 12px; color: #999">Выберите код ТН ВЭД из дерева слева или воспользуйтесь поиском</div>
        </div>

        <div v-else>
          <a-breadcrumb v-if="breadcrumb.length > 0" style="margin-bottom: 16px">
            <a-breadcrumb-item v-for="item in breadcrumb" :key="item.code">
              <a @click.prevent="loadBreadcrumbNode(item.code)" href="#">{{ item.code }}</a>
            </a-breadcrumb-item>
          </a-breadcrumb>

          <h2 style="margin-bottom: 4px">{{ selectedNode.code }}</h2>
          <p style="color: #666; margin-bottom: 16px">{{ selectedNode.treeName }}</p>

          <a-tabs v-model:active-key="activeTab">
            <a-tab-pane key="rate" tab="Ставка">
              <div v-if="rateLoading" style="padding: 24px; text-align: center"><a-spin /></div>
              <div v-else-if="rateData">
                <a-descriptions bordered :column="1" size="small">
                  <a-descriptions-item label="Ставка">
                    {{ rateData.rateStr ?? '—' }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Статус ВТО">
                    {{ rateData.vtoStatus ?? '—' }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Единица измерения">
                    {{ rateData.unitName ?? '—' }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Источник ставки">
                    <a v-if="rateData.rateSourceUrl" :href="rateData.rateSourceUrl" target="_blank">
                      {{ rateData.rateSourceName ?? rateData.rateSourceUrl }}
                    </a>
                    <span v-else>{{ rateData.rateSourceName ?? '—' }}</span>
                  </a-descriptions-item>
                  <a-descriptions-item label="Обновлено">
                    {{ rateData.updatedAtUtc ? dayjs(rateData.updatedAtUtc).format('DD.MM.YYYY') : '—' }}
                  </a-descriptions-item>
                </a-descriptions>
              </div>
              <a-empty v-else description="Данные о ставке недоступны" />
            </a-tab-pane>

            <a-tab-pane key="notes" tab="Пояснения">
              <div v-if="notesLoading" style="padding: 24px; text-align: center"><a-spin /></div>
              <div v-else-if="notesData" class="notes-content" v-html="notesData.htmlContent" />
              <a-empty v-else description="Пояснения недоступны" />
            </a-tab-pane>

            <a-tab-pane key="classify" tab="Классификатор">
              <a-space direction="vertical" style="width: 100%" :size="12">
                <a-input
                  v-model:value="classifyDescription"
                  placeholder="Введите описание товара для классификации..."
                />
                <a-button type="primary" :loading="classifyLoading" @click="handleClassify">
                  Классифицировать
                </a-button>
                <a-table
                  v-if="classifyResult"
                  :data-source="classifyResult.matches"
                  :columns="classifyColumns"
                  :pagination="false"
                  size="small"
                  row-key="code"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'probability'">
                      <a-progress
                        :percent="Math.round(record.probability * 100)"
                        size="small"
                        :stroke-color="record.probability > 0.7 ? '#52c41a' : record.probability > 0.4 ? '#faad14' : '#ff4d4f'"
                      />
                    </template>
                    <template v-else-if="column.key === 'code'">
                      <a @click.prevent="loadNodeByCode(record.code)" href="#">{{ record.code }}</a>
                    </template>
                  </template>
                </a-table>
              </a-space>
            </a-tab-pane>

            <a-tab-pane key="calc" tab="Калькулятор">
              <a-form :model="calcForm" layout="vertical" style="max-width: 500px">
                <a-form-item label="Код ТН ВЭД">
                  <a-input v-model:value="calcForm.code" />
                </a-form-item>
                <a-form-item label="Таможенная стоимость">
                  <a-input-number
                    v-model:value="calcForm.customsValue"
                    style="width: 100%"
                    :min="0"
                    :step="100"
                  />
                </a-form-item>
                <a-form-item label="Валюта">
                  <a-select
                    v-model:value="calcForm.currencyCode"
                    :options="currencyOptions"
                    style="width: 100%"
                  />
                </a-form-item>
                <a-form-item label="Вес (кг, необязательно)">
                  <a-input-number
                    v-model:value="calcForm.weightKg"
                    style="width: 100%"
                    :min="0"
                  />
                </a-form-item>
                <a-form-item>
                  <a-button type="primary" :loading="calcLoading" @click="handleCalculate">
                    Рассчитать
                  </a-button>
                </a-form-item>
              </a-form>

              <div v-if="calcResult">
                <a-descriptions bordered :column="1" size="small" style="max-width: 500px">
                  <a-descriptions-item label="Таможенная стоимость (KZT)">
                    {{ fmt(calcResult.customsValueKzt) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Ввозная пошлина">
                    {{ fmt(calcResult.importDutyKzt) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Таможенный сбор">
                    {{ fmt(calcResult.customsFeeKzt) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="НДС">
                    {{ fmt(calcResult.vatKzt) }}
                  </a-descriptions-item>
                  <a-descriptions-item label="Итого">
                    <strong>{{ fmt(calcResult.totalKzt) }}</strong>
                  </a-descriptions-item>
                </a-descriptions>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>
      </a-layout-content>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNode, TnvedRateDto, TnvedExplanationDto, TnvedClassifyResponse, TnvedCalculateResult, TnvedCurrency } from '@/types/api'
import { RightOutlined, FileSearchOutlined } from '@ant-design/icons-vue'

const treeNodes = ref<TnvedNode[]>([])
const treeLoading = ref(false)
const expandedIds = reactive(new Set<number>())
const loadingIds = reactive(new Set<number>())
const childrenMap = reactive<Record<number, TnvedNode[]>>({})
const selectedNode = ref<TnvedNode | null>(null)
const breadcrumb = ref<{ code: string; treeName: string; nodeLevel: number }[]>([])

const searchQuery = ref('')
const searchResults = ref<TnvedNode[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const activeTab = ref('rate')
const rateLoading = ref(false)
const rateData = ref<TnvedRateDto | null>(null)
const notesLoading = ref(false)
const notesData = ref<TnvedExplanationDto | null>(null)

const classifyDescription = ref('')
const classifyLoading = ref(false)
const classifyResult = ref<TnvedClassifyResponse | null>(null)

const calcLoading = ref(false)
const calcResult = ref<TnvedCalculateResult | null>(null)
const currencies = ref<TnvedCurrency[]>([])
const currencyOptions = ref<{ value: string; label: string }[]>([])

const calcForm = reactive({
  code: '',
  customsValue: 0,
  currencyCode: 'USD',
  weightKg: null as number | null,
})

const classifyColumns = [
  { title: 'Код', key: 'code', dataIndex: 'code', width: 120 },
  { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: 'Ставка', dataIndex: 'rateStr', key: 'rateStr', width: 100 },
  { title: 'Вероятность', key: 'probability', width: 160 },
]

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₸'

onMounted(async () => {
  treeLoading.value = true
  try {
    treeNodes.value = (await tnvedApi.children()).data
  } catch {
    message.error('Не удалось загрузить дерево ТН ВЭД')
  } finally {
    treeLoading.value = false
  }

  try {
    currencies.value = (await tnvedApi.currencies()).data
    currencyOptions.value = currencies.value.map((c) => ({
      value: c.codeLat,
      label: `${c.codeLat} — ${c.name}`,
    }))
  } catch {
    currencyOptions.value = [
      { value: 'USD', label: 'USD' },
      { value: 'EUR', label: 'EUR' },
      { value: 'RUB', label: 'RUB' },
      { value: 'KZT', label: 'KZT' },
    ]
  }
})

const toggleNode = async (node: TnvedNode) => {
  if (expandedIds.has(node.id)) {
    expandedIds.delete(node.id)
    return
  }
  expandedIds.add(node.id)
  if (!childrenMap[node.id]) {
    loadingIds.add(node.id)
    try {
      const children = (await tnvedApi.children(node.id)).data
      childrenMap[node.id] = children
    } catch {
      message.error('Не удалось загрузить дочерние узлы')
    } finally {
      loadingIds.delete(node.id)
    }
  }
}

const selectNode = async (node: TnvedNode) => {
  selectedNode.value = node
  calcForm.code = node.code
  activeTab.value = 'rate'
  rateData.value = null
  notesData.value = null
  classifyResult.value = null
  calcResult.value = null

  try {
    const path = (await tnvedApi.path(node.code)).data
    breadcrumb.value = path
  } catch {
    breadcrumb.value = []
  }

  loadRateData(node.code)
  loadNotesData(node.code)
}

const loadRateData = async (code: string) => {
  rateLoading.value = true
  try {
    rateData.value = (await tnvedApi.rates(code)).data
  } catch {
    rateData.value = null
  } finally {
    rateLoading.value = false
  }
}

const loadNotesData = async (code: string) => {
  notesLoading.value = true
  try {
    notesData.value = (await tnvedApi.notes(code)).data
  } catch {
    notesData.value = null
  } finally {
    notesLoading.value = false
  }
}

const loadNodeByCode = async (code: string) => {
  try {
    const node = (await tnvedApi.node(code)).data
    selectNode(node)
  } catch {
    message.error('Не удалось загрузить узел')
  }
}

const loadBreadcrumbNode = async (code: string) => {
  await loadNodeByCode(code)
}

const onSearchChange = () => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(() => {
    handleSearch(searchQuery.value)
  }, 400)
}

const handleSearch = async (val: string) => {
  if (!val.trim()) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    searchResults.value = (await tnvedApi.search(val.trim())).data
  } catch {
    message.error('Ошибка поиска')
  } finally {
    searching.value = false
  }
}

const handleClassify = async () => {
  if (!classifyDescription.value.trim()) {
    message.warning('Введите описание товара')
    return
  }
  classifyLoading.value = true
  try {
    classifyResult.value = (await tnvedApi.classify(classifyDescription.value.trim())).data
  } catch {
    message.error('Ошибка классификации')
  } finally {
    classifyLoading.value = false
  }
}

const handleCalculate = async () => {
  if (!calcForm.code || !calcForm.customsValue || !calcForm.currencyCode) {
    message.warning('Заполните код, стоимость и валюту')
    return
  }
  calcLoading.value = true
  try {
    calcResult.value = (await tnvedApi.calculate({
      code: calcForm.code,
      customsValue: calcForm.customsValue,
      currencyCode: calcForm.currencyCode,
      weightKg: calcForm.weightKg ?? undefined,
    })).data
  } catch {
    message.error('Ошибка расчёта')
  } finally {
    calcLoading.value = false
  }
}
</script>

<style scoped>
.tnved-view {
  max-width: 1400px;
  margin: 0 auto;
}

.tree-container {
  overflow-y: auto;
  flex: 1;
  height: calc(80vh - 56px);
}

.tree-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
  transition: background 0.15s;
}

.tree-item:hover {
  background: #e6f4ff;
}

.tree-item-selected {
  background: #bae0ff !important;
}

.tree-section {
  font-weight: 500;
  background: #f5f5f5;
}

.tree-child {
  padding-left: 24px;
}

.tree-leaf {
  padding-left: 40px;
}

.tree-deepleaf {
  padding-left: 56px;
}

.tree-children {
  border-left: 2px solid #e8e8e8;
  margin-left: 12px;
}

.tree-children-deep {
  margin-left: 24px;
}

.tree-children-deepest {
  margin-left: 24px;
}

.tree-arrow {
  flex-shrink: 0;
  font-size: 10px;
  margin-top: 3px;
  transition: transform 0.2s;
  color: #999;
}

.tree-arrow-open {
  transform: rotate(90deg);
}

.tree-leaf-dot {
  flex-shrink: 0;
  color: #1677ff;
  font-size: 10px;
  margin-top: 2px;
}

.tree-code {
  flex-shrink: 0;
  font-family: monospace;
  color: #1677ff;
  font-weight: 500;
  min-width: 80px;
}

.tree-name {
  color: #333;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
}

.notes-content {
  max-height: 600px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}

.notes-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.notes-content :deep(td),
.notes-content :deep(th) {
  border: 1px solid #d9d9d9;
  padding: 4px 8px;
}
</style>
