import { useI18n } from 'vue-i18n'
import { businessRoleLabel } from '@/api/permissions'

// Короткие подписи ролей для чипов и флажков («Декларант», «КПП»…). Полные названия enum.businessRole.*
// слишком длинные для строки таблицы; для неизвестного кода — запасной вариант из enum.businessRole.*.
export function useTeamRoleLabels() {
  const { t, te } = useI18n()
  const roleLabel = (code: string): string => {
    const c = (code || '').toLowerCase()
    return te(`broker.settings.team.role.${c}`) ? t(`broker.settings.team.role.${c}`) : businessRoleLabel(c)
  }
  const roleScope = (code: string, fallback = ''): string => {
    const c = (code || '').toLowerCase()
    return te(`broker.settings.team.roleScope.${c}`) ? t(`broker.settings.team.roleScope.${c}`) : fallback
  }
  return { roleLabel, roleScope }
}
