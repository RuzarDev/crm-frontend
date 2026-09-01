<template>
  <div class="goods-section">
    <div class="section-bar">
      <span class="section-label">ТОВАРЫ</span>
      <a-space v-if="!readonly" size="small">
        <a-upload
          :show-upload-list="false"
          :before-upload="onExcelFile"
          :custom-request="() => {}"
          accept=".xlsx,.xls"
        >
          <a-button size="small" :loading="excelBusy">
            <UploadOutlined />
            Загрузить из Excel
          </a-button>
        </a-upload>
        <a-button type="dashed" size="small" @click="addItem">+ Добавить товар</a-button>
      </a-space>
    </div>

    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">Нажмите «+ Добавить товар» чтобы добавить позицию</span>
      <span v-else>Нет товаров</span>
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="goods-card">
      <div class="card-top">
        <span class="card-num" title="Порядковый номер товара">{{ idx + 1 }}</span>
        <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /></a-button>
      </div>

      <!-- Row: код тнвэд + найти + описание из тнвэд -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Код ТНВЭД</div>
          <a-input-group compact style="display: flex">
            <a-input
              v-model:value="item.tnvedCode"
              size="small"
              :disabled="readonly"
              placeholder="0000000000"
              @change="emit('update:modelValue', items.map(fromRow))"
            />
            <a-button
              v-if="!readonly"
              size="small"
              :loading="item.tnvedLoading"
              @click="lookupTnved(item)"
            >Найти</a-button>
            <a-button
              v-if="!readonly"
              size="small"
              @click="openPicker(item)"
            >Справочник</a-button>
          </a-input-group>
        </div>
        <div class="field f-2">
          <div class="field-label">Описание товара из ТНВЭД</div>
          <a-input
            v-model:value="item.tnvedDescription"
            size="small"
            :disabled="readonly"
            placeholder="Автозаполнение по коду ТНВЭД"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: описание из инвойса (wide) -->
      <!-- uppercase — опция только для Import40 ДТ (DtSectionGoods передаёт true);
           транзитные вызовы (ReestrFormFields/DocumentPackageWorkspaceView) её не
           передают и остаются без принудительного верхнего регистра. Директиву
           v-uppercase нельзя переключить динамически (mounted/unmounted only),
           поэтому два варианта инпута вместо одного условного :class/directive. -->
      <div class="field-row">
        <div class="field f-grow">
          <div class="field-label">Описание из инвойса</div>
          <a-input
            v-if="uppercase"
            v-uppercase
            v-model:value="item.description"
            size="small"
            :disabled="readonly"
            placeholder="Описание товара из инвойса"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
          <a-input
            v-else
            v-model:value="item.description"
            size="small"
            :disabled="readonly"
            placeholder="Описание товара из инвойса"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: страна происхождения -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Страна происхождения</div>
          <a-select
            v-model:value="item.countryOfOrigin"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="countryOptions"
            :filter-option="filterCountry"
            placeholder="Выберите страну по коду"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: кол-во + код ОКЕИ + тип количества -->
      <div class="field-row">
        <div class="field f-narrow">
          <div class="field-label">Кол-во ДЕИ</div>
          <a-input
            v-model:value="item.quantityStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'quantity', item.quantityStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Код ДЕИ (ОКЕИ)</div>
          <a-select
            v-model:value="item.unitCode"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="okeiOptions"
            placeholder="796"
            @change="(v: string) => onUnitCodeChange(item, v)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Код типа кол-ва</div>
          <a-select
            v-model:value="item.quantityTypeCode"
            size="small"
            :disabled="readonly"
            allow-clear
            style="width: 100%"
            :options="quantityTypeOptions"
            placeholder="РК / РР"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>

      <!-- Row: брутто + нетто + кол-во мест -->
      <div class="field-row">
        <div class="field f-narrow">
          <div class="field-label">Брутто, кг</div>
          <a-input
            v-model:value="item.grossWeightStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'grossWeightKg', item.grossWeightStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Нетто, кг</div>
          <a-input
            v-model:value="item.netWeightStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'netWeightKg', item.netWeightStr)"
          />
        </div>
        <div class="field f-narrow">
          <div class="field-label">Кол-во грузовых мест</div>
          <a-input
            v-model:value="item.packagesCountStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'packagesCount', item.packagesCountStr)"
          />
        </div>
      </div>

      <!-- Row: там.стоимость + валюта -->
      <div class="field-row">
        <div class="field f-2">
          <div class="field-label">Таможенная стоимость</div>
          <a-input
            v-model:value="item.customsValueStr"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @blur="syncNum(item, 'customsValue', item.customsValueStr)"
          />
        </div>
        <div class="field f-2">
          <div class="field-label">Валюта</div>
          <a-select
            v-model:value="item.currency"
            size="small"
            :disabled="readonly"
            show-search
            allow-clear
            style="width: 100%"
            :options="currencyOptions"
            :filter-option="filterCurrency"
            placeholder="USD"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>
      </div>
    </div>

    <TnvedPickerModal v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPickerSelect" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { CloseOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import * as XLSX from 'xlsx'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import type { ReestrGoodsItemInput } from '@/types/api'
