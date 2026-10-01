<template>
  <div class="doc44-section">
    <div class="section-bar">
      <span class="section-label">{{ t('transit.n44GrafaTdDokumenty') }}</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">{{ t('transit.dobavitDokument') }}</a-button>
    </div>

    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">{{ t('transit.nazhmiteDobavitDokumentChtoby') }}</span>
      <span v-else>{{ t('transit.netDokumentov') }}</span>
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="doc-card">
      <div class="doc-num">{{ idx + 1 }}</div>

      <!-- Строка 1: тип документа (широко) -->
      <div class="doc-body">
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">{{ t('transit.tipDokumentaKodEaes') }}</div>
            <a-select
              v-model:value="item.docTypeCode"
              size="small"
              :disabled="readonly"
              allow-clear
              show-search
              style="width: 100%"
              :options="eaesOptions"
              :placeholder="t('transit.vyberiteTip')"
              @change="(v: string | undefined) => onTypeCodeChange(item, v ?? null)"
            />
          </div>
          <div class="field f-grow">
            <div class="field-label">{{ t('transit.naimenovanieDokumenta') }}</div>
            <a-input
              v-model:value="item.docTypeName"
              size="small"
              :disabled="readonly"
              placeholder="—"
              @change="emitChange"
            />
          </div>
        </div>

        <!-- Строка 2: номер + дата -->
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">{{ t('transit.nomerDokumenta') }}</div>
            <a-input
              v-model:value="item.docNumber"
              size="small"
              :disabled="readonly"
              placeholder="—"
              @change="emitChange"
            />
          </div>
          <div class="field" style="flex: 0 0 160px;">
            <div class="field-label">{{ t('transit.dataDokumenta') }}</div>
            <a-date-picker
              v-model:value="item.docDate"
              size="small"
              :disabled="readonly"
              style="width: 100%"
              format="DD.MM.YYYY"
              value-format="YYYY-MM-DD"
              placeholder="дд.мм.гггг"
              allow-clear
              @change="emitChange"
            />
          </div>
        </div>

        <!-- Строка 3 (расширенный режим Import40): «на все товары» + мультивыбор товаров -->
        <div v-if="extended" class="field-row">
          <div class="field" style="flex: 0 0 auto;">
            <div class="field-label">{{ t('transit.primenimost') }}</div>
            <a-checkbox
              :checked="(item as Import40Doc44ItemInput).appliesToAll ?? false"
              :disabled="readonly"
              @change="(e: any) => onAppliesToAllChange(item as Import40Doc44ItemInput, e.target.checked)"
            >{{ t('transit.naVseTovary') }}</a-checkbox>
          </div>
          <div class="field f-grow">
            <div class="field-label">{{ t('transit.tovary') }}</div>
            <a-select
              mode="multiple"
              :value="goodsIdxArray(item as Import40Doc44ItemInput)"
              size="small"
              :disabled="readonly || ((item as Import40Doc44ItemInput).appliesToAll ?? false)"
              allow-clear
              style="width: 100%"
              :placeholder="t('transit.vyberiteTovary')"
              :options="goodsOptions ?? []"
              :get-popup-container="popupContainer"
              @change="(vals: number[]) => onGoodsIndexesChange(item as Import40Doc44ItemInput, vals)"
            />
          </div>
        </div>

        <!-- Строка 4 (extended или transitExtended): сроки действия + страна (§7 гр.44) -->
        <div v-if="extended || transitExtended" class="field-row">
          <div class="field" style="flex: 0 0 130px;">
            <div class="field-label">{{ t('transit.deystvuetS') }}</div>
            <a-date-picker
              :value="(item as Import40Doc44ItemInput).docStartDate"
              size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD"
              placeholder="дд.мм.гггг" style="width: 130px" allow-clear
              @update:value="(v: string) => { (item as Import40Doc44ItemInput).docStartDate = v || null; emitChange() }"
            />
          </div>
          <div class="field" style="flex: 0 0 130px;">
            <div class="field-label">{{ t('transit.deystvuetPo') }}</div>
            <a-date-picker
              :value="(item as Import40Doc44ItemInput).docValidityDate"
              size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD"
              placeholder="дд.мм.гггг" style="width: 130px" allow-clear
              @update:value="(v: string) => { (item as Import40Doc44ItemInput).docValidityDate = v || null; emitChange() }"
            />
          </div>
          <div class="field" style="flex: 0 0 200px;">
            <div class="field-label">{{ t('transit.stranaVydachiGr44') }}</div>
            <a-select
              :value="(item as Import40Doc44ItemInput).issueCountryCode ?? null"
              size="small" :disabled="readonly" show-search allow-clear :options="countryOptions"
              :filter-option="filterCountry" placeholder="KZ / CN…" style="width: 200px"
              @change="(v: string | null) => { (item as Import40Doc44ItemInput).issueCountryCode = v ?? null; emitChange() }"
            />
          </div>
        </div>

        <!-- Строка 5 (transitExtended): уполномоченный орган + номер бланка + вложение (§7) -->
        <div v-if="transitExtended" class="field-row">
          <div class="field f-grow">
            <div class="field-label">{{ t('transit.upolnomochennyyOrgan') }}</div>
            <a-input
              :value="(item as Import40Doc44ItemInput).authorizedBody ?? null"
              size="small" :disabled="readonly" placeholder="—"
              @change="(e: Event) => { (item as Import40Doc44ItemInput).authorizedBody = (e.target as HTMLInputElement).value || null; emitChange() }"
            />
          </div>
          <div class="field" style="flex: 0 0 160px;">
            <div class="field-label">{{ t('transit.idUpolnomOrgana') }}</div>
            <a-input
              :value="(item as Import40Doc44ItemInput).authorizedBodyId ?? null"
              size="small" :disabled="readonly" placeholder="—"
              @change="(e: Event) => { (item as Import40Doc44ItemInput).authorizedBodyId = (e.target as HTMLInputElement).value || null; emitChange() }"
            />
          </div>
          <div class="field" style="flex: 0 0 160px;">
            <div class="field-label">{{ t('transit.nomerBlanka') }}</div>
            <a-input
              :value="(item as Import40Doc44ItemInput).formBlankNumber ?? null"
              size="small" :disabled="readonly" placeholder="—"
              @change="(e: Event) => { (item as Import40Doc44ItemInput).formBlankNumber = (e.target as HTMLInputElement).value || null; emitChange() }"
            />
          </div>
          <div class="field" style="flex: 0 0 220px;">
            <div class="field-label">{{ t('transit.faylDokumenta') }}</div>
            <a-input disabled size="small" :placeholder="t('transit.zagruzhaetsyaVoVkladkeDokumenty')" />
          </div>
        </div>
      </div>

      <a-button
        v-if="!readonly"
        type="text"
        danger
        size="small"
        class="del-btn"
        @click="removeItem(idx)"
       :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrDoc44ItemInput, Import40Doc44ItemInput } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'

