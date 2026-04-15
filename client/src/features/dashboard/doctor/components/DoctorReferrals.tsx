import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowRightLeft,
  Search,
  Send,
  Inbox,
  Loader2,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Stethoscope,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  doctorService,
  type Referral,
  type DoctorAppointment,
  type DoctorSearchResult,
} from '@/services/doctor.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600',
  accepted: 'bg-green-500/10 text-green-600',
  declined: 'bg-red-500/10 text-red-500',
  completed: 'bg-blue-500/10 text-blue-600',
};

// ─── Component ───────────────────────────────────────────────────────────────

export const DoctorReferrals = () => {
  // ── Referrals list ──
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  // ── Create referral form ──
  const [showForm, setShowForm] = useState(false);
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState<DoctorSearchResult[]>([]);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const [selectedReferDoctor, setSelectedReferDoctor] = useState<DoctorSearchResult | null>(null);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; full_name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Action loading ──
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Collapsible referral details ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Fetch referrals ──
  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await doctorService.listReferrals();
      setReferrals((res as any).data?.referrals ?? []);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // Graceful fallback when the referrals table hasn't been migrated yet
      if (
        msg.toLowerCase().includes('relation') ||
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('schema cache') ||
        msg.toLowerCase().includes("could not find the table")
      ) {
        setReferrals([]);
        toast.error('Referrals table not yet set up — restart the server to apply migrations.');
      } else {
        toast.error(msg || 'Failed to fetch referrals');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  // ── Fetch patients from past appointments (for creating referrals) ──
  const fetchPatients = useCallback(async (ensurePatient?: { id: string; full_name: string }) => {
    setPatientsLoading(true);
    try {
      const res = await doctorService.listAppointments('all');
      const appts: DoctorAppointment[] = (res as any).data?.appointments ?? [];
      // Deduplicate patients
      const seen = new Set<string>();
      const uniquePatients: { id: string; full_name: string }[] = [];
      for (const a of appts) {
        if (!seen.has(a.patient_id) && a.patients?.full_name) {
          seen.add(a.patient_id);
          uniquePatients.push({ id: a.patient_id, full_name: a.patients.full_name });
        }
      }
      // Ensure preselected patient is always in the list
      if (ensurePatient && !seen.has(ensurePatient.id)) {
        uniquePatients.push(ensurePatient);
      }
      uniquePatients.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setPatients(uniquePatients);
    } catch {
      toast.error('Failed to load patients');
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  // ── Doctor search with debounce ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDoctorSearch = (q: string) => {
    setDoctorQuery(q);
    setSelectedReferDoctor(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setDoctorResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setDoctorSearching(true);
      try {
        const res = await doctorService.searchDoctors(q.trim());
        setDoctorResults((res as any).data?.doctors ?? []);
      } catch {
        // silent
      } finally {
        setDoctorSearching(false);
      }
    }, 300);
  };

  // ── Open form ──
  const openForm = () => {
    setShowForm(true);
    setDoctorQuery('');
    setDoctorResults([]);
    setSelectedReferDoctor(null);
    setSelectedPatient(null);
    setReason('');
    fetchPatients();
  };

  // ── Create referral ──
  const handleCreate = async () => {
    if (!selectedReferDoctor || !selectedPatient) return;
    setCreating(true);
    try {
      const res = await doctorService.createReferral({
        patient_id: selectedPatient.id,
        referred_to_doctor_id: selectedReferDoctor.id,
        reason: reason.trim() || undefined,
      });
      const grantsCopied = (res as any).data?.grants_copied ?? 0;
      toast.success(
        `Referral sent to ${selectedReferDoctor.full_name}` +
          (grantsCopied > 0 ? `. ${grantsCopied} document access grant${grantsCopied > 1 ? 's' : ''} copied.` : '')
      );
      setShowForm(false);
      fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create referral');
    } finally {
      setCreating(false);
    }
  };

  // ── Update referral status ──
  const handleStatusUpdate = async (referralId: string, status: 'accepted' | 'declined' | 'completed') => {
    setActionLoading(referralId);
    try {
      await doctorService.updateReferralStatus(referralId, status);
      const messages = {
        accepted: 'Referral accepted',
        declined: 'Referral declined',
        completed: 'Referral marked as completed',
      };
      toast.success(messages[status]);
      fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update referral');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Filtered referrals ──
  const filtered = referrals.filter((r) => r.direction === tab);
  const received = referrals.filter((r) => r.direction === 'received');
  const sent = referrals.filter((r) => r.direction === 'sent');

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-light tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            Referrals
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Refer patients to other doctors or manage referrals sent to you.
          </p>
        </div>
        <Button onClick={openForm} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          New Referral
        </Button>
      </div>

      {/* Create Referral Form */}
      {showForm && (
        <div className="bg-card rounded-xl border p-5 mb-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Create Referral</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Select Patient */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Patient</Label>
            {patientsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading patients...
              </div>
            ) : (
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedPatient?.id ?? ''}
                onChange={(e) => {
                  const p = patients.find((pt) => pt.id === e.target.value) ?? null;
                  setSelectedPatient(p);
                }}
              >
                <option value="">Select a patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Search Doctor */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Refer to Doctor</Label>
            {selectedReferDoctor ? (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium">{selectedReferDoctor.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedReferDoctor.specialisation}
                    {selectedReferDoctor.hospitals?.name && ` · ${selectedReferDoctor.hospitals.name}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedReferDoctor(null);
                    setDoctorQuery('');
                    setDoctorResults([]);
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or specialisation..."
                  className="pl-9"
                  value={doctorQuery}
                  onChange={(e) => handleDoctorSearch(e.target.value)}
                />
                {doctorSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {doctorResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {doctorResults.map((doc) => (
                      <button
                        key={doc.id}
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors text-sm"
                        onClick={() => {
                          setSelectedReferDoctor(doc);
                          setDoctorQuery('');
                          setDoctorResults([]);
                        }}
                      >
                        <p className="font-medium">{doc.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.specialisation}
                          {doc.hospitals?.name && ` · ${doc.hospitals.name}, ${doc.hospitals.city}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Patient needs cardiac evaluation following persistent chest pain..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Info note */}
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            Creating a referral will automatically copy your document access grants for this patient to the referred doctor.
            The referred doctor will only see the same documents you currently have access to.
          </p>

          {/* Submit */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!selectedPatient || !selectedReferDoctor || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Referral
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mb-6">
        <button
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'received' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('received')}
        >
          <Inbox className="h-4 w-4" />
          Received
          {received.filter(r => r.status === 'pending').length > 0 && (
            <span className="text-xs bg-amber-500/15 text-amber-600 rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-semibold">
              {received.filter(r => r.status === 'pending').length}
            </span>
          )}
          {received.filter(r => r.status === 'pending').length === 0 && received.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {received.length}
            </span>
          )}
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'sent' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('sent')}
        >
          <Send className="h-4 w-4" />
          Sent
          {sent.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {sent.length}
            </span>
          )}
        </button>
      </div>

      {/* Referrals list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No {tab} referrals yet.</p>
          {tab === 'sent' && (
            <p className="text-sm mt-1">
              Click "New Referral" to refer a patient to another doctor.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ref) => {
            const isExpanded = expandedId === ref.id;
            const otherDoctor = tab === 'received' ? ref.referring_doctor : ref.referred_to_doctor;
            const isPending = ref.status === 'pending';
            const isActioning = actionLoading === ref.id;

            return (
              <div
                key={ref.id}
                className="bg-card rounded-xl border transition-colors"
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : ref.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">
                        {tab === 'received' ? 'From' : 'To'}: {otherDoctor?.full_name ?? 'Unknown'}
                      </p>
                      <span className={`text-xs capitalize rounded px-1.5 py-0.5 ${STATUS_BADGE[ref.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {ref.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {otherDoctor?.specialisation}
                      {otherDoctor?.hospitals?.name && ` · ${otherDoctor.hospitals.name}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <User className="h-3 w-3 inline mr-1" />
                      Patient: {ref.patient?.full_name ?? 'Unknown'}
                      <span className="mx-1.5">·</span>
                      {format(parseISO(ref.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
                    {ref.reason && (
                      <div className="text-sm">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reason</p>
                        <p className="text-foreground">{ref.reason}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                          {tab === 'received' ? 'Referred by' : 'Referred to'}
                        </p>
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{otherDoctor?.full_name}</span>
                        </div>
                        {otherDoctor?.hospitals?.name && (
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {otherDoctor.hospitals.name}, {otherDoctor.hospitals.city}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Patient</p>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{ref.patient?.full_name}</span>
                        </div>
                        {ref.patient?.email && (
                          <p className="text-xs text-muted-foreground mt-0.5">{ref.patient.email}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {format(parseISO(ref.created_at), 'EEEE, MMMM d, yyyy · h:mm a')}
                      {ref.updated_at !== ref.created_at && (
                        <span className="ml-2">
                          · Updated {format(parseISO(ref.updated_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>

                    {/* Actions for received + pending referrals */}
                    {tab === 'received' && isPending && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleStatusUpdate(ref.id, 'accepted'); }}
                          disabled={isActioning}
                        >
                          {isActioning ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleStatusUpdate(ref.id, 'declined'); }}
                          disabled={isActioning}
                          className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Decline
                        </Button>
                      </div>
                    )}

                    {/* Mark completed — available to either doctor once accepted */}
                    {ref.status === 'accepted' && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleStatusUpdate(ref.id, 'completed'); }}
                          disabled={isActioning}
                        >
                          {isActioning ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Mark Completed
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