import { OKEI_QUANTITY_TYPE_CODES } from '@/types/api'

interface GoodsRow extends ReestrGoodsItemInput {
  quantityStr: string
  grossWeightStr: string
  netWeightStr: string
  packagesCountStr: string
  customsValueStr: string
  tnvedLoading?: boolean
}

const props = defineProps<{
  modelValue: ReestrGoodsItemInput[]
  readonly?: boolean
  // Опт-ин UPPERCASE для описания товара (Task 8c) — компонент общий с
  // транзитом (ReestrFormFields/DocumentPackageWorkspaceView), поэтому
  // по умолчанию выключено и не влияет на транзитное поведение.
  uppercase?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrGoodsItemInput[]): void
}>()

// Пикер ТН ВЭД (поиск по дереву/коду + ставки/разрешения) для конкретной строки товара
const pickerOpen = ref(false)
const pickerTarget = ref<GoodsRow | null>(null)
const pickerQuery = ref('')
const openPicker = (item: GoodsRow) => { pickerTarget.value = item; pickerQuery.value = ''; pickerOpen.value = true }
const onPickerSelect = (payload: { code: string; name: string }) => {
  const t = pickerTarget.value
  if (!t) return
  t.tnvedCode = payload.code
  if (!t.tnvedDescription) t.tnvedDescription = payload.name
  emit('update:modelValue', items.value.map(fromRow))
}

const quantityTypeOptions = OKEI_QUANTITY_TYPE_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}))

const okeiOptions = ref<{ value: string; label: string }[]>([])
const okeiByCode = ref<Record<string, string>>({})
const countryOptions = ref<{ value: string; label: string }[]>([])

onMounted(async () => {
  try {
    const units = await referencesApi.listOkeiUnits()
    okeiOptions.value = units.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))
    okeiByCode.value = Object.fromEntries(units.map((u) => [u.code, u.name]))
  } catch (e) {
    console.error('Failed to load OKEI units', e)
  }
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch (e) {
    console.error('Failed to load countries', e)
  }
})

function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function onUnitCodeChange(item: GoodsRow, code: string | undefined) {
  item.unitCode = code || null
  if (code && okeiByCode.value[code]) {
    item.unit = okeiByCode.value[code]
  }
  emit('update:modelValue', items.value.map(fromRow))
}

async function lookupTnved(item: GoodsRow) {
  const code = (item.tnvedCode || '').trim()
  if (!code) return
  item.tnvedLoading = true
  try {
    const res = await tnvedApi.node(code)
    // Неполный код (напр. 6 знаков = субпозиция) — не лист: открываем справочник
    // с этим кодом, чтобы декларант выбрал конкретный 10-значный код.
    if (!res.data.is10) {
      item.tnvedLoading = false
      pickerTarget.value = item
      pickerQuery.value = code
      pickerOpen.value = true
      return
    }
    item.tnvedDescription = res.data.name
    // Автоподстановка единицы измерения по ТНВЭД — только если поле ещё не заполнено вручную
    if (!item.unitCode && !item.unit) {
      try {
        const ratesRes = await tnvedApi.rates(code)
        if (ratesRes.data.unitCode) {
          item.unitCode = ratesRes.data.unitCode
          item.unit = ratesRes.data.unitName || okeiByCode.value[ratesRes.data.unitCode] || item.unit
        }
      } catch (e) {
        console.error('Failed to look up TNVED unit', e)
      }
    }
    emit('update:modelValue', items.value.map(fromRow))
  } catch (e) {
    // Код не найден точным совпадением (частичный/6-значный) — открываем справочник с поиском по нему
    console.error('Failed to look up TNVED code', e)
    pickerTarget.value = item
    pickerQuery.value = code
    pickerOpen.value = true
  } finally {
    item.tnvedLoading = false
  }
}

