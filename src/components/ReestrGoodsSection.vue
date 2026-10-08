<template>
  <div class="goods-section">
    <div class="section-bar">
      <span class="section-label">{{ t('dt.tovaryUpper') }}</span>
      <a-space v-if="!readonly" size="small">
        <a-upload
          :show-upload-list="false"
          :before-upload="onExcelFile"
          :custom-request="() => {}"
          accept=".xlsx,.xls"
        >
          <a-button size="small" :loading="excelBusy">
            <UploadOutlined /> {{ t('dt.zagruzitIzExcel') }} </a-button>
        </a-upload>
        <a-button type="dashed" size="small" @click="addItem">{{ t('dt.dobavitTovar') }}</a-button>
      </a-space>
      <a-button v-if="items.length > 1" size="small" type="link" class="collapse-all" @click="toggleAll">
        {{ allCollapsed ? t('dt.razvernutVse') : t('dt.svernutVse') }}
      </a-button>
    </div>

    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">{{ t('dt.nazhmiteDobavitTovar') }}</span>
      <span v-else>{{ t('dt.netTovarov') }}</span>
    </div>

    <div v-for="(item, idx) in items" :key="keys[idx]" class="goods-card zf-card">
      <div class="card-top">
        <!-- Свернуть карточку: при 10+ товарах страница превращалась в бесконечную простыню. -->
        <a-button type="text" size="small" class="collapse-btn" :aria-label="isCollapsed(idx) ? t('dt.razvernut') : t('dt.svernut')"
          :title="isCollapsed(idx) ? t('dt.razvernut') : t('dt.svernut')" @click="toggleCard(idx)">
          <RightOutlined :class="{ open: !isCollapsed(idx) }" />
        </a-button>
        <span class="card-num" :title="t('dt.poryadkovyyNomerTovara')">{{ idx + 1 }}</span>
        <span class="card-title">
          <b>{{ t('dt.tovarN', { n: idx + 1 }) }}</b>
          <template v-if="item.tnvedCode"> · <span class="card-code">{{ item.tnvedCode }}</span></template>
          <template v-if="item.description || item.tnvedDescription"> · {{ item.description || item.tnvedDescription }}</template>
        </span>
        <span v-if="isCollapsed(idx)" class="card-sum">
          <template v-if="item.customsValue != null">{{ fmtNum(item.customsValue) }} {{ lockedCurrency || item.currency || '' }}</template>
          <template v-if="paymentsTotal(item) > 0"> · {{ t('dt.tpin') }} {{ fmtNum(paymentsTotal(item)) }} ₸</template>
        </span>
        <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
      </div>

      <div v-show="!isCollapsed(idx)" class="zf-grid">
        <!-- Код ТН ВЭД + описание из ТН ВЭД -->
        <div class="zf-field zf-s5">
          <div class="zf-label">{{ t('dt.kodTnved') }}</div>
          <a-input-group compact class="tnved-group">
            <a-input
              v-model:value="item.tnvedCode"
              :disabled="readonly"
              :status="isTnvedInvalid(item) ? 'error' : undefined"
              placeholder="0000000000"
              class="tnved-input"
              @change="emit('update:modelValue', items.map(fromRow))"
              @blur="validateTnved(item)"
            />
            <a-button v-if="!readonly" :loading="item.tnvedLoading" @click="lookupTnved(item)">{{ t('dt.nayti') }}</a-button>
            <a-button v-if="!readonly" @click="openPicker(item)">{{ t('dt.spravochnik') }}</a-button>
          </a-input-group>
          <!-- Несуществующий 10-значный код (например 1902303000 вместо 1902301000)
               раньше выявлялся только на расчёте ТПиН — помечаем сразу при вводе. -->
          <div v-if="isTnvedInvalid(item)" class="field-error">{{ t('dt.kodaNetVSpravochnikeTnved') }}</div>
        </div>
        <div class="zf-field zf-s7">
          <div class="zf-label">{{ t('dt.opisanieTovaraIzTnved') }}</div>
          <a-input
            v-model:value="item.tnvedDescription"
            :disabled="readonly"
            :placeholder="t('dt.avtozapolneniePoKoduTnved')"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>

        <!-- Описание из инвойса. uppercase — опция только для Import40 ДТ (DtSectionGoods передаёт true);
             транзитные вызовы её не передают. Директиву v-uppercase нельзя переключить динамически
             (mounted/unmounted only), поэтому два варианта инпута вместо одного условного. -->
        <div class="zf-field zf-s12">
          <div class="zf-label">{{ t('dt.opisanieIzInvoysa') }}</div>
          <a-input
            v-if="uppercase"
            v-uppercase
            v-model:value="item.description"
            :disabled="readonly"
            :placeholder="t('dt.opisanieTovaraIzInvoysa')"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
          <a-input
            v-else
            v-model:value="item.description"
            :disabled="readonly"
            :placeholder="t('dt.opisanieTovaraIzInvoysa')"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
        </div>

        <!-- Бланк товара (гр.31): марка/знак/модель/артикул/изготовитель — после описаний и ПЕРЕД
             страной происхождения. Только в ДТ Импорта 40 (brandFields), в транзите блока нет. -->
        <template v-if="brandFields">
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.torgovayaMarka') }}</div>
            <a-input v-model:value="item.tradeMarkName" v-uppercase :disabled="readonly"
              @change="emit('update:modelValue', items.map(fromRow))" />
