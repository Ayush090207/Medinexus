import { useEffect, useState } from 'react';
import { Calendar, User, Phone, Stethoscope, Hash, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  hospitalService,
  type ServiceAppointment,
  type ServiceAppointmentStatus,
  type HospitalService,
} from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

type Filter = 'upcoming' | 'past' | 'all';

const FILTERS: Filter[] = ['upcoming', 'past', 'all'];

const STATUS_COLORS: Record<string, string> = {
  booked:      'bg-blue-500/10 text-blue-500',
  checked_in:  'bg-yellow-500/10 text-yellow-500',
  in_progress: 'bg-orange-500/10 text-orange-500',
  completed:   'bg-green-500/10 text-green-500',
  cancelled:   'bg-red-500/10 text-red-400',
  no_show:     'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS: Array<{ label: string; value: ServiceAppointmentStatus | '' }> = [
  { label: 'All statuses',  value: '' },
  { label: 'Booked',        value: 'booked' },
  { label: 'Checked in',    value: 'checked_in' },
  { label: 'In progress',   value: 'in_progress' },
  { label: 'Completed',     value: 'completed' },
  { label: 'Cancelled',     value: 'cancelled' },
  { label: 'No show',       value: 'no_show' },
];

/** Actions available from each status (admin-side transitions). */
const NEXT_ACTIONS: Record<ServiceAppointmentStatus, Array<{ label: string; value: ServiceAppointmentStatus }>> = {
  booked:      [{ label: 'Check in',    value: 'checked_in' },
                { label: 'No show',     value: 'no_show'    },
                { label: 'Cancel',      value: 'cancelled'  }],
  checked_in:  [{ label: 'Start',       value: 'in_progress'},
                { label: 'Cancel',      value: 'cancelled'  }],
  in_progress: [{ label: 'Complete',    value: 'completed'  },
                { label: 'Cancel',      value: 'cancelled'  }],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a DATE-only string (YYYY-MM-DD) as local midnight to avoid UTC offset
 * shifting the displayed date by one day in non-UTC timezones.
 */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminServiceAppointments = () => {
  const [appointments, setAppointments] = useState<ServiceAppointment[]>([]);
  const [total, setTotal]               = useState(0);
  const [services, setServices]         = useState<HospitalService[]>([]);
  const [filter, setFilter]             = useState<Filter>('upcoming');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter]   = useState<ServiceAppointmentStatus | ''>('');
  const [loading, setLoading]           = useState(true);

  // Load services for the filter dropdown (once)
  useEffect(() => {
    hospitalService
      .listServices()
      .then(res => setServices((res as any).data?.services ?? []))
      .catch(() => { /* non-critical */ });
  }, []);

  // Reload appointments whenever any filter changes
  useEffect(() => {
    setLoading(true);
    hospitalService
      .listServiceAppointments({
        filter,
        serviceId: serviceFilter || undefined,
        status:    (statusFilter as ServiceAppointmentStatus) || undefined,
      })
      .then(res => {
        setAppointments((res as any).data?.appointments ?? []);
        setTotal((res as any).data?.total ?? 0);
      })
      .catch(() => toast.error('Failed to load service appointments'))
      .finally(() => setLoading(false));
  }, [filter, serviceFilter, statusFilter]);

  const handleStatusUpdate = (appointmentId: string, newStatus: ServiceAppointmentStatus) => {
    hospitalService
      .updateServiceAppointmentStatus(appointmentId, newStatus)
      .then(() => {
        toast.success(`Appointment marked as ${newStatus.replace(/_/g, ' ')}`);
        // Update in place so we don't trigger a full reload
        setAppointments(prev =>
          prev.map(a => a.id === appointmentId ? { ...a, status: newStatus } : a)
        );
      })
      .catch((e: any) => toast.error(e.message ?? 'Failed to update status'));
  };

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-light tracking-tight">Service Bookings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Patient bookings for your hospital's services
          {!loading && ` · ${total} result${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">

        {/* Upcoming / Past / All */}
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <Button
              key={f}
              variant={filter === f ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Service filter */}
        {services.length > 0 && (
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All services</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.service_name}</option>
            ))}
          </select>
        )}

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as ServiceAppointmentStatus | '')}
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Clear filters */}
        {(serviceFilter || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => { setServiceFilter(''); setStatusFilter(''); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No {filter !== 'all' ? filter : ''} service bookings found.</p>
          {(serviceFilter || statusFilter) && (
            <p className="text-xs mt-1">Try adjusting or clearing the filters above.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Card sub-component ───────────────────────────────────────────────────────

interface CardProps {
  appt: ServiceAppointment;
  onStatusUpdate: (id: string, status: ServiceAppointmentStatus) => void;
}

const AppointmentCard = ({ appt, onStatusUpdate }: CardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusClass = STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground';
  const actions = NEXT_ACTIONS[appt.status] ?? [];

  const slotDate   = appt.service_slots?.slot_date;
  const slotNumber = appt.service_slots?.slot_number;

  return (
    <div className="bg-card rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">

          {/* Patient */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">
              {appt.patients?.full_name ?? 'Unknown Patient'}
            </span>
            {appt.patients?.phone_number && (
              <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                <Phone className="h-3 w-3" />
                {appt.patients.phone_number}
              </span>
            )}
          </div>

          {/* Service */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Stethoscope className="h-4 w-4 shrink-0" />
            <span>{appt.hospital_services?.service_name ?? 'Unknown Service'}</span>
            {appt.hospital_services?.department && (
              <span className="text-xs">· {appt.hospital_services.department}</span>
            )}
          </div>
        </div>

        {/* Right side: status badge + action menu */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
            {appt.status.replace(/_/g, ' ')}
          </span>

          {/* Action dropdown — only rendered when there are valid transitions */}
          {actions.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMenuOpen(v => !v)}
              >
                Actions <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {menuOpen && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 z-20 w-36 rounded-md border bg-popover shadow-md py-1">
                    {actions.map(action => (
                      <button
                        key={action.value}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          setMenuOpen(false);
                          onStatusUpdate(appt.id, action.value);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slot info footer */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t pt-2">
        {slotDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {/* Parse as local date to avoid UTC timezone shift on DATE-only strings */}
            {format(parseDateOnly(slotDate), 'EEE, MMM d, yyyy')}
          </span>
        )}
        {slotNumber != null && (
          <span className="flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" />
            Slot {slotNumber}
          </span>
        )}
        {appt.hospital_services?.fee != null && (
          <span>₹{appt.hospital_services.fee}</span>
        )}
        {appt.booking_type && (
          <span className="capitalize">{appt.booking_type.replace(/_/g, ' ')}</span>
        )}
        {appt.booked_at && (
          <span className="ml-auto text-muted-foreground/60">
            Booked {format(parseISO(appt.booked_at), 'MMM d, h:mm a')}
          </span>
        )}
      </div>
    </div>
  );
};