const CURRENCIES = [
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'EUR', label: 'EUR — Евро' },
  { value: 'CNY', label: 'CNY — Юань' },
  { value: 'KZT', label: 'KZT — Тенге' },
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'GBP', label: 'GBP — Фунт стерлингов' },
  { value: 'CHF', label: 'CHF — Швейцарский франк' },
  { value: 'JPY', label: 'JPY — Иена' },
  { value: 'AED', label: 'AED — Дирхам ОАЭ' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
]
const currencyOptions = CURRENCIES

function filterCurrency(_input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(_input.toLowerCase())
}

const items = ref<GoodsRow[]>([])

function toRow(g: ReestrGoodsItemInput): GoodsRow {
  return {
    ...g,
    quantityStr: g.quantity != null ? String(g.quantity) : '',
    grossWeightStr: g.grossWeightKg != null ? String(g.grossWeightKg) : '',
    netWeightStr: g.netWeightKg != null ? String(g.netWeightKg) : '',
    packagesCountStr: g.packagesCount != null ? String(g.packagesCount) : '',
    customsValueStr: g.customsValue != null ? String(g.customsValue) : '',
  }
}

function fromRow(r: GoodsRow): ReestrGoodsItemInput {
  // rest сохраняет расширенные поля (например КЕДЕН-поля Импорта 40),
  // которые этот компонент не знает и не должен терять
  const { quantityStr, grossWeightStr, netWeightStr, packagesCountStr, customsValueStr, tnvedLoading, ...rest } = r
  return {
    ...rest,
    description: r.description || null,
    tnvedCode: r.tnvedCode || null,
    tnvedDescription: r.tnvedDescription || null,
    countryOfOrigin: r.countryOfOrigin || null,
    unit: r.unit || null,
    unitCode: r.unitCode || null,
    quantityTypeCode: r.quantityTypeCode || null,
    currency: r.currency || null,
  }
}

function syncNum(
  item: GoodsRow,
  key: 'quantity' | 'grossWeightKg' | 'netWeightKg' | 'packagesCount' | 'customsValue',
  str: string,
) {
  const n = parseFloat(str.replace(',', '.'))
  item[key] = isNaN(n) ? null : n
  emit('update:modelValue', items.value.map(fromRow))
}

watch(
  () => props.modelValue,
  (v) => {
    items.value = (v ?? []).map(toRow)
  },
  { immediate: true },
)

function addItem() {
  items.value.push({
    description: null,
    tnvedCode: null,
    tnvedDescription: null,
    countryOfOrigin: null,
    quantity: null,
    unit: null,
    unitCode: null,
    grossWeightKg: null,
    netWeightKg: null,
    packagesCount: null,
    quantityTypeCode: null,
    customsValue: null,
    currency: 'USD',
    quantityStr: '',
    grossWeightStr: '',
    netWeightStr: '',
    packagesCountStr: '',
    customsValueStr: '',
  })
  emit('update:modelValue', items.value.map(fromRow))
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emit('update:modelValue', items.value.map(fromRow))
}

// ── Импорт товаров из Excel «КЕДЕН ШАПКА» ────────────────────────────────────
// Столбцы источника нестабильны по написанию (пробелы/регистр/лишние слова),
// поэтому матчим заголовки по нормализованной подстроке, а не точным именам.
type ExcelField = 'tnvedCode' | 'description' | 'grossWeightKg' | 'quantity' | 'unit' | 'packagesCount'

