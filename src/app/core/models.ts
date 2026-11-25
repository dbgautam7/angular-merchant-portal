export type Role = 'SALES' | 'REVIEWER' | 'ADMIN';
export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface BusinessInfo {
  legalName: string;
  registrationNumber: string;
  category: string;
  website: string;
}

export interface OwnerInfo {
  fullName: string;
  email: string;
  dateOfBirth: string;
  taxId: string; // sensitive
}

export interface BankingInfo {
  bankName: string;
  accountNumber: string; // sensitive
  monthlyVolume: number | null;
}

export interface ApplicationForm {
  business: BusinessInfo;
  owner: OwnerInfo;
  banking: BankingInfo;
}

export interface RiskEvent {
  at: string;
  by: string;
  decision: 'APPROVED' | 'REJECTED' | 'NOTE';
  comment: string;
}

export interface MerchantApplication extends ApplicationForm {
  id: string;
  status: ApplicationStatus;
  createdBy: string;
  assignedTo: string | null;
  updatedAt: string;
  riskHistory: RiskEvent[];
}

/** Something a user may do with one application. Decided by the server, per user and record. */
export type ApplicationAction = 'edit' | 'submit' | 'decide' | 'assign' | 'reveal';

/**
 * An application as the API returns it: sensitive fields masked (except the author's own
 * draft) and the actions the caller may take on it. The UI shows controls from
 * `allowedActions`; it never re-derives permissions from roles.
 */
export interface ApplicationDto extends MerchantApplication {
  allowedActions: ApplicationAction[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

/** Application counts per status for the current user's scope (and search term). */
export interface ApplicationSummary {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
}

export interface ApplicationQuery {
  page: number;
  size: number;
  status: ApplicationStatus | '';
  q: string;
}
