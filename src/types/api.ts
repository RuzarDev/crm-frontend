export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  expiresAtUtc: string
  role: string
  permissions: string[]
}

export interface BulkDeleteResponse {
  deleted: number
}

export interface User {
  id: string
  username: string
  role: string
}

export interface ReestrEntry {
  id: string
  createdAtUtc: string
  fields: Record<string, string | null>
}

export interface ReestrListRequest {
  page?: number
  pageSize?: number
  search?: string
}

export interface ReestrListResponse {
  items: ReestrEntry[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UpsertReestrEntryRequest {
  fields: Record<string, string | null>
}

export interface ImportResponse {
  imported: number
  fileName?: string
}
