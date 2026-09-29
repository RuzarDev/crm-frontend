<!-- Поля КЕДЕН по одному товару (упаковка, преференции, процедура, стоимости,
     ОИС, маркировка, платежи гр.47). Живут прямо в карточке товара под «Производителем»
     — по требованию декларанта всё о товаре заполняется в одном месте (2026-09-23). -->
<template>
  <div class="keden-fields">
    <div v-if="good.needsTpinRecalc || hasReducedVat(good)" class="keden-flags">
      <a-tag v-if="good.needsTpinRecalc" color="orange">{{ t('dt.pereschitatTpin') }}</a-tag>
      <a-tooltip v-if="hasReducedVat(good)" :title="t('dt.ponizhennyyNds5Primenyaetsya')">
        <a-tag color="green">{{ t('dt.nds5') }}</a-tag>
      </a-tooltip>
    </div>
    <!-- Упаковка (гр.31) — единой строкой: наличие/вид/кол-во упаковок/грузомест -->
    <div class="section-bar"><span class="section-label">{{ t('dt.upakovkaGr31') }}</span></div>
    <div class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.nalichieUpakovki') }}</div>
        <a-select v-model:value="good.packageAvailabilityCode" size="small" :disabled="readonly" show-search
          :options="packagingAvailabilityOptions" :dropdown-match-select-width="false" allow-clear
          :get-popup-container="popupContainer" placeholder="0/1/2" @change="emitChange" /></div>
      <div class="field field-wide" style="min-width: 260px"><div class="field-label">{{ t('dt.vidUpakovki') }}</div>
        <a-select v-model:value="good.packageKindCode" size="small" :disabled="readonly" show-search allow-clear
          :options="pkgOptions" option-filter-prop="label" :dropdown-match-select-width="false" placeholder="PK"
          style="width: 100%" :get-popup-container="popupContainer" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.kolichestvoUpakovok') }}</div>
        <a-input-number v-model:value="good.packageQuantity" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="emitChange" /></div>
      <!-- «Кол-во грузовых мест» — одно поле, в карточке товара выше (packagesCount); cargoPlacesQuantity
           синхронизируется с ним автоматически (DtSectionGoods), дубля здесь больше нет. -->
    </div>
    <div class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.preferenciyaSbor') }}</div>
        <a-select v-model:value="good.prefClearanceCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefFeeOptions" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" placeholder="ОО" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.poshlina') }}</div>
        <a-select v-model:value="good.prefDutyCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefDutyOptions" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" placeholder="ОО" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.akciz') }}</div>
        <a-select v-model:value="good.prefExciseCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefExciseOptions" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" placeholder="Z" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.nds') }} <a-tooltip v-if="hasReducedVat(good)" :title="t('dt.ponizhennyyNds5Primenyaetsya')">
            <a-tag color="green" style="margin-left: 4px">5%</a-tag>
          </a-tooltip>
        </div>
        <a-select v-model:value="good.prefVatCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefVatOptions" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" placeholder="ОО" style="width: 100%" @change="emitChange" /></div>
    </div>
    <div v-if="containerIndicator" class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.nomerKonteyneraGr313') }}</div>
        <a-input v-uppercase v-model:value="good.containerNumber" size="small" :disabled="readonly" placeholder="GLDU9071686" @change="emitChange" /></div>
    </div>
    <div class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.proceduraGr37') }}</div>
        <a-select v-model:value="good.procedureCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="procOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" placeholder="40" style="width: 100%" @change="emitChange" /></div>
      <div class="field field-wide"><div class="field-label">{{ t('dt.predshProceduraGr37') }}</div>
        <a-select v-model:value="good.previousProcedureCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="procOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" placeholder="00" style="width: 100%" @change="emitChange" /></div>
      <div class="field field-wide"><div class="field-label">{{ t('dt.osobennostPeremescheniya') }}</div>
        <a-select v-model:value="good.goodsMoveFeatureCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="moveFeatureOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" placeholder="000" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.metodTsGr43') }}</div>
        <a-select v-model:value="good.valuationMethodCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="valuationOptions" :get-popup-container="popupContainer" placeholder="1" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.kvotaGr39') }}</div>
        <a-input-number v-model:value="good.quotaAmount" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.kolVoMesyacevVrem') }}</div>
        <a-input-number v-model:value="good.tempImportMonths" size="small" :disabled="readonly" :min="0" :precision="0" style="width: 100%" placeholder="0" @change="emitChange" /></div>
    </div>
    <div class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.tamozhennayaStoimostGr45') }}</div>
        <a-input-number v-model:value="good.customsValueKzt" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="onCustomsValueChange(good)" /></div>
      <div class="field"><div class="field-label">{{ t('dt.statisticheskayaUsdGr46') }} <a-tooltip :title="t('dt.avtoTamozhennayaStoimostGr45')">
            <QuestionCircleOutlined style="margin-left: 4px; color: var(--z-text-secondary, #999)" />
          </a-tooltip>
        </div>
        <a-input-number v-model:value="good.statisticValueUsd" size="small" :disabled="readonly" :min="0" style="width: 100%" @change="emitChange" /></div>
    </div>
    <div class="field-row">
      <div class="field f-2"><div class="field-label">{{ t('dt.sertifikaciyaEkspKontrol') }}</div>
        <a-select :value="certificationArray(good)" mode="tags" size="small" :disabled="readonly"
          :options="certificationOptions" :dropdown-match-select-width="false" allow-clear
          option-filter-prop="label" :token-separators="[';']" :get-popup-container="popupContainer"
          :placeholder="t('dt.vyberiteIliVvedite')"
          @change="(v: string[]) => onCertificationChange(good, v)" /></div>
    </div>

    <!-- ОИС / признаки соблюдения запретов (гр.33 «О») -->
    <div class="section-bar">
      <span class="section-label">{{ t('dt.oisZapretyGr33O') }}</span>
      <a-button v-if="!readonly && otherGoods.length" type="link" size="small" @click="openCopy">
        <CopyOutlined /> {{ t('dt.kopirovatVTovary') }}
      </a-button>
    </div>
    <div class="field-row">
      <div class="field"><div class="field-label">{{ t('dt.ois') }}</div>
        <a-select v-model:value="good.oisIndicatorCode" size="small" :disabled="readonly" show-search
          :options="oisIndicatorOptions" :dropdown-match-select-width="false" allow-clear
          :get-popup-container="popupContainer" placeholder="I/N/S" @change="emitChange" /></div>
      <div class="field field-wide"><div class="field-label">{{ t('dt.priznakiSoblyudeniyaZapretov') }}</div>
        <a-select :value="restrictionMarksArray(good)" mode="multiple" size="small" :disabled="readonly"
          :options="restrictionMarksOptions" :dropdown-match-select-width="false" allow-clear
          :max-tag-count="4" :get-popup-container="popupContainer" :placeholder="t('dt.sMP')"
          class="ois-marks-select" @change="(v: string[]) => onRestrictionMarksChange(good, v)">
          <template #tag="{ value: markValue, onClose }">
            <a-tag class="ois-mark-tag" :title="restrictionMarkLabel(markValue)" closable @close="onClose">{{ markValue }}</a-tag>
          </template>
        </a-select></div>
      <div class="field f-2"><div class="field-label">{{ t('dt.priznakiNetarifnogoGr33') }}
          <a-tooltip :title="t('dt.priznakiNetarifnogoHint')">
            <QuestionCircleOutlined style="margin-left: 4px; color: var(--z-text-secondary, #999)" />
          </a-tooltip>
        </div>
        <!-- Справочник кодов (Приказ МФ РК №259) с поиском по коду и словам; свой код можно вписать — тогда предупреждение. -->
        <a-select :value="featureCodesArray(good)" mode="tags" size="small" :disabled="readonly"
          :options="prohibitionOptions" option-label-prop="value" option-filter-prop="label"
          :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '620px' }" allow-clear
          :token-separators="[',', ';']" :get-popup-container="popupContainer"
          :placeholder="t('dt.kodyGr33Placeholder')"
          :status="invalidFeatureCodes(good.prohibitionCode).length || unknownFeatureCodes(good).length ? 'warning' : undefined"
          @change="(v: string[]) => onFeatureCodesChange(good, v)">
          <template #tag="{ value: codeValue, onClose }">
            <a-tag class="ois-mark-tag" :title="prohibitionTitle(codeValue)" :closable="!readonly" @close="onClose">{{ codeValue }}</a-tag>
          </template>
        </a-select>
        <div v-if="invalidFeatureCodes(good.prohibitionCode).length" class="field-hint-warn">
          {{ t('dt.priznakiNetarifnogoFormat', { codes: invalidFeatureCodes(good.prohibitionCode).join(', ') }) }}
        </div>
        <div v-else-if="unknownFeatureCodes(good).length" class="field-hint-warn">
          {{ t('dt.kodyNeVSpravochnike', { codes: unknownFeatureCodes(good).join(', ') }) }}
        </div>
        <!-- Подсказки по ТН ВЭД из KEDEN: ничего не подставляем сами — коды выбирает декларант (юридическая ответственность). -->
        <div v-if="!readonly && suggest.tnved" class="sug-row">
          <a-spin v-if="suggest.loading" size="small" />
          <template v-else-if="suggest.codes.length">
            <span class="sug-label">{{ t('dt.podskazkiPoTnved', { code: suggest.tnved }) }}</span>
            <a-tag v-for="c in suggest.codes" :key="c.code" class="sug-chip" :class="{ 'sug-chip-on': isFeatureSelected(good, c.code) }"
              :title="c.name ?? c.code" @click="addFeatureCode(good, c.code)">{{ c.code }}</a-tag>
            <a-tooltip :title="t('dt.dobavitNePodpadaetHint')">
              <a-button v-if="negativeToAdd(good).length" type="link" size="small" class="sug-neg" @click="addNegativeCodes(good)">
                {{ t('dt.dobavitNePodpadaet') }}
              </a-button>
            </a-tooltip>
            <span v-if="suggest.warning" class="sug-note">{{ t('dt.podskazkiStale') }}</span>
          </template>
          <span v-else class="sug-note">{{ suggest.failed ? t('dt.podskazkiNedostupny') : t('dt.podskazkiPusto') }}</span>
        </div>
        </div>
      <div class="field"><div class="field-label">{{ t('dt.regPoOis') }}</div>
        <a-input v-uppercase v-model:value="good.oisRegNumber" size="small" :disabled="readonly" @change="emitChange" /></div>
      <div class="field"><div class="field-label">{{ t('dt.kodStranyOis') }}</div>
        <a-input v-uppercase v-model:value="good.oisCountryCode" size="small" :disabled="readonly" :maxlength="2" @change="emitChange" /></div>
    </div>

    <!-- Маркировка товаров (гр.31.13) — коллекция: один товар может иметь
         несколько строк маркировки (Task 2 бэк заменил одиночные скаляры) -->
    <a-collapse ghost class="marking-collapse">
      <a-collapse-panel key="marking" :header="t('dt.markirovkaTovarovGr3113') + ((good.markings?.length ?? 0) ? ` — ${good.markings?.length}` : '')">
        <div v-for="(m, mi) in (good.markings ?? [])" :key="mi" class="marking-block">
          <div class="field-row">
            <div class="field"><div class="field-label">{{ t('dt.posleVypuska') }}</div>
              <a-checkbox v-model:checked="m.markingAfterRelease" :disabled="readonly" @change="emitChange">{{ t('dt.markirovkaPosleVypuska') }}</a-checkbox></div>
            <div class="field"><div class="field-label">{{ t('dt.kolVoKiz') }}</div>
              <a-input-number v-model:value="m.kizCount" size="small" :disabled="readonly" :min="0" :precision="0" style="width: 100%" @change="emitChange" /></div>
            <div class="field"><div class="field-label">{{ t('dt.agregaciya') }}</div>
              <a-checkbox v-model:checked="m.aggregated" :disabled="readonly" @change="emitChange">{{ t('dt.agregirovannayaUpakovka') }}</a-checkbox></div>
            <div class="field marking-remove">
              <a-button v-if="!readonly" type="text" danger size="small" @click="removeMarking(good, m)"><CloseOutlined /> {{ t('dt.udalit') }}</a-button></div>
          </div>
          <div class="field-row">
            <div class="field"><div class="field-label">{{ t('dt.kodUrovnyaMarkirovki') }}</div>
              <a-select v-model:value="m.levelCode" size="small" :disabled="readonly" show-search allow-clear
                :options="MARKING_LEVEL_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
                :get-popup-container="popupContainer" placeholder="0–4" @change="emitChange" /></div>
            <div class="field"><div class="field-label">{{ t('dt.kodVidaIdentifikacii') }}</div>
              <a-select v-model:value="m.idTypeCode" size="small" :disabled="readonly" show-search allow-clear
                :options="MARKING_ID_TYPE_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
                :get-popup-container="popupContainer" placeholder="101/301…" @change="emitChange" /></div>
            <div class="field"><div class="field-label">{{ t('dt.kodIdentifikatoraPrimeneniya') }}</div>
              <a-select v-model:value="m.idApplicationCode" size="small" :disabled="readonly" show-search allow-clear
                :options="MARKING_ID_APPLICATION_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
                :get-popup-container="popupContainer" placeholder="00/01/02…" @change="emitChange" /></div>
            <div class="field f-2"><div class="field-label">{{ t('dt.nomerMarkirovki') }}</div>
              <a-input v-uppercase v-model:value="m.number" size="small" :disabled="readonly" @change="emitChange" /></div>
          </div>
        </div>
        <div v-if="!(good.markings?.length)" class="marking-empty">{{ t('dt.strokMarkirovkiNet') }}</div>
        <div class="marking-actions">
          <a-button v-if="!readonly" type="dashed" size="small" @click="addMarking(good)">{{ t('dt.dobavitMarkirovku') }}</a-button>
          <a-upload v-if="!readonly" :show-upload-list="false" accept=".xlsx,.xls"
            :before-upload="(file: File) => importMarkingsFromExcel(good, file)">
            <a-button type="dashed" size="small"><UploadOutlined /> {{ t('dt.importIzExcel') }}</a-button>
          </a-upload>
          <span class="marking-hint">{{ t('dt.excelNomerUrovenIdentifikator') }}</span>
        </div>
      </a-collapse-panel>
    </a-collapse>

    <div class="section-bar payments-bar">
      <span class="section-label">{{ t('dt.platezhiGr47') }}</span>
      <a-tag v-if="good.tempImportMonths" color="blue">{{ t('dt.vremVvoz', { months: good.tempImportMonths }) }}</a-tag>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addPayment(good)">{{ t('dt.stroka') }}</a-button>
    </div>
    <div v-for="(p, pi) in sortedPayments(good)" :key="pi" class="payment-row">
      <a-select v-model:value="p.taxModeCode" size="small" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="taxModeOptions" :placeholder="t('dt.vid2010')" style="width: 140px" :get-popup-container="popupContainer" @change="emitChange" />
      <a-input-number v-model:value="p.taxBase" size="small" :disabled="readonly" :placeholder="t('dt.osnova')" style="width: 130px" @change="emitChange" />
      <!-- Task 10, №13: вид ставки/дата НЕ обязательны для показа сумм — суммы гр.47
           уже заполнены "Рассчитать платежи"/"Рассчитать ТПиН" выше (см. сводную
           таблицу и applyPaymentsResult); эти поля — необязательное ручное уточнение
           (например, для весовых ставок '*'), поэтому оба с allow-clear. -->
      <a-select v-model:value="p.rateKindCode" size="small" :disabled="readonly" :options="rateKindOptions" allow-clear :placeholder="t('dt.vidStavkiAvto')" style="width: 130px" :get-popup-container="popupContainer" @change="emitChange" />
      <a-input-number v-model:value="p.rateValue" size="small" :disabled="readonly" :placeholder="t('dt.stavka')" style="width: 100px" @change="emitChange" />
      <template v-if="p.rateKindCode === '*'">
        <a-input v-model:value="p.rateUnitCode" size="small" :disabled="readonly" :placeholder="t('dt.okei166')" style="width: 90px" @change="emitChange" />
        <a-input v-model:value="p.rateCurrencyCode" size="small" :disabled="readonly" :placeholder="t('dt.valyutaN3978')" style="width: 110px" @change="emitChange" />
        <a-input-number v-model:value="p.weightRatio" size="small" :disabled="readonly" :placeholder="t('dt.koef')" style="width: 80px" @change="emitChange" />
      </template>
      <a-date-picker v-model:value="p.rateDate" size="small" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :placeholder="t('dt.dataAvto')" style="width: 130px" allow-clear @change="emitChange" />
      <a-input-number v-model:value="p.amountKzt" size="small" :disabled="readonly" :placeholder="t('dt.summa')" style="width: 130px" @change="emitChange" />
      <a-button v-if="!readonly" type="text" danger size="small" @click="removePayment(good, p)"><CloseOutlined /></a-button>
    </div>

    <!-- Копирование ОИС / МНР (признаков запретов) в выбранные товары: у партии
         однотипных товаров эти поля совпадают, но не всегда у всех — поэтому
         выбор товаров, а не «применить ко всем» (декларант, 2026-09-23). -->
    <a-modal v-model:open="copyOpen" :title="t('dt.kopirovatOisIMnr')" :ok-text="t('dt.kopirovat')"
      :cancel-text="t('dt.otmena')" :ok-button-props="{ disabled: !copyTargets.length }" @ok="applyCopy">
      <div class="copy-what">
        <div class="field-label">{{ t('dt.chtoKopirovat') }}</div>
        <a-checkbox v-model:checked="copyOis">{{ t('dt.oisIndikatorRegStrana') }}</a-checkbox>
        <a-checkbox v-model:checked="copyMarks">{{ t('dt.mnrPriznakiZapretov') }}</a-checkbox>
        <a-checkbox v-model:checked="copyCert">{{ t('dt.sertifikaciyaEkspKontrol') }}</a-checkbox>
      </div>
      <div class="copy-head">
        <span class="field-label">{{ t('dt.vKakieTovary') }}</span>
        <a-button type="link" size="small" @click="toggleAllTargets">
          {{ allTargetsSelected ? t('dt.snyatVse') : t('dt.vybratVse') }}
        </a-button>
      </div>
      <a-checkbox-group v-model:value="copyTargets" class="copy-list">
        <a-checkbox v-for="o in otherGoods" :key="o.index" :value="o.index" class="copy-item">{{ o.title }}</a-checkbox>
      </a-checkbox-group>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CloseOutlined, CopyOutlined, QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import * as XLSX from 'xlsx'