</div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.znak') }}</div>
            <a-input v-model:value="item.productMarkName" v-uppercase :disabled="readonly"
              :placeholder="t('dt.neUkazan')" @change="emit('update:modelValue', items.map(fromRow))" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.model') }}</div>
            <a-input v-model:value="item.productModelName" v-uppercase :disabled="readonly"
              :placeholder="t('dt.neUkazan')" @change="emit('update:modelValue', items.map(fromRow))" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.artikul') }}</div>
            <a-input v-model:value="item.productArticle" v-uppercase :disabled="readonly"
              :placeholder="t('dt.neUkazan')" @change="emit('update:modelValue', items.map(fromRow))" /></div>
          <!-- ТРОИС: знак есть в таможенном реестре ОИС — только подсказка на всю ширину (в колонке марки
               она вытягивалась в узкий жёлтый столбец), ничего не блокирует. -->
          <TroisTrademarkHint class="zf-s12" :name="item.tradeMarkName" />
          <div class="zf-field zf-s6"><div class="zf-label">{{ t('dt.proizvoditel') }}</div>
            <a-input v-model:value="item.manufacturerName" v-uppercase :disabled="readonly"
              @change="emit('update:modelValue', items.map(fromRow))" /></div>
        </template>

        <!-- Страна происхождения (+ ставки по стране, акциз, антидемпинг в ДТ) -->
        <div class="zf-field zf-s6">
          <div class="zf-label">{{ t('dt.stranaProishozhdeniya') }}</div>
          <a-select
            v-model:value="item.countryOfOrigin"
            :disabled="readonly"
            show-search
            allow-clear
            :options="countryOptions"
            :filter-option="filterCountry"
            :placeholder="t('dt.vyberiteStranuPoKodu')"
            @change="emit('update:modelValue', items.map(fromRow))"
          />
          <TariffOptionsHint
            v-if="brandFields"
            :code="item.tnvedCode"
            :country="item.countryOfOrigin"
            :excise-kind="item.exciseKind"
            :anti-dumping-kind="item.antiDumpingKind"
            :readonly="readonly"
            :unit-code="item.unitCode"
            :quantities="{ taxVolumeL: item.taxVolumeL, taxAlcoholL: item.taxAlcoholL, taxPieces: item.taxPieces, engineVolumeCm3: item.engineVolumeCm3 }"
            @update:tax-quantity="(f, v) => { item[f] = v; emit('update:modelValue', items.map(fromRow)) }"
            @update:excise-kind="(v) => { item.exciseKind = v; emit('update:modelValue', items.map(fromRow)) }"
            @update:anti-dumping-kind="(v) => { item.antiDumpingKind = v; emit('update:modelValue', items.map(fromRow)) }"
          />
        </div>

        <div class="zf-sec">{{ t('dt.secKolichestvo') }}</div>
        <div class="zf-field zf-s2">
          <div class="zf-label" :title="t('dt.kolVoDei')">{{ t('dt.kolVoDei') }}</div>
          <a-input v-model:value="item.quantityStr" :disabled="readonly" placeholder="—"
            @blur="syncNum(item, 'quantity', item.quantityStr)" />
        </div>
        <div class="zf-field zf-s2">
          <div class="zf-label" :title="t('dt.kodDeiOkei')">{{ t('dt.kodDeiOkei') }}</div>
          <!-- Единица доп. измерения жёстко привязана к коду ТН ВЭД: декларант вводит
               только количество, саму единицу править нельзя (требование 2026-09-23). -->
          <a-select v-model:value="item.unitCode" disabled :options="okeiOptions" :placeholder="t('dt.avto')" :title="t('dt.poKoduTnved')" />
        </div>
        <div class="zf-field zf-s2">
          <div class="zf-label" :title="t('dt.kodTipaKolVa')">{{ t('dt.kodTipaKolVa') }}</div>
          <a-select v-model:value="item.quantityTypeCode" :disabled="readonly" allow-clear
            :options="quantityTypeOptions" :placeholder="t('dt.rkRr')" :dropdown-match-select-width="false"
            @change="emit('update:modelValue', items.map(fromRow))" />
        </div>
        <div class="zf-field zf-s2">
          <div class="zf-label">{{ t('dt.bruttoKg') }}</div>
          <a-input v-model:value="item.grossWeightStr" :disabled="readonly" placeholder="—"
            @blur="syncNum(item, 'grossWeightKg', item.grossWeightStr)" />
        </div>
        <div class="zf-field zf-s2">
          <div class="zf-label">{{ t('dt.nettoKg') }}</div>
          <a-input v-model:value="item.netWeightStr" :disabled="readonly" placeholder="—"
            @blur="syncNum(item, 'netWeightKg', item.netWeightStr)" />
        </div>
        <div class="zf-field zf-s2">
          <div class="zf-label" :title="t('dt.kolVoGruzovyhMest')">{{ t('dt.gruzovyhMest') }}</div>
          <a-input v-model:value="item.packagesCountStr" :disabled="readonly" placeholder="—"
            @blur="syncNum(item, 'packagesCount', item.packagesCountStr)" />
        </div>
        <div class="zf-field zf-s3">
          <div class="zf-label">{{ t('dt.fakturnayaStoimost') }}</div>
          <a-input v-model:value="item.customsValueStr" :disabled="readonly" placeholder="—"
            @blur="syncNum(item, 'customsValue', item.customsValueStr)" />
        </div>
        <div class="zf-field zf-s3">
          <div class="zf-label">{{ t('dt.valyuta') }}<span v-if="lockedCurrency" class="zf-label-note"> · {{ t('dt.izGr22') }}</span></div>
          <a-select
            :value="lockedCurrency || item.currency"
            :disabled="readonly || !!lockedCurrency"
            show-search
            allow-clear
            :options="currencyOptions"
            :filter-option="filterCurrency"
            placeholder="USD"
            @change="(v: unknown) => setRowCurrency(item, (v as string) || null)"
          />
        </div>

        <!-- Поля, специфичные для ДТ Импорта 40 (стоимости гр.45/46, упаковка, льготы, процедура, ОИС,
             маркировка, платежи гр.47). Компонент слота раскладывается в эту же сетку (display: contents):
             порядок карточки повторяет порядок гр.31 в ДТ (декларант, 2026-09-23). -->
        <slot name="goods-extra" :item="item" :index="idx" :change="syncRows" />
      </div>

    </div>

    <TnvedPickerModal v-model:open="pickerOpen" :initial-query="pickerQuery" @select="onPickerSelect" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CloseOutlined, RightOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/message'
