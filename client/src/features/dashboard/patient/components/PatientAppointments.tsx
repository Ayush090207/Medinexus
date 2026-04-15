import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Loader2, X, ListChecks, ArrowRight, Stethoscope, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientService, type PatientAppointment } from '@/services/patient.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

type Filter = 'upcoming' | 'past' | 'all';
type AppointmentKind = 'doctor' | 'service';

const STATUS_COLORS: Record<string, string> = {
  booked: 'bg-blue-500/10 text-blue-500',
  checked_in: 'bg-yellow-500/10 text-yellow-600',
  in_progress: 'bg-orange-500/10 text-orange-500',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-red-500/10 text-red-400',
  no_show: 'bg-muted text-muted-foreground',
};

const CANCELLABLE_DOCTOR = ['booked', 'checked_in'];
const CANCELLABLE_SERVICE = ['booked'];

// Service appointments are filtered client-side since the API doesn't support upcoming/past filter
const filterServiceAppointments = (appts: any[], filter: Filter): any[] => {
  const today = new Date().toISOString().split('T')[0];
  if (filter === 'upcoming') return appts.filter(a => (a.service_slots?.slot_date ?? '') >= today && a.status !== 'cancelled');
  if (filter === 'past') return appts.filter(a => (a.service_slots?.slot_date ?? '') < today || a.status === 'cancelled');
  return appts;
};

export const PatientAppointments = ({ setActiveTab }: { setActiveTab?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const [kind, setKind] = useState<AppointmentKind>('doctor');
  const [filter, setFilter] = useState<Filter>('upcoming');

  // Doctor appointments
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Service appointments
  const [serviceAppts, setServiceAppts] = useState<any[]>([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [cancellingService, setCancellingService] = useState<string | null>(null);

  // ── Fetch doctor appointments ───────────────────────────────────────────────

  const fetchAppointments = async () => {
    setApptLoading(true);
    try {
      const res = await patientService.listAppointments(filter);
      setAppointments((res as any).data?.appointments ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Failed to load appointments');
    } finally {
      setApptLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [filter]);

  // ── Fetch service appointments ──────────────────────────────────────────────

  const fetchServiceAppointments = async () => {
    setServiceLoading(true);
    try {
      const res = await patientService.listMyServiceAppointments();
      setServiceAppts((res as any).data?.appointments ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Failed to load service appointments');
    } finally {
      setServiceLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceAppointments();
  }, []);

  // ── Cancel handlers ─────────────────────────────────────────────────────────

  const handleCancelDoctor = async (id: string) => {
    setCancelling(id);
    try {
      await patientService.cancelAppointment(id);
      toast.success('Appointment cancelled');
      fetchAppointments();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Could not cancel appointment');
    } finally {
      setCancelling(null);
    }
  };

  const handleCancelService = async (id: string) => {
    setCancellingService(id);
    try {
      await patientService.cancelServiceAppointment(id);
      toast.success('Service appointment cancelled');
      fetchServiceAppointments();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Could not cancel appointment');
    } finally {
      setCancellingService(null);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const filteredServiceAppts = filterServiceAppointments(serviceAppts, filter);
  const loading = kind === 'doctor' ? apptLoading : serviceLoading;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-light tracking-tight">My Appointments</h1>
        <div className="flex items-center gap-2">
          {setActiveTab && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setActiveTab('waitlist')}
            >
              <ListChecks className="h-4 w-4 mr-1.5" />
              My Waitlist
            </Button>
          )}
          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            {(['upcoming', 'past', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors capitalize ${
                  filter === f ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kind tabs: Doctor vs Service */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setKind('doctor')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            kind === 'doctor'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Stethoscope className="h-4 w-4" />
          Doctor Appointments
        </button>
        <button
          onClick={() => setKind('service')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            kind === 'service'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FlaskConical className="h-4 w-4" />
          Service Appointments
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>

      ) : kind === 'doctor' ? (
        appointments.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
            No {filter === 'all' ? '' : filter} doctor appointments found.
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map((appt) => (
              <div key={appt.id} className="bg-card rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{appt.doctors?.full_name ?? 'Doctor'}</span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {appt.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {appt.doctors?.specialisation} — {appt.hospitals?.name}, {appt.hospitals?.city}
                  </p>
                  {appt.appointment_slots && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(parseISO(appt.appointment_slots.slot_start), 'EEE, MMM d, yyyy')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {format(parseISO(appt.appointment_slots.slot_start), 'h:mm a')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {CANCELLABLE_DOCTOR.includes(appt.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={cancelling === appt.id}
                      onClick={() => handleCancelDoctor(appt.id)}
                    >
                      {cancelling === appt.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                      Cancel
                    </Button>
                  )}
                  {appt.status === 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => navigate('/patient/discover')}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Book Again
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )

      ) : (
        // ── Service appointments ──────────────────────────────────────────────
        filteredServiceAppts.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No {filter === 'all' ? '' : filter} service appointments found.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => navigate('/patient/services')}
            >
              Book a Service
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredServiceAppts.map((appt: any) => (
              <div key={appt.id} className="bg-card rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{appt.hospital_services?.service_name ?? 'Service'}</span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {appt.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {appt.hospital_services?.service_type}
                    {appt.hospital_services?.department ? ` · ${appt.hospital_services.department}` : ''}
                    {appt.hospitals ? ` — ${appt.hospitals.name}, ${appt.hospitals.city}` : ''}
                  </p>
                  {appt.service_slots && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {appt.service_slots.slot_date
                          ? format(parseISO(appt.service_slots.slot_date), 'EEE, MMM d, yyyy')
                          : '—'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Slot #{appt.service_slots.slot_number}
                      </span>
                    </div>
                  )}
                  {appt.hospital_services?.fee != null && (
                    <p className="text-xs text-muted-foreground">Fee: ₹{appt.hospital_services.fee}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {CANCELLABLE_SERVICE.includes(appt.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={cancellingService === appt.id}
                      onClick={() => handleCancelService(appt.id)}
                    >
                      {cancellingService === appt.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4 mr-1" />}
                      Cancel
                    </Button>
                  )}
                  {appt.status === 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => navigate('/patient/services')}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Book Again
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