import type { Import40GoodsItemInput, Import40GoodsPayment, Import40GoodsMarking } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { FEATURE_CODE_RE, invalidFeatureCodes, joinFeatureCodes, splitFeatureCodes } from '@/utils/nonTariffCodes'
import { prohibitionCodesApi, type ProhibitionCodeItem, type SuggestedProhibitionCode } from '@/api/prohibitionCodes'

const { t } = useI18n()

const props = defineProps<{
  /** Редактируемый товар — объект строки из списка товаров ДТ (мутируется на месте). */
  good: Import40GoodsItemInput
  readonly?: boolean
  /** гр.19: поле «Номер контейнера» показываем только при контейнерной перевозке. */
  containerIndicator?: boolean
  /** Курс USD на дату гр.А — для авторасчёта статистической стоимости (гр.46). */
  usdRate?: number | null
  /** Все товары ДТ и номер текущего — нужны для копирования ОИС/МНР в выбранные товары. */
  allGoods?: Import40GoodsItemInput[]
  index?: number
}>()

const emit = defineEmits<{ (e: 'change'): void }>()

/** Сообщаем родителю, что товар изменился: список товаров пересобирается и уходит наверх. */
const emitChange = () => emit('change')

const popupContainer = () => document.body

// Item I (гр.46 статистическая стоимость, USD): авто = таможенная стоимость
// (гр.45, ₸) / курс доллара на дату гр.А. Поле остаётся редактируемым — авто-
// расчёт срабатывает только когда значение ещё пустое (0/null) или когда
// декларант меняет гр.45 (явное действие). Ручной ввод в гр.46 сохраняется до
// следующего изменения гр.45.