import type { UploadProps } from 'ant-design-vue'
import { tnvedApi } from '@/api/tnved'
import { referencesApi } from '@/api/references'
import TnvedPickerModal from '@/components/TnvedPickerModal.vue'
import { GOODS_EXCEL_MESSAGES, isExcelFileName, readGoodsExcel } from '@/utils/goodsExcel'
import TroisTrademarkHint from '@/components/import40/TroisTrademarkHint.vue'
import TariffOptionsHint from '@/components/import40/TariffOptionsHint.vue'
import type { ReestrGoodsItemInput } from '@/types/api'
import { OKEI_QUANTITY_TYPE_CODES } from '@/types/api'

const { t } = useI18n()

interface GoodsRow extends ReestrGoodsItemInput {
  quantityStr: string
  grossWeightStr: string
  netWeightStr: string
  packagesCountStr: string
  customsValueStr: string
  tnvedLoading?: boolean
  // Поля «бланка товара» Импорта 40 — приходят в том же объекте (см. fromRow: rest).
  tradeMarkName?: string | null
  productMarkName?: string | null
  productModelName?: string | null
  productArticle?: string | null
  manufacturerName?: string | null
  // Выбор по данным КЕДЕН (Импорт 40): вид акциза и вариант антидемпинга.
  exciseKind?: string | null
  antiDumpingKind?: string | null
  // Количества в единицах специфических ставок, которых нет в ДЕИ (см. TariffOptionsHint).
  taxVolumeL?: number | null
  taxAlcoholL?: number | null
  taxPieces?: number | null
  engineVolumeCm3?: number | null
}

