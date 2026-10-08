<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { import40Api } from '@/api/import40'
import type { SalesQuoteListItem } from '@/api/sales'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { CaseStepContext } from '../caseContext'
import { dtLabel } from '../caseSteps'
import { dtPath } from '../declarations'

// «Импорт из КП» (прежнее окно карточки): КП клиента этой заявки (GET quotes, с поиском), куда добавить товары —
// новая ДТ или существующая. POST import-quote { quoteId, targetDeclarationId, force }; 409 (КП уже импортирован) —
// вопрос «Добавить ещё раз?» и повтор с force. После успеха — тост «Добавлено товаров: N», перечитывание и переход к ДТ.
// Список КП не загрузился — сообщение в окне с «Повторить» (тост уже показал перехватчик).
const props = defineProps<{ open: boolean; ctx: CaseStepContext }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()
const uid = useId()

const KEY = 'dt-quote'
const quotes = ref<SalesQuoteListItem[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const form = reactive({ quoteId: null as string | null, target: 'new' as 'new' | 'existing', declarationId: null as string | null })

const load = async () => {
  loading.value = true
  loadFailed.value = false
  try {
    quotes.value = await import40Api.caseQuotes(props.ctx.kase.id)
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}
watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, { quoteId: null, target: 'new', declarationId: null })
  void load()
}, { immediate: true })

const quoteOptions = computed(() => quotes.value.map((q) => ({ value: q.id, label: `№${q.number}/${q.year} — ${q.clientName}` })))
const hasDts = computed(() => props.ctx.kase.declarations.length > 0)
const targetOptions = computed(() => [
  { value: 'new', label: t('import40Case.targetNew') },
  { value: 'existing', label: t('import40Case.targetExisting'), disabled: !hasDts.value },
])
const dtOptions = computed(() => props.ctx.kase.declarations.map((d) => ({ value: d.id, label: dtLabel(props.ctx.kase, d.id, t) })))
const canSubmit = computed(() => !!form.quoteId && (form.target === 'new' || !!form.declarationId))
const importing = computed(() => props.ctx.actions.isPending(KEY))

const statusOf = (e: unknown) => (e as { response?: { status?: number } } | null)?.response?.status

const submit = async (force = false): Promise<void> => {
  if (!canSubmit.value || !form.quoteId) return
  const caseId = props.ctx.kase.id
  const payload = { quoteId: form.quoteId, targetDeclarationId: form.target === 'new' ? null : form.declarationId, force }
  let conflict = false
  let res: { declarationId: string; addedGoods: number } | null = null
  const ok = await props.ctx.actions.mutate(KEY, async () => {
    try {
      res = await import40Api.importQuote(caseId, payload)
    } catch (e) {
      if (statusOf(e) !== 409) throw e
      conflict = true
    }
  }, { reload: false })
  if (conflict) {
    const again = await confirm({
      title: t('import40Case.quoteImportedTitle'),
      content: t('import40Case.quoteImportedContent'),
      okText: t('import40Case.add'),
      cancelText: t('common.cancel'),
    })
    if (again) await submit(true)
    return
  }
  const done = res as { declarationId: string; addedGoods: number } | null
  if (!ok || !done) return
  message.success(t('import40Case.goodsAdded', { n: done.addedGoods }))
  emit('update:open', false)
  await props.ctx.actions.reload()
  await router.push(dtPath(caseId, done.declarationId))
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('import40Case.importTitle')"
    :ok-text="t('import40Case.importOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="importing"
    :ok-button-props="{ disabled: !canSubmit }"
    data-quote-modal
    @update:open="emit('update:open', $event)"
    @ok="submit()"
  >
    <div class="flex flex-col gap-4 pb-2">
      <div class="flex flex-col gap-1.5">
        <span :id="`${uid}-quote`" class="text-[13px] font-medium text-ink-2">{{ t('import40Case.quoteLabel') }}</span>
        <ZSelect
          v-model:value="form.quoteId"
          show-search
          :options="quoteOptions"
          :loading="loading"
          :placeholder="t('import40Case.quotePh')"
          :aria-labelledby="`${uid}-quote`"
          class="max-sm:*:h-11"
          data-quote-select
        />
        <div v-if="loadFailed" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-tone-danger-fg" role="alert" data-quote-load-error>
          {{ t('import40Case.quoteListFailed') }}
          <ZButton variant="link" size="sm" data-quote-retry @click="load">{{ t('broker.case.declaring.quote.retry') }}</ZButton>
        </div>
        <p v-else-if="!loading && !quotes.length" class="m-0 text-[13px] text-muted" data-quote-empty>{{ t('broker.case.declaring.quote.empty') }}</p>
      </div>

      <div class="flex flex-col gap-1.5">
        <span :id="`${uid}-target`" class="text-[13px] font-medium text-ink-2">{{ t('import40Case.targetLabel') }}</span>
        <ZRadioGroup v-model:value="form.target" :options="targetOptions" :aria-labelledby="`${uid}-target`" data-quote-target />
      </div>

      <div v-if="form.target === 'existing'" class="flex flex-col gap-1.5">
        <span :id="`${uid}-dt`" class="text-[13px] font-medium text-ink-2">{{ t('import40Case.declarationLabel') }}</span>
        <ZSelect
          v-model:value="form.declarationId"
          :options="dtOptions"
          :placeholder="t('import40Case.selectDt')"
          :aria-labelledby="`${uid}-dt`"
          class="max-sm:*:h-11"
          data-quote-dt
        />
      </div>
    </div>
  </ZModal>
</template>
