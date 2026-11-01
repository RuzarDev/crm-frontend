<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import ZSelect from '@/components/z/ZSelect.vue'
import CustomsPostOption from '@/components/customsPost/CustomsPostOption.vue'
import { referencesApi } from '@/api/references'
import type { StaffPlaceDto } from '@/api/users'
import type { CustomsPostItem, RefItem } from '@/types/api'
import type { ZOption } from '@/ui/options'
import { buildCustomsPostOptions, filterCustomsPostOption, foldSearch, postCodeOf, toLatin } from '@/utils/customsPosts'
import { stationKey } from './team'

// Посты и станции сотрудника в панели (пакет C, 01.11.2026, пункт 8 правок 30.10): список закреплённых (с удалением)
// и поиск-добавление по справочникам постов (код, название, адрес — как в мастере клиента) и станций.
// Сам ничего не сохраняет: изменённый список уходит наверх, сохраняет панель вместе с ролями.
const props = defineProps<{
  value: StaffPlaceDto[]
  disabled?: boolean
  loading?: boolean
  error?: boolean
}>()
const emit = defineEmits<{ 'update:value': [value: StaffPlaceDto[]]; retry: [] }>()
const { t } = useI18n()

const posts = ref<CustomsPostItem[]>([])
const stations = ref<RefItem[]>([])
const refsLoading = ref(false)
onMounted(async () => {
  refsLoading.value = true
  // Справочник — подсказка: не загрузился один — второй всё равно доступен (тост не нужен, ошибка видна пустым списком).
  const [p, s] = await Promise.allSettled([referencesApi.listCustomsPosts({ silent: true }), referencesApi.listStations({ silent: true })])
  if (p.status === 'fulfilled') posts.value = p.value
  if (s.status === 'fulfilled') stations.value = s.value
  refsLoading.value = false
})

const placeId = (p: Pick<StaffPlaceDto, 'kind' | 'key'>) => `${p.kind}:${p.key}`
type PlaceOption = ZOption & { place: StaffPlaceDto }
const options = computed<PlaceOption[]>(() => {
  const postOpts = buildCustomsPostOptions(posts.value, (k) => t(`customsPost.kind.${k}`))
    .filter((o) => o.code && o.code.length === 5)
    .map((o) => ({ ...o, value: `post:${o.code}`, place: { kind: 'post' as const, key: o.code!, name: o.label } }))
  const stationOpts = stations.value
    .map((s) => ({ s, key: stationKey(s.name) }))
    .filter((x): x is { s: RefItem; key: string } => !!x.key)
    .map(({ s, key }) => {
      const folded = foldSearch(s.name)
      return {
        value: `station:${key}`, label: s.name, title: s.name, code: null, hint: t('broker.settings.team.drawer.placeStation'),
        searchText: [folded, toLatin(folded)].join(' '), place: { kind: 'station' as const, key, name: s.name },
      }
    })
  return [...postOpts, ...stationOpts]
})
const addable = computed(() => options.value.filter((o) => !props.value.some((v) => placeId(v) === o.value)))
const add = (id: string | null) => {
  const opt = options.value.find((o) => o.value === id)
  if (opt) emit('update:value', [...props.value, opt.place])
}
const remove = (p: StaffPlaceDto) => emit('update:value', props.value.filter((v) => placeId(v) !== placeId(p)))
const codeOf = (p: StaffPlaceDto) => (p.kind === 'post' ? postCodeOf(p.name) ?? p.key : null)
const titleOf = (p: StaffPlaceDto) => (p.kind === 'post' ? p.name.replace(/^\s*\d{5,8}\s*[—–-]\s*/, '') : p.name)
</script>

<template>
  <div class="flex flex-col gap-2" data-member-places>
    <div v-if="error" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-member-places-error>
      <span class="min-w-0 flex-1">{{ t('broker.settings.team.drawer.placesError') }}</span>
      <button type="button" class="cursor-pointer rounded-field border-0 bg-transparent p-0 font-sans text-sm text-ink underline outline-hidden focus-visible:shadow-focus max-sm:min-h-11" data-member-places-retry @click="emit('retry')">{{ t('broker.settings.team.retry') }}</button>
    </div>
    <template v-else>
      <p v-if="loading" class="m-0 text-sm text-muted" data-member-places-loading>{{ t('broker.settings.team.drawer.placesLoading') }}</p>
      <template v-else>
        <ZSelect
          :value="null"
          :disabled="disabled"
          :options="addable"
          :loading="refsLoading"
          show-search
          :filter-option="filterCustomsPostOption"
          :placeholder="t('broker.settings.team.drawer.placesAdd')"
          :not-found-content="t('broker.settings.team.drawer.placesNone')"
          popup-width="min(420px, calc(100vw - 32px))"
          class="max-sm:min-h-11"
          :aria-label="t('broker.settings.team.drawer.placesAdd')"
          data-member-places-add
          @update:value="add($event as string | null)"
        >
          <template #option="{ option }"><CustomsPostOption :option="option" /></template>
        </ZSelect>
        <p v-if="!value.length" class="m-0 text-sm text-muted" data-member-places-empty>{{ t('broker.settings.team.drawer.placesEmpty') }}</p>
        <ul v-else class="m-0 flex list-none flex-col p-0">
          <li v-for="p in value" :key="placeId(p)" class="flex min-h-11 items-center gap-2 border-b border-line py-1 last:border-b-0" :data-member-place="placeId(p)">
            <span class="min-w-0 flex-1 truncate text-sm text-ink" :title="p.name" data-member-place-name>
              <span v-if="codeOf(p)" class="font-mono font-medium tabular-nums">{{ codeOf(p) }} </span>{{ titleOf(p) }}
              <span class="text-xs text-muted"> · {{ t(p.kind === 'post' ? 'broker.settings.team.drawer.placePost' : 'broker.settings.team.drawer.placeStation') }}</span>
            </span>
            <button
              type="button"
              :disabled="disabled"
              :aria-label="t('broker.settings.team.drawer.placeRemove', { name: p.name })"
              class="flex size-11 shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-50 items-center justify-center rounded-field border-0 bg-transparent p-0 text-muted outline-hidden hover:text-ink focus-visible:shadow-focus sm:size-8"
              data-member-place-remove
              @click="remove(p)"
            >
              <PhX :size="14" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