const calcStatUsd = (customsValueKzt: number | null | undefined): number | null => {
  const rate = props.usdRate
  if (!rate || rate <= 0 || customsValueKzt == null) return null
  return Math.round((customsValueKzt / rate) * 100) / 100
}

// Изменение гр.45 → пересчитать гр.46 (если курс известен), затем sync.
// (sync объявлена ниже; вызывается только по событию — TDZ не задевает.)

const onCustomsValueChange = (g: Import40GoodsItemInput) => {
  const stat = calcStatUsd(g.customsValueKzt)
  if (stat != null) g.statisticValueUsd = stat
  emitChange()
}

// Русские названия видов платежа гр.47 (см. tax-modes в DatabaseExtensions.cs
// на бэке) — для явной, не-кодовой подписи в сводной таблице ниже.

const TAX_MODE_PRIORITY: Record<string, number> = { '1010': 0, '2010': 1, '5060': 2 }

const taxModePriority = (code: string | null | undefined) =>
  code != null && code in TAX_MODE_PRIORITY ? TAX_MODE_PRIORITY[code] : 99

const sortedPayments = (g: Import40GoodsItemInput): Import40GoodsPayment[] =>
  [...(g.payments ?? [])].sort((a, b) => taxModePriority(a.taxModeCode) - taxModePriority(b.taxModeCode))

