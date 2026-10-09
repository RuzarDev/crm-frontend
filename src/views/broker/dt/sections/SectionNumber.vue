<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { DtFormState } from '../dtPayload'
import { buildFromParts, cleanTail, ddmmyyOf, isoOfDdmmyy, isStandardNumber, partsOf, tailOf } from '../dtNumber'
import { withCurrent } from '../dtOptions'

// Гр. А — регистрационный номер ДТ: пост подачи, дата и 7 цифр. Номер собирается сам («пост/ДДММГГ/7 цифр») и
// пересобирается при правке любой из трёх частей — но только когда все три полные: пока части не хватает, номер
// остаётся как есть (случайный Backspace не должен стереть зарегистрированный номер, автосейв сохранил бы null).
// Пока пост или дата не тронуты пользователем, они берутся из самого номера (дата формы по умолчанию — сегодня).
// «Ввести номер целиком» — ручной режим для номеров другого формата (КЕДЕН): свободная строка, части её не
// трогают; очистить номер можно только здесь (пустая строка → null на сервере). Номер, пришедший с сервера,
// не пересобирается: пересборка — только по правке пользователя.
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  postOptions: { value: string; label: string }[]
}>()
const { t } = useI18n()

const tail = ref(tailOf(props.form.declarationNumber))
// Номер уже есть и не стандартный — сразу ручной режим (иначе поле «7 цифр» выглядело бы пустым и вело к потере).
const manual = ref(!!props.form.declarationNumber && !isStandardNumber(props.form.declarationNumber))
/** Последнее значение, которое записали мы: отличать собственные записи от пришедших извне. */
let written: string | null = null
/** Пост и дата тронуты пользователем: тогда в номер идут они, иначе — части самого номера. */
let touchedPost = false
let touchedDate = false

const write = (num: string) => {
  written = num
  if (props.form.declarationNumber !== num) props.form.declarationNumber = num
}
// Пересборка только из полных частей; неполные — номер не трогаем.
const rebuild = () => {
  const n = partsOf(props.form.declarationNumber)
  const formPost = (props.form.submissionCustomsOfficeCode ?? '').trim()
  const formDate = ddmmyyOf(props.form.submissionDate)
  const post = (touchedPost ? formPost : n?.post) || formPost || n?.post || ''
  const d6 = (touchedDate ? formDate : n?.d6) ?? formDate ?? n?.d6 ?? null
  const built = buildFromParts(post, d6, tail.value)
  if (built) write(built)
}

// Номер сменился не нами (перезагрузка ДТ, ответ сервера): подхватываем хвост и режим; пустой — не трогаем,
// чтобы не стереть набранные цифры.
watch(() => props.form.declarationNumber, (num) => {
  if (num === written || !num) return
  tail.value = tailOf(num)
  manual.value = !isStandardNumber(num)
})

const onPost = (v: unknown) => {
  touchedPost = true
  props.form.submissionCustomsOfficeCode = v == null ? '' : String(v)
  if (!manual.value) rebuild()
}
const onPostText = (v: string) => onPost(v.trim())
const onDate = (v: string | null) => {
  touchedDate = true
  props.form.submissionDate = v
  if (!manual.value) rebuild()
}
const onTail = (e: Event) => {
  const el = e.target as HTMLInputElement
  const clean = cleanTail(el.value)
  if (el.value !== clean) el.value = clean // нецифры в поле не остаются, даже когда значение осталось прежним
  tail.value = clean
  rebuild()
}
const onManual = (v: string) => {
  written = v
  props.form.declarationNumber = v
}
const toManual = () => { manual.value = true }
const toAuto = () => {
  manual.value = false
  const n = partsOf(props.form.declarationNumber)
  if (n) {
    // Стандартный номер — истина: части формы подстраиваются под него, а не наоборот.
    tail.value = n.tail
    touchedPost = false
    touchedDate = false
    if (props.form.submissionCustomsOfficeCode !== n.post) props.form.submissionCustomsOfficeCode = n.post
    const iso = isoOfDdmmyy(n.d6)
    if (iso && ddmmyyOf(props.form.submissionDate) !== n.d6) props.form.submissionDate = iso
    return
  }
  // Номер другого формата: собираем из частей, если они полные; иначе номер остаётся как есть.
  rebuild()
}

