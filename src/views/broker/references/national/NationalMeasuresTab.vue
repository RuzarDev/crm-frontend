<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { nationalListsApi, type NationalMeasure, type NationalMeasureExtendRequest, type NationalMeasureRequest } from '@/api/nationalLists'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { almatyToday } from '@/utils/customsRequests'
import { safeUrl } from '@/views/references/regulations'
import NationalMeasureExtendModal from './NationalMeasureExtendModal.vue'
import NationalMeasureModal from './NationalMeasureModal.vue'
import { actText, d, P, periodText, STATE_TONE, toRequest } from './national'

// Вкладка «Временные меры»: запреты и ограничения ввоза/вывоза приказами министерств на срок (в КЕДЕН их нет).
// Действующие и будущие — сверху, истёкшие и снятые — ниже, приглушённо. Пока код под мерой, она видна в «Справке по
// товару», в подсказках возврата на доработку и предупреждением в ДТ. Добавить, изменить, продлить актом, снять и
// вернуть — с правом tnved.manage (как сервер); остальным — только просмотр.
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`${P}.measures.${key}`, p ?? {})
const auth = useAuthStore()
const { confirm } = useConfirm()
const canManage = computed(() => auth.hasPermission('tnved.manage'))

const state = ref<'loading' | 'ready' | 'error'>('loading')
const list = ref<NationalMeasure[]>([])
const load = async () => {
  state.value = 'loading'
  try {
    list.value = await nationalListsApi.measures()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const replace = (m: NationalMeasure) => {
  const i = list.value.findIndex((x) => x.id === m.id)
  if (i >= 0) list.value.splice(i, 1, m)
  else list.value.unshift(m)
}

// ---- Добавить / изменить ----
const editOpen = ref(false)
const editing = ref<NationalMeasure | null>(null)
const editInitial = computed<NationalMeasureRequest | null>(() => (editing.value ? toRequest(editing.value) : null))
const openAdd = () => { editing.value = null; editOpen.value = true }
const openEdit = (m: NationalMeasure) => { editing.value = m; editOpen.value = true }
const saveMeasure = async (v: NationalMeasureRequest) => {
  const saved = editing.value ? await nationalListsApi.update(editing.value.id, v) : await nationalListsApi.create(v)
  replace(saved)
  message.success(tm(editing.value ? 'saved' : 'added'))
}

// ---- Продлить ----
const extendOpen = ref(false)
const extending = ref<NationalMeasure | null>(null)
const openExtend = (m: NationalMeasure) => { extending.value = m; extendOpen.value = true }
const saveExtend = async (v: NationalMeasureExtendRequest) => {
  if (!extending.value) return
  replace(await nationalListsApi.extend(extending.value.id, v))
  message.success(tm('extended'))
}

// ---- Снять / вернуть ----
const busy = ref<number | null>(null)
const toggle = async (m: NationalMeasure) => {
  if (busy.value !== null) return
  if (m.isActive) {
    const ok = await confirm({ title: tm('removeTitle'), content: tm('removeText', { goods: m.goods }), okText: tm('remove'), danger: true })
    if (!ok) return
  }
  busy.value = m.id
  try {
    replace(m.isActive ? await nationalListsApi.remove(m.id) : await nationalListsApi.restore(m.id))
    message.success(tm(m.isActive ? 'removed' : 'restored'))
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = null
  }
}

const muted = (m: NationalMeasure) => m.state === 'expired' || m.state === 'removed'
const btn = 'max-sm:h-11 max-sm:flex-1'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-national-measures>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <p class="m-0 min-w-0 flex-1 basis-72 text-sm text-ink-2 text-pretty">{{ tm('lead') }}</p>
      <ZButton v-if="canManage" variant="primary" class="max-sm:h-11 max-sm:w-full" data-nm-add @click="openAdd">
        <template #icon><PhPlus :size="14" weight="bold" aria-hidden="true" /></template>
        {{ tm('add') }}
      </ZButton>
    </div>

    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-nm-load-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ tm('loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-nm-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" class="rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="6" height="18px" /></div>
    <p v-else-if="!list.length" class="m-0 rounded-panel border border-line bg-surface px-5 py-4 text-sm text-muted" data-nm-empty>{{ tm('empty') }}</p>

    <ul v-else role="list" class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="m in list"
        :key="m.id"
        :class="['min-w-0 rounded-panel border px-4 py-3.5 sm:px-5', muted(m) ? 'border-dashed border-line bg-sunken' : 'border-line bg-surface']"
        :data-nm="m.id"
        :data-nm-state="m.state"
      >
        <div class="flex flex-wrap items-center gap-2">
          <ZTag :tone="STATE_TONE[m.state]" size="sm" data-nm-state-tag>{{ tm(`state.${m.state}`) }}</ZTag>
          <ZTag :tone="m.kind === 'ban' ? 'danger' : 'wait'" size="sm">{{ tm(`kind.${m.kind}`) }}</ZTag>
          <span class="text-xs text-muted">{{ tm(`direction.${m.direction}`) }}</span>
          <span class="inline-flex min-h-6 max-w-full items-center rounded-pill border border-line bg-sunken px-2 py-0.5 font-mono text-xs leading-4 text-ink [overflow-wrap:anywhere]" data-nm-codes>{{ m.codeText }}</span>
        </div>
        <p class="m-0 mt-2 text-[15px] leading-6 font-semibold text-ink [overflow-wrap:anywhere]" data-nm-goods>{{ m.goods }}</p>
        <p class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]">{{ m.name }}</p>
        <p class="m-0 mt-1 text-sm font-medium text-ink tabular-nums" data-nm-period>{{ periodText(t, m) }}</p>
        <p class="m-0 mt-1 text-[13px] leading-5 [overflow-wrap:anywhere]" data-nm-act>
          <a
            v-if="safeUrl(m.actUrl)"
            :href="safeUrl(m.actUrl)!"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-field font-medium text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus"
          >{{ actText(t, m) }}<PhArrowSquareOut :size="13" class="ml-1 inline-block align-[-2px]" aria-hidden="true" /><span class="sr-only"> ({{ t(`${P}.opensInNewTab`) }})</span></a>
          <span v-else class="font-medium text-ink">{{ actText(t, m) }}</span>
        </p>
        <p v-if="m.exceptions" class="m-0 mt-1.5 text-[13px] leading-5 text-ink-2 [overflow-wrap:anywhere]" data-nm-exceptions>
          <span class="text-ink-3">{{ tm('exceptions') }}</span> {{ m.exceptions }}
        </p>
        <p v-if="m.note" class="m-0 mt-1 text-xs leading-5 text-muted [overflow-wrap:anywhere]" data-nm-note>{{ m.note }}</p>
        <ul v-if="m.extensions.length" role="list" class="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-xs text-ink-3" data-nm-extensions>
          <li v-for="(x, i) in m.extensions" :key="i" class="[overflow-wrap:anywhere]">
            {{ tm('extension', { act: actText(t, x), from: d(x.previousValidTo), to: d(x.validTo) }) }}
          </li>
        </ul>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span class="min-w-0 basis-full text-xs text-muted sm:basis-48 sm:flex-1">{{ tm('updated', { date: d(almatyToday(new Date(m.updatedAtUtc))), by: m.updatedBy || '—' }) }}</span>
          <template v-if="canManage">
            <ZButton size="sm" :class="btn" data-nm-edit @click="openEdit(m)">{{ tm('edit') }}</ZButton>
            <ZButton v-if="m.isActive && m.validTo" size="sm" :class="btn" data-nm-extend @click="openExtend(m)">{{ tm('extend') }}</ZButton>
            <ZButton size="sm" :variant="m.isActive ? 'danger-ghost' : 'secondary'" :loading="busy === m.id" :class="btn" data-nm-toggle @click="toggle(m)">
              {{ m.isActive ? tm('remove') : tm('restore') }}
            </ZButton>
          </template>
        </div>
      </li>
    </ul>

    <NationalMeasureModal v-model:open="editOpen" :initial="editInitial" :save="saveMeasure" />
    <NationalMeasureExtendModal v-model:open="extendOpen" :measure="extending" :save="saveExtend" />
  </div>
</template>