const { t } = useI18n()

const countryOptions = useCountryAlpha2Options()
const filterCountry = (input: string, option: { label: string }) =>
  option.label.toLowerCase().includes(input.toLowerCase())

const props = defineProps<{
  modelValue: ReestrDoc44ItemInput[]
  readonly?: boolean
  extended?: boolean
  // КЕДЕН-транзит §7: страна/сроки действия/уполном.орган/номер бланка —
  // независимо от extended (Import40), чтобы не тянуть в транзит поле «Товар».
  transitExtended?: boolean
  goodsOptions?: { value: number; label: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrDoc44ItemInput[]): void
}>()

const popupContainer = () => document.body

// Виды документов — классификатор ЕЭК 2009 с сервера (сверяется с НСИ ЕЭК раз в неделю).
const classifiers = useClassifiersStore()
void classifiers.load('2009').catch(() => {})
const eaesOptions = computed(() => classifiers.options('2009'))

// Import40Doc44ItemInput расширяет ReestrDoc44ItemInput опциональными полями —
// items хранит их, даже когда компонент используется в транзитном (не extended) режиме
const items = ref<Import40Doc44ItemInput[]>([])

watch(
  () => props.modelValue,
  (v) => {
    items.value = (v ?? []).map((d) => ({ ...d }))
  },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((d) => ({ ...d })))
}

// CSV (goodsItemIndexes) ↔ number[] для мультиселекта товаров
function goodsIdxArray(item: Import40Doc44ItemInput): number[] {
  // ВАЖНО: пустые сегменты отсеиваем ДО Number() — Number('') === 0 (не NaN),
  // иначе у пустого/несохранённого документа мультивыбор показывал бы фантомный
  // чип «Товар 1» (индекс 0). Number.isFinite(0) === true, поэтому фильтр по
  // finite сам по себе это не ловит.
  if (!item.goodsItemIndexes) return []
  return item.goodsItemIndexes
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

function onGoodsIndexesChange(item: Import40Doc44ItemInput, vals: number[]) {
  item.goodsItemIndexes = vals.length ? vals.join(',') : null
  emitChange()
}

function onAppliesToAllChange(item: Import40Doc44ItemInput, checked: boolean) {
  item.appliesToAll = checked
  // взаимоисключение: «на все товары» очищает конкретный мультивыбор
  if (checked) item.goodsItemIndexes = null
  emitChange()
}

function onTypeCodeChange(item: ReestrDoc44ItemInput, code: string | null) {
  item.docTypeCode = code
  const found = classifiers.cache['2009']?.find((c) => c.code === code)
  if (found) item.docTypeName = found.nameRu
  emitChange()
}

function addItem() {
  items.value.push({
    docTypeCode: null,
    docTypeName: null,
    docNumber: null,
    docDate: null,
    goodsItemIndex: null,
    appliesToAll: false,
    goodsItemIndexes: null,
    docStartDate: null,
    docValidityDate: null,
    issueCountryCode: null,
    authorizedBody: null,
    authorizedBodyId: null,
    formBlankNumber: null,
  })
  emitChange()
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emitChange()
}
</script>

<style scoped>
.doc44-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--z-ink);
}

.empty-state {
  font-size: 12px;
  color: var(--z-muted);
  font-style: italic;
  padding: 6px 0 2px;
}

.doc-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--z-line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--z-surface);
}

.doc-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--z-teal-soft);
  color: var(--z-teal);
  font-size: 12px;
  font-weight: 700;
  margin-top: 20px;
}

.doc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

:not(#z) .del-btn {
  flex-shrink: 0;
  color: var(--z-danger);
  padding: 0 4px;
  height: 20px;
  font-size: 13px;
  margin-top: 20px;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.f-grow {
  flex: 1;
  min-width: 0;
}

.field-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--z-ink-2);
}

.field :deep(.ant-input-sm),
.field :deep(.ant-select-sm .ant-select-selector),
.field :deep(.ant-picker-small) {
  font-size: 13px;
}
</style>