// Task 6 (follow-ups): применённый пониженный НДС (5%) — display-only, без пересчёта
// на клиенте. Источник истины — гр.47/5060 (НДС) с последнего расчёта (rateLabel
// начинается с "5%": сервер сам определяет ставку по коду ТНВЭД, см. Import40PaymentCalculator
// Task 5) ЛИБО ручной флаг vatRatePreferential=0.05 (переключатель «Медизделие»,
// см. DtPaymentsCalcModal/Import40DtView), пока расчёт ещё не проведён. Если нет ни
// того, ни другого — бейдж не показываем (не гадаем).

const hasReducedVat = (g: Import40GoodsItemInput): boolean => {
  if (g.vatRatePreferential === 0.05) return true
  const vatPayment = (g.payments ?? []).find((p) => p.taxModeCode === '5060')
  return !!vatPayment?.rateLabel?.startsWith('5%')
}

interface PaymentsSummaryRow {
  key: string
  goods: string
  taxMode: string
  base: number | null
  rate: number | null
  amount: number | null
  // Task 10: подписи из calculate-payments (basisLabel/rateLabel/паспорт СП) —
  // приоритет над числовыми base/rate в отображении (см. bodyCell в шаблоне).
  basisLabel: string | null
  rateLabel: string | null
  featureCode: string | null
}

