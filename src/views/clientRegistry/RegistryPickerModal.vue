<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { clientRegistryApi, type RegistryDocument } from '@/api/clientRegistry'
import type { Import40FileDto } from '@/api/import40'
import { DOC_CHECKLIST } from '@/views/client/docKinds'
import { cn } from '@/ui/cn'
import { defaultDocKind, docTitle, filterDocs, STATUS_TONE, validDate, validityHint } from './registry'

// «Выбрать из реестра» в мастере заявки (шаг «Документы»): документ реестра клиента прикладывается к заявке
// копией файлов с видом документа (по категории, можно сменить). Истёкшие видны, но с пометкой «истёк»
// и предупреждением — приложить их можно (решает клиент), архивных в списке нет.
const props = defineProps<{ open: boolean; clientId: string; caseId: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; attached: [files: Import40FileDto[]] }>()
const { t } = useI18n()

const docs = shallowRef<RegistryDocument[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const q = ref('')
const selected = shallowRef<RegistryDocument | null>(null)
const kind = ref<string>('other')
const saving = ref(false)

const load = async () => {
  state.value = 'loading'
  try {
    docs.value = await clientRegistryApi.list(props.clientId, { silent: true })
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
watch(() => props.open, (v) => {
  if (!v) return
  q.value = ''
  selected.value = null
  void load()
}, { immediate: true })

// Действующие — выше истёкших: выбирать обычно из них.
const rows = computed(() => {
  const list = filterDocs(docs.value, q.value, 'all', 'all')
  return [...list.filter((d) => d.status !== 'expired'), ...list.filter((d) => d.status === 'expired')]
})
const kindOptions = computed(() => [...DOC_CHECKLIST.map((d) => d.key), 'other' as const]
  .map((k) => ({ value: k, label: t(`client.docKind.${k}.name`) })))
const pick = (d: RegistryDocument) => {
  selected.value = d
  kind.value = defaultDocKind(d.category)
}

const submit = async () => {
  const d = selected.value
  if (!d || saving.value) return
  saving.value = true
  try {
    const files = await clientRegistryApi.attachToCase(props.caseId, d.id, kind.value)
    emit('attached', files)
    emit('update:open', false)
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('clientRegistry.picker.title')"
    :width="600"
    :ok-text="t('clientRegistry.picker.attach')"
    :cancel-text="t('clientRegistry.form.cancel')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !selected }"
    data-registry-picker
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 pb-2">
      <p class="m-0 text-sm text-ink-2 text-pretty">{{ t('clientRegistry.picker.hint') }}</p>
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('clientRegistry.search')"
        :aria-label="t('clientRegistry.search')"
        class="max-sm:h-11"
        data-picker-search
        @update:value="q = $event ?? ''"
      />

      <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true"><ZSkeleton v-for="i in 3" :key="i" height="48px" /></div>
      <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3" role="alert" data-picker-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('clientRegistry.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t('clientRegistry.retry') }}</ZButton>
      </div>
      <p v-else-if="!docs.length" class="m-0 rounded-row bg-sunken px-4 py-3 text-sm text-ink-2" data-picker-empty>{{ t('clientRegistry.picker.empty') }}</p>
      <p v-else-if="!rows.length" class="m-0 px-1 text-sm text-ink-3">{{ t('clientRegistry.nothingFound') }}</p>
      <ul v-else role="listbox" :aria-label="t('clientRegistry.picker.title')" class="m-0 flex max-h-[46vh] list-none flex-col overflow-y-auto rounded-row border border-solid border-line p-0" data-picker-list>
        <li
          v-for="(d, i) in rows"
          :key="d.id"
          role="option"
          :aria-selected="selected?.id === d.id"
          tabindex="0"
          :class="cn(
            'flex min-h-11 cursor-pointer items-start gap-3 px-3.5 py-2.5 outline-hidden focus-visible:shadow-focus',
            i > 0 && 'border-0 border-t border-solid border-line',
            selected?.id === d.id ? 'bg-sunken' : 'hover:bg-sunken/60',
          )"
          :data-picker-doc="d.id"
          :data-status="d.status"
          @click="pick(d)"
          @keydown.enter.prevent="pick(d)"
          @keydown.space.prevent="pick(d)"
        >
          <span
            :class="cn('mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-pill border-[1.5px] border-solid', selected?.id === d.id ? 'border-navy bg-navy text-white' : 'border-line-strong')"
            aria-hidden="true"
          ><PhCheck v-if="selected?.id === d.id" :size="11" weight="bold" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold break-words text-ink">{{ docTitle(d, t) }}</span>
            <span class="block text-xs text-muted">
              {{ d.validUntil ? t('clientRegistry.until', { date: validDate(d.validUntil) }) : t('clientRegistry.hint.unlimited') }}
              <template v-if="d.validUntil"> · {{ validityHint(d, t) }}</template>
              · {{ t('clientRegistry.picker.filesCount', { n: d.files.length }) }}
            </span>
          </span>
          <ZTag :tone="STATUS_TONE[d.status]" size="sm" class="shrink-0">{{ t(`clientRegistry.status.${d.status}`) }}</ZTag>
        </li>
      </ul>

      <template v-if="selected">
        <p v-if="selected.status === 'expired'" class="m-0 flex items-start gap-1.5 rounded-row bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg" role="alert" data-picker-expired>
          <PhWarningCircle :size="16" weight="bold" class="mt-px shrink-0" aria-hidden="true" />
          <span>{{ t('clientRegistry.picker.expiredWarn') }}</span>
        </p>
        <ZField :label="t('clientRegistry.picker.kind')">
          <ZSelect :value="kind" :options="kindOptions" class="max-sm:h-11" data-picker-kind @update:value="kind = String($event ?? 'other')" />
        </ZField>
      </template>
    </div>
  </ZModal>
</template>
