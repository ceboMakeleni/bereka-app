// Database Types for Bereka Platform

export interface Profile {
  id: string
  username: string | null
  bio: string | null
  role: 'worker' | 'client' | 'admin'
  skills: string[] | null
  avatar_url: string | null
  lnbits_id: string | null
  lnbits_admin_key: string | null
  lnbits_invoice_key: string | null
  has_wallet?: boolean
  updated_at: string | null
}

export interface Job {
  id: string
  creator_id: string
  worker_id: string | null
  title: string
  description: string
  budget_sats: number
  status: 'OPEN' | 'FUNDED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'
  category: string | null
  deadline: string | null
  created_at: string
  updated_at: string
  profiles?: Profile
}

export interface Application {
  id: string
  job_id: string
  worker_id: string
  cover_letter: string | null
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  created_at: string
  profiles?: Profile
}

export interface Submission {
  id: string
  job_id: string
  worker_id: string
  content: string | null
  attachments: string[] | null
  created_at: string
}

export interface Dispute {
  id: string
  job_id: string
  opened_by: string
  reason: string
  evidence_urls: string[] | null
  status: 'OPEN' | 'RESOLVED'
  resolution: 'REFUND' | 'PAY_WORKER' | 'SPLIT' | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export interface Account {
  id: string
  user_id: string | null
  type: 'AVAILABLE' | 'ESCROW' | 'PLATFORM_FEES' | 'EXTERNAL_DEPOSITS'
  balance_sats: number
  created_at: string
}

export interface LedgerEntry {
  id: string
  debit_account_id: string
  credit_account_id: string
  amount_sats: number
  reference_type: 'DEPOSIT' | 'ESCROW_FUND' | 'PAYOUT' | 'PLATFORM_FEE' | 'REFUND' | 'SPLIT'
  reference_id: string
  created_at: string
}

export interface PaymentIntent {
  payment_hash: string
  user_id: string
  amount_sats: number
  payment_request: string
  status: 'PENDING' | 'COMPLETED'
  created_at: string
  expires_at: string | null
}

export interface PaymentEvent {
  id: string
  provider: string
  payment_hash: string
  amount_sats: number | null
  status: string | null
  processed_at: string
  raw_payload: any
}

export interface EscrowHold {
  id: string
  job_id: string
  amount_sats: number
  status: 'HELD' | 'RELEASED' | 'REFUNDED'
  created_at: string
}

export interface JobCategory {
  id: string
  name: string
  description: string | null
  created_at: string
}

// Edge Function Request/Response Types

export interface CreateWalletRequest {
  // No body needed — userId comes from JWT
}

export interface CreateWalletResponse {
  wallet: {
    id: string
    adminkey?: string
    inkey?: string
    message?: string
  }
}

export interface CreateInvoiceRequest {
  amountSats: number
}

export interface CreateInvoiceResponse {
  payment_request: string
  payment_hash: string
  amount: number
}

export interface CheckPaymentRequest {
  paymentHash: string
}

export interface CheckPaymentResponse {
  paid: boolean
}

export interface FundEscrowRequest {
  jobId: string
}

export interface FundEscrowResponse {
  success: boolean
}

export interface ApprovePayoutRequest {
  jobId: string
}

export interface ApprovePayoutResponse {
  success: boolean
}

export interface ResolveDisputeRequest {
  jobId: string
  resolution: 'REFUND' | 'PAY_WORKER' | 'SPLIT'
}

export interface ResolveDisputeResponse {
  success: boolean
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  job_id: string | null
  read: boolean
  created_at: string
}

export interface SendNotificationRequest {
  type: 'APPLICATION_RECEIVED' | 'JOB_ACCEPTED' | 'SUBMISSION_READY' | 'PAYOUT_APPROVED' | 'DISPUTE_OPENED' | 'DISPUTE_RESOLVED' | 'PAYMENT_RECEIVED'
  recipientUserId: string
  jobId?: string
  amount?: number
  paymentHash?: string
}

// Utility Types

export type JobStatus = Job['status']
export type ApplicationStatus = Application['status']
export type DisputeResolution = Dispute['resolution']
export type AccountType = Account['type']
export type ReferenceType = LedgerEntry['reference_type']
export type UserRole = Profile['role']
export type NotificationType = SendNotificationRequest['type']

// Extended Types with Relations

export interface JobWithProfiles extends Job {
  creator?: Profile
  worker?: Profile
  applications?: Application[]
  submissions?: Submission[]
  disputes?: Dispute[]
}

export interface ApplicationWithProfile extends Application {
  job?: Job
  worker?: Profile
}

export interface DisputeWithJob extends Dispute {
  job?: Job
  opener?: Profile
  resolver?: Profile
}

// Form Types

export interface JobCreateForm {
  title: string
  description: string
  category: string
  budget_sats: number
  deadline?: string
}

export interface ApplicationCreateForm {
  job_id: string
  cover_letter: string
}

export interface SubmissionCreateForm {
  job_id: string
  content: string
  files?: File[]
}

export interface DisputeCreateForm {
  job_id: string
  reason: string
  evidence_files?: File[]
}

export interface ProfileUpdateForm {
  username?: string
  bio?: string
  skills?: string[]
  avatar_url?: string
}

// Query Filter Types

export interface JobFilters {
  category?: string
  minBudget?: number
  maxBudget?: number
  search?: string
  status?: JobStatus[]
  sortBy?: 'newest' | 'budget_high' | 'budget_low' | 'deadline'
  page?: number
  limit?: number
}

export interface LedgerFilters {
  accountId?: string
  userId?: string
  referenceType?: ReferenceType
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
}

// Pagination Types

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  limit: number
  totalPages: number
}

// Error Types

export interface ApiError {
  message: string
  code?: string
  details?: any
}
