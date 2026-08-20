<template>
  <a-modal :open="open" title="Справочник ТН ВЭД — выбор кода" width="820px" :footer="null"
    @update:open="(v: boolean) => emit('update:open', v)">
    <div class="tnved-picker">
      <a-input-search v-model:value="query" placeholder="Поиск по наименованию или коду ТН ВЭД"
        allow-clear enter-button="Найти" :loading="searchLoading" @search="doSearch" />

      <div class="picker-body">
        <!-- Левая часть: результаты поиска или дерево -->
        <div class="picker-left">
          <template v-if="results !== null">
            <div class="picker-hint">
              Результаты поиска
              <a class="picker-reset" @click="clearSearch"><LeftOutlined /> дерево</a>
            </div>
            <div v-if="results.length === 0" class="picker-empty">Ничего не найдено</div>
            <div v-for="n in results" :key="n.id" class="picker-node" :class="{ active: selected?.id === n.id }"
              @click="pickNode(n)">
              <span class="pn-code">{{ n.code }}</span>
              <span class="pn-name">{{ n.name || n.treeName }}</span>
              <a-tag v-if="n.is10" color="blue" class="pn-tag">10</a-tag>
            </div>
          </template>

          <template v-else>
            <div class="picker-crumbs">
              <a @click="toRoot">Разделы</a>
              <template v-for="(c, i) in crumbs" :key="c.id">
                <span class="crumb-sep">/</span>
                <a @click="toCrumb(i)">{{ c.code }}</a>
              </template>
            </div>
            <div v-if="treeLoading" class="picker-empty">Загрузка…</div>
            <div v-for="n in nodes" :key="n.id" class="picker-node" :class="{ active: selected?.id === n.id }"
              @click="clickNode(n)">
              <span class="pn-code">{{ n.code }}</span>
              <span class="pn-name">{{ n.treeName }}</span>
              <a-tag v-if="n.is10" color="blue" class="pn-tag">10</a-tag>
              <span v-if="!n.isLast" class="pn-arrow">›</span>
            </div>
          </template>
        </div>

        <!-- Правая часть: детали выбранного кода -->
        <div class="picker-right">
          <div v-if="!selected" class="picker-empty">Выберите товар — покажу ставки и разрешительные документы</div>
          <template v-else>
            <div class="detail-code">{{ selected.code }}</div>
            <div class="detail-name">{{ selected.name || selected.treeName }}</div>

            <div class="detail-block-title">Ставки (ТО / ТТ)</div>
            <div v-if="detailLoading" class="picker-empty">Загрузка ставок…</div>
            <div v-else-if="rates.length === 0" class="picker-empty">Ставки не найдены</div>
            <div v-else class="rates">
              <div v-for="r in rates" :key="r.code" class="rate-row">
                <span class="rate-code">{{ r.code }}</span>
                <a-tag v-if="r.rateStr" color="orange">{{ r.rateStr }}</a-tag>
                <span v-else class="muted">—</span>
                <a-tag v-if="r.vtoStatus" color="purple">ВТО: {{ r.vtoStatus }}</a-tag>
              </div>
            </div>

            <div class="detail-block-title">Разрешительные документы (нетарифные меры)</div>
            <div v-if="detailLoading" class="picker-empty">…</div>
            <div v-else-if="measures.length === 0" class="picker-empty muted">Не требуются / нет данных</div>
            <ul v-else class="measures">
              <li v-for="(m, i) in measures" :key="i">{{ m.docType ? m.docType + ': ' : '' }}{{ m.name || m.description }}</li>
            </ul>

            <a-button type="primary" block :disabled="!selected.is10" style="margin-top:14px" @click="choose">
              {{ selected.is10 ? 'Выбрать этот код' : 'Выберите конечный 10-значный код' }}
            </a-button>
          </template>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { LeftOutlined } from '@ant-design/icons-vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto, TnvedRateDto } from '@/types/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', payload: { code: string; name: string }): void
}>()