// Task 10, №9: колонки гр.47 — Вид / Основа начисления / Ставка / Сумма / СП
// (мнемоника формы — "способ платежа" гр.47).

const classifiers = useClassifiersStore()

const pkgOptions = computed(() => classifiers.options('2013'))

// Гр.36: у каждого вида платежа свой перечень льгот (классификатор ЕЭК 2008, разделы ЕАЭС и РК) —
// одинаковые коды значат разное (ПП, МД, БГ…). Раньше на все четыре подграфы был один список «ОО, Z».
// «Без льгот» (ОО/О) и «Z» — первыми, остальные по коду; полный текст — в подсказке пункта.
const PREF_PINNED = ['ОО', 'О', 'Z']
const prefOptionsOf = (classifierCode: string) => computed(() =>
  [...(classifiers.cache[classifierCode] ?? [])]
    .sort((a, b) => {
      const pa = PREF_PINNED.indexOf(a.code)
      const pb = PREF_PINNED.indexOf(b.code)
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
      return a.code.localeCompare(b.code, 'ru')
    })
    .map((c) => ({ value: c.code, label: `${c.code} — ${c.nameRu}`, title: `${c.code} — ${c.nameRu}` })))
const prefFeeOptions = prefOptionsOf('pref-fee')
const prefDutyOptions = prefOptionsOf('pref-duty')
const prefExciseOptions = prefOptionsOf('pref-excise')
const prefVatOptions = prefOptionsOf('pref-vat')

const taxModeOptions = computed(() => classifiers.options('tax-modes'))

const rateKindOptions = computed(() => classifiers.options('rate-kinds'))

const valuationOptions = computed(() => classifiers.options('2005'))

const procOptions = computed(() => classifiers.options('customs-procedures'))

const moveFeatureOptions = computed(() => classifiers.options('movement-features'))

const packagingAvailabilityOptions = computed(() => classifiers.options('packaging-availability'))

