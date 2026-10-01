<template>
  <a-modal :open="open" :title="t('sales.spravochnikTnVedVybor')" width="1040px" :footer="null"
    @update:open="(v: boolean) => emit('update:open', v)">
    <div class="tnved-picker">
      <a-input-search v-model:value="query" :placeholder="t('sales.poiskPoNaimenovaniyuIli')"
        allow-clear :enter-button="t('misc.nayti')" :loading="searchLoading" @search="doSearch" />

      <div class="picker-body">
        <!-- Левая часть: полное раскрывающееся дерево или результаты поиска -->
        <div class="picker-left">
          <div v-show="showResults && results !== null" class="picker-results">
            <div class="picker-hint"> {{ t('sales.rezultatyPoiska') }}
              <a class="picker-reset" @click="backToTree"><LeftOutlined /> {{ t('sales.derevo') }}</a>
            </div>
            <div v-if="results?.length === 0" class="picker-empty">{{ t('sales.nichegoNeNaydeno') }}</div>
            <div v-for="n in results ?? []" :key="n.id" class="picker-node" :class="{ active: selected?.id === n.id }"
              @click="openResult(n)">
              <span class="pn-code">{{ n.code }}</span>
              <span class="pn-name">{{ n.name || n.treeName }}</span>
            </div>
          </div>
          <div v-show="!(showResults && results !== null)">
            <div class="picker-hint">
              <a v-if="results !== null" class="picker-reset" @click="showResults = true"><LeftOutlined /> {{ t('sales.rezultatyPoiska') }}</a>
              <span class="picker-spacer" />
              <a class="picker-reset" @click="treeRef?.collapseAll()">{{ t('sales.svernutVse') }}</a>
            </div>
            <TnvedTree v-if="mounted" ref="treeRef" :height="470" @select="pickNode" />
          </div>
        </div>

        <!-- Правая часть: детали выбранного кода -->
        <div class="picker-right">
          <div v-if="!selected" class="picker-empty">{{ t('sales.vyberiteTovarPokazhuStavki') }}</div>
          <template v-else>
            <div class="detail-code">{{ selected.code || '—' }}</div>
            <div class="detail-name">{{ selected.name || selected.treeName }}</div>

            <div v-if="!selected.is10" class="picker-note">{{ t('sales.gruppaRaskroyte') }}</div>
            <template v-else>
              <div class="detail-block-title">{{ t('sales.stavkiToTt') }}</div>
              <div v-if="detailLoading" class="picker-empty">{{ t('sales.zagruzkaStavok') }}</div>
              <div v-else-if="rates.length === 0" class="picker-empty">{{ t('sales.stavkiNeNaydeny') }}</div>
              <div v-else class="rates">
                <div v-for="r in rates" :key="r.code" class="rate-row">
                  <a-tag v-if="r.rateStr" color="orange">{{ r.rateStr }}</a-tag>
                  <span v-else class="muted">—</span>
                  <a-tag v-if="r.vtoStatus" color="purple">{{ t('sales.vto', { s: r.vtoStatus }) }}</a-tag>
                </div>
              </div>

              <div class="detail-block-title">{{ t('sales.razreshitelnyeDokumentyNetarifnyeMery') }}</div>
              <div v-if="detailLoading" class="picker-empty">…</div>
              <div v-else-if="measures.length === 0" class="picker-empty muted">{{ t('sales.neTrebuyutsyaNetDannyh') }}</div>
              <ul v-else class="measures">
                <li v-for="(m, i) in measures" :key="i">{{ m.docType ? m.docType + ': ' : '' }}{{ m.name || m.description }}</li>
              </ul>

              <a-button type="primary" block class="choose-btn" @click="choose">{{ t('sales.vybratEtotKod') }}</a-button>
            </template>
          </template>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { nextTick, ref, watch } from 'vue'
import { LeftOutlined } from '@ant-design/icons-vue'
import { tnvedApi } from '@/api/tnved'
import TnvedTree from '@/components/TnvedTree.vue'
import type { TnvedNodeDto, TnvedRateDto } from '@/types/api'

const { t } = useI18n()