const query = ref('')
const results = ref<TnvedNodeDto[] | null>(null)
const searchLoading = ref(false)
const nodes = ref<TnvedNodeDto[]>([])
const crumbs = ref<TnvedNodeDto[]>([])
const treeLoading = ref(false)
const selected = ref<TnvedNodeDto | null>(null)
const rates = ref<TnvedRateDto[]>([])
const measures = ref<{ docType?: string; name?: string; description?: string }[]>([])
const detailLoading = ref(false)

const loadChildren = async (parentId = 0) => {
  treeLoading.value = true
  try {
    nodes.value = (await tnvedApi.children(parentId)).data
  } catch {
    nodes.value = []
  } finally {
    treeLoading.value = false
  }
}

const doSearch = async () => {
  const q = query.value.trim()
  if (!q) { clearSearch(); return }
  searchLoading.value = true
  try {
    results.value = (await tnvedApi.search(q, false, 40)).data
  } catch {
    results.value = []
  } finally {
    searchLoading.value = false
  }
}
const clearSearch = () => { results.value = null; query.value = '' }

const toRoot = () => { crumbs.value = []; loadChildren(0) }
const toCrumb = (i: number) => {
  const c = crumbs.value[i]
  crumbs.value = crumbs.value.slice(0, i + 1)
  loadChildren(c.id)
}
const clickNode = async (n: TnvedNodeDto) => {
  pickNode(n)
  if (!n.isLast) {
    crumbs.value = [...crumbs.value, n]
    await loadChildren(n.id)
  }
}

const pickNode = async (n: TnvedNodeDto) => {
  selected.value = n
  rates.value = []
  measures.value = []
  if (!n.is10) return
  detailLoading.value = true
  try {
    const [r, ref] = await Promise.allSettled([tnvedApi.rates(n.code), tnvedApi.reference(n.code)])
    if (r.status === 'fulfilled') rates.value = Array.isArray(r.value.data) ? r.value.data : [r.value.data].filter(Boolean)
    if (ref.status === 'fulfilled') measures.value = ref.value.data?.nonTariffMeasures ?? []
  } catch {
    /* детали не критичны */
  } finally {
    detailLoading.value = false
  }
}

const choose = () => {
  if (!selected.value?.is10) return
  emit('select', { code: selected.value.code, name: selected.value.name || selected.value.treeName || '' })
  emit('update:open', false)
}

watch(() => props.open, (v) => {
  if (v) {
    // сброс + загрузка корня при открытии
    clearSearch(); selected.value = null; rates.value = []; measures.value = []; crumbs.value = []
    loadChildren(0)
  }
})
</script>

<style scoped>
.tnved-picker { display: flex; flex-direction: column; gap: 12px; }
.picker-body { display: flex; gap: 14px; height: 440px; }
.picker-left, .picker-right { flex: 1; overflow-y: auto; border: 1px solid var(--atg-border, #e5e7eb); border-radius: 8px; padding: 8px; }
.picker-hint, .picker-crumbs { font-size: 12px; color: var(--atg-muted, #6b7280); margin-bottom: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.picker-reset, .picker-crumbs a { cursor: pointer; color: var(--atg-accent, #0f8ba8); }
.crumb-sep { color: var(--atg-muted, #9ca3af); }
.picker-node { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.picker-node:hover { background: rgba(15, 139, 168, 0.08); }
.picker-node.active { background: rgba(15, 139, 168, 0.15); }
.pn-code { font-family: ui-monospace, monospace; font-weight: 600; min-width: 92px; }
.pn-name { flex: 1; }
.pn-tag { margin: 0; }
.pn-arrow { color: var(--atg-muted, #9ca3af); }
.picker-empty { color: var(--atg-muted, #9ca3af); font-size: 13px; padding: 8px; }
.muted { color: var(--atg-muted, #9ca3af); }
.detail-code { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 700; }
.detail-name { color: var(--atg-muted, #4b5563); margin: 4px 0 10px; }
.detail-block-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--atg-muted, #6b7280); margin: 12px 0 6px; }
.rate-row { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 13px; }
.rate-code { font-family: ui-monospace, monospace; min-width: 48px; }
.measures { margin: 0; padding-left: 18px; font-size: 13px; }
.measures li { margin: 2px 0; }
</style>
