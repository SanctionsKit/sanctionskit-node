export type Environment = 'sandbox' | 'production';
export type EntityType = 'person' | 'organization' | 'vessel' | 'aircraft' | 'other';
export type ScreeningStatus = 'potential_match' | 'no_match';
export type Retention = 'standard' | 'minimal';

export interface APIResponse<T> {
  data: T;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PageParams {
  limit?: number;
  cursor?: string;
}

export interface Identifier {
  type: string;
  value: string;
  issuer?: string;
}

export interface Subject {
  name: string;
  entityType?: EntityType;
  identifiers?: Identifier[];
  birthDate?: string;
  country?: string;
}

export interface PolicyReference {
  id: string;
  version: number;
}

export type CoverageSelection =
  | { sources: string[]; package?: never }
  | { package: string; sources?: never };

export type ScreeningRequest = CoverageSelection & {
  subject: Subject;
  counterpartyId?: string;
  policy?: PolicyReference;
  reference?: string;
  retention?: Retention;
};

export type BatchScreeningRequest = ScreeningRequest & { retention?: 'standard' };

export type BatchRequest = { name: string } & (
  | { subjects: BatchScreeningRequest[]; uploadId?: never }
  | { uploadId: string; subjects?: never }
);

export interface SourceVersion {
  source_id: string;
  id: string;
  retrieved_at: string;
  last_checked_at?: string | null;
  published_at?: string | null;
  status: string;
  rights_approved: boolean;
}

export interface Source {
  id: string;
  name: string;
  authority: string;
  availability: 'available' | 'disabled';
  capabilities: string[];
  rightsStatus: 'approved' | 'review_required' | 'restricted';
  category: 'financial_sanctions' | 'export_control' | 'debarment' | 'regulatory_enforcement' | 'public_office' | 'reference' | 'other' | 'mixed';
  jurisdiction?: string;
  homepage?: string;
  downloadUrl?: string;
  format?: string;
  attribution?: string;
  termsUrl?: string;
  disabledReason?: string;
  refreshHours?: number;
  parserVersion?: string;
  fresh?: boolean;
  qualification?: {
    implemented: boolean;
    fixtureTested: boolean;
    liveFetchTested: boolean;
    rightsApproved: boolean;
    activated: boolean;
    liveFetchedAt?: string;
    blockers: string[];
  };
  currentVersion?: SourceVersion | null;
  lastImport?: SourceVersion | null;
}

export interface ScreeningPolicySnapshot {
  id: string;
  version: number;
  environment: Environment;
  createdAt: string;
  name: string;
  purpose: string;
  jurisdictions: string[];
  requiredSources: Partial<Record<EntityType, string[]>>;
  optionalSources: Partial<Record<EntityType, string[]>>;
  exclusions: string[];
  externalChecks: string[];
  externalCheckGuidance?: {
    label: string;
    instructions: string;
    evidenceExample?: string;
  }[];
  review: {
    requireSecondReview?: boolean;
    secondReviewFor?: ('same_identity' | 'allow' | 'restrict' | 'escalate')[];
    approverRoles?: ('owner' | 'admin' | 'analyst')[];
  };
  monitoringIntervalHours: 6 | 24 | 168;
  retentionTrigger: 'review_completed' | 'relationship_ended' | 'business_event';
}

export interface PolicyList extends Page<ScreeningPolicySnapshot> {
  requirePolicy: boolean;
}

export interface SourceNotice {
  text: string;
  sourceUrl: string;
  termsUrl: string;
  licenseUrl?: string;
  databaseDownloadUrl?: string;
}

export interface Coverage {
  sourceId: string;
  version: string;
  retrievedAt: string;
  publishedAt?: string;
  fresh: boolean;
  sourceNotice?: SourceNotice;
}

export interface SourceProvenance {
  sourceId: string;
  recordId: string;
  field: string;
  rawValue?: string;
}

export interface SourceRecord {
  id: string;
  sourceId: string;
  authority: string;
  list: string;
  sourceUrl: string;
  entityType: EntityType;
  names: {
    value: string;
    kind: 'primary' | 'alias';
    quality?: 'strong' | 'weak' | 'unknown';
    script?: string;
    provenance?: SourceProvenance;
  }[];
  identifiers: (Identifier & { provenance?: SourceProvenance })[];
  birthDates: {
    value: string;
    precision: 'day' | 'month' | 'year' | 'range' | 'unknown';
    original: string;
  }[];
  addresses: { text?: string; country?: string; provenance?: SourceProvenance }[];
  nationalities: string[];
  designations: {
    category: 'financial_sanctions' | 'export_control' | 'debarment' | 'other';
    programs: string[];
    legalReferences: string[];
    wording?: string;
    effectiveDate?: string;
  }[];
  dataThrough?: string;
  screeningPeriods?: { from?: string; through?: string }[];
  publicContext?: { label: string; value: string }[];
  extensions: Record<string, unknown>;
}

export interface MatchEvidence {
  field: string;
  queryValue: string;
  sourceValue: string;
  method: string;
  contribution: number;
  explanation: string;
}

export interface ScreeningMatch {
  record: SourceRecord;
  score: number;
  evidence: MatchEvidence[];
  conflicts: string[];
}

export interface ScreeningResult {
  id: string;
  environment: Environment;
  status: ScreeningStatus;
  createdAt: string;
  matches: ScreeningMatch[];
  coverage: Coverage[];
  versions: {
    dataset: string;
    matchingEngine: string;
    policy: string;
    package?: string;
  };
  disclaimer: string;
  policySnapshot?: ScreeningPolicySnapshot;
}

export interface RetainedScreeningResult extends ScreeningResult {
  subject: Subject | null;
  reference: string | null;
}

export interface ScreeningEvidence {
  format: 'sanctionskit-evidence@1';
  result: ScreeningResult;
  retention: Retention;
  expires_at: string | null;
  subject: Subject | null;
  reference: string | null;
  request: ScreeningRequest | null;
  retainedInputs: boolean;
  replayLimit: string | null;
}

export interface ScreeningSummary {
  id: string;
  status: ScreeningStatus;
  createdAt: string;
  subjectName: string | null;
  entityType: string | null;
  retention: Retention;
  expiresAt: string | null;
  origin: string;
  caseId: string | null;
  reviewDecision: 'open' | 'confirmed' | 'dismissed' | null;
  reviewBusinessDisposition: 'pending' | 'allow' | 'restrict' | 'escalate' | null;
  matchCount: number;
  batchId: string | null;
  monitorId: string | null;
}

export interface ResultsListParams extends PageParams {
  summary?: boolean;
  q?: string;
  status?: ScreeningStatus;
  review?: 'open' | 'confirmed' | 'dismissed' | 'unreviewed';
  origin?: 'manual' | 'api' | 'batch' | 'monitor' | 'unknown';
}

export type ResultsPage = Page<ScreeningResult> | Page<ScreeningSummary>;

export interface BatchAccepted {
  id: string;
  status: 'importing' | 'pending';
  total: number;
}

export interface Batch {
  id: string;
  name: string;
  environment: Environment;
  status: 'importing' | 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  total: number;
  completed: number;
  failed: number;
  created_at: string;
  cancelled_at: string | null;
}

export interface BatchDetail extends Batch {
  rows: {
    row_number: number;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    screening_id: string | null;
    error: { code: string; message: string } | null;
  }[];
  nextOffset: number | null;
}

export interface BatchRetrieveParams {
  limit?: number;
  offset?: number;
}

export interface BatchCancellation {
  id: string;
  status: 'completed' | 'cancelled' | 'failed';
}

export interface StorageUsage {
  maxBytes: number;
  usedBytes: number;
  reservedBytes: number;
  remainingBytes: number;
}

export interface FileStorage extends StorageUsage {
  plan: string;
  sandbox: StorageUsage;
  maxBatchUploadBytes: number;
  maxEvidenceAttachmentBytes: number;
}

export interface MonitoringForecast {
  generatedAt: string;
  periodEnd: string;
  dailyScreenings: number;
  projectedRemainingScreenings: number;
  effectiveLimit: number;
  used: number;
  reserved: number;
  remaining: number;
  projectedExhaustionAt: string | null;
}

export interface Usage {
  environment: Environment;
  period: string;
  used: number;
  reserved: number;
  limit: number;
  planLimit: number;
  spendingCap: number;
  effectiveLimit: number;
  remaining: number;
  plan: string;
  events: { kind: string; subjects: number }[];
  fileStorage: FileStorage;
  monitoringForecast: MonitoringForecast | null;
  forecastUnavailable: string | null;
}