const props = defineProps<{
  modelValue: ReestrGoodsItemInput[]
  readonly?: boolean
  // Опт-ин UPPERCASE для описания товара (Task 8c) — компонент общий с
  // транзитом (ReestrFormFields/DocumentPackageWorkspaceView), поэтому
  // по умолчанию выключено и не влияет на транзитное поведение.
  uppercase?: boolean
  // Пакет 6 №4: валюта сделки из гр.22 (dtForm.currency). Когда задана —
  // поле «Валюта» у каждого товара показывает её неактивной и синхронизируется
  // автоматически. undefined в транзите/реестре → прежнее поведение (выбор per-строка).
  lockedCurrency?: string | null
  /** Показывать «бланк товара» (марка/знак/модель/артикул/изготовитель) перед страной происхождения. */
  brandFields?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrGoodsItemInput[]): void
}>()

// Свёрнутые карточки товаров. В свёрнутом виде — номер, код, описание, стоимость, ТПиН.
// Ключ карточки — стабильный номер (keys[idx]), а не индекс: после удаления товара выше свёрнутость
// оставалась у номера строки и переезжала на соседнюю карточку. Строки пересоздаются при каждом
// возврате v-model, поэтому ключи ведём параллельным массивом: свои добавления/удаления двигают его
// вместе со строками, внешняя смена длины — дописывает/обрезает хвост (как раньше по индексу).
let lastKey = 0
const keys: number[] = []
const syncKeys = (n: number) => {
  while (keys.length < n) keys.push(++lastKey)
  keys.length = n
}
const collapsed = reactive(new Set<number>())
const isCollapsed = (i: number) => collapsed.has(keys[i])
const toggleCard = (i: number) => { if (isCollapsed(i)) collapsed.delete(keys[i]); else collapsed.add(keys[i]) }
const allCollapsed = computed(() => items.value.length > 0 && items.value.every((_, i) => isCollapsed(i)))
const toggleAll = () => {
  if (allCollapsed.value) collapsed.clear()
  else items.value.forEach((_, i) => collapsed.add(keys[i]))
}
const fmtNum = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const paymentsTotal = (item: GoodsRow) =>
  ((item as GoodsRow & { payments?: { amountKzt?: number | null }[] }).payments ?? [])
    .reduce((sum, p) => sum + (p.amountKzt ?? 0), 0)

