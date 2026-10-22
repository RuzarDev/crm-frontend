<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhLink, PhLinkBreak, PhMagnifyingGlass, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZPopover from '@/components/z/ZPopover.vue'
import { kedenLinkApi, type KedenCandidateDto, type KedenLinkDto } from '@/api/kedenLink'
import { useConfirm } from '@/ui/confirm'
import { calendarLocale } from '@/ui/date'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { kedenChipText, kedenCorridorText, kedenTone } from '@/utils/kedenLink'

// Чип «КЕДЕН» в шапке ДТ (17.10): текущий статус из журнала КЕДЕН (его шлёт kedenlogger), дата, коридор, ДХТ (если КЕДЕН
// его отдаёт — иначе подписанное пустое поле), как связана ДТ; сотруднику — связать вручную (поиск по номеру/БИН/дате)
// и отвязать. Свои запросы, без автосейва ДТ; после связи сервер мог заполнить номер ДТ — родитель перечитывает ДТ.
const props = defineProps<{
  caseId: string
  dtId: string
  keden: KedenLinkDto | null | undefined
  /** Связывать/отвязывать: право вести ДТ (декларант, РОП, админ). */
  canLink: boolean
  /** Пост подачи и дата гр. А из формы ДТ — для подсказки «Найдено в КЕДЕН» (21.10). */
  post?: string | null
  submissionDate?: string | null
}>()
const emit = defineEmits<{ changed: [value: KedenLinkDto] }>()
const { t, te, locale } = useI18n()
const { confirm } = useConfirm()

const state = ref<KedenLinkDto | null>(props.keden ?? null)
watch(() => props.keden, (v) => { state.value = v ?? null })
const linked = computed(() => !!state.value?.linked)

const DOT: Record<string, string> = {
  neutral: 'bg-ink-3', info: 'bg-tone-info-fg', wait: 'bg-tone-wait-fg', submitted: 'bg-tone-submitted-fg',
  done: 'bg-tone-done-fg', danger: 'bg-danger', pay: 'bg-tone-pay-fg', accent: 'bg-zircon',
}
const tone = computed(() => kedenTone(state.value))
const chipText = computed(() => kedenChipText(state.value, t))

