import type {
  CoverageSelection,
  MonitoringForecast,
  Page,
  PageParams,
  PolicyReference,
  ScreeningRequest,
  SourceRecord,
  Subject,
} from './types.js';

export type MonitorStatus = 'active' | 'paused';
export type MonitorIntervalHours = 6 | 24 | 168;
export type MonitorHealth = 'pending' | 'healthy' | 'overdue' | 'failed' | 'paused';

export type MonitorRequest = CoverageSelection & {
  name: string;
  subject: Subject;
  counterpartyId?: string;
  policy?: PolicyReference;
};

export type MonitorUpdate = MonitorRequest & { expectedRevision: number };

export type MonitorControl = {
  expectedRevision: number;
  status?: MonitorStatus;
  intervalHours?: MonitorIntervalHours;
  runNow?: true;
} & (
  | { status: MonitorStatus }
  | { intervalHours: MonitorIntervalHours }
  | { runNow: true }
);

export type MonitorListParams = PageParams;

export interface MonitoringListParams extends PageParams {
  monitorId?: string;
  q?: string;
}

export interface Monitor {
  id: string;
  name: string;
  status: MonitorStatus;
  last_screening_id: string | null;
  next_run_at: string;
  created_at: string;
  revision: number;
  counterparty_id: string | null;
}

export type MonitorPage = Page<Monitor>;

export interface MonitorCreated {
  id: string;
  name: string;
  status: 'active';
}

export interface MonitorUpdated {
  id: string;
  name: string;
  status: MonitorStatus;
  revision: number;
}

export interface MonitorDeleted {
  id: string;
  status: 'deleted';
}

export interface ResourceUpdated {
  id: string;
  updated: true;
}

export interface MonitoringItem {
  id: string;
  name: string;
  status: MonitorStatus;
  request: ScreeningRequest;
  counterpartyId: string | null;
  lastScreeningId: string | null;
  nextRunAt: string;
  updatedAt: string;
  intervalHours: MonitorIntervalHours;
  revision: number;
  lastErrorCode: string | null;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  health: MonitorHealth;
}

export interface MonitoringPage extends Page<MonitoringItem> {
  forecast: MonitoringForecast | null;
  forecastUnavailable: string | null;
}

export type MonitorEventKind =
  | 'initial_match'
  | 'match_added'
  | 'match_removed'
  | 'evidence_changed'
  | 'policy_changed'
  | 'baseline_unavailable'
  | 'screening_failed'
  | 'screening_overdue'
  | 'screening_recovered'
  | 'review_required';

export type MonitorEventStatus = 'unread' | 'acknowledged';

export interface MonitoringInboxListParams extends PageParams {
  status?: MonitorEventStatus | 'all';
  kind?: MonitorEventKind;
  monitorId?: string;
}

export type MonitorRecordPreview = Pick<
  SourceRecord,
  'names' | 'identifiers' | 'birthDates' | 'nationalities' | 'designations'
>;

export interface MonitorChange {
  sourceId: string;
  recordId: string;
  kind: 'added' | 'removed' | 'changed';
  fields: string[];
  before?: MonitorRecordPreview;
  after?: MonitorRecordPreview;
}

export interface MonitorEvent {
  id: string;
  monitorId: string;
  monitorName: string;
  caseId: string | null;
  screeningId: string | null;
  previousScreeningId: string | null;
  kind: MonitorEventKind;
  status: MonitorEventStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  errorCode: string | null;
  totalChanges: number;
  evidenceExpired: boolean;
  currentEvidenceAvailable: boolean;
  previousEvidenceAvailable: boolean;
  changes: MonitorChange[];
}

export interface MonitorEventPage extends Page<MonitorEvent> {
  unreadCount: number;
}
