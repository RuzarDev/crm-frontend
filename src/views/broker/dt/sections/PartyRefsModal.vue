<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import { partyRefsApi, type PartyRefDto } from '@/api/partyRefs'
import { useBinLookup } from '@/composables/useBinLookup'

// Справочник сторон (гр. 2 — отправители, гр. 8 — получатели): поиск по наименованию или БИН, выбор строки —
// pick. Если в строке 12 цифр — «Найти в ГБД ЮЛ и подставить» (found с карточкой реестра).
const props = defineProps<{
  open: boolean
  target: 'sender' | 'receiver'
  /** Строка поиска при открытии — наименование стороны. */
  initialQuery: string
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; pick: [ref: PartyRefDto]; found: [company: CompanyLookupDto] }>()
const { t } = useI18n()
const tp = (key: string) => t(`broker.dt.parties.refs.${key}`)

const query = ref('')
const results = ref<PartyRefDto[]>([])
const loading = ref(false)

const search = async (q: string) => {
  loading.value = true
  try {
    results.value = await partyRefsApi.search(q.trim())
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}
const onQuery = (v: string) => {
  query.value = v
  void search(v)
}
watch(() => props.open, (on) => {
  if (!on) return
  query.value = props.initialQuery
  results.value = []
  void search(query.value)
}, { immediate: true })

const queryIsBin = computed(() => isBinLike(query.value))
const { loading: binLoading, lookup } = useBinLookup()
const findInRegistry = async () => {
  const company = await lookup(query.value)
  if (company) emit('found', company)
}
const address = (r: PartyRefDto) => [r.countryCode, r.city, r.street, r.house].filter(Boolean).join(', ') || '—'
</script>

<template>
  <ZModal
    :open="open"
    :title="target === 'sender' ? tp('titleSender') : tp('titleReceiver')"
    :width="720"
    :footer="false"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3" data-party-refs>
      <ZInput
        :value="query"
        type="search"
        allow-clear
        autofocus
        :placeholder="tp('search')"
        :aria-label="tp('search')"
        data-party-refs-search
        @update:value="onQuery"
      />
      <div class="relative min-h-16">
        <ul v-if="results.length" class="m-0 flex max-h-96 list-none flex-col gap-0.5 overflow-y-auto p-0" :aria-busy="loading">
          <li v-for="r in results" :key="r.id">
            <button
              type="button"
              class="flex min-h-11 w-full cursor-pointer flex-col items-start gap-0.5 rounded-row border-0 bg-transparent px-2.5 py-2 text-left font-sans outline-hidden hover:bg-sunken focus-visible:shadow-focus"
              data-party-ref
              @click="emit('pick', r)"
            >
              <span class="text-sm font-semibold text-ink">{{ r.name }}</span>
              <span class="text-xs text-muted">
                <template v-if="r.bin">{{ t('broker.dt.parties.bin') }} <span class="font-mono">{{ r.bin }}</span> · </template>{{ address(r) }}
              </span>
            </button>
          </li>
        </ul>
        <div v-else-if="loading" class="flex justify-center py-4"><ZSpin /></div>
        <p v-else class="m-0 py-2 text-sm text-muted" data-party-refs-empty>{{ tp('empty') }}</p>
        <div v-if="!loading && queryIsBin" class="mt-3">
          <ZButton variant="primary" :loading="binLoading" data-party-refs-registry @click="findInRegistry">
            <template #icon><PhMagnifyingGlass :size="16" aria-hidden="true" /></template>
            {{ tp('findInRegistry') }}
          </ZButton>
        </div>
      </div>
    </div>
  </ZModal>
</template>