const fmt = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(calendarLocale(locale.value), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

const rows = computed(() => {
  const k = state.value
  if (!k?.linked) return []
  return [
    { key: 'status', label: t('kedenLink.status'), value: k.statusName?.trim() || t('kedenLink.noStatus'), empty: !k.statusName },
    { key: 'statusAt', label: t('kedenLink.statusAt'), value: fmt(k.statusAtUtc) || '—', empty: !k.statusAtUtc },
    { key: 'reg', label: t('kedenLink.regNumber'), value: k.registrationNumber || '—', empty: !k.registrationNumber, mono: true },
    { key: 'corridor', label: t('kedenLink.corridor'), value: kedenCorridorText(k.corridor, t, te), empty: !k.corridor },
    // ДХТ: КЕДЕН может не отдавать его в журнале — поле подписано, не придумываем.
    { key: 'dht', label: t('kedenLink.dht'), value: k.dhtNumber || t('kedenLink.dhtNone'), empty: !k.dhtNumber, mono: !!k.dhtNumber },
    {
      key: 'how', label: t('kedenLink.linkedHow'),
      value: [k.source ? t(`kedenLink.source.${k.source}`) : '', fmt(k.linkedAtUtc)].filter(Boolean).join(' · ') || '—', empty: false,
    },
  ]
})

const open = ref(false)

// ---- Отвязать ----
const unlinking = ref(false)
// Нестрогая связь дополнила номер ДТ из КЕДЕН — при отвязке он вернётся к введённому (или очистится): предупреждаем.
const unlinkHint = computed(() => {
  const back = state.value?.numberOnUnlink
  if (back == null) return t('kedenLink.unlinkConfirmHint')
  return back.trim() ? t('kedenLink.unlinkConfirmHintRestore', { n: back.trim() }) : t('kedenLink.unlinkConfirmHintClear')
})
const unlink = async () => {
  const ok = await confirm({ title: t('kedenLink.unlinkConfirm'), content: unlinkHint.value, okText: t('kedenLink.unlink'), cancelText: t('common.cancel'), danger: true })
  if (!ok) return
  unlinking.value = true
  try {
    state.value = await kedenLinkApi.unlink(props.caseId, props.dtId)
    message.success(t('kedenLink.unlinkedDone'))
    emit('changed', state.value)
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    unlinking.value = false
  }
}

// ---- Связать вручную ----
const searchOpen = ref(false)
const q = ref('')
const bin = ref('')
const from = ref<string | null>(null)
const to = ref<string | null>(null)
const list = ref<KedenCandidateDto[]>([])
const loading = ref(false)
const loadError = ref(false)
const searched = ref(false)
// Поиск открыт кнопкой «Найдено в КЕДЕН» (22.10): тот же запрос, что посчитал подсказку, — свободные ДТ этого поста, даты
// ±3 дня от гр. А уже в полях. Иначе список по умолчанию (50 последних записей БИН клиента) мог не содержать найденных.
const hintPost = ref<string | null>(null)
// Окно дат подсказки (±3 дня от гр. А при открытии) и даты, с которыми прошёл последний поиск: плашка говорит «±3 дн. от
// гр. А», только пока поиск шёл ровно с этим окном; даты поменяли или стёрли — показывает те, что ушли в запрос (22.10).
const hintWindow = ref<{ from: string; to: string } | null>(null)
const ranDates = ref<{ from: string | null; to: string | null } | null>(null)

const search = async () => {
  loading.value = true
  loadError.value = false
  const dates = { from: from.value, to: to.value }
  try {
    list.value = await kedenLinkApi.candidates(props.caseId, props.dtId, {
      q: q.value.trim() || undefined, bin: bin.value.trim() || undefined, from: dates.from ?? undefined, to: dates.to ?? undefined,
      ...(hintPost.value ? { post: hintPost.value, hint: true } : {}),
    })
    ranDates.value = dates
    searched.value = true
  } catch {
    loadError.value = true
    list.value = []
  } finally {
    loading.value = false
  }
}
const isDefaultSearch = computed(() => !hintPost.value && !q.value.trim() && !bin.value.trim() && !from.value && !to.value)
/** fromHint — из кнопки «Найдено в КЕДЕН»: поиск сразу с фильтром подсказки (пост, даты, только свободные ДТ). */
const openSearch = (fromHint = false) => {
  open.value = false
  const h = fromHint ? hintQuery.value : null
  q.value = ''
  bin.value = ''
  from.value = h?.from ?? null
  to.value = h?.to ?? null
  hintPost.value = h?.post ?? null
  hintWindow.value = h ? { from: h.from, to: h.to } : null
  ranDates.value = null
  searched.value = false
  searchOpen.value = true
  void search()
}
/** Снять фильтр подсказки — обычный поиск по умолчанию. */
const clearHint = () => {
  hintPost.value = null
  hintWindow.value = null
  from.value = null
  to.value = null
  void search()
}
const fmtDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(calendarLocale(locale.value), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
}
/** Текст плашки фильтра подсказки — по датам, с которыми поиск на самом деле прошёл. */
const hintBanner = computed(() => {
  const post = hintPost.value
  if (!post) return ''
  const w = hintWindow.value
  const r = ranDates.value ?? { from: from.value, to: to.value }
  if (w && r.from === w.from && r.to === w.to) return t('kedenLink.search.hintFilter', { post, days: WINDOW_DAYS })
  if (!r.from && !r.to) return t('kedenLink.search.hintFilterAnyDate', { post })
  const range = r.from && r.to
    ? `${fmtDay(r.from)} – ${fmtDay(r.to)}`
    : r.from ? t('kedenLink.search.rangeFrom', { d: fmtDay(r.from) }) : t('kedenLink.search.rangeTo', { d: fmtDay(r.to!) })
  return t('kedenLink.search.hintFilterDates', { post, range })
})

const linking = ref<string | null>(null)
const pick = async (c: KedenCandidateDto) => {
  if (linking.value) return
  linking.value = c.id
  try {
    state.value = await kedenLinkApi.link(props.caseId, props.dtId, c.id)
    searchOpen.value = false
    message.success(t('kedenLink.linkedDone'))
    emit('changed', state.value)
  } catch {
    // 409 «уже связана с другой ДТ» — текст показал перехватчик.
  } finally {
    linking.value = null
  }
}
const takenElsewhere = (c: KedenCandidateDto) => !!c.linkedDeclarationId && c.linkedDeclarationId !== props.dtId

// «Нет связи», но в журнале КЕДЕН есть свободные ДТ этого клиента того же поста и ±3 дня от гр. А — кнопка рядом с
// чипом, чтобы ручную связь не искали в окне чипа (21.10). Без поста или даты подсказки нет. Ошибка молчит: это только
// подсказка. Ответ на устаревший запрос (сменились ДТ, пост или дата) не применяется.
const WINDOW_DAYS = 3
const shiftIso = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
const hintQuery = computed(() => {
  const post = (props.post ?? '').trim()
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(props.submissionDate ?? '')?.[1]
  if (!/^\d{5}$/.test(post) || !date) return null
  return { hint: true, post, from: shiftIso(date, -WINDOW_DAYS), to: shiftIso(date, WINDOW_DAYS) }
})
const suggestCount = ref(0)
let suggestSeq = 0
const prefetch = async () => {
  const my = ++suggestSeq
  const query = hintQuery.value
  if (!query) return
  try {
    const found = (await kedenLinkApi.candidates(props.caseId, props.dtId, query)) ?? []
    if (my !== suggestSeq || linked.value) return
    suggestCount.value = found.filter((c) => c.declarationType?.trim().toUpperCase() === 'DT' && !c.linkedDeclarationId).length
  } catch {
    if (my === suggestSeq) suggestCount.value = 0
  }
}
watch([linked, () => props.canLink, () => props.dtId, () => hintQuery.value?.post, () => hintQuery.value?.from], ([isLinked, can]) => {
  suggestCount.value = 0
  suggestSeq++ // ответ прежнего запроса больше не нужен
  if (!isLinked && can) void prefetch()
}, { immediate: true })
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5" data-dt-keden>
    <ZPopover v-model:open="open" :width="360" align="start" :title="t('kedenLink.title')">
      <template #trigger>
        <button
          type="button"
          :class="cn(
            'inline-flex h-7 max-w-[22rem] cursor-pointer items-center gap-1.5 rounded-pill border border-line-strong bg-surface px-2.5 font-sans text-[12.5px] text-ink-2',
            'outline-hidden transition-colors duration-150 hover:bg-sunken focus-visible:shadow-focus motion-reduce:transition-none max-sm:h-9',
          )"
          :aria-label="`${t('kedenLink.chip')}: ${chipText}`"
          :data-keden-tone="tone"
          data-dt-keden-chip
        >
          <span :class="cn('size-[7px] shrink-0 rounded-pill', DOT[tone])" aria-hidden="true" />
          <span class="font-semibold text-ink">{{ t('kedenLink.chip') }}</span>
          <span class="min-w-0 truncate" data-dt-keden-status>{{ chipText }}</span>
          <PhWarningCircle v-if="state?.numberConflict" :size="14" class="shrink-0 text-danger" aria-hidden="true" />
        </button>
      </template>

      <div class="flex flex-col gap-3" data-dt-keden-panel>
        <dl v-if="linked" class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          <template v-for="r in rows" :key="r.key">
            <dt class="text-muted">{{ r.label }}</dt>
            <dd :class="cn('m-0 [overflow-wrap:anywhere]', r.empty ? 'text-muted italic' : 'text-ink', r.mono && 'font-mono')" :data-dt-keden-row="r.key">{{ r.value }}</dd>
          </template>
        </dl>
        <p v-else class="m-0 text-[13px] text-ink-3" data-dt-keden-unlinked>{{ t('kedenLink.notLinkedHint') }}</p>

        <p
          v-if="state?.numberConflict"
          class="m-0 flex gap-1.5 rounded-field bg-tone-danger-bg px-2.5 py-2 text-[12.5px] text-tone-danger-fg"
          role="alert"
          data-dt-keden-conflict
        >
          <PhWarningCircle :size="16" class="mt-px shrink-0" aria-hidden="true" />
          <span>{{ t('kedenLink.conflict', { keden: state.numberConflict }) }}</span>
        </p>

        <div v-if="canLink" class="flex flex-wrap gap-2">
          <ZButton size="sm" class="max-sm:h-11" data-dt-keden-link @click="openSearch()">
            <PhLink :size="14" aria-hidden="true" />{{ linked ? t('kedenLink.relink') : t('kedenLink.link') }}
          </ZButton>
          <ZButton v-if="linked" size="sm" variant="ghost" class="max-sm:h-11" :loading="unlinking" data-dt-keden-unlink @click="unlink">
            <PhLinkBreak :size="14" aria-hidden="true" />{{ t('kedenLink.unlink') }}
          </ZButton>
        </div>
      </div>
    </ZPopover>
    <ZButton
      v-if="canLink && !linked && suggestCount > 0"
      size="sm"
      class="max-sm:h-9"
      data-dt-keden-suggest
      @click="openSearch(true)"
    >
      <PhLink :size="14" aria-hidden="true" />{{ t('kedenLink.suggest', { n: suggestCount }) }}
    </ZButton>

    <ZModal v-if="canLink" v-model:open="searchOpen" :title="t('kedenLink.search.title')" :footer="false" :width="760" data-dt-keden-search>
      <form class="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" @submit.prevent="search">
        <ZField :label="t('kedenLink.search.q')">
          <ZInput v-model:value="q" allow-clear mono data-keden-search-q />
        </ZField>
        <ZField :label="t('kedenLink.search.bin')">
          <ZInput v-model:value="bin" allow-clear mono :maxlength="12" data-keden-search-bin />
        </ZField>
        <ZField :label="t('kedenLink.search.from')">
          <ZDate v-model:value="from" allow-clear data-keden-search-from />
        </ZField>
        <ZField :label="t('kedenLink.search.to')">
          <ZDate v-model:value="to" allow-clear data-keden-search-to />
        </ZField>
        <div class="sm:col-span-2">
          <ZButton variant="primary" html-type="submit" class="max-sm:h-11 max-sm:w-full" :loading="loading" data-keden-search-find>
            <PhMagnifyingGlass :size="16" aria-hidden="true" />{{ t('kedenLink.search.find') }}
          </ZButton>
        </div>
      </form>

      <div
        v-if="hintPost"
        class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-field bg-sunken px-3 py-2 text-[13px] text-ink-2"
        data-keden-search-hint
      >
        <span class="min-w-[12rem] flex-1 [overflow-wrap:anywhere]" data-keden-search-hint-text>{{ hintBanner }}</span>
        <ZButton size="sm" variant="ghost" class="max-sm:h-11" data-keden-search-hint-clear @click="clearHint">{{ t('kedenLink.search.hintClear') }}</ZButton>
      </div>
      <p v-if="isDefaultSearch" class="mt-3 mb-0 text-[13px] text-ink-3">{{ t('kedenLink.search.defaultHint') }}</p>
      <p v-if="loadError" role="alert" class="mt-3 mb-0 text-sm text-danger" data-keden-search-error>{{ t('kedenLink.search.loadError') }}</p>
      <p v-else-if="searched && !loading && !list.length" class="mt-3 mb-0 text-sm text-muted" data-keden-search-empty>{{ t('kedenLink.search.empty') }}</p>

      <ul v-if="list.length" class="m-0 mt-3 flex max-h-[min(420px,55dvh)] list-none flex-col divide-y divide-line overflow-y-auto rounded-panel border border-line p-0" data-keden-search-list>
        <li v-for="c in list" :key="c.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5" :data-keden-candidate="c.id">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="font-mono text-[13.5px] text-ink [overflow-wrap:anywhere]">{{ c.registrationNumber || '—' }}<span class="ml-2 font-sans text-[12px] text-muted">{{ c.declarationType }}</span></span>
            <span class="text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
              {{ [c.statusName, fmt(c.registeredDateTimeUtc ?? c.statusDateTimeUtc), c.declarantName, c.declarantXin, c.customsPost].filter(Boolean).join(' · ') }}
            </span>
            <span v-if="takenElsewhere(c)" class="text-[12px] text-tone-wait-fg" data-keden-candidate-taken>{{ t('kedenLink.search.linkedTo', { n: c.linkedCaseNumber ?? '' }) }}</span>
          </div>
          <ZButton
            size="sm"
            class="max-sm:h-11"
            :disabled="takenElsewhere(c) || c.linkedDeclarationId === dtId || (!!linking && linking !== c.id)"
            :loading="linking === c.id"
            data-keden-candidate-pick
            @click="pick(c)"
          >{{ t('kedenLink.search.pick') }}</ZButton>
        </li>
      </ul>
    </ZModal>
  </span>
</template>
