<!-- Поля КЕДЕН по одному товару (упаковка, преференции, процедура, стоимости,
     ОИС, маркировка, платежи гр.47). Живут прямо в карточке товара под «Производителем»
     — по требованию декларанта всё о товаре заполняется в одном месте (2026-09-23). -->
<template>
  <div class="keden-fields">
    <!-- Продолжение раздела «Количество, вес и стоимость» карточки товара (сетка общая, display: contents). -->
    <div class="zf-field zf-s3"><div class="zf-label" :title="t('dt.tamozhennayaStoimostGr45')">{{ t('dt.tamStoimostGr45') }}</div>
      <a-input-number v-model:value="good.customsValueKzt" :disabled="readonly" :min="0" @change="onCustomsValueChange(good)" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.statisticheskayaUsdGr46') }}
        <a-tooltip :title="t('dt.avtoTamozhennayaStoimostGr45')"><QuestionCircleOutlined class="label-help" /></a-tooltip></div>
      <a-input-number v-model:value="good.statisticValueUsd" :disabled="readonly" :min="0" @change="emitChange" /></div>
    <div v-if="good.needsTpinRecalc || hasReducedVat(good)" class="keden-flags zf-s12">
      <a-tag v-if="good.needsTpinRecalc" color="orange">{{ t('dt.pereschitatTpin') }}</a-tag>
      <a-tooltip v-if="hasReducedVat(good)" :title="t('dt.ponizhennyyNds5Primenyaetsya')">
        <a-tag color="green">{{ t('dt.nds5') }}</a-tag>
      </a-tooltip>
    </div>

    <!-- Упаковка (гр.31). «Кол-во грузовых мест» — одно поле выше (packagesCount); cargoPlacesQuantity
         синхронизируется с ним автоматически (DtSectionGoods). -->
    <div class="zf-sec">{{ t('dt.upakovkaGr31') }}</div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.nalichieUpakovki') }}</div>
      <a-select v-model:value="good.packageAvailabilityCode" :disabled="readonly" show-search
        :options="packagingAvailabilityOptions" :dropdown-match-select-width="false" allow-clear
        :get-popup-container="popupContainer" :placeholder="t('dt.phEstLiUpakovka')" @change="emitChange" /></div>
    <div class="zf-field zf-s6"><div class="zf-label">{{ t('dt.vidUpakovki') }}</div>
      <a-select v-model:value="good.packageKindCode" :disabled="readonly" show-search allow-clear
        :options="pkgOptions" option-filter-prop="label" :dropdown-match-select-width="false" :placeholder="t('dt.phVidUpakovki')"
        :get-popup-container="popupContainer" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kolichestvoUpakovok') }}</div>
      <a-input-number v-model:value="good.packageQuantity" :disabled="readonly" :min="0" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.chastichnoMest') }}
        <a-tooltip :title="t('dt.chastichnoMestHint')"><QuestionCircleOutlined class="label-help" /></a-tooltip></div>
      <a-input-number :value="good.extras?.cargoPartQuantity ?? null" :disabled="readonly" :min="0" :max="99999999" :precision="0"
        placeholder="0" @change="onPartPlaces" /></div>
    <div v-if="containerIndicator" class="zf-field zf-s4"><div class="zf-label">{{ t('dt.nomerKonteyneraGr313') }}</div>
      <a-input v-uppercase v-model:value="good.containerNumber" :disabled="readonly" placeholder="GLDU9071686" @change="emitChange" /></div>

    <!-- Льготы гр.36: у каждого вида платежа свой перечень (классификатор 2008) -->
    <div class="zf-sec">{{ t('dt.secLgoty') }}</div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.preferenciyaSbor') }}</div>
      <a-select v-model:value="good.prefClearanceCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefFeeOptions" :status="offKeden('pref-fee', good.prefClearanceCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" :placeholder="t('dt.phBezLgot')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.poshlina') }}</div>
      <a-select v-model:value="good.prefDutyCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefDutyOptions" :status="offKeden('pref-duty', good.prefDutyCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" :placeholder="t('dt.phBezLgot')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.akciz') }}</div>
      <a-select v-model:value="good.prefExciseCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefExciseOptions" :status="offKeden('pref-excise', good.prefExciseCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" :placeholder="t('dt.phBezLgot')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.nds') }}
        <a-tooltip v-if="hasReducedVat(good)" :title="t('dt.ponizhennyyNds5Primenyaetsya')"><a-tag color="green" class="label-tag">5%</a-tag></a-tooltip></div>
      <a-select v-model:value="good.prefVatCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prefVatOptions" :status="offKeden('pref-vat', good.prefVatCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '640px' }" :get-popup-container="popupContainer" :placeholder="t('dt.phBezLgot')" @change="emitChange" /></div>

    <!-- Процедура (гр.37), квота (гр.39), метод ТС (гр.43), временный ввоз, сертификация -->
    <div class="zf-sec">{{ t('dt.secProcedura') }}</div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.proceduraGr37') }}</div>
      <a-select v-model:value="good.procedureCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="procOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" :placeholder="t('dt.phVyberiteProceduru')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.predshProceduraGr37') }}</div>
      <a-select v-model:value="good.previousProcedureCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="prevProcOptions" :status="offKeden('prev', good.previousProcedureCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :get-popup-container="popupContainer" :placeholder="t('dt.phNet')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.osobennostPeremescheniya') }}</div>
      <a-select v-model:value="good.goodsMoveFeatureCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="moveFeatureOptions" :status="offKeden('movement-features', good.goodsMoveFeatureCode) ? 'warning' : undefined" :dropdown-match-select-width="false" :get-popup-container="popupContainer" :placeholder="t('dt.phNet')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.metodTsGr43') }}</div>
      <a-select v-model:value="good.valuationMethodCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="valuationOptions" :dropdown-match-select-width="false" :get-popup-container="popupContainer" :placeholder="t('dt.phVyberiteMetod')" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kvotaGr39') }}</div>
      <a-input-number v-model:value="good.quotaAmount" :disabled="readonly" :min="0" @change="emitChange" /></div>
    <div class="zf-field zf-s3"><div class="zf-label" :title="t('dt.kolVoMesyacevVrem')">{{ t('dt.kolVoMesyacevVrem') }}</div>
      <a-input-number v-model:value="good.tempImportMonths" :disabled="readonly" :min="0" :precision="0" placeholder="0" @change="emitChange" /></div>
    <div class="zf-field zf-s6"><div class="zf-label">{{ t('dt.sertifikaciyaEkspKontrol') }}</div>
      <a-select :value="certificationArray(good)" mode="tags" :disabled="readonly"
        :options="certificationOptions" :dropdown-match-select-width="false" allow-clear
        option-filter-prop="label" :token-separators="[';']" :get-popup-container="popupContainer"
        :placeholder="t('dt.vyberiteIliVvedite')"
        @change="(v: string[]) => onCertificationChange(good, v)" /></div>

    <div v-if="kedenOffFields.length" class="field-hint-warn zf-s12">
      {{ t('dt.kedenOffList', { key: kedenKey, codes: kedenOffFields.join('; ') }) }}
    </div>

    <!-- ОИС / признаки соблюдения запретов (гр.33 «О») -->
    <div class="zf-sec">
      <span>{{ t('dt.oisZapretyGr33O') }}</span>
      <span class="zf-sec-actions">
        <a-button v-if="!readonly && otherGoods.length" type="link" size="small" @click="openCopy">
          <CopyOutlined /> {{ t('dt.kopirovatVTovary') }}
        </a-button>
      </span>
    </div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.ois') }}</div>
      <a-select v-model:value="good.oisIndicatorCode" :disabled="readonly" show-search
        :options="oisIndicatorOptions" :dropdown-match-select-width="false" allow-clear
        :get-popup-container="popupContainer" :placeholder="t('dt.phVyberite')" @change="emitChange" />
      <!-- Знак найден в ТРОИС: признак ОИС сам не ставится — декларант решает -->
      <div v-if="troisFound" class="trois-ois-hint">{{ t('dt.troisOisHint') }}</div></div>
    <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.regPoOis') }}</div>
      <!-- Подсказки из ТРОИС: сначала знаки по торговой марке товара, при вводе — поиск по номеру, названию,
           правообладателю. Свой номер вписать можно; выбор только подставляет номер (и KZ, если страна пуста). -->
      <a-auto-complete :value="good.oisRegNumber ?? ''" :disabled="readonly" :options="regOptions"
        :filter-option="false" :dropdown-match-select-width="false" :dropdown-style="{ minWidth: '420px', maxWidth: '620px' }"
        :get-popup-container="popupContainer" :placeholder="t('dt.troisRegPlaceholder')"
        @search="onRegSearch" @select="onRegSelect" @update:value="onRegInput">
        <template #option="{ value: regNo, item }">
          <div class="trois-opt" :class="{ off: !item.isActive }">
            <div><b>№ {{ regNo }}</b> {{ item.objectName }}<span v-if="!item.isActive" class="trois-off"> · {{ t('dt.troisNeDeystvuet') }}</span></div>
            <div class="trois-sub">{{ item.rightHolder ?? '—' }}<template v-if="item.validUntil"> · {{ t('dt.troisDo', { date: troisDate(item.validUntil) }) }}</template></div>
          </div>
        </template>
      </a-auto-complete></div>
    <div class="zf-field zf-s2"><div class="zf-label">{{ t('dt.kodStranyOis') }}</div>
      <!-- Страна регистрации ОИС — буквенный код (KZ, CN), как в КЕДЕН; список стран с поиском по коду и названию. -->
      <a-select v-model:value="good.oisCountryCode" :disabled="readonly" show-search allow-clear
        :options="countryAlpha2Options" :filter-option="filterAlpha2" :dropdown-match-select-width="false"
        :get-popup-container="popupContainer" placeholder="KZ" @change="emitChange" /></div>
    <div class="zf-field zf-s4"><div class="zf-label">{{ t('dt.priznakiSoblyudeniyaZapretov') }}</div>
      <a-select :value="restrictionMarksArray(good)" mode="multiple" :disabled="readonly"
        :options="restrictionMarksOptions" :dropdown-match-select-width="false" allow-clear
        :max-tag-count="4" :get-popup-container="popupContainer" :placeholder="t('dt.phVyberitePriznaki')"
        @change="(v: string[]) => onRestrictionMarksChange(good, v)">
        <template #tag="{ value: markValue, onClose }">
          <a-tag class="ois-mark-tag" :title="restrictionMarkLabel(markValue)" closable @close="onClose">{{ markValue }}</a-tag>
        </template>
      </a-select></div>
    <div class="zf-field zf-s12"><div class="zf-label">{{ t('dt.priznakiNetarifnogoGr33') }}
        <a-tooltip :title="t('dt.priznakiNetarifnogoHint')"><QuestionCircleOutlined class="label-help" /></a-tooltip>
      </div>
      <!-- Справочник кодов (Приказ МФ РК №259) с поиском по коду и словам; свой код можно вписать — тогда предупреждение. -->
      <a-select :value="featureCodesArray(good)" mode="tags" :disabled="readonly"
        :options="prohibitionOptions" option-label-prop="value" option-filter-prop="label"
        :dropdown-match-select-width="false" :dropdown-style="{ maxWidth: '620px' }" allow-clear
        :token-separators="[',', ';']" :get-popup-container="popupContainer"
        :placeholder="t('dt.kodyGr33Placeholder')"
        :status="invalidFeatureCodes(good.prohibitionCode).length || unknownFeatureCodes(good).length ? 'warning' : undefined"
        @change="(v: string[]) => onFeatureCodesChange(good, v)"
        @search="(v: string) => (gr33Search = v)"
        @dropdown-visible-change="(open: boolean) => { if (!open) gr33Search = '' }">
        <template #tag="{ value: codeValue, onClose }">
          <a-tag class="ois-mark-tag" :title="prohibitionTitle(codeValue)" :closable="!readonly" @close="onClose">{{ codeValue }}</a-tag>
        </template>
        <!-- Внизу списка — чем он ограничен (коды по ТН ВЭД из KEDEN или весь справочник) и переключатель. -->
        <template #dropdownRender="{ menuNode }">
          <VNodes :vnodes="menuNode" />
          <div v-if="visibleSuggest.length && !gr33Search" class="gr33-scope" @mousedown.prevent>
            <span>{{ gr33ByTnved ? t('dt.gr33ScopeTnved', { code: suggest.tnved }) : t('dt.gr33ScopeAll', { n: prohibitionRef.length }) }}</span>
            <a-button type="link" size="small" @click="showAllCodes = !showAllCodes">
              {{ gr33ByTnved ? t('dt.gr33ShowAll') : t('dt.gr33ShowTnved') }}
            </a-button>
          </div>
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
        <template v-else-if="visibleSuggest.length">
          <span class="sug-label">{{ t('dt.podskazkiPoTnved', { code: suggest.tnved }) }}</span>
          <a-tag v-for="c in visibleSuggest" :key="c.code" class="sug-chip" :class="{ 'sug-chip-on': isFeatureSelected(good, c.code) }"
            :title="c.name ?? c.code" @click="addFeatureCode(good, c.code)">{{ c.code }}</a-tag>
          <a-tooltip :title="t('dt.dobavitNePodpadaetHint')">
            <a-button v-if="negativeToAdd(good).length" type="link" size="small" class="sug-neg" @click="addNegativeCodes(good)">
              {{ t('dt.dobavitNePodpadaet') }}
            </a-button>
          </a-tooltip>
          <span v-if="suggest.warning" class="sug-note">{{ t('dt.podskazkiStale') }}</span>
        </template>
        <!-- КЕДЕН для этого ТН ВЭД даёт только экспортные коды — при импорте он отклонит любой код (проверено 06.10.2026). -->
        <span v-else-if="suggest.codes.length" class="sug-note">{{ t('dt.gr33NoImportCodes', { code: suggest.tnved }) }}</span>
        <span v-else class="sug-note">{{ suggest.failed ? t('dt.podskazkiNedostupny') : t('dt.podskazkiPusto') }}</span>
      </div>
    </div>

    <!-- Маркировка товаров (гр.31.13) — коллекция: один товар может иметь несколько строк маркировки -->
    <a-collapse ghost class="marking-collapse zf-s12">
      <a-collapse-panel key="marking" :header="t('dt.markirovkaTovarovGr3113') + ((good.markings?.length ?? 0) ? ` — ${good.markings?.length}` : '')">
        <div v-for="(m, mi) in (good.markings ?? [])" :key="mi" class="marking-block zf-grid">
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.posleVypuska') }}</div>
            <a-checkbox v-model:checked="m.markingAfterRelease" :disabled="readonly" @change="emitChange">{{ t('dt.markirovkaPosleVypuska') }}</a-checkbox></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kolVoKiz') }}</div>
            <a-input-number v-model:value="m.kizCount" :disabled="readonly" :min="0" :precision="0" @change="emitChange" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.agregaciya') }}</div>
            <a-checkbox v-model:checked="m.aggregated" :disabled="readonly" @change="emitChange">{{ t('dt.agregirovannayaUpakovka') }}</a-checkbox></div>
          <div class="zf-field zf-s3 marking-remove">
            <a-button v-if="!readonly" type="text" danger size="small" @click="removeMarking(good, m)"><CloseOutlined /> {{ t('dt.udalit') }}</a-button></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kodUrovnyaMarkirovki') }}</div>
            <a-select v-model:value="m.levelCode" :disabled="readonly" show-search allow-clear
              :options="MARKING_LEVEL_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
              :get-popup-container="popupContainer" placeholder="0–4" @change="emitChange" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kodVidaIdentifikacii') }}</div>
            <a-select v-model:value="m.idTypeCode" :disabled="readonly" show-search allow-clear
              :options="MARKING_ID_TYPE_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
              :get-popup-container="popupContainer" placeholder="101/301…" @change="emitChange" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.kodIdentifikatoraPrimeneniya') }}</div>
            <a-select v-model:value="m.idApplicationCode" :disabled="readonly" show-search allow-clear
              :options="MARKING_ID_APPLICATION_OPTIONS" :dropdown-match-select-width="false" option-filter-prop="label"
              :get-popup-container="popupContainer" placeholder="00/01/02…" @change="emitChange" /></div>
          <div class="zf-field zf-s3"><div class="zf-label">{{ t('dt.nomerMarkirovki') }}</div>
            <a-input v-uppercase v-model:value="m.number" :disabled="readonly" @change="emitChange" /></div>
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

    <!-- Доп. сведения гр.31: характеристики, акцизные марки, автомобили, период, инвестпроект, прослеживаемость -->
    <Import40GoodsExtras :good="good" :readonly="readonly" @change="emitChange" />

    <!-- Платежи гр.47: таблица с заголовками колонок (раньше были только плейсхолдеры в полях) -->
    <div class="zf-sec">
      <span>{{ t('dt.platezhiGr47') }}</span>
      <span class="zf-sec-actions">
        <a-tag v-if="good.tempImportMonths" color="blue">{{ t('dt.vremVvoz', { months: good.tempImportMonths }) }}</a-tag>
        <a-button v-if="!readonly" type="dashed" size="small" @click="addPayment(good)">{{ t('dt.stroka') }}</a-button>
      </span>
    </div>
    <div class="payments zf-s12">
      <div v-if="sortedPayments(good).length" class="pay-row pay-head">
        <span>{{ t('dt.payVid') }}</span><span>{{ t('dt.payOsnova') }}</span><span>{{ t('dt.payVidStavki') }}</span>
        <span>{{ t('dt.stavka') }}</span><span>{{ t('dt.payData') }}</span><span>{{ t('dt.summa') }}</span><span />
      </div>
      <template v-for="(p, pi) in sortedPayments(good)" :key="pi">
        <div class="pay-row">
          <a-select v-model:value="p.taxModeCode" :disabled="readonly" show-search allow-clear option-filter-prop="label" :options="taxModeOptions" :dropdown-match-select-width="false" placeholder="2010" :get-popup-container="popupContainer" @change="emitChange" />
          <a-input-number v-model:value="p.taxBase" :disabled="readonly" placeholder="—" @change="emitChange" />
          <!-- Task 10, №13: вид ставки/дата НЕ обязательны для показа сумм — суммы гр.47 заполняет
               «Рассчитать платежи/ТПиН»; эти поля — необязательное ручное уточнение (allow-clear). -->
          <a-select v-model:value="p.rateKindCode" :disabled="readonly" :options="rateKindOptions" allow-clear :placeholder="t('dt.vidStavkiAvto')" :get-popup-container="popupContainer" @change="emitChange" />
          <a-input-number v-model:value="p.rateValue" :disabled="readonly" placeholder="—" @change="emitChange" />
          <a-date-picker v-model:value="p.rateDate" :disabled="readonly" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :placeholder="t('dt.dataAvto')" allow-clear @change="emitChange" />
          <a-input-number v-model:value="p.amountKzt" :disabled="readonly" placeholder="—" @change="emitChange" />
          <a-button v-if="!readonly" type="text" danger @click="removePayment(good, p)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
          <span v-else />
        </div>
        <!-- Специфическая ставка (*): единица, валюта, коэффициент — отдельной строкой под платежом -->
        <div v-if="p.rateKindCode === '*'" class="pay-specific">
          <span class="zf-help">{{ t('dt.payStavkaDetali') }}:</span>
          <a-input v-model:value="p.rateUnitCode" :disabled="readonly" :placeholder="t('dt.okei166')" @change="emitChange" />
          <a-input v-model:value="p.rateCurrencyCode" :disabled="readonly" :placeholder="t('dt.valyutaN3978')" @change="emitChange" />
          <a-input-number v-model:value="p.weightRatio" :disabled="readonly" :placeholder="t('dt.koef')" @change="emitChange" />
        </div>
      </template>
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
import { computed, defineComponent, onMounted, reactive, ref, watch, type PropType, type VNode } from 'vue'
import { CloseOutlined, CopyOutlined, QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { loadXlsx } from '@/utils/xlsx'
import type { Import40GoodsItemInput, Import40GoodsPayment, Import40GoodsMarking } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'
import { FEATURE_CODE_RE, invalidFeatureCodes, joinFeatureCodes, splitFeatureCodes } from '@/utils/nonTariffCodes'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { useCountryAlpha2Options } from '@/composables/useCountryAlpha2Options'
import { prohibitionCodesApi, type ProhibitionCodeItem, type SuggestedProhibitionCode } from '@/api/prohibitionCodes'
import { troisApi, troisDate, type TroisItem } from '@/api/trois'
import { kedenListKey, kedenProcedureListsApi, type KedenProcedureLists } from '@/api/kedenProcedureLists'
import Import40GoodsExtras from '@/components/import40/Import40GoodsExtras.vue'

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
  /** Гр.1: направление (ИМ/ЭК) и процедура — по ним КЕДЕН сужает списки гр.36/37 товара. */
  direction?: string | null
  declProcedure?: string | null
}>()

const emit = defineEmits<{ (e: 'change'): void }>()

/** Сообщаем родителю, что товар изменился: список товаров пересобирается и уходит наверх. */
const emitChange = () => emit('change')

const popupContainer = () => document.body

// Частично занятые места (2 товара в 1 коробке) живут в доп. сведениях товара (extras) — создаём их при первой правке.
const onPartPlaces = (v: number | string | null) => {
  const g = props.good
  g.extras ??= { traceable: false, exciseStamps: [], vehicles: [] }
  g.extras.cargoPartQuantity = v === '' || v == null ? null : Number(v)
  emitChange()
}

const countryAlpha2Options = useCountryAlpha2Options()
const filterAlpha2 = (input: string, option: { value: string; label: string }) =>
  option.label.toLowerCase().includes(input.trim().toLowerCase())

// ТРОИС: торговая марка товара найдена среди действующих знаков (точно или «похоже») — подсказка у поля ОИС.
const trois = useTroisCheck()
const troisFound = computed(() =>
  !!trois?.resultFor(props.good.tradeMarkName)?.matches.some((m) => m.isActive && (m.match === 'exact' || m.match === 'similar')))

// Рег.№ по ОИС (гр.33): подсказки из ТРОИС. Пока ничего не введено — знаки, найденные по торговой марке
// товара (действующие сначала); при вводе — поиск по номеру, названию знака, правообладателю.
const regSearch = ref<TroisItem[] | null>(null)
let regTimer: number | undefined
let regSeq = 0
const toRegOption = (m: TroisItem) => ({ value: m.registrationNumber, item: m })
const regOptions = computed(() => {
  const list = regSearch.value
    ?? [...(trois?.resultFor(props.good.tradeMarkName)?.matches ?? [])]
      .sort((a, b) => Number(b.isActive) - Number(a.isActive))
  const seen = new Set<string>()
  return list.filter((m) => !seen.has(m.registrationNumber) && seen.add(m.registrationNumber)).slice(0, 20).map(toRegOption)
})
const onRegSearch = (q: string) => {
  window.clearTimeout(regTimer)
  const term = q.trim()
  if (term.length < 2) { regSearch.value = null; return }
  const my = ++regSeq
  regTimer = window.setTimeout(async () => {
    try {
      const found = await troisApi.search(term)
      if (my === regSeq) regSearch.value = found
    } catch {
      if (my === regSeq) regSearch.value = []
    }
  }, 300)
}
const onRegInput = (v: string) => {
  props.good.oisRegNumber = (v ?? '').toUpperCase() || null
  emitChange()
}
const onRegSelect = (regNo: string) => {
  props.good.oisRegNumber = regNo
  // ТРОИС — таможенный реестр Казахстана: страна реестра — KZ, если декларант её ещё не указал.
  if (!props.good.oisCountryCode) props.good.oisCountryCode = 'KZ'
  regSearch.value = null
  emitChange()
}

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
// Списки КЕДЕН по процедуре гр.1 (ref/keden-procedure-lists): КЕДЕН предлагает только часть кодов —
// например, при ЭК 10 льгот по акцизу и НДС нет («Z»), при ИМ 53 свои особенности перемещения.
// Показываем только их; уже выбранный код вне списка оставляем видимым и подсвечиваем.
const kedenLists = ref<KedenProcedureLists | null>(null)
onMounted(() => { kedenProcedureListsApi.get().then((l) => (kedenLists.value = l)).catch(() => {}) })
const kedenKey = computed(() => kedenListKey(props.direction, props.good.procedureCode || props.declProcedure))
const kedenAllowed = (field: string): Set<string> | null => {
  const codes = kedenKey.value ? kedenLists.value?.[kedenKey.value]?.[field] : undefined
  return codes ? new Set(codes) : null
}
type Opt = { value: string; label: string; title?: string }
const byKeden = (field: string, opts: () => Opt[], current: () => string | null | undefined) => computed(() => {
  const allowed = kedenAllowed(field)
  const cur = current()?.trim()
  return allowed ? opts().filter((o) => allowed.has(o.value) || o.value === cur) : opts()
})
/** Выбранный код, которого КЕДЕН при этой процедуре не предлагает. */
const offKeden = (field: string, value: string | null | undefined) => {
  const v = value?.trim()
  const allowed = kedenAllowed(field)
  return !!v && !!allowed && !allowed.has(v)
}
const prefFeeAll = prefOptionsOf('pref-fee')
const prefDutyAll = prefOptionsOf('pref-duty')
const prefExciseAll = prefOptionsOf('pref-excise')
const prefVatAll = prefOptionsOf('pref-vat')
const prefFeeOptions = byKeden('pref-fee', () => prefFeeAll.value, () => props.good.prefClearanceCode)
const prefDutyOptions = byKeden('pref-duty', () => prefDutyAll.value, () => props.good.prefDutyCode)
const prefExciseOptions = byKeden('pref-excise', () => prefExciseAll.value, () => props.good.prefExciseCode)
const prefVatOptions = byKeden('pref-vat', () => prefVatAll.value, () => props.good.prefVatCode)
const kedenOffFields = computed(() => [
  ['pref-fee', t('dt.preferenciyaSbor'), props.good.prefClearanceCode],
  ['pref-duty', t('dt.poshlina'), props.good.prefDutyCode],
  ['pref-excise', t('dt.akciz'), props.good.prefExciseCode],
  ['pref-vat', t('dt.nds'), props.good.prefVatCode],
  ['prev', t('dt.predshProceduraGr37'), props.good.previousProcedureCode],
  ['movement-features', t('dt.osobennostPeremescheniya'), props.good.goodsMoveFeatureCode],
].filter(([f, , v]) => offKeden(f as string, v)).map(([, l, v]) => `${l}: ${v}`))

const taxModeOptions = computed(() => classifiers.options('tax-modes'))

const rateKindOptions = computed(() => classifiers.options('rate-kinds'))

const valuationOptions = computed(() => classifiers.options('2005'))

const procOptions = computed(() => classifiers.options('customs-procedures'))
const prevProcOptions = byKeden('prev', () => procOptions.value, () => props.good.previousProcedureCode)

const moveFeatureOptions = byKeden('movement-features', () => classifiers.options('movement-features'), () => props.good.goodsMoveFeatureCode)

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
// Отрисовка готового меню AntD внутри #dropdownRender.
const VNodes = defineComponent({
  props: { vnodes: { type: Object as PropType<VNode>, required: true } },
  render() { return this.vnodes },
})
type Gr33Option = { value: string; label: string; title: string }
const toGr33Option = (code: string, name: string): Gr33Option =>
  ({ value: code, label: `${code} — ${shorten(name, 90)}`, title: name })
const allProhibitionOptions = computed(() => {
  const groups = new Map<string, { label: string; options: Gr33Option[] }>()
  for (const c of prohibitionRef.value) {
    let grp = groups.get(c.categoryCode)
    if (!grp) {
      grp = { label: `${c.categoryCode} — ${shorten(c.categoryName, 70)}`, options: [] }
      groups.set(c.categoryCode, grp)
    }
    grp.options.push(toGr33Option(c.code, c.name))
  }
  return [...groups.values()]
})
// Есть подсказки KEDEN по ТН ВЭД — в списке сначала они, затем другие варианты тех же мер (например, D0125
// «бывшие в употреблении» вместо подсказанного D0110). Весь справочник — по кнопке внизу списка или при поиске.
const showAllCodes = ref(false)
const gr33Search = ref('')
// Направление товара по гр.37 («1000» — экспорт): при импорте экспортные коды (C2000, C1700, H0111…) КЕДЕН
// отклоняет — в подсказках их не показываем (флаг exportOnly с сервера, Gr33Direction).
const isExportGood = computed(() => ['10', '21', '23', '31'].includes((props.good.procedureCode ?? '').trim().slice(0, 2)))
const visibleSuggest = computed(() => suggest.codes.filter((c) => isExportGood.value || !c.exportOnly))
const gr33ByTnved = computed(() => visibleSuggest.value.length > 0 && !showAllCodes.value)
const prohibitionOptions = computed(() => {
  if (!gr33ByTnved.value || gr33Search.value.trim()) return allProhibitionOptions.value
  const suggested = new Set(visibleSuggest.value.map((c) => c.code))
  const categoryOf = (code: string) => prohibitionByCode.value.get(code)?.categoryCode ?? code.slice(0, 3)
  const categories = new Set(visibleSuggest.value.map((c) => categoryOf(c.code)))
  const groups = [{
    label: t('dt.gr33GroupTnved', { code: suggest.tnved }),
    options: visibleSuggest.value.map((c) => toGr33Option(c.code, prohibitionByCode.value.get(c.code)?.name ?? c.name ?? c.code)),
  }]
  const others = prohibitionRef.value
    .filter((c) => !suggested.has(c.code) && categories.has(c.categoryCode))
    .map((c) => toGr33Option(c.code, c.name))
  if (others.length) groups.push({ label: t('dt.gr33GroupSameMeasures'), options: others })
  return groups
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
  visibleSuggest.value.filter((c) => c.isNegative && !isFeatureSelected(g, c.code))
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
  const XLSX = await loadXlsx()
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
/* Корень не создаёт свой блок: поля ложатся в 12-колоночную сетку карточки товара (ReestrGoodsSection). */
.keden-fields { display: contents; }
.keden-flags { display: flex; gap: 6px; }
.label-help { margin-left: 4px; color: var(--z-muted); }
.label-tag { margin-left: 6px; line-height: 16px; font-size: 12px; padding: 0 4px; }
.trois-ois-hint { font-size: 12px; font-weight: 500; color: var(--z-warning, #8a6410); }
.field-hint-warn { font-size: 12px; color: var(--z-warning, #8a6410); }
.sug-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; font-size: 12px; }
.sug-label { color: var(--z-muted); margin-right: 6px; }
.sug-chip { cursor: pointer; margin-right: 4px; }
.sug-chip-on { opacity: 0.45; cursor: default; }
.sug-neg { padding: 0 4px; height: auto; font-size: 12px; }
.sug-note { color: var(--z-muted); margin-left: 4px; }
.gr33-scope {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 4px; padding: 6px 12px 2px; border-top: 1px solid var(--z-line, #e6eaee);
  font-size: 12px; color: var(--z-muted);
}

/* Подсказки ТРОИС у «Рег.№ по ОИС» */
.trois-opt { line-height: 1.35; white-space: normal; }
.trois-opt.off { opacity: 0.6; }
.trois-off { color: var(--z-warning, #8a6410); }
.trois-sub { font-size: 12px; color: var(--z-muted); }

/* гр.33 «Признаки соблюдения запретов»: в теге только код, полный текст — в tooltip. */
.ois-mark-tag { margin: 1px 2px; padding: 0 6px; font-weight: 600; }

/* Маркировка */
:not(#z) .marking-collapse :deep(.ant-collapse-header) { padding: 8px 0; font-weight: 600; color: var(--z-ink); }
:not(#z) .marking-collapse :deep(.ant-collapse-content-box) { padding: 4px 0 0; }
.marking-block { border: 1px solid var(--z-line); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.marking-remove { align-self: end; align-items: flex-end; }
.marking-empty { color: var(--z-muted); font-size: 12.5px; margin-bottom: 8px; }
.marking-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.marking-hint { font-size: 12px; color: var(--z-muted); }

/* Платежи гр.47 — таблица */
.payments { display: flex; flex-direction: column; gap: 6px; }
.pay-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1.3fr) 32px;
  gap: 8px;
  align-items: center;
}
.pay-row > :deep(.ant-select), .pay-row > :deep(.ant-input-number), .pay-row > :deep(.ant-picker) { width: 100%; }
.pay-head { font-size: 12px; font-weight: 500; color: var(--z-muted); }
.pay-specific {
  display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: center;
  padding: 0 0 6px 12px; border-left: 2px solid var(--z-line);
}
.pay-specific > :deep(.ant-input-number) { width: 100%; }
@container (max-width: 760px) {
  .pay-head { display: none; }
  .pay-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Модалка копирования ОИС/МНР */
.copy-what { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.copy-head { display: flex; align-items: center; justify-content: space-between; }
.copy-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.copy-item { margin-left: 0; }
.field-label { font-size: 13px; font-weight: 500; color: var(--z-ink-2); }
</style>
