<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { NOTICE130_SUBITEMS, dtFormsApi, type Notice130Subitem } from '@/api/dtForms'
import type { Import40GoodsItemInput } from '@/types/api'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import DtGoodsPickTable from './DtGoodsPickTable.vue'
import {
  SUBITEM_ATTACH, SUBITEM_KEY, declarantText, dtFormFileName, loadNotice130Choice, notice130Forms, notice130Missing, pickRows,
  saveNotice130Choice, singleItemOverOne, todayIso, type Notice130Doc44Entry, type Notice130Letters,
} from './dtForms'

// «Уведомление (Решение 130)» (23.10.2026, голосовое декларанта: как в их программе — выбрать товары и букву подпункта,
// получить Word, клиент подписывает, мы прикладываем к ДТ). Товары — из формы (страница сохранила ДТ перед открытием,
// документ сервер строит по сохранённой). Буква п. 6 — в ячейке или «Проставить» всем отмеченным; разные буквы — одна
// форма на подпункт в одном файле. Пустые должность, Ф.И.О. или буква — подтверждение «места останутся пустыми».
// После формирования — по желанию строки гр. 44 01416 (родитель кладёт их в форму, сохранит автосейв). Выбор и буквы
// запоминаются в браузере по id ДТ (сервер их не хранит).
const props = defineProps<{
  open: boolean
  caseId: string
  dtId: string
  goods: Import40GoodsItemInput[]
  currency: string | null
  /** Декларант гр. 14 (без него — компания клиента). */
  declarant: { name: string | null; bin: string | null }
  /** Руководитель из профиля клиента — Ф.И.О. по умолчанию. */
  directorName: string | null
  /** Код ОКСМ → буквенный код страны. */
  countryOf?: (code: string) => string | null
  /** Можно дописать строку гр. 44 (ДТ открыта для правки). */
  canAddDoc44: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; doc44: [entries: Notice130Doc44Entry[]] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.dt.forms.notice.${key}`, p ?? {})

// Должность по умолчанию — в документ по-русски (как «Директор» в шаблоне доверенности).
const DEFAULT_POSITION = 'Директор'

const rows = computed(() => pickRows(props.goods, props.countryOf))
const selected = ref<number[]>([])
const letters = ref<Notice130Letters>({})
const bulk = ref<Notice130Subitem | null>(null)
const number = ref('')
const position = ref(DEFAULT_POSITION)
const signer = ref('')
const date = ref<string | null>(todayIso())
const addDoc44 = ref(true)
const busy = ref(false)

const reset = () => {
  const saved = loadNotice130Choice(props.dtId, props.goods.length)
  selected.value = saved ? saved.selected : rows.value.map((r) => r.index)
  letters.value = saved ? { ...saved.letters } : {}
  bulk.value = null
  number.value = ''
  position.value = DEFAULT_POSITION
  signer.value = props.directorName ?? ''
  date.value = todayIso()
  addDoc44.value = props.canAddDoc44
}
watch(() => props.open, (open) => { if (open) reset() }, { immediate: true })

const subitemOptions = computed(() => NOTICE130_SUBITEMS.map((l) => ({ value: l, label: `${l} — ${tr(`subitems.${SUBITEM_KEY[l]}`)}` })))
const setLetter = (index: number, v: unknown) => {
  letters.value = { ...letters.value, [index]: (v as Notice130Subitem | null) ?? null }
}
const selectAll = () => { selected.value = rows.value.map((r) => r.index) }
const clearSelection = () => { selected.value = [] }
/** «Проставить»: выбранная буква — всем отмеченным галочкой. */
const applyBulk = () => {
  if (!bulk.value || !selected.value.length) return
  const next = { ...letters.value }
  for (const i of selected.value) next[i] = bulk.value
  letters.value = next
}

const forms = computed(() => notice130Forms(selected.value, letters.value, number.value))
/** Что приложить — по буквам отмеченных товаров (а, б, ж, и). */
const attachHints = computed(() => {
  const used = new Set(selected.value.map((i) => letters.value[i]).filter(Boolean) as Notice130Subitem[])
  return NOTICE130_SUBITEMS.filter((l) => used.has(l) && SUBITEM_ATTACH[l])
    .map((l) => tr(`attach.${SUBITEM_KEY[l]}`, { code: SUBITEM_ATTACH[l] }))
})
const singleOver = computed(() => singleItemOverOne(rows.value, selected.value, letters.value))
const declarant = computed(() => declarantText(props.declarant.name, props.declarant.bin, t))

const close = () => emit('update:open', false)

const generate = async () => {
  if (busy.value || !selected.value.length || !date.value) return
  const missing = notice130Missing(position.value, signer.value, selected.value, letters.value)
  if (missing.length && !(await confirm({
    title: t('broker.dt.forms.missingTitle', { list: missing.map((k) => t(`broker.dt.forms.missing.${k}`)).join(', ') }),
    content: t('broker.dt.forms.missingText'),
    okText: t('broker.dt.forms.generate'),
    cancelText: t('common.cancel'),
  }))) return
  const day = date.value
  const plan = forms.value
  busy.value = true
  try {
    const res = await dtFormsApi.notice130(props.caseId, props.dtId, {
      number: number.value.trim() || null,
      date: day,
      signerPosition: position.value.trim() || null,
      signerName: signer.value.trim() || null,
      items: selected.value.map((i) => ({ sortOrder: i, subitem: letters.value[i] ?? null })),
    })
    if ('error' in res) {
      message.error(res.error)
      return
    }
    // Имя файла — по-русски, как сам документ.
    saveBlob(res.blob, dtFormFileName('Уведомление_130', props.declarant.name, day))
    saveNotice130Choice(props.dtId, props.goods.length, selected.value, letters.value)
    if (addDoc44.value && props.canAddDoc44) emit('doc44', plan.map((f) => ({ number: f.number, date: day, indexes: f.indexes })))
    message.success(plan.length > 1 ? tr('doneMany', { n: plan.length }) : tr('done'))
    close()
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="tr('title')"
    :width="1080"
    :ok-text="t('broker.dt.forms.generate')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="busy"
    :ok-button-props="{ disabled: !selected.length || !date }"
    data-dt-notice130-modal
    @update:open="emit('update:open', $event)"
    @ok="generate"
  >
    <div class="flex flex-col gap-3 pb-2">
      <p class="m-0 text-[13px] text-ink-3">{{ tr('lead') }}</p>
      <DtGoodsPickTable
        v-model:selected="selected"
        :rows="rows"
        :currency="currency"
        :extra="{ title: tr('subitem'), width: 230 }"
        :label="tr('tableLabel')"
      >
        <template #extra="{ row }">
          <ZSelect
            :value="letters[row.index] ?? null"
            :options="subitemOptions"
            size="sm"
            allow-clear
            :placeholder="tr('subitemPlaceholder')"
            :popup-width="440"
            :aria-label="tr('subitemOf', { n: row.index + 1 })"
            :data-dt-notice-subitem="row.index"
            @update:value="setLetter(row.index, $event)"
          />
        </template>
      </DtGoodsPickTable>

      <div class="flex flex-wrap items-center gap-2" data-dt-notice-bulk>
        <ZButton size="sm" class="max-sm:h-11" data-dt-pick-all @click="selectAll">{{ t('broker.dt.forms.selectAll') }}</ZButton>
        <ZButton size="sm" variant="ghost" class="max-sm:h-11" data-dt-pick-none @click="clearSelection">{{ t('broker.dt.forms.clearSelection') }}</ZButton>
        <span class="ml-auto text-[13px] text-ink-2 max-sm:ml-0">{{ tr('bulkLabel') }}</span>
        <ZSelect
          v-model:value="bulk"
          :options="subitemOptions"
          size="sm"
          :placeholder="tr('subitemPlaceholder')"
          :popup-width="440"
          :aria-label="tr('bulkLabel')"
          class="w-[200px] max-sm:w-full"
          data-dt-notice-bulk-letter
        />
        <ZButton size="sm" class="max-sm:h-11" :disabled="!bulk || !selected.length" data-dt-notice-apply @click="applyBulk">{{ tr('apply') }}</ZButton>
      </div>
      <p class="m-0 text-xs text-muted">{{ tr('subitemsHint') }}</p>

      <ZAlert v-if="forms.length > 1" type="info" show-icon :message="tr('manyForms', { n: forms.length })" data-dt-notice-many />
      <ZAlert v-if="singleOver.length" type="warning" show-icon :message="tr('singleWarning', { list: singleOver.join(', ') })" data-dt-notice-single />
      <ZAlert v-if="attachHints.length" type="info" :message="tr('attachTitle')" data-dt-notice-attach>
        <ul class="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
          <li v-for="h in attachHints" :key="h">{{ h }}</li>
        </ul>
      </ZAlert>

      <div class="grid gap-3 sm:grid-cols-2">
        <ZField :label="tr('number')">
          <ZInput v-model:value="number" :maxlength="50" :placeholder="tr('numberPlaceholder')" data-dt-notice-number />
        </ZField>
        <ZField :label="t('broker.dt.forms.declarant')" :help="t('broker.dt.forms.declarantHelp')">
          <ZInput :value="declarant" readonly data-dt-notice-declarant />
        </ZField>
        <ZField :label="t('broker.dt.forms.position')">
          <ZInput v-model:value="position" :maxlength="200" data-dt-notice-position />
        </ZField>
        <ZField :label="t('broker.dt.forms.signer')">
          <ZInput v-model:value="signer" :maxlength="200" data-dt-notice-signer />
        </ZField>
        <ZField :label="t('broker.dt.forms.date')" required>
          <ZDate v-model:value="date" data-dt-notice-date />
        </ZField>
      </div>
      <div v-if="canAddDoc44">
        <ZCheckbox v-model:checked="addDoc44" data-dt-notice-doc44>{{ tr('addDoc44') }}</ZCheckbox>
      </div>
    </div>
  </ZModal>
</template>