// Пост из справочника КЕДЕН; сохранённый пост вне списка показывается и подсвечивается, а не теряется.
const postSel = computed(() => withCurrent(props.postOptions, props.form.submissionCustomsOfficeCode))

const hasPosts = computed(() => props.postOptions.length > 0)
const result = computed(() => props.form.declarationNumber || '')
</script>

<template>
  <section class="@container flex flex-col gap-4" data-dt-number-section>
    <h2 class="m-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink">
      {{ t('broker.dt.number.title') }}
      <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: 'А' }) }}</span>
    </h2>

    <div class="grid grid-cols-1 gap-4 @md:grid-cols-2 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <ZField
        :label="t('broker.dt.number.post')"
        data-graph="А"
        class="@md:col-span-2 @2xl:col-span-1"
        :validate-status="postSel.unknown ? 'warning' : ''"
        :help="postSel.unknown ? t('broker.dt.general.notInList', { value: form.submissionCustomsOfficeCode }) : ''"
      >
        <ZSelect
          v-if="hasPosts"
          :value="form.submissionCustomsOfficeCode || null"
          :options="postSel.options"
          show-search
          :disabled="readonly"
          :placeholder="t('broker.dt.number.postPlaceholder')"
          :popup-width="420"
          @update:value="onPost"
        />
        <!-- Справочник постов не загрузился — код вводится вручную. -->
        <ZInput
          v-else
          :value="form.submissionCustomsOfficeCode"
          :disabled="readonly"
          mono
          :maxlength="16"
          :placeholder="t('broker.dt.number.postPlaceholder')"
          @update:value="onPostText"
        />
      </ZField>
      <ZField :label="t('broker.dt.number.date')">
        <ZDate :value="form.submissionDate" :disabled="readonly" @update:value="onDate" />
      </ZField>
      <ZField :label="t('broker.dt.number.tail')">
        <ZInput
          :value="tail"
          :disabled="readonly || manual"
          mono
          placeholder="0000000"
          inputmode="numeric"
          autocomplete="off"
          @change="onTail"
        />
      </ZField>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-field bg-sunken px-3 py-2.5" data-dt-number-row>
      <template v-if="manual">
        <ZField :label="t('broker.dt.number.manualLabel')" class="min-w-0 flex-1 basis-64">
          <ZInput
            :value="form.declarationNumber"
            :disabled="readonly"
            mono
            allow-clear
            :placeholder="t('broker.dt.number.manualPlaceholder')"
            data-dt-number-manual
            @update:value="onManual"
          />
        </ZField>
        <p class="m-0 min-w-0 flex-1 basis-56 text-xs text-muted">{{ t('broker.dt.number.manualHint') }}</p>
      </template>
      <template v-else>
        <span class="text-xs text-muted">{{ t('broker.dt.number.result') }}</span>
        <output class="font-mono text-lg font-semibold tabular-nums text-ink" data-dt-number-result :aria-label="t('broker.dt.number.result')">{{ result || '—' }}</output>
        <p class="m-0 min-w-0 flex-1 basis-56 text-xs text-muted">{{ result ? t('broker.dt.number.assembled') : t('broker.dt.number.incomplete') }}</p>
      </template>
      <ZButton v-if="!readonly" size="sm" variant="ghost" class="max-sm:h-11" data-dt-number-toggle @click="manual ? toAuto() : toManual()">
        {{ manual ? t('broker.dt.number.auto') : t('broker.dt.number.manual') }}
      </ZButton>
    </div>
  </section>
</template>
