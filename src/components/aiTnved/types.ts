export type { AiTnvedCode, AiTnvedStatus } from '@/api/aiTnved'
import type { AiTnvedCode } from '@/api/aiTnved'

export interface AiTnvedResponseLike { questions: string[]; suggestions: Pick<AiTnvedCode, 'questions'>[] }
