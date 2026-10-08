<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFile } from '@phosphor-icons/vue'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import { countryName } from '@/utils/countries'
import { formatDay } from '@/views/broker/list'
import CaseTeam from './CaseTeam.vue'
import CaseFilesDrawer from './CaseFilesDrawer.vue'
import CaseHistoryDrawer from './CaseHistoryDrawer.vue'
import { FILE_SECTIONS, authorLine, formatLogStamp, sectionLabelKey, sectionOf } from './caseFormat'
import type { CasePerms } from './casePermissions'
import type { CaseActions } from './useCaseActions'

// Правая колонка (доски Case/CaseSvh): команда, данные заявки, файлы по разделам, три последние записи истории.
const props = defineProps<{ kase: Import40CaseDto; files: Import40FileDto[]; perms: CasePerms; actions: CaseActions }>()
const emit = defineEmits<{ edit: [] }>()
const { t, locale } = useI18n()

// Справочник стран — только для названия страны отправителя/получателя; лениво, без тоста.
const countries = ref<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((r) => { countries.value = r }).catch(() => {})
const country = (code: string | null | undefined) => (code ? countryName(code, countries.value) : '')

const INTL: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const info = computed(() => {
  const c = props.kase
  const rows: { key: string; label: string; value: string; mono?: boolean }[] = []
  if (c.containers.length) {
    rows.push({ key: 'containers', label: t('broker.case.info.containers'), value: c.containers.map((x) => x.containerNumber).join(', '), mono: true })
  }
  const sender = [c.clientSenderName, country(c.clientSenderCountryCode)].filter(Boolean).join(' · ')
  if (sender) rows.push({ key: 'sender', label: t('broker.case.info.sender'), value: sender })
  const receiver = [
    c.clientReceiverName,
    c.clientReceiverBin ? t('broker.case.info.bin', { bin: c.clientReceiverBin }) : '',
    country(c.clientReceiverCountryCode),
  ].filter(Boolean).join(' · ')
  if (receiver) rows.push({ key: 'receiver', label: t('broker.case.info.receiver'), value: receiver })
  if (c.clientEstimatedValue != null || c.clientCurrencyCode) {
    const value = c.clientEstimatedValue != null ? c.clientEstimatedValue.toLocaleString(INTL[locale.value] ?? 'ru-RU') : '—'
    rows.push({ key: 'value', label: t('broker.case.info.value'), value: [value, c.clientCurrencyCode].filter(Boolean).join(' ') })
  }
  rows.push({ key: 'created', label: t('broker.case.info.created'), value: formatDay(c.createdAtUtc) })
  return rows
})

const fileCounts = computed(() => FILE_SECTIONS.map((key) => ({ key, n: props.files.filter((f) => sectionOf(f) === key).length })))
const filesOpen = ref(false)
const historyOpen = ref(false)
const lastLogs = computed(() => (props.kase.logs ?? []).slice(0, 3))
const now = () => new Date()

const panel = 'rounded-panel border border-line bg-surface px-[18px] py-4'
const head = 'mb-2.5 flex items-center gap-2'
const link = 'ml-auto inline-flex min-h-8 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-xs font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <aside class="flex min-w-0 flex-col gap-3.5" data-case-side>
    <CaseTeam :kase="kase" :perms="perms" :actions="actions" />

    <section aria-labelledby="case-info-title" :class="panel" data-case-info>
      <div :class="head">
        <h3 id="case-info-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.case.info.title') }}</h3>
        <button v-if="perms.canManageDraft" type="button" :class="link" data-case-edit @click="emit('edit')">{{ t('broker.case.info.edit') }}</button>
      </div>
      <dl class="m-0">
        <div
          v-for="(r, i) in info"
          :key="r.key"
          :class="['grid grid-cols-[104px_minmax(0,1fr)] gap-2.5 py-1.5 text-[13px]', i > 0 && 'border-t border-line']"
          :data-info="r.key"
        >
          <dt class="text-muted">{{ r.label }}</dt>
          <dd :class="['m-0 min-w-0 text-ink [overflow-wrap:anywhere]', r.mono && 'font-mono']">{{ r.value }}</dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="case-files-title" :class="panel" data-case-files>
      <div :class="head">
        <h3 id="case-files-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.case.files.title') }}</h3>
        <button v-if="files.length" type="button" :class="link" data-case-files-all @click="filesOpen = true">
          {{ t('broker.case.files.all', { n: files.length }) }}
        </button>
      </div>
      <ul class="m-0 list-none p-0">
        <li
          v-for="(s, i) in fileCounts"
          :key="s.key"
          :class="['flex items-center gap-2.5 py-1.5 text-[13px]', i > 0 && 'border-t border-line']"
          :data-file-count="s.key"
        >
          <PhFile :size="15" class="shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 text-ink">{{ t(sectionLabelKey(s.key)) }}</span>
          <span :class="['tabular-nums', s.n ? 'text-ink-2' : 'text-muted']">{{ s.n || '—' }}</span>
        </li>
      </ul>
    </section>

    <section aria-labelledby="case-history-title" :class="panel" data-case-history>
      <div :class="head">
        <h3 id="case-history-title" class="m-0 text-sm font-semibold text-ink">{{ t('broker.case.history.title') }}</h3>
        <button v-if="kase.logs?.length" type="button" :class="link" data-case-history-all @click="historyOpen = true">
          {{ t('broker.case.history.all') }}
        </button>
      </div>
      <p v-if="!lastLogs.length" class="m-0 text-sm text-muted">{{ t('broker.case.history.empty') }}</p>
      <ol v-else class="m-0 list-none p-0">
        <li v-for="l in lastLogs" :key="l.id" class="grid grid-cols-[12px_minmax(0,1fr)] gap-2.5 py-1.5" data-history-row>
          <span class="mt-1.5 size-[7px] rounded-pill bg-line-strong" aria-hidden="true" />
          <div class="min-w-0">
            <div class="text-[13px] text-ink [overflow-wrap:anywhere]">{{ l.text }}</div>
            <div class="mt-px text-xs text-muted">{{ [authorLine(l.changedByName, l.changedByBusinessRole, t), formatLogStamp(l.createdAtUtc, now(), t)].filter(Boolean).join(' · ') }}</div>
          </div>
        </li>
      </ol>
    </section>

    <CaseFilesDrawer v-model:open="filesOpen" :case-id="kase.id" :files="files" />
    <CaseHistoryDrawer v-model:open="historyOpen" :logs="kase.logs ?? []" />
  </aside>
</template>