const oisIndicatorOptions = computed(() => classifiers.options('ois-indicators'))

const restrictionMarksOptions = computed(() => classifiers.options('restriction-marks'))

// g.restrictionMarks хранится строкой CSV («С,М,П»), т.к. так задан контракт бэка
// (Task 1); UI — multi-select, поэтому туда/обратно конвертируем через запятую.

const restrictionMarksArray = (g: Import40GoodsItemInput): string[] =>
  (g.restrictionMarks ?? '').split(',').map((s) => s.trim()).filter(Boolean)

// Полная подпись признака по коду — для tooltip на компактном теге (в теге только
// код, иначе длинные подписи перекрывают соседние поля гр.33).

const restrictionMarkLabel = (code: string): string =>
  restrictionMarksOptions.value.find((o) => o.value === code)?.label ?? code

// Признаки нетарифного регулирования (гр.33, XML: ProhibitionCode) — открытый список кодов вида D0110;
// хранится строкой через запятую в goods.prohibitionCode, нормализация — в utils/nonTariffCodes.
const featureCodesArray = (g: Import40GoodsItemInput): string[] => splitFeatureCodes(g.prohibitionCode)

const onFeatureCodesChange = (g: Import40GoodsItemInput, values: string[]) => {
  g.prohibitionCode = joinFeatureCodes(values)
  emitChange()
}

// Справочник кодов гр.33 (ref_prohibition_codes): грузится один раз на сессию; если не загрузился —
// поле работает как свободный ввод (предупреждение «нет в справочнике» тогда не показываем).
const prohibitionRef = ref<ProhibitionCodeItem[]>([])
const prohibitionByCode = computed(() => new Map(prohibitionRef.value.map((c) => [c.code, c])))
const shorten = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const prohibitionOptions = computed(() => {
  const groups = new Map<string, { label: string; options: { value: string; label: string; title: string }[] }>()
  for (const c of prohibitionRef.value) {
    let grp = groups.get(c.categoryCode)
    if (!grp) {
      grp = { label: `${c.categoryCode} — ${shorten(c.categoryName, 70)}`, options: [] }
      groups.set(c.categoryCode, grp)
    }
    grp.options.push({ value: c.code, label: `${c.code} — ${shorten(c.name, 90)}`, title: c.name })
  }
  return [...groups.values()]
})
const prohibitionTitle = (code: string) => prohibitionByCode.value.get(code)?.name ?? code
const unknownFeatureCodes = (g: Import40GoodsItemInput): string[] =>
  prohibitionRef.value.length
    ? featureCodesArray(g).filter((c) => FEATURE_CODE_RE.test(c) && !prohibitionByCode.value.has(c))
    : []

onMounted(async () => {
  try { prohibitionRef.value = await prohibitionCodesApi.list() } catch { /* справочник необязателен: ввод остаётся свободным */ }
})

// Подсказки кодов по ТН ВЭД товара (из «Справки по товару» KEDEN). Клик по чипу добавляет код —
// сами ничего не подставляем: набор кодов выбирает декларант.
const suggest = reactive({
  tnved: '', loading: false, failed: false, warning: false, codes: [] as SuggestedProhibitionCode[],
})
let suggestSeq = 0
const loadSuggestions = async (raw: string | null | undefined) => {
  const tnved = (raw ?? '').replace(/\D/g, '')
  const seq = ++suggestSeq
  if (tnved.length !== 10) { suggest.tnved = ''; suggest.codes = []; return }
  suggest.tnved = tnved; suggest.loading = true; suggest.failed = false; suggest.warning = false; suggest.codes = []
  try {
    const r = await prohibitionCodesApi.suggest(tnved)
    if (seq !== suggestSeq) return
    suggest.codes = r.codes; suggest.warning = r.stale && r.codes.length > 0
    suggest.failed = r.stale && r.codes.length === 0
  } catch {
    if (seq === suggestSeq) suggest.failed = true
  } finally {
    if (seq === suggestSeq) suggest.loading = false
  }
}
watch(() => props.good.tnvedCode, (v) => { void loadSuggestions(v) }, { immediate: true })

const isFeatureSelected = (g: Import40GoodsItemInput, code: string) => featureCodesArray(g).includes(code)
const addFeatureCode = (g: Import40GoodsItemInput, code: string) => {
  if (props.readonly || isFeatureSelected(g, code)) return
  onFeatureCodesChange(g, [...featureCodesArray(g), code])
}
// «Не подпадает»: только подсказанные коды вида XX00 (C1700, C2000, D0100…), которых ещё нет в поле.
const negativeToAdd = (g: Import40GoodsItemInput) =>
  suggest.codes.filter((c) => c.isNegative && !isFeatureSelected(g, c.code))
const addNegativeCodes = (g: Import40GoodsItemInput) => {
  const add = negativeToAdd(g).map((c) => c.code)
  if (props.readonly || !add.length) return
  onFeatureCodesChange(g, [...featureCodesArray(g), ...add])
}

const onRestrictionMarksChange = (g: Import40GoodsItemInput, values: string[]) => {
  g.restrictionMarks = values.length ? values.join(',') : null
  emitChange()
}

