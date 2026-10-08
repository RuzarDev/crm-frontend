<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { useConfirm } from '@/ui/confirm'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { countText, whatsLeft, type WhatsLeftItem } from '../caseSteps'
import DeclarationsList from './DeclarationsList.vue'

// Шаг 3 «Декларирование и выпуск» (статусы 2 и 3, декларант; доска Case).
// Статус 2: плашка «Что осталось до подачи» (caseSteps.whatsLeft — подсказка, «Подать ДТ» ею не блокируется),
// «Подать ДТ» (подтверждение → submit-declaration; выключена без ДТ или права декларанта / шаг ведёт коллега),
// «Вернуть клиенту». Статус 3: «Зафиксировать выпуск» (подтверждение → release-declaration).
// Ниже — список ДТ (DeclarationsList). Пройденный шаг (mode done) — список ДТ только для чтения.
const props = defineProps<CaseStepProps>()
const { t, locale } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const isDeclaring = computed(() => kase.value.status === 2)
const otherBusy = (key: string) => props.ctx.actions.busy() && !props.ctx.actions.isPending(key)
const declHint = computed(() => hintText(props.ctx.perms.actionHint('declarant'), t))

const left = computed(() => whatsLeft(kase.value, props.ctx.readiness, props.ctx.files, t))
const leftText = (it: WhatsLeftItem): string => {
  switch (it.id) {
    case 'dt': return t(it.done ? 'broker.case.declaring.left.dtDone' : 'broker.case.declaring.left.dtTodo')
    case 'fill': return t('broker.case.declaring.left.fill', { label: it.label, filled: it.filled, total: it.total })
    case 'docs': return it.done
      ? t('broker.case.declaring.left.docsDone', { files: countText('files', it.count, t, locale.value) })
      : t('broker.case.declaring.left.docsTodo')
    case 'problem': return t('broker.case.declaring.left.problem')
  }
}
const leftKey = (it: WhatsLeftItem) => (it.id === 'fill' ? `fill:${it.declarationId}` : it.id)

// «Подать ДТ»
const SUBMIT = 'submit-declaration'
const noDt = computed(() => !kase.value.declarations.length)
const submitDisabled = computed(() => props.ctx.perms.actionDisabled('declarant') || noDt.value || otherBusy(SUBMIT))
const submitHint = computed(() => declHint.value || (noDt.value ? t('broker.case.declaring.needDt') : ''))
const submit = async () => {
  const ok = await confirm({
    title: t('broker.case.declaring.confirmSubmit'),
    okText: t('broker.case.declaring.confirmSubmitOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run(SUBMIT)
}

// «Вернуть клиенту» — только на статусе 2 (с «ДТ подана» сервер возврат не принимает).
const canReturn = computed(() => props.ctx.perms.can('kpp') || props.ctx.perms.can('declarant'))
const returnHint = computed(() => (canReturn.value ? '' : hintText({ kind: 'role', role: 'declarant' }, t)))

// «Зафиксировать выпуск»
const RELEASE = 'release-declaration'
const releaseDisabled = computed(() => props.ctx.perms.actionDisabled('declarant') || otherBusy(RELEASE))
const release = async () => {
  const ok = await confirm({
    title: t('import40Case.confirmRelease'),
    okText: t('broker.case.declaring.confirmReleaseOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run(RELEASE)
}
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="isDeclaring ? '' : t('broker.case.declaring.metaSubmitted')" flush>
    <template #actions>
      <template v-if="isDeclaring">
        <ZTooltip :title="returnHint">
          <span class="inline-flex max-sm:flex-1" :tabindex="returnHint ? 0 : undefined">
            <ZButton variant="ghost" :disabled="!canReturn || otherBusy('return-to-client')" class="max-sm:w-full" data-declaring-return @click="ctx.actions.ask('return')">
              {{ t('import40Case.returnToClient') }}
            </ZButton>
          </span>
        </ZTooltip>
        <ZTooltip :title="submitDisabled ? submitHint : ''">
          <span class="inline-flex max-sm:flex-1" :tabindex="submitDisabled && submitHint ? 0 : undefined">
            <ZButton
              variant="primary"
              :disabled="submitDisabled"
              :loading="ctx.actions.isPending(SUBMIT)"
              class="max-sm:w-full"
              data-declaring-submit
              @click="submit"
            >{{ t('import40Case.submitDt') }}</ZButton>
          </span>
        </ZTooltip>
      </template>
      <ZTooltip v-else :title="releaseDisabled ? declHint : ''">
        <span class="inline-flex max-sm:w-full" :tabindex="releaseDisabled && declHint ? 0 : undefined">
          <ZButton
            variant="primary"
            :disabled="releaseDisabled"
            :loading="ctx.actions.isPending(RELEASE)"
            class="max-sm:w-full"
            data-declaring-release
            @click="release"
          >{{ t('import40Case.fixRelease') }}</ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="px-[18px] pb-3.5">
      <section
        v-if="isDeclaring"
        aria-labelledby="case-whats-left-title"
        class="rounded-row border border-gold-line bg-gold-soft px-4 py-3.5"
        data-whats-left
      >
        <h3 id="case-whats-left-title" class="m-0 mb-2 text-[13px] font-semibold text-gold-ink">{{ t('broker.case.declaring.left.title') }}</h3>
        <ul role="list" class="m-0 grid list-none grid-cols-1 gap-x-[18px] gap-y-1.5 p-0 text-[13.5px] text-ink sm:grid-cols-2">
          <li v-for="it in left" :key="leftKey(it)" class="flex min-w-0 items-start gap-2" :data-left-item="it.id" :data-left-done="it.done">
            <PhCheck v-if="it.done" :size="15" weight="bold" class="mt-[3px] shrink-0 text-tone-done-fg" aria-hidden="true" />
            <span v-else class="mt-[3px] size-[15px] shrink-0 rounded-pill border-[1.5px] border-gold" aria-hidden="true" />
            <span class="min-w-0 [overflow-wrap:anywhere]">
              {{ leftText(it) }}<span class="sr-only"> — {{ t(it.done ? 'broker.case.declaring.left.stateDone' : 'broker.case.declaring.left.stateTodo') }}</span>
            </span>
          </li>
        </ul>
      </section>
      <p v-else class="m-0 text-[13px] text-muted" data-declaring-submitted>{{ t('import40Case.status3Note') }}</p>
    </div>

    <DeclarationsList :ctx="ctx" mode="current" />
  </CaseStepPanel>

  <DeclarationsList v-else :ctx="ctx" mode="done" />
</template>
