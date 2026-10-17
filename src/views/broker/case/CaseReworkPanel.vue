<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhCircleDashed, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { Import40CaseDto } from '@/api/import40'
import { reworkApi, type ReworkItemDto } from '@/api/import40Rework'
import { useConfirm } from '@/ui/confirm'
import { cn } from '@/ui/cn'
import type { CasePerms } from './casePermissions'
import { sortItems } from './rework'
import type { CaseActions } from './useCaseActions'

// «Что догрузить клиенту» в карточке заявки (17.10): пункты доработки со статусом — ждём / есть (файл или закрыт
// вручную). Закрыть вручную и удалить — тем, кто возвращает заявку клиенту. Список перечитывается при каждом
// обновлении заявки (после действий, загрузки файла, возврата на вкладку); без пунктов панели нет.
const props = defineProps<{ kase: Import40CaseDto; perms: CasePerms; actions: CaseActions }>()
const { t } = useI18n()
const { confirm } = useConfirm()

const items = shallowRef<ReworkItemDto[]>([])
let seq = 0
const load = async () => {
  const id = props.kase.id
  const my = ++seq
  try {
    const r = await reworkApi.list(id, { silent: true })
    if (my === seq && id === props.kase.id) items.value = r.items
  } catch {
    // Тихо: панель — дополнение к карточке; при сбое остаётся последнее известное состояние.
  }
}
watch(() => `${props.kase.id}:${props.kase.updatedAtUtc}:${props.kase.status}`, (now, before) => {
  if (before && now.split(':')[0] !== before.split(':')[0]) items.value = []
  void load()
}, { immediate: true })

const sorted = computed(() => sortItems(items.value))
const doneCount = computed(() => items.value.filter((x) => x.resolvedAtUtc).length)
const canManage = computed(() => props.perms.can('kpp') || props.perms.can('declarant'))

const resolutionText = (x: ReworkItemDto) => {
  if (!x.resolvedAtUtc) return ''
  if (x.resolvedFileName) return t('rework.list.file', { file: x.resolvedFileName })
  return x.resolvedByName ? t('rework.list.manualBy', { name: x.resolvedByName }) : t('rework.list.manual')
}

const resolve = (x: ReworkItemDto) =>
  props.actions.mutate(`rework:${x.id}`, () => reworkApi.resolve(props.kase.id, x.id), { done: 'rework.list.resolved' })
const remove = async (x: ReworkItemDto) => {
  const ok = await confirm({ title: t('rework.list.removeTitle', { title: x.title }), content: t('rework.list.removeText'), okText: t('rework.list.remove'), danger: true })
  if (!ok) return
  await props.actions.mutate(`rework:${x.id}`, () => reworkApi.remove(props.kase.id, x.id), { done: 'rework.list.removed' })
}

const btn = 'max-sm:h-11 max-sm:px-4'
</script>

<template>
  <section v-if="items.length" aria-labelledby="case-rework-title" class="rounded-panel border border-line bg-surface" data-case-rework>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-[18px] pt-3.5 pb-2">
      <h2 id="case-rework-title" class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t('rework.list.title') }}</h2>
      <span class="text-[13px] text-muted" data-rework-summary>{{ t('rework.list.summary', { done: doneCount, total: items.length }) }}</span>
    </div>
    <ul role="list" class="m-0 flex list-none flex-col p-0">
      <li
        v-for="x in sorted"
        :key="x.id"
        class="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-line px-[18px] py-2.5"
        :data-rework-item="x.kind"
        :data-rework-state="x.resolvedAtUtc ? 'done' : 'open'"
      >
        <PhCheckCircle v-if="x.resolvedAtUtc" :size="18" weight="fill" class="mt-0.5 shrink-0 text-tone-done-fg" aria-hidden="true" />
        <PhCircleDashed v-else :size="18" class="mt-0.5 shrink-0 text-gold-ink" aria-hidden="true" />
        <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
          <span :class="cn('text-sm text-ink [overflow-wrap:anywhere]', !x.resolvedAtUtc && 'font-medium')">{{ x.title }}</span>
          <span v-if="x.note" class="text-[13px] text-ink-2 [overflow-wrap:anywhere]" data-rework-item-note>{{ x.note }}</span>
          <span v-if="x.resolvedAtUtc" class="text-xs text-muted [overflow-wrap:anywhere]" data-rework-resolution>{{ resolutionText(x) }}</span>
        </div>
        <div class="flex items-center gap-2 max-sm:w-full max-sm:pl-[30px]">
          <ZTag :tone="x.resolvedAtUtc ? 'done' : 'wait'" size="sm">{{ x.resolvedAtUtc ? t('rework.list.done') : t('rework.list.open') }}</ZTag>
          <template v-if="canManage">
            <ZButton
              v-if="!x.resolvedAtUtc"
              size="sm"
              :class="btn"
              :loading="actions.isPending(`rework:${x.id}`)"
              :disabled="actions.busy() && !actions.isPending(`rework:${x.id}`)"
              :aria-label="t('rework.list.resolveAria', { title: x.title })"
              data-rework-resolve
              @click="resolve(x)"
            >{{ t('rework.list.resolve') }}</ZButton>
            <button
              type="button"
              :disabled="actions.busy()"
              :aria-label="t('rework.list.removeAria', { title: x.title })"
              class="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
              data-rework-remove-item
              @click="remove(x)"
            ><PhTrash :size="16" aria-hidden="true" /></button>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
