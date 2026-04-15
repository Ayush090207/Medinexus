import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Pill,
  Share2,
  Loader2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Shield,
  Clock,
  UserRound,
  Building2,
  ArrowRightLeft,
  Plus,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  patientService,
  type PatientPassport,
  type AccessGrant,
  type PatientReferral,
  type DocumentSelection,
} from '@/services/patient.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  PrescriptionViewModal,
  normalizePrescriptionData,
  type PDFPrescriptionData,
} from '@/features/dashboard/shared/PrescriptionViewModal';

type PassportTab = 'prescriptions' | 'reports' | 'grants' | 'referrals' | 'trends';

// ─── Trend types ──────────────────────────────────────────────────────────────

interface TrendItem {
  parameter: string;
  direction: 'improving' | 'declining' | 'stable' | 'variable';
  concern: 'none' | 'watch' | 'urgent';
  note: string;
}

interface TrendsData {
  summary: string;
  trends: TrendItem[];
  report_count: number;
  generated_at: string;
}

// ─── Helper: group grants by doctor ──────────────────────────────────────────

interface GroupedGrant {
  doctorId: string;
  doctorName: string;
  specialisation: string;
  hospitalName: string;
  grants: AccessGrant[];
}

function groupGrantsByDoctor(grants: AccessGrant[]): GroupedGrant[] {
  const map = new Map<string, GroupedGrant>();

  for (const g of grants) {
    const docId = g.granted_to_doctor_id ?? 'unknown';
    if (!map.has(docId)) {
      map.set(docId, {
        doctorId: docId,
        doctorName: g.doctor?.full_name ?? 'Unknown Doctor',
        specialisation: g.doctor?.specialisation ?? '',
        hospitalName: g.doctor?.hospitals?.name ?? '',
        grants: [],
      });
    }
    map.get(docId)!.grants.push(g);
  }

  return [...map.values()].sort((a, b) => {
    // Sort by most recent grant first
    const aLatest = Math.max(...a.grants.map(g => new Date(g.created_at).getTime()));
    const bLatest = Math.max(...b.grants.map(g => new Date(g.created_at).getTime()));
    return bLatest - aLatest;
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const PatientHealthPassport = () => {
  const [tab, setTab] = useState<PassportTab>('prescriptions');
  const [passport, setPassport] = useState<PatientPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingDoctor, setRevokingDoctor] = useState<string | null>(null);

  // PDF modal state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);

  // Collapsible doctor groups
  const [expandedDoctors, setExpandedDoctors] = useState<Set<string>>(new Set());

  // ── Report Audio Analysis ──
  // reportSpeakState: per-report loading/playing state
  // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  type SpeakState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  const [reportSpeakStates, setReportSpeakStates] = useState<Record<string, SpeakState>>({});
  // Per-report language selection; audio is cached per `${reportId}:${lang}`
  const [reportLangs, setReportLangs] = useState<Record<string, 'en' | 'hi'>>({});
  const reportAudioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const setSpeakState = (reportId: string, state: SpeakState) =>
    setReportSpeakStates((prev) => ({ ...prev, [reportId]: state }));

  const handleSpeakReport = async (reportId: string, lang: 'en' | 'hi') => {
    const current = reportSpeakStates[reportId] ?? 'idle';
    const audioKey = `${reportId}:${lang}`;

    // If audio already loaded for this lang — toggle play/pause
    const existing = reportAudioRefs.current[audioKey];
    if (existing && (current === 'playing' || current === 'paused')) {
      if (current === 'playing') {
        existing.pause();
        setSpeakState(reportId, 'paused');
      } else {
        existing.play();
        setSpeakState(reportId, 'playing');
      }
      return;
    }

    // Otherwise: fetch from server
    setSpeakState(reportId, 'loading');
    try {
      const res = await patientService.speakReport(reportId, lang);
      const audioBase64 = res.data?.audio_base64;
      if (!audioBase64) throw new Error('No audio received');

      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      reportAudioRefs.current[audioKey] = audio;

      audio.onended = () => setSpeakState(reportId, 'idle');
      audio.onpause = () => {
        if (!audio.ended) setSpeakState(reportId, 'paused');
      };
      audio.onplay = () => setSpeakState(reportId, 'playing');

      await audio.play();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate audio');
      setSpeakState(reportId, 'error');
    }
  };

  // ── Health Trends ──
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  const handleGenerateTrends = async () => {
    if (trendsLoading) return;
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const res = await patientService.getHealthTrends();
      setTrendsData(res.data);
    } catch (e: any) {
      setTrendsError(e.message ?? 'Failed to generate trend analysis');
    } finally {
      setTrendsLoading(false);
    }
  };

  // ── Grant Access Dialog ──
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantDoctorQuery, setGrantDoctorQuery] = useState('');
  const [grantDoctorResults, setGrantDoctorResults] = useState<any[]>([]);
  const [grantDoctorSearching, setGrantDoctorSearching] = useState(false);
  const [grantSelectedDoctor, setGrantSelectedDoctor] = useState<any | null>(null);
  const [grantSelectedDocs, setGrantSelectedDocs] = useState<DocumentSelection[]>([]);
  const [grantValidDays, setGrantValidDays] = useState(30);
  const [grantSaving, setGrantSaving] = useState(false);
  const grantDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPassport = async () => {
    setLoading(true);
    try {
      const res = await patientService.getPassport();
      setPassport((res as any).data as PatientPassport);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load health passport');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPassport();
  }, []);

  // ── Grant dialog: debounced doctor search ──
  useEffect(() => {
    if (!grantDialogOpen) return;
    if (grantDoctorQuery.length < 2) {
      setGrantDoctorResults([]);
      return;
    }
    if (grantDebounceRef.current) clearTimeout(grantDebounceRef.current);
    grantDebounceRef.current = setTimeout(async () => {
      setGrantDoctorSearching(true);
      try {
        const res = await patientService.searchDoctors(grantDoctorQuery);
        setGrantDoctorResults((res as any).data?.doctors ?? []);
      } catch {
        setGrantDoctorResults([]);
      } finally {
        setGrantDoctorSearching(false);
      }
    }, 300);
    return () => { if (grantDebounceRef.current) clearTimeout(grantDebounceRef.current); };
  }, [grantDoctorQuery, grantDialogOpen]);

  const openGrantDialog = () => {
    setGrantDoctorQuery('');
    setGrantDoctorResults([]);
    setGrantSelectedDoctor(null);
    setGrantSelectedDocs([]);
    setGrantValidDays(30);
    setGrantDialogOpen(true);
  };

  const toggleGrantDoc = (docType: 'prescription' | 'report', docId: string) => {
    setGrantSelectedDocs(prev => {
      const exists = prev.some(d => d.document_type === docType && d.document_id === docId);
      if (exists) return prev.filter(d => !(d.document_type === docType && d.document_id === docId));
      return [...prev, { document_type: docType, document_id: docId }];
    });
  };

  const isGrantDocSelected = (docType: 'prescription' | 'report', docId: string) =>
    grantSelectedDocs.some(d => d.document_type === docType && d.document_id === docId);

  const handleSubmitGrant = async () => {
    if (!grantSelectedDoctor || grantSelectedDocs.length === 0) return;
    setGrantSaving(true);
    try {
      await patientService.createGrant({
        granted_to_doctor_id: grantSelectedDoctor.id,
        documents: grantSelectedDocs,
        valid_days: grantValidDays,
        source: 'manual',
      });
      toast.success(`Shared ${grantSelectedDocs.length} document${grantSelectedDocs.length !== 1 ? 's' : ''} with ${grantSelectedDoctor.full_name}`);
      setGrantDialogOpen(false);
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to grant access');
    } finally {
      setGrantSaving(false);
    }
  };

  // Fetcher for the PDF modal
  const fetchPDFData = useCallback(async (id: string): Promise<PDFPrescriptionData> => {
    const res = await patientService.getPrescription(id);
    const raw = (res as any).data?.prescription;
    if (!raw) throw new Error('Prescription not found');
    return normalizePrescriptionData(raw);
  }, []);

  const openModal = (rxId: string) => {
    setSelectedRxId(rxId);
    setViewModalOpen(true);
  };

  // Revoke a single grant
  const handleRevokeSingle = async (grantId: string) => {
    setRevoking(grantId);
    try {
      await patientService.revokeGrant(grantId);
      toast.success('Access revoked');
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to revoke access');
    } finally {
      setRevoking(null);
    }
  };

  // Revoke ALL grants for a doctor
  const handleRevokeAllForDoctor = async (doctorId: string, doctorName: string) => {
    setRevokingDoctor(doctorId);
    try {
      await patientService.revokeAllGrantsForDoctor(doctorId);
      toast.success(`All access for ${doctorName} revoked`);
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to revoke access');
    } finally {
      setRevokingDoctor(null);
    }
  };

  const toggleDoctorExpanded = (doctorId: string) => {
    setExpandedDoctors(prev => {
      const next = new Set(prev);
      if (next.has(doctorId)) next.delete(doctorId);
      else next.add(doctorId);
      return next;
    });
  };

  // Grouped grants
  const groupedGrants = useMemo(
    () => groupGrantsByDoctor(passport?.grants ?? []),
    [passport?.grants]
  );

  const activeGrantCount = (passport?.grants ?? []).filter(g => g.is_active).length;
  const expiredGrantCount = (passport?.grants ?? []).filter(g => !g.is_active).length;

  const tabs: { key: PassportTab; label: string; icon: any; badge?: number }[] = [
    { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
    { key: 'reports', label: 'Reports', icon: FileText },
    { key: 'trends', label: 'Health Trends', icon: Activity },
    { key: 'grants', label: 'Access Granted', icon: Share2, badge: activeGrantCount || undefined },
    { key: 'referrals', label: 'Referrals', icon: ArrowRightLeft },
  ];

  return (
    <>
      {/* Waveform bar animation for report speak button */}
      <style>{`
        @keyframes speakBar {
          0%, 100% { transform: scaleY(0.3); }
          50%       { transform: scaleY(1); }
        }
      `}</style>
      <div className="p-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-light tracking-tight">Health Passport</h1>
        </div>

        {/* Inner tabs */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 mb-6 w-fit flex-wrap">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {badge !== undefined && badge > 0 && (
                <span className="bg-primary/10 text-primary text-xs font-medium rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── Prescriptions ── */}
            {tab === 'prescriptions' && (
              <div className="space-y-3">
                {(passport?.prescriptions ?? []).length === 0 ? (
                  <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">No prescriptions found.</div>
                ) : (
                  (passport?.prescriptions ?? []).map((rx) => (
                    <div key={rx.id} className="bg-card rounded-xl border p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rx.illness_description ?? 'Prescription'}</p>
                          <p className="text-sm text-muted-foreground">
                            Issued {format(parseISO(rx.issued_at), 'MMM d, yyyy')}
                            {(rx as any).doctors ? ` · ${(rx as any).doctors.full_name}` : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openModal(rx.id)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          View PDF
                        </Button>
                      </div>
                      {(rx.prescription_items ?? []).length > 0 && (
                        <div className="border-t pt-3 space-y-1.5">
                          {(rx.prescription_items ?? []).map((item: any) => (
                            <div key={item.id} className="flex items-start justify-between text-sm">
                              <span className="font-medium">{item.medicines?.medicine_name ?? item.medicine_id}</span>
                              <span className="text-muted-foreground text-xs text-right">
                                {item.dosage} · {item.frequency} · {item.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Reports ── */}
            {tab === 'reports' && (
              <div className="space-y-3">
                {(passport?.reports ?? []).length === 0 ? (
                  <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">No reports found.</div>
                ) : (
                  (passport?.reports ?? []).map((report) => {
                    const speakState = reportSpeakStates[report.id] ?? 'idle';
                    const isLoading = speakState === 'loading';
                    const isPlaying = speakState === 'playing';
                    const isError = speakState === 'error';
                    const lang = reportLangs[report.id] ?? 'en';

                    return (
                      <div key={report.id} className="bg-card rounded-xl border p-5 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{report.report_name}</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {report.report_type.replace('_', ' ')} · {(report as any).hospitals?.name ?? ''} ·{' '}
                            {format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* ── Language toggle ── */}
                          <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
                            {(['en', 'hi'] as const).map((l) => (
                              <button
                                key={l}
                                onClick={() => {
                                  if (l === lang) return;
                                  // Stop any currently playing audio for this report
                                  const audioKey = `${report.id}:${lang}`;
                                  const existing = reportAudioRefs.current[audioKey];
                                  if (existing) { existing.pause(); existing.currentTime = 0; }
                                  setSpeakState(report.id, 'idle');
                                  setReportLangs((prev) => ({ ...prev, [report.id]: l }));
                                }}
                                disabled={isLoading}
                                className={`px-2 py-1 font-medium transition-colors ${
                                  lang === l
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {l === 'en' ? 'EN' : 'हि'}
                              </button>
                            ))}
                          </div>

                          {/* ── Audio speak button ── */}
                          <button
                            onClick={() => handleSpeakReport(report.id, lang)}
                            disabled={isLoading}
                            title={isPlaying ? 'Pause audio' : isLoading ? 'Generating audio…' : 'Listen to AI analysis'}
                            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                              isError
                                ? 'border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10'
                                : isPlaying
                                ? 'border-primary/40 text-primary bg-primary/10 hover:bg-primary/15'
                                : 'border-border text-muted-foreground bg-muted/40 hover:bg-muted hover:text-foreground'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Analysing…</span>
                              </>
                            ) : isPlaying ? (
                              <>
                                {/* Animated waveform bars */}
                                <span className="flex items-end gap-[2px] h-3.5">
                                  {[0, 1, 2, 3].map((i) => (
                                    <span
                                      key={i}
                                      className="w-[3px] rounded-full bg-primary"
                                      style={{
                                        height: '100%',
                                        animation: `speakBar 0.8s ease-in-out infinite`,
                                        animationDelay: `${i * 0.15}s`,
                                        transformOrigin: 'bottom',
                                      }}
                                    />
                                  ))}
                                </span>
                                <span>Pause</span>
                              </>
                            ) : isError ? (
                              <>
                                <span className="text-xs">⚠</span>
                                <span>Retry</span>
                              </>
                            ) : (
                              <>
                                {/* Static waveform icon (play state) */}
                                <span className="flex items-end gap-[2px] h-3.5">
                                  {[2, 4, 3, 5].map((h, i) => (
                                    <span
                                      key={i}
                                      className="w-[3px] rounded-full bg-current"
                                      style={{ height: `${h * 14}%` }}
                                    />
                                  ))}
                                </span>
                                <span>Listen</span>
                              </>
                            )}
                          </button>

                          <a
                            href={report.report_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Access Granted ── */}
            {tab === 'grants' && (
              <div className="space-y-4">
                {/* Summary + Grant button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-green-500" />
                      {activeGrantCount} active
                    </span>
                    {expiredGrantCount > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {expiredGrantCount} expired
                      </span>
                    )}
                  </div>
                  <Button size="sm" onClick={openGrantDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Grant Access
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Grant specific doctors access to your documents. Only you can grant or revoke access.
                </p>

                {groupedGrants.length === 0 ? (
                  <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
                    <Share2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No access grants.</p>
                    <p className="text-sm mt-1">When you book an appointment, you can share specific documents with the doctor.</p>
                  </div>
                ) : (
                  groupedGrants.map((group) => {
                    const isExpanded = expandedDoctors.has(group.doctorId);
                    const activeInGroup = group.grants.filter(g => g.is_active).length;
                    const allExpired = activeInGroup === 0;

                    return (
                      <div
                        key={group.doctorId}
                        className={`bg-card rounded-xl border overflow-hidden ${
                          allExpired ? 'opacity-60' : ''
                        }`}
                      >
                        {/* Doctor header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleDoctorExpanded(group.doctorId)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <UserRound className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">Dr. {group.doctorName.replace(/^Dr\.\s*/i, '')}</p>
                              <p className="text-sm text-muted-foreground">
                                {group.specialisation}
                                {group.hospitalName && (
                                  <span className="inline-flex items-center gap-1 ml-2">
                                    <Building2 className="h-3 w-3" />
                                    {group.hospitalName}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              allExpired
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-green-500/10 text-green-600'
                            }`}>
                              {activeInGroup} active · {group.grants.length} total
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Expanded: list of shared documents */}
                        {isExpanded && (
                          <div className="border-t">
                            <div className="divide-y">
                              {group.grants.map((grant) => {
                                const isActive = grant.is_active;
                                const docName = grant.document_type === 'prescription'
                                  ? (grant.document?.illness_description ?? 'Prescription')
                                  : (grant.document?.report_name ?? 'Report');
                                const docDate = grant.document_type === 'prescription'
                                  ? grant.document?.issued_at
                                  : grant.document?.uploaded_at;
                                const docAuthor = grant.document_type === 'prescription'
                                  ? grant.document?.doctors?.full_name
                                  : null;

                                return (
                                  <div key={grant.id} className="flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                                        grant.document_type === 'prescription'
                                          ? 'bg-blue-500/10'
                                          : 'bg-amber-500/10'
                                      }`}>
                                        {grant.document_type === 'prescription' ? (
                                          <Pill className="h-4 w-4 text-blue-500" />
                                        ) : (
                                          <FileText className="h-4 w-4 text-amber-500" />
                                        )}
                                      </div>
                                      <div>
                                        <p className={`text-sm font-medium ${!isActive ? 'line-through text-muted-foreground' : ''}`}>
                                          {docName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {grant.document_type === 'prescription' ? 'Prescription' : 'Report'}
                                          {docDate && ` · ${format(parseISO(docDate), 'MMM d, yyyy')}`}
                                           {docAuthor && ` · ${docAuthor}`}
                                          {grant.source !== 'manual' && (
                                            <span className="ml-1 text-xs bg-muted rounded px-1 py-0.5 capitalize">
                                              {grant.source}
                                            </span>
                                          )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {isActive
                                            ? `Expires ${format(parseISO(grant.valid_until), 'MMM d, yyyy')}`
                                            : 'Expired'}
                                        </p>
                                      </div>
                                    </div>
                                    {isActive && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive shrink-0"
                                        disabled={revoking === grant.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRevokeSingle(grant.id);
                                        }}
                                      >
                                        {revoking === grant.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Revoke all for this doctor */}
                            {activeInGroup > 1 && (
                              <div className="border-t px-4 py-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full"
                                  disabled={revokingDoctor === group.doctorId}
                                  onClick={() => handleRevokeAllForDoctor(group.doctorId, group.doctorName)}
                                >
                                  {revokingDoctor === group.doctorId ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                  )}
                                   Revoke All Access for Dr. {group.doctorName.replace(/^Dr\.\s*/i, '')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Referrals ── */}
            {tab === 'referrals' && (
              <div className="space-y-3">
                {(passport?.referrals ?? []).length === 0 ? (
                  <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
                    <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No referrals.</p>
                    <p className="text-sm mt-1">When a doctor refers you to another doctor, it will appear here.</p>
                  </div>
                ) : (
                  (passport?.referrals ?? []).map((referral: PatientReferral) => {
                    const statusColor = {
                      pending: 'bg-yellow-500/10 text-yellow-600',
                      accepted: 'bg-green-500/10 text-green-600',
                      declined: 'bg-red-500/10 text-red-600',
                      completed: 'bg-blue-500/10 text-blue-600',
                    }[referral.status] ?? 'bg-muted text-muted-foreground';

                    return (
                      <div key={referral.id} className="bg-card rounded-xl border p-5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                            <p className="font-medium text-sm">
                              {referral.referring_doctor?.full_name ?? 'Unknown Doctor'}
                              <span className="text-muted-foreground font-normal mx-2">referred you to</span>
                              {referral.referred_to_doctor?.full_name ?? 'Unknown Doctor'}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                            {referral.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          {referral.referring_doctor?.specialisation && (
                            <p>
                              From: {referral.referring_doctor.specialisation}
                              {referral.referring_doctor.hospitals?.name && ` at ${referral.referring_doctor.hospitals.name}`}
                            </p>
                          )}
                          {referral.referred_to_doctor?.specialisation && (
                            <p>
                              To: {referral.referred_to_doctor.specialisation}
                              {referral.referred_to_doctor.hospitals?.name && ` at ${referral.referred_to_doctor.hospitals.name}`}
                            </p>
                          )}
                          {referral.reason && (
                            <p className="italic">Reason: {referral.reason}</p>
                          )}
                          <p className="text-xs">
                            {format(parseISO(referral.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Health Trends ── */}
            {tab === 'trends' && (
              <div className="space-y-4">
                {/* Generate / Regenerate button */}
                {!trendsData && !trendsLoading && (
                  <div className="bg-card rounded-xl border p-10 flex flex-col items-center gap-4 text-center">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Activity className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Longitudinal Health Trend Analysis</p>
                      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        AI reads all your reports together in chronological order and surfaces how your key health markers have changed over time.
                      </p>
                    </div>
                    {trendsError && (
                      <p className="text-sm text-destructive">{trendsError}</p>
                    )}
                    <Button onClick={handleGenerateTrends} className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Analyse My Health Trends
                    </Button>
                  </div>
                )}

                {trendsLoading && (
                  <div className="bg-card rounded-xl border p-16 flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Reading your reports and identifying trends…
                    </p>
                    <p className="text-xs text-muted-foreground opacity-60">This may take 15–30 seconds</p>
                  </div>
                )}

                {trendsData && !trendsLoading && (
                  <>
                    {/* Overall summary card */}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary shrink-0" />
                          <p className="text-sm font-medium text-primary">Overall Summary</p>
                        </div>
                        <button
                          onClick={() => { setTrendsData(null); handleGenerateTrends(); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Refresh
                        </button>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{trendsData.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        Based on {trendsData.report_count} reports · Generated {format(parseISO(trendsData.generated_at), 'MMM d, yyyy')}
                      </p>
                    </div>

                    {/* Individual trend cards */}
                    {trendsData.trends.length === 0 ? (
                      <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground text-sm">
                        No measurable parameter trends were found across your reports.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {trendsData.trends.map((trend, i) => {
                          const directionIcon =
                            trend.direction === 'improving' ? <TrendingUp className="h-4 w-4" /> :
                            trend.direction === 'declining' ? <TrendingDown className="h-4 w-4" /> :
                            trend.direction === 'variable' ? <Activity className="h-4 w-4" /> :
                            <Minus className="h-4 w-4" />;

                          const concernColors = {
                            urgent: 'border-red-500/30 bg-red-500/5',
                            watch: 'border-yellow-500/30 bg-yellow-500/5',
                            none: 'border-green-500/30 bg-green-500/5',
                          }[trend.concern] ?? 'border-border bg-card';

                          const directionColors = {
                            improving: 'text-green-600',
                            declining: trend.concern === 'urgent' ? 'text-red-500' : 'text-yellow-600',
                            stable: 'text-green-600',
                            variable: 'text-yellow-600',
                          }[trend.direction] ?? 'text-muted-foreground';

                          const concernLabel = {
                            urgent: '⚠ Needs attention',
                            watch: '· Worth monitoring',
                            none: '· Looking good',
                          }[trend.concern] ?? '';

                          return (
                            <div key={i} className={`rounded-xl border p-4 space-y-2 ${concernColors}`}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium leading-tight">{trend.parameter}</p>
                                <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ${directionColors}`}>
                                  {directionIcon}
                                  <span className="capitalize">{trend.direction}</span>
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{trend.note}</p>
                              {trend.concern !== 'none' && (
                                <p className={`text-xs font-medium ${directionColors}`}>{concernLabel}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedRxId && (
        <PrescriptionViewModal
          open={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          prescriptionId={selectedRxId}
          label="Prescription Preview"
          fetchData={fetchPDFData}
        />
      )}

      {/* ── Grant Access Dialog ── */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Grant Document Access</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
            {/* Step 1 — Doctor search */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Search for a doctor</p>
              {grantSelectedDoctor ? (
                <div className="flex items-center justify-between bg-primary/5 border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Dr. {grantSelectedDoctor.full_name.replace(/^Dr\.\s*/i, '')}</p>
                    <p className="text-xs text-muted-foreground">
                      {grantSelectedDoctor.specialisation}
                      {grantSelectedDoctor.hospitals?.name && ` · ${grantSelectedDoctor.hospitals.name}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setGrantSelectedDoctor(null);
                      setGrantDoctorQuery('');
                      setGrantDoctorResults([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9"
                    placeholder="Search by name or specialisation..."
                    value={grantDoctorQuery}
                    onChange={(e) => setGrantDoctorQuery(e.target.value)}
                    autoFocus
                  />
                  {grantDoctorSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {grantDoctorResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {grantDoctorResults.map((doc) => (
                        <button
                          key={doc.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={() => {
                            setGrantSelectedDoctor(doc);
                            setGrantDoctorQuery('');
                            setGrantDoctorResults([]);
                          }}
                        >
                          <p className="font-medium">Dr. {doc.full_name.replace(/^Dr\.\s*/i, '')}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.specialisation}
                            {doc.hospitals?.name && ` · ${doc.hospitals.name}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!grantDoctorSearching && grantDoctorQuery.length >= 2 && grantDoctorResults.length === 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-sm px-3 py-2 text-sm text-muted-foreground">
                      No doctors found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2 — Select documents */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Select documents to share</p>

              {/* Prescriptions */}
              {(passport?.prescriptions ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium px-1">
                    Prescriptions
                  </p>
                  {(passport?.prescriptions ?? []).map((rx) => (
                    <label
                      key={rx.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={isGrantDocSelected('prescription', rx.id)}
                        onCheckedChange={() => toggleGrantDoc('prescription', rx.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {rx.illness_description ?? 'Prescription'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(rx.issued_at), 'MMM d, yyyy')}
                           {(rx as any).doctors ? ` · ${(rx as any).doctors.full_name}` : ''}
                         </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Reports */}
              {(passport?.reports ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium px-1">
                    Reports
                  </p>
                  {(passport?.reports ?? []).map((report) => (
                    <label
                      key={report.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={isGrantDocSelected('report', report.id)}
                        onCheckedChange={() => toggleGrantDoc('report', report.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{report.report_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {report.report_type.replace('_', ' ')} ·{' '}
                          {format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {(passport?.prescriptions ?? []).length === 0 && (passport?.reports ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                  No documents available to share.
                </p>
              )}
            </div>

            {/* Step 3 — Valid duration */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Access duration</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={grantValidDays}
                  onChange={(e) => setGrantValidDays(Math.min(365, Math.max(1, Number(e.target.value))))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days from today</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t mt-2">
            <Button
              variant="outline"
              onClick={() => setGrantDialogOpen(false)}
              disabled={grantSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitGrant}
              disabled={!grantSelectedDoctor || grantSelectedDocs.length === 0 || grantSaving}
            >
              {grantSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              Share {grantSelectedDocs.length > 0 ? `${grantSelectedDocs.length} ` : ''}
              {grantSelectedDocs.length === 1 ? 'Document' : 'Documents'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