// Сертификация / экспортный контроль (гр.33): справочника «код ТНВЭД → сертификация»
// не существует, поэтому список открытый (mode="tags"): подсказки из классификатора
// certification-kinds, но декларант может вписать и свой вариант. Хранится строкой
// через «; » — поле на бэке свободнотекстовое (certificationNote).

const certificationOptions = computed(() => classifiers.options('certification-kinds'))

const certificationArray = (g: Import40GoodsItemInput): string[] =>
  (g.certificationNote ?? '').split(';').map((x) => x.trim()).filter(Boolean)

const onCertificationChange = (g: Import40GoodsItemInput, values: string[]) => {
  const cleaned = values.map((v) => v.trim()).filter(Boolean)
  g.certificationNote = cleaned.length ? cleaned.join('; ') : null
  emitChange()
}

// ── копирование ОИС / МНР в выбранные товары ──
// Однотипная партия: индикатор ОИС и признаки запретов у товаров обычно совпадают,
// но не обязательно у всех — поэтому копируем в отмеченные, а не «во все».

const copyOpen = ref(false)
const copyTargets = ref<number[]>([])
const copyOis = ref(true)
const copyMarks = ref(true)
const copyCert = ref(false)

const otherGoods = computed(() =>
  (props.allGoods ?? [])
    .map((g, i) => ({
      index: i,
      title: `${i + 1}. ${[g.tnvedCode, g.description || g.tnvedDescription].filter(Boolean).join(' · ') || t('dt.bezOpisaniya')}`,
    }))
    .filter((o) => o.index !== props.index))

const allTargetsSelected = computed(() =>
  otherGoods.value.length > 0 && copyTargets.value.length === otherGoods.value.length)

const openCopy = () => {
  copyTargets.value = otherGoods.value.map((o) => o.index)
  copyOpen.value = true
}

const toggleAllTargets = () => {
  copyTargets.value = allTargetsSelected.value ? [] : otherGoods.value.map((o) => o.index)
}

const applyCopy = () => {
  const goods = props.allGoods ?? []
  const src = props.good
  for (const i of copyTargets.value) {
    const target = goods[i]
    if (!target) continue
    if (copyOis.value) {
      target.oisIndicatorCode = src.oisIndicatorCode ?? null
      target.oisRegNumber = src.oisRegNumber ?? null
      target.oisCountryCode = src.oisCountryCode ?? null
    }
    if (copyMarks.value) {
      target.restrictionMarks = src.restrictionMarks ?? null
      target.prohibitionCode = src.prohibitionCode ?? null
    }
    if (copyCert.value) target.certificationNote = src.certificationNote ?? null
  }
  emitChange()
  message.success(t('dt.skopirovanoVTovarov', { n: copyTargets.value.length }))
  copyOpen.value = false
}

const emptyPayment = (): Import40GoodsPayment => ({
  taxModeCode: null, taxBase: null, rateKindCode: '%', rateValue: null,
  rateUnitCode: null, rateCurrencyCode: null, weightRatio: null,
  rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: null,
})

const addPayment = (g: Import40GoodsItemInput) => {
  g.payments = [...(g.payments ?? []), emptyPayment()]
  emitChange()
}

// Принимает саму строку платежа (а не индекс) — строки рендерятся из
// sortedPayments(g), отсортированной копии, чей порядок индексов не совпадает
// с исходным g.payments; сравниваем по ссылке на объект.

const removePayment = (g: Import40GoodsItemInput, payment: Import40GoodsPayment) => {
  g.payments = (g.payments ?? []).filter((p) => p !== payment)
  emitChange()
}

// Маркировка (гр.31.13) — коллекция строк. По образцу addPayment/removePayment:
// мутируем g.markings, затем emitChange() эмитит новый массив с копиями (в т.ч. markings).

const emptyMarking = (): Import40GoodsMarking => ({
  markingAfterRelease: false, kizCount: null, levelCode: null,
  idTypeCode: null, idApplicationCode: null, number: null, aggregated: false,
})

const addMarking = (g: Import40GoodsItemInput) => {
  g.markings = [...(g.markings ?? []), emptyMarking()]
  emitChange()
}

const removeMarking = (g: Import40GoodsItemInput, marking: Import40GoodsMarking) => {
  g.markings = (g.markings ?? []).filter((m) => m !== marking)
  emitChange()
}

// Справочники кодов маркировки гр.31.13 (по Решению 257 / образцу КЕДЕН).

const MARKING_LEVEL_OPTIONS = computed(() => ([

  { value: '0', label: t('dt.0TovarPotrebUpakovka') },
  { value: '1', label: t('dt.1GruppovayaUpakovka') },
  { value: '2', label: t('dt.2TransportnayaUpakovka') },
  { value: '3', label: t('dt.3NaborDlyaRoznicy') },
  { value: '4', label: t('dt.4PotrebUpakovkaRaznye') },
]))
// Код вида идентификации (m.idTypeCode)