const props = defineProps<{ open: boolean; initialQuery?: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', payload: { code: string; name: string }): void
}>()

const query = ref('')
const results = ref<TnvedNodeDto[] | null>(null)
const searchLoading = ref(false)
const showResults = ref(true)
// Дерево создаём при первом открытии модалки (не грузим корень, пока пикер не нужен).
const mounted = ref(false)
const treeRef = ref<InstanceType<typeof TnvedTree> | null>(null)
const selected = ref<TnvedNodeDto | null>(null)
const rates = ref<TnvedRateDto[]>([])
const measures = ref<{ docType?: string; name?: string; description?: string }[]>([])
const detailLoading = ref(false)

const doSearch = async () => {
  const q = query.value.trim()
  if (!q) { clearSearch(); return }
  // Полный 10-значный код — сразу раскрываем его в дереве.
  if (/^\d{10}$/.test(q.replace(/\s/g, ''))) {
    const n = await treeRef.value?.reveal(q.replace(/\s/g, ''))
    if (n) { results.value = null; pickNode(n); return }
  }
  searchLoading.value = true
  try {
    results.value = (await tnvedApi.search(q, false, 40)).data
    showResults.value = true
  } catch {
    results.value = []
  } finally {
    searchLoading.value = false
  }
}
const clearSearch = () => { results.value = null; query.value = '' }

const backToTree = () => { showResults.value = false; void treeRef.value?.scrollToSelected() }

// Результат поиска показываем на своём месте в дереве — видно соседние коды и всю ветку.
const openResult = async (n: TnvedNodeDto) => {
  pickNode(n)
  showResults.value = false
  await treeRef.value?.reveal(n.code)
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
    clearSearch(); selected.value = null; rates.value = []; measures.value = []
    mounted.value = true
    // если передан начальный запрос (напр. неполный 6-значный код) — сразу ищем
    const iq = (props.initialQuery || '').trim()
    if (iq) { query.value = iq; void nextTick(doSearch) }
  }
})
</script>

<style scoped>
.tnved-picker { display: flex; flex-direction: column; gap: 12px; }
.picker-body { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 14px; height: 520px; }
.picker-left, .picker-right { overflow: hidden; border: 1px solid var(--z-line, var(--z-line)); border-radius: 8px; padding: 8px; }
.picker-right { overflow-y: auto; padding: 14px 16px; }
.picker-results { height: 100%; overflow-y: auto; }
.picker-hint { font-size: 12px; color: var(--z-muted, var(--z-muted)); margin-bottom: 6px; display: flex; gap: 6px; align-items: center; min-height: 20px; }
.picker-spacer { flex: 1; }
.picker-reset { cursor: pointer; color: var(--z-teal-d, var(--z-teal-d)); }
.picker-node { display: flex; align-items: baseline; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.picker-node:hover { background: var(--z-teal-soft, #e1f5fa); }
.picker-node.active { background: var(--z-teal-soft, #e1f5fa); box-shadow: inset 2px 0 0 var(--z-teal, var(--z-teal)); }
.pn-code { font-family: ui-monospace, monospace; font-weight: 600; flex: none; min-width: 92px; }
.pn-name { flex: 1; }
.picker-empty { color: var(--z-muted, var(--z-muted)); font-size: 13px; padding: 8px 0; }
.picker-note { margin-top: 12px; padding: 10px 12px; border-radius: 6px; background: var(--z-surface-2, #eef1f7); color: var(--z-ink-2, var(--z-ink-2)); font-size: 13px; }
.muted { color: var(--z-muted, var(--z-muted)); }
.detail-code { font-family: ui-monospace, monospace; font-size: 20px; font-weight: 700; }
.detail-name { color: var(--z-ink-2, var(--z-ink-2)); margin: 4px 0 4px; font-size: 13px; }
.detail-block-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--z-muted, var(--z-muted)); margin: 16px 0 6px; }
.rate-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; font-size: 13px; }
.measures { margin: 0; padding-left: 18px; font-size: 13px; }
.measures li { margin: 2px 0; }
.choose-btn { margin-top: 18px; }
</style>