const EXCEL_COLUMN_MATCHERS: { field: ExcelField; patterns: string[] }[] = [
  { field: 'tnvedCode', patterns: ['кодтнвэд'] },
  { field: 'description', patterns: ['коммерческоеописание'] },
  { field: 'grossWeightKg', patterns: ['брутто'] },
  { field: 'quantity', patterns: ['количествотовара'] },
  { field: 'unit', patterns: ['видупаковкитовара'] },
  { field: 'packagesCount', patterns: ['количествогрузовыхмест'] },
]

function normalizeHeader(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function excelToStr(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

function excelToNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

const excelBusy = ref(false)

async function importGoodsFromExcel(file: File) {
  excelBusy.value = true
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      message.warning('В файле нет листов')
      return
    }
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    if (!rows.length) {
      message.warning('Файл пуст')
      return
    }

    const headerRow = rows[0] ?? []
    const colIndex: Partial<Record<ExcelField, number>> = {}
    headerRow.forEach((cell, idx) => {
      const norm = normalizeHeader(cell)
      if (!norm) return
      for (const matcher of EXCEL_COLUMN_MATCHERS) {
        if (colIndex[matcher.field] != null) continue
        if (matcher.patterns.some((p) => norm.includes(p))) {
          colIndex[matcher.field] = idx
          break
        }
      }
    })

    const added: GoodsRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.every((c) => c == null || c === '')) continue

      const tnvedCode = colIndex.tnvedCode != null ? excelToStr(row[colIndex.tnvedCode]) : null
      const description = colIndex.description != null ? excelToStr(row[colIndex.description]) : null
      const grossWeightKg = colIndex.grossWeightKg != null ? excelToNum(row[colIndex.grossWeightKg]) : null
      const quantity = colIndex.quantity != null ? excelToNum(row[colIndex.quantity]) : null
      const unit = colIndex.unit != null ? excelToStr(row[colIndex.unit]) : null
      const packagesCount = colIndex.packagesCount != null ? excelToNum(row[colIndex.packagesCount]) : null

      const isEmptyRow =
        !tnvedCode && !description && grossWeightKg == null && quantity == null && unit == null && packagesCount == null
      if (isEmptyRow) continue

      added.push(
        toRow({
          description,
          tnvedCode,
          tnvedDescription: description,
          countryOfOrigin: null,
          quantity,
          unit,
          unitCode: null,
          grossWeightKg,
          netWeightKg: null,
          packagesCount,
          quantityTypeCode: null,
          customsValue: null,
          currency: null,
        }),
      )
    }

    if (!added.length) {
      message.warning('Не найдено товаров для импорта')
      return
    }

    items.value = [...items.value, ...added]
    emit('update:modelValue', items.value.map(fromRow))
    message.success(`Загружено ${added.length} товаров`)
  } catch (e) {
    console.error('Failed to import goods from Excel', e)
    message.error('Не удалось прочитать файл Excel')
  } finally {
    excelBusy.value = false
  }
}

const onExcelFile: UploadProps['beforeUpload'] = (file) => {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    message.error('Допустим только Excel-файл (.xlsx)')
    return false
  }
  void importGoodsFromExcel(file as File)
  return false
}
</script>

<style scoped>
.goods-section {
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
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  letter-spacing: 0.06em;
}

.empty-state {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 6px 0 2px;
}

.goods-card {
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--atg-surface, var(--atg-bg));
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: -2px;
}

.card-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5);
  color: var(--atg-teal, #00b8a0);
  font-size: 11px;
  font-weight: 700;
}

.del-btn {
  color: var(--atg-danger, #ff4d4f) !important;
  padding: 0 4px !important;
  height: 20px !important;
  font-size: 13px !important;
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
}

.f-2 {
  flex: 2;
  min-width: 0;
}

.f-narrow {
  flex: 1;
  min-width: 60px;
}

.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--atg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field :deep(.ant-input-sm),
.field :deep(.ant-select-sm .ant-select-selector) {
  font-size: 13px;
}

.field :deep(.ant-select-sm) {
  font-size: 13px;
}
</style>