const MARKING_ID_TYPE_OPTIONS = computed(() => ([

  { value: '101', label: t('dt.101LineynyyShtrihkodCode128') },
  { value: '301', label: '301 — DataMatrix' },
  { value: '302', label: t('dt.302QrKod') },
  { value: '303', label: '303 — MicroQR' },
  { value: '401', label: t('dt.401RfidMetkaUhf') },
  { value: '999', label: t('dt.999Prochee') },
]))
// Код идентификатора применения (m.idApplicationCode)

const MARKING_ID_APPLICATION_OPTIONS = computed(() => ([

  { value: '00', label: t('dt.00SsccKodTransportnoy') },
  { value: '01', label: t('dt.01GtinEdinicyTovara') },
  { value: '02', label: t('dt.02GtinVnutriTary') },
  { value: '21', label: t('dt.21SeriynyyNomer') },
  { value: '91', label: t('dt.91IdentifikatorKlyuchaProverki') },
  { value: '92', label: t('dt.92KodProverki') },
]))
// Импорт маркировок из Excel. Формат (без шапки): A=Номер маркировки,
// B=Код уровня, C=Код идентификатора применения, D=Код вида идентификации.

const importMarkingsFromExcel = async (g: Import40GoodsItemInput, file: File) => {
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) { message.warning(t('dt.vFayleNetListov')); return }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })
    const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim())
    // idApplicationCode — 2-значный (02, 91…): дополняем ведущим нулём, если Excel потерял его как число.
    const pad2 = (v: unknown): string | null => {
      const t = s(v); return t == null ? null : (t.length === 1 ? '0' + t : t)
    }
    const parsed: Import40GoodsMarking[] = []
    for (const r of rows) {
      if (!Array.isArray(r)) continue
      const number = s(r[0])
      const levelCode = s(r[1])
      const idApplicationCode = pad2(r[2])
      const idTypeCode = s(r[3])
      if (!number && !levelCode && !idApplicationCode && !idTypeCode) continue // пустая строка
      parsed.push({ markingAfterRelease: false, kizCount: null, levelCode, idTypeCode, idApplicationCode, number, aggregated: false })
    }
    if (!parsed.length) { message.warning(t('dt.vFayleNetStrok')); return }
    g.markings = [...(g.markings ?? []), ...parsed]
    emitChange()
    message.success(t('dt.importirovanoMarkirovokParsedLength', { n: parsed.length }))
  } catch {
    message.error(t('dt.neUdalosProchitatExcel'))
  }
  return false // отменяем авто-загрузку a-upload
}

// Task 6b: копирует g.tempImportMonths первого товара во все остальные.
</script>

<style scoped>
.field-hint-warn { margin-top: 2px; font-size: 12px; color: var(--z-warning, #d48806); }
.sug-row { margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 0; font-size: 12px; }
.sug-label { color: var(--z-text-secondary, #8c8c8c); margin-right: 6px; }
.sug-chip { cursor: pointer; margin-right: 4px; }
.sug-chip-on { opacity: 0.45; cursor: default; }
.sug-neg { padding: 0 4px; height: auto; font-size: 12px; }
.sug-note { color: var(--z-text-secondary, #8c8c8c); margin-left: 4px; }
.keden-fields { display: flex; flex-direction: column; gap: 2px; }
.keden-flags { display: flex; gap: 6px; margin-bottom: 4px; }

/* Раскладка полей — та же, что была в панели «Данные КЕДЕН»: без неё поля
   схлопываются по ширине контента (у «Вида упаковки» обрезался список). */
.section-bar { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.section-label { font-size: 12px; font-weight: 600; color: var(--atg-muted); }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; }
.field.f-2 { flex: 2; }
/* гр.31 (упаковка) / гр.37 (процедура): коды короткие, названия в списке длинные —
   полю нужно больше места, иначе выпадающий список обрезается. */
.field.field-wide { flex: 2; min-width: 260px; }
.field-label { font-size: 11px; color: var(--atg-muted); margin-bottom: 2px; }

/* гр.33 «Признаки соблюдения запретов»: в теге только код, полный текст — в tooltip. */
.ois-marks-select :deep(.ant-select-selector) { overflow: hidden; }
.ois-mark-tag { margin: 1px 2px; padding: 0 4px; font-weight: 600; line-height: 18px; }

.payments-bar { margin-top: 12px; }
.payment-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.marking-collapse { margin-top: 4px; margin-bottom: 8px; }
.marking-block { border: 1px solid var(--atg-border, #f0f0f0); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.marking-block .field-row:last-child { margin-bottom: 0; }
.marking-remove { display: flex; align-items: flex-end; justify-content: flex-end; }
.marking-empty { color: var(--atg-muted); font-size: 12px; margin-bottom: 8px; }
.marking-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.marking-hint { font-size: 11.5px; color: var(--atg-muted, #95a1b7); }

/* Модалка копирования ОИС/МНР */
.copy-what { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.copy-head { display: flex; align-items: center; justify-content: space-between; }
.copy-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.copy-item { margin-left: 0; }
</style>