// Пикер ТН ВЭД (поиск по дереву/коду + ставки/разрешения) для конкретной строки товара
const pickerOpen = ref(false)
const pickerTarget = ref<GoodsRow | null>(null)
const pickerQuery = ref('')
// Справочник открываем сразу на уже введённом коде: декларант жмёт «Справочник»,
// чтобы уточнить/досмотреть СВОЙ код, а не искать его заново (2026-09-23).
const openPicker = (item: GoodsRow) => {
  pickerTarget.value = item
  pickerQuery.value = (item.tnvedCode ?? '').trim()
  pickerOpen.value = true
}
const onPickerSelect = (payload: { code: string; name: string }) => {
  const t = pickerTarget.value
  if (!t) return
  t.tnvedCode = payload.code
  tnvedCodeValid.value[payload.code] = true
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
  void validateAllTnved()
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

// Кэш проверок кодов на время жизни экрана: в ДТ один и тот же код обычно
// повторяется у нескольких товаров, дёргать справочник на каждый blur незачем.
// Ошибка у поля — по этому кэшу (код проверен и его нет в справочнике), а не флагом в строке:
// флаг уходил в данные товара (разбор B.13) и терялся бы при пересборке строк из v-model.
const tnvedCodeValid = ref<Record<string, boolean>>({})
const isTnvedInvalid = (item: GoodsRow) => {
  const code = (item.tnvedCode || '').trim()
  return !!code && tnvedCodeValid.value[code] === false
}

async function validateTnved(item: GoodsRow) {
  const code = (item.tnvedCode || '').trim()
  if (!code || code in tnvedCodeValid.value) return
  try {
    const res = await tnvedApi.node(code)
    tnvedCodeValid.value[code] = res.data.is10
  } catch {
    tnvedCodeValid.value[code] = false
  }
}

// Проверяем коды у уже сохранённых товаров при открытии — иначе ошибочный код
// (пришедший из КП/импорта) остаётся незаметным до расчёта платежей.
async function validateAllTnved() {
  for (const item of items.value) {
    if (item.tnvedCode) await validateTnved(item)
  }
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
    tnvedCodeValid.value[code] = true
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

/** Отдаёт наверх изменённый список товаров — вызывается и из слота с полями ДТ. */
function syncRows() {
  emit('update:modelValue', items.value.map(fromRow))
}

function fromRow(r: GoodsRow): ReestrGoodsItemInput {
  // rest сохраняет расширенные поля (например КЕДЕН-поля Импорта 40),
  // которые этот компонент не знает и не должен терять. tnvedInvalid — служебный флаг прежних версий:
  // мог прийти в modelValue, на сервер его не отправляем.
  const { quantityStr, grossWeightStr, netWeightStr, packagesCountStr, customsValueStr, tnvedLoading, tnvedInvalid, ...rest } =
    r as GoodsRow & { tnvedInvalid?: boolean }
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

// Пакет 6 №4: изменение валюты одного товара (когда gr.22 не задаёт lockedCurrency).
function setRowCurrency(item: GoodsRow, v: string | null) {
  item.currency = v || null
  emit('update:modelValue', items.value.map(fromRow))
}

// Синхронизирует валюту всех товаров с lockedCurrency (гр.22). Эмитит только при
// реальном изменении → сходится за один цикл, без бесконечного watch-петли.
function applyLockedCurrency() {
  const locked = props.lockedCurrency
  if (!locked) return
  let changed = false
  for (const it of items.value) {
    if (it.currency !== locked) {
      it.currency = locked
      changed = true
    }
  }
  if (changed) emit('update:modelValue', items.value.map(fromRow))
}

watch(
  () => props.modelValue,
  (v) => {
    items.value = (v ?? []).map(toRow)
    syncKeys(items.value.length)
    applyLockedCurrency()
  },
  { immediate: true },
)

watch(() => props.lockedCurrency, applyLockedCurrency)

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
    currency: props.lockedCurrency || 'USD',
    quantityStr: '',
    grossWeightStr: '',
    netWeightStr: '',
    packagesCountStr: '',
    customsValueStr: '',
  })
  syncKeys(items.value.length)
  emit('update:modelValue', items.value.map(fromRow))
}

function removeItem(idx: number) {
  collapsed.delete(keys[idx])
  keys.splice(idx, 1)
  items.value.splice(idx, 1)
  emit('update:modelValue', items.value.map(fromRow))
}

// ── Импорт товаров из Excel «КЕДЕН ШАПКА» (разбор — goodsExcel.ts, общий с записью транзита) ──────────
const excelBusy = ref(false)

async function importGoodsFromExcel(file: File) {
  excelBusy.value = true
  try {
    const result = await readGoodsExcel(file)
    if ('problem' in result) {
      message.warning(t(GOODS_EXCEL_MESSAGES[result.problem]))
      return
    }
    const added = result.goods.map(toRow)
    items.value = [...items.value, ...added]
    syncKeys(items.value.length)
    emit('update:modelValue', items.value.map(fromRow))
    message.success(t('dt.zagruzhenoTovarov', { n: added.length }))
  } catch (e) {
    console.error('Failed to import goods from Excel', e)
    message.error(t('dt.neUdalosProchitatFayl'))
  } finally {
    excelBusy.value = false
  }
}

const onExcelFile: UploadProps['beforeUpload'] = (file) => {
  if (!isExcelFileName(file.name)) {
    message.error(t('dt.dopustimTolkoExcel'))
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

.goods-card {
  border: 1px solid var(--z-line);
  border-radius: 10px;
  padding: 14px 18px 18px;
  background: var(--z-surface);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--z-line);
}

.card-num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--z-teal-soft);
  color: var(--z-teal-d);
  font-size: 12px;
  font-weight: 700;
}

.card-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--z-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-title b { color: var(--z-ink); }
.card-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--z-ink); }

.del-btn { flex: none; }
:not(#z) .collapse-btn { flex: none; padding: 0 4px; color: var(--z-muted); }
.collapse-btn :deep(.anticon) { transition: transform 0.15s; }
.collapse-btn :deep(.anticon.open) { transform: rotate(90deg); }
.card-sum { flex: none; font-size: 13px; color: var(--z-ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
:not(#z) .collapse-all { padding: 0; }

:not(#z) .tnved-group { display: flex; }
.tnved-group .tnved-input { flex: 1; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.field-error {
  font-size: 12px;
  color: var(--z-danger);
}
</style>
