<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { vUppercase } from '@/directives/uppercase'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { DtFormState } from '../dtPayload'
import DtsAddSheet from './DtsAddSheet.vue'
import DtsMainSheet from './DtsMainSheet.vue'
import DtsQuestions from './DtsQuestions.vue'
import DtsToolbar from './DtsToolbar.vue'
import { countGoodsValuationChanges, syncGoodsValuationForDts } from './dtsFreeOfCharge'
import type { DtsState } from './useDts'

// Раздел «ДТС» страницы ДТ (волна 6в, Task 4; доска DtDts). Данные и действия — из общего загрузчика страницы
// (useDts): раздел сам ничего не грузит и форму не обходит (прежний раздел глубоко следил за всей формой ДТ на каждое
// нажатие). Пишет в форму ДТ только поля ДТС (сохраняются обычным PUT): форма ДТС-1/ДТС-2 (с гр. 43 товаров), вопросы
// 7–9, причины выбора метода, место для гр. 17. Эти поля доступны и без листа (ДТС ещё грузится или не загрузилась).
// У ДТ, заменённой разделением, ДТС не считается — вместо листа одна строка: оформлять в ДТ ЕТТ и ВТО.
// - Плашка «Для ДТС не хватает N» — только пункты самой ДТС (как число в навигации), и отдельной строкой — что XML ДТС
//   требует и готовности ДТ (её пункты — в «До подачи»). Ответ XML 400 — своей плашкой со списком.
// - ДТС-1 ↔ ДТС-2: у товаров с гр. 43 = 1 (6) или пустой метод станет 6 (1) — с подтверждением и числом; товары с
//   другим методом не трогаем (их покажет проверка ДТС).
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  dts: DtsState
  /** Код статьи расхода → название (справочник расходов страницы). */
  expenseLabels: Record<string, string>
  /** Без «XML» ДТС (исходная ДТ разделения). */
  noXml?: boolean
}>()
const emit = defineEmits<{ 'open-panel': [] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const td = (key: string, p?: Record<string, unknown>) => t(`broker.dt.dts.${key}`, p ?? {})

const view = computed(() => props.dts.view.value)
const sheet = computed(() => view.value?.sheet ?? null)
const items = computed(() => props.dts.items.value ?? [])

const onForm = async (free: boolean) => {
  if (props.readonly || free === !!props.form.dtsFreeOfCharge) return
  const n = countGoodsValuationChanges(props.form.goodsItems, free)
  if (n > 0) {
    const ok = await confirm({
      title: td('switchTitle'),
      content: td(free ? 'switchTo2' : 'switchTo1', { n }),
      okText: td('switchOk'),
      cancelText: t('common.cancel'),
    })
    if (!ok) return
  }
  props.form.dtsFreeOfCharge = free
  const changed = syncGoodsValuationForDts(props.form.goodsItems, free)
  if (changed) message.success(td('switched', { n: changed }))
}
</script>

<template>
  <section class="@container flex flex-col gap-5" data-dt-dts :aria-busy="dts.loading.value || undefined">
    <DtsToolbar
      :free="!!form.dtsFreeOfCharge"
      :readonly="readonly"
      :printing="dts.printing.value"
      :xml-loading="dts.xmlLoading.value"
      :no-xml="noXml"
      @form="onForm"
      @print="dts.print"
      @xml="dts.xml"
    />

    <ZAlert v-if="dts.xmlErrors.value?.length" type="error" show-icon :message="td('xmlErrors', { n: dts.xmlErrors.value.length })" data-dts-xml-errors>
      <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
        <li v-for="(e, i) in dts.xmlErrors.value" :key="i">{{ e }}</li>
      </ul>
    </ZAlert>

    <div v-if="items.length || dts.dtMissingCount.value" class="flex flex-col gap-2" data-graph="ДТС" data-dts-missing-wrap>
      <ZAlert v-if="items.length" type="warning" show-icon :message="td('missing', { n: items.length })" data-dts-missing>
        <ul class="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-0.5 p-0">
          <li v-for="(i, k) in items" :key="k" data-dts-missing-item>{{ i.text }}<span v-if="k < items.length - 1" aria-hidden="true" class="ml-1.5">·</span></li>
        </ul>
      </ZAlert>
      <p v-if="dts.dtMissingCount.value" class="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2" data-dts-dt-missing>
        {{ td('dtNotReady', { n: dts.dtMissingCount.value }) }}
        <ZButton variant="link" size="sm" class="max-sm:h-11" data-dts-open-panel @click="emit('open-panel')">{{ td('openPanel') }} →</ZButton>
      </p>
    </div>

    <p v-if="!dts.enabled.value" class="m-0 rounded-row bg-canvas px-4 py-3 text-sm text-ink-2" role="status" data-dts-replaced>
      {{ td('replaced') }}
    </p>

    <ZAlert
      v-if="dts.failed.value"
      type="error"
      show-icon
      :message="sheet ? td('refreshError') : td('loadError')"
      data-dts-load-error
    >
      <template #action>
        <ZButton size="sm" class="max-sm:h-11" :loading="dts.loading.value" data-dts-retry @click="dts.refresh()">{{ td('retry') }}</ZButton>
      </template>
    </ZAlert>

    <div v-if="!sheet && dts.loading.value" class="border-t border-line pt-5" :aria-label="td('loading')" data-dts-skeleton>
      <ZSkeleton height="120px" />
    </div>
    <DtsMainSheet v-else-if="sheet" :sheet="sheet" class="border-t border-line pt-5" />
    <!-- Вопросы и место — поля самой ДТ: править можно и без расчёта листа. -->
    <DtsQuestions :form="form" :readonly="readonly" class="border-t border-line pt-5" />
    <ZField
      class="max-w-md border-t border-line pt-5"
      :label="t('broker.dt.dts.sheet.place')"
      :extra="t('broker.dt.dts.sheet.placeHint')"
      data-graph="ДТС"
      data-goods-field="dtsPlace"
      data-dts-place-field
    >
      <ZInput
        v-uppercase
        :value="form.dtsPlaceName"
        :disabled="readonly"
        :placeholder="form.incotermsPlace || t('broker.dt.dts.sheet.placePlaceholder')"
        data-dts-place
        @update:value="form.dtsPlaceName = $event || null"
      />
    </ZField>
    <div v-if="!sheet && dts.loading.value" class="border-t border-line pt-5" aria-hidden="true">
      <ZSkeleton :lines="6" height="28px" />
    </div>
    <DtsAddSheet
      v-else-if="sheet"
      :sheet="sheet"
      :form="form"
      :readonly="readonly"
      :mismatch="dts.mismatch.value"
      :expense-labels="expenseLabels"
      :recalc-loading="dts.recalcLoading.value"
      class="border-t border-line pt-5"
      @recalc="dts.recalc45()"
    />
  </section>
</template>
