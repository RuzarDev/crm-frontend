<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import { import40Api } from '@/api/import40'
import { useConfirm } from '@/ui/confirm'
import type { CaseStepContext } from '../caseContext'

// Контейнеры заявки: чипы «номер + тип». Правка (editable) — «×» с подтверждением и строка добавления;
// иначе только чтение. Запросы — прежние: POST/DELETE /import40/{id}/containers[/{containerId}], затем перечитывание заявки.
const props = defineProps<{ ctx: CaseStepContext; editable?: boolean }>()
const { t } = useI18n()
const { confirm } = useConfirm()

const number = ref('')
const type = ref('')
const adding = () => props.ctx.actions.isPending('container-add')

const add = async () => {
  const containerNumber = number.value.trim()
  if (!containerNumber) return
  const ok = await props.ctx.actions.mutate('container-add', () => import40Api.addContainer(props.ctx.kase.id, {
    containerNumber,
    containerType: type.value.trim() || null,
    notes: null,
  }), { done: 'broker.case.done.containerAdded' })
  if (ok) {
    number.value = ''
    type.value = ''
  }
}

const remove = async (id: string, containerNumber: string) => {
  const ok = await confirm({
    title: t('broker.case.draft.removeConfirm', { number: containerNumber }),
    okText: t('broker.case.draft.removeOk'),
    cancelText: t('broker.case.draft.keep'),
    danger: true,
  })
  if (!ok) return
  await props.ctx.actions.mutate(`container-delete:${id}`, () => import40Api.deleteContainer(props.ctx.kase.id, id), { done: 'broker.case.done.containerRemoved' })
}

const removeBtn = 'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-muted outline-hidden transition-colors duration-150 hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none max-sm:size-11'
</script>

<template>
  <div class="flex flex-col gap-2.5" data-draft-containers>
    <ul v-if="ctx.kase.containers.length" role="list" class="m-0 flex list-none flex-wrap gap-2 p-0">
      <li
        v-for="c in ctx.kase.containers"
        :key="c.id"
        class="inline-flex min-h-8 items-center gap-2 rounded-field bg-sunken py-0.5 pl-2.5 text-[13px] text-ink"
        :class="editable ? 'pr-1' : 'pr-2.5'"
        data-draft-container
      >
        <span class="font-mono tabular-nums">{{ c.containerNumber }}</span>
        <span v-if="c.containerType" class="font-mono text-muted">{{ c.containerType }}</span>
        <button
          v-if="editable"
          type="button"
          :class="removeBtn"
          :disabled="ctx.actions.busy() && !ctx.actions.isPending(`container-delete:${c.id}`)"
          :aria-busy="ctx.actions.isPending(`container-delete:${c.id}`) || undefined"
          :aria-label="t('broker.case.draft.remove', { number: c.containerNumber })"
          :title="t('broker.case.draft.remove', { number: c.containerNumber })"
          data-draft-container-remove
          @click="remove(c.id, c.containerNumber)"
        >
          <PhX :size="13" weight="bold" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="m-0 text-sm text-ink-3" data-draft-containers-empty>{{ t('broker.case.draft.noContainers') }}</p>

    <div v-if="editable" class="flex flex-wrap items-center gap-2" data-draft-container-add>
      <ZInput
        v-model:value="number"
        mono
        :maxlength="20"
        autocomplete="off"
        autocapitalize="characters"
        :placeholder="t('broker.case.draft.containerNumber')"
        :aria-label="t('broker.case.draft.containerNumber')"
        class="w-full max-w-[220px] max-sm:h-11 max-sm:max-w-none max-sm:flex-1 max-sm:text-base"
        data-draft-container-number
        @press-enter="add"
      />
      <ZInput
        v-model:value="type"
        mono
        :maxlength="10"
        autocomplete="off"
        placeholder="40HC"
        :aria-label="t('broker.case.draft.containerType')"
        class="w-[110px] max-sm:h-11 max-sm:text-base"
        data-draft-container-type
        @press-enter="add"
      />
      <ZButton
        :disabled="!number.trim() || (ctx.actions.busy() && !adding())"
        :loading="adding()"
        class="max-sm:h-11"
        data-draft-container-add-btn
        @click="add"
      >{{ t('broker.case.draft.add') }}</ZButton>
    </div>
  </div>
</template>
