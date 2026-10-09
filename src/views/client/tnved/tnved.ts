// Правила ТН ВЭД живут в views/references/tnvedShared.ts (общие для клиента и сотрудника);
// здесь — реэкспорт для клиентского кода («Подбор кода ТН ВЭД», «Курсы валют», калькулятор).
export {
  cleanName, codeDigits, formatTnvedCode, hitFromMatch, hitFromNode, httpStatus, isCodeLike, isRateLimited, MIN_QUERY, VAT_RATE,
  type TnvedHit,
} from '@/views/references/tnvedShared'
