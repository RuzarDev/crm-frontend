<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZPopover from '@/components/z/ZPopover.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { import40Api, type Import40CaseDto } from '@/api/import40'
import { manageApi, type StaffMember } from '@/api/manage'
import { GUID_EMPTY, assignedIdOf, assignedNameOf, type CasePerms, type StepRole } from './casePermissions'
import type { CaseActions } from './useCaseActions'

// «Команда»: декларант и КПП заявки. Руководитель/администратор (canAssign) назначает или меняет — окно с выбором
// сотрудника; сохраняется прежним PUT с обоими полями (Guid.Empty — снять). Сотрудник с правом роли берёт
// незанятую заявку в работу (claim) на строке роли текущего шага. «занято коллегой» — шаг ведёт другой (тег — строкой
// под именем, чтобы имя переносилось по словам, а не посреди слова). Выполненной и отменённой заявке назначать некого.
const props = defineProps<{ kase: Import40CaseDto; perms: CasePerms; actions: CaseActions }>()
const { t } = useI18n()

const ROLES: StepRole[] = ['declarant', 'kpp']
const rows = computed(() => ROLES.map((role) => {
  const id = assignedIdOf(props.kase, role)
  const name = assignedNameOf(props.kase, role)
  const isCurrent = props.perms.stepRole === role
  return {
    role,
    id,
    name: id ? name || t('import40Case.staffAssigned') : null,
    me: !!id && id === props.perms.userId,
    claim: isCurrent && props.perms.claimVisible(role) && props.kase.status < 8,
    busy: isCurrent && props.perms.assignedTag === 'other',
  }
}))

// ---- Назначение: каталог сотрудников грузится при первом открытии окна ----
const staff = ref<StaffMember[] | null>(null)
const staffLoading = ref(false)
const staffError = ref(false)
const loadStaff = async () => {
  if (staff.value || staffLoading.value) return
  staffLoading.value = true
  staffError.value = false
  try {
    staff.value = await manageApi.staff()
  } catch {
    staffError.value = true // тост показал перехватчик
  } finally {
    staffLoading.value = false
  }
}
const optionsFor = (role: StepRole) =>
  (staff.value ?? []).filter((u) => u.roles.includes(role)).map((u) => ({ value: u.id, label: u.displayName || u.username }))

const open = reactive<Record<StepRole, boolean>>({ declarant: false, kpp: false })
const pick = reactive<Record<StepRole, string | null>>({ declarant: null, kpp: null })
const onOpen = (role: StepRole, v: boolean) => {
  open[role] = v
  if (!v) return
  pick[role] = assignedIdOf(props.kase, role)
  void loadStaff()
}

// Декларант и КПП назначаются независимо, но PUT, как раньше, всегда несёт оба поля.
const save = async (role: StepRole) => {
  const caseId = props.kase.id
  const declarant = role === 'declarant' ? pick.declarant : assignedIdOf(props.kase, 'declarant')
  const kpp = role === 'kpp' ? pick.kpp : assignedIdOf(props.kase, 'kpp')
  const ok = await props.actions.mutate('assign', () => import40Api.update(caseId, {
    assignedDeclarantId: declarant || GUID_EMPTY,
    assignedKppId: kpp || GUID_EMPTY,
  }), { done: 'broker.case.done.assign' })
  if (ok) open[role] = false
}

const label = (role: StepRole) => t(`broker.case.team.${role}`)
const linkBtn = 'inline-flex min-h-8 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-xs font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <section aria-labelledby="case-team-title" class="rounded-panel border border-line bg-surface px-[18px] py-4" data-case-team>
    <h3 id="case-team-title" class="m-0 mb-2.5 text-sm font-semibold text-ink">{{ t('broker.case.team.title') }}</h3>
    <div
      v-for="(r, i) in rows"
      :key="r.role"
      :class="['flex flex-wrap items-center gap-x-2.5 gap-y-2 py-1.5', i > 0 && 'border-t border-line']"
      :data-team-row="r.role"
    >
      <ZAvatar v-if="r.name" :name="r.name" />
      <span v-else class="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-sunken text-xs font-bold text-tone-neutral-fg" aria-hidden="true">—</span>
      <div class="min-w-0 flex-1" data-team-person>
        <div class="text-xs text-muted">{{ label(r.role) }}</div>
        <div v-if="r.name" class="text-sm font-medium break-words text-ink" data-team-name>
          {{ r.name }}<span v-if="r.me" class="font-medium text-zircon-ink"> · {{ t('broker.case.team.you') }}</span>
        </div>
        <div v-else class="text-sm font-medium text-gold-ink" data-team-name>{{ t('broker.case.team.unassigned') }}</div>
        <div v-if="r.busy" class="mt-1 flex">
          <ZTag tone="wait" size="sm" data-team-busy>{{ t('broker.case.team.busy') }}</ZTag>
        </div>
      </div>

      <ZButton
        v-if="r.claim"
        size="sm"
        variant="primary"
        class="max-sm:h-11"
        :loading="actions.isPending('claim')"
        :disabled="actions.busy() && !actions.isPending('claim')"
        data-team-claim
        @click="actions.run('claim')"
      >{{ t('import40Case.claim') }}</ZButton>

      <ZPopover
        v-if="perms.canAssign && kase.status < 8"
        :open="open[r.role]"
        :title="t(r.role === 'kpp' ? 'broker.case.team.assignKpp' : 'broker.case.team.assignDeclarant')"
        align="end"
        :width="280"
        @update:open="onOpen(r.role, $event)"
      >
        <template #trigger>
          <ZButton v-if="!r.id" size="sm" class="bg-surface shadow-[inset_0_0_0_1px_var(--color-line-strong)] enabled:hover:bg-canvas max-sm:h-11" data-team-assign>
            {{ t('broker.case.team.assign') }}
          </ZButton>
          <button v-else type="button" :class="linkBtn" data-team-assign>{{ t('broker.case.team.change') }}</button>
        </template>
        <div class="flex flex-col gap-3" :data-team-popover="r.role">
          <p v-if="staffError" class="m-0 text-sm text-ink-2">{{ t('broker.case.team.staffError') }}</p>
          <ZSelect
            v-else
            v-model:value="pick[r.role]"
            :options="optionsFor(r.role)"
            :loading="staffLoading"
            show-search
            allow-clear
            :placeholder="t('broker.case.team.pickPh')"
            :not-found-content="t('broker.case.team.noStaff')"
            :aria-label="label(r.role)"
            data-team-select
          />
          <div class="flex justify-end gap-2">
            <ZButton size="sm" variant="ghost" class="max-sm:h-11" @click="open[r.role] = false">{{ t('broker.case.team.cancel') }}</ZButton>
            <ZButton
              size="sm"
              variant="primary"
              class="max-sm:h-11"
              :loading="actions.isPending('assign')"
              :disabled="staffError || (actions.busy() && !actions.isPending('assign'))"
              data-team-save
              @click="save(r.role)"
            >{{ t('broker.case.team.save') }}</ZButton>
          </div>
        </div>
      </ZPopover>
    </div>
  </section>
</template>
