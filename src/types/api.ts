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

export interface CatalogLinkedPerson {
  id: string
  username: string
  role: string
}

export interface CatalogAdministratorRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
}

export interface CatalogBrokerRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export interface CatalogClientRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  brokers: CatalogLinkedPerson[]
  expeditors: CatalogLinkedPerson[]
}

export interface CatalogExpeditorRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export type CatalogTabKey = 'administrators' | 'brokers' | 'clients' | 'expeditors'

export type CatalogTableRow =
  | CatalogAdministratorRow
  | CatalogBrokerRow
  | CatalogClientRow
  | CatalogExpeditorRow

export interface LinkUsersRequest {
  staffUserId: string
  clientUserId: string
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

export interface RoleItem {
  name: string
  permissions: string[]
}

export interface CreateRoleRequest {
  name: string
  permissions: string[]
}

export interface UpdateRolePermissionsRequest {
  permissions: string[]
}

export interface RegisterRequest {
  username: string
  password: string
  role: string
}
