import { useEffect, useState } from 'react';
import { Calendar, Clock, User, Stethoscope, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hospitalService, type HospitalAppointment } from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

type Filter = 'upcoming' | 'past' | 'all';

const STATUS_COLORS: Record<string, string> = {
  booked: 'bg-blue-500/10 text-blue-500',
  checked_in: 'bg-yellow-500/10 text-yellow-500',
  in_progress: 'bg-orange-500/10 text-orange-500',
  completed: 'bg-green-500/10 text-green-500',
  cancelled: 'bg-red-500/10 text-red-400',
  no_show: 'bg-muted text-muted-foreground',
};

export const AdminAppointments = () => {
  const [appointments, setAppointments] = useState<HospitalAppointment[]>([]);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    hospitalService
      .listAppointments(filter)
      .then(res => setAppointments((res as any).data?.appointments ?? []))
      .catch(() => toast.error('Failed to load appointments'))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Appointments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All appointments at your hospital
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['upcoming', 'past', 'all'] as Filter[]).map(f => (
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No {filter !== 'all' ? filter : ''} appointments found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(appt => (
            <div key={appt.id} className="bg-card rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  {/* Patient */}
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{appt.patients?.full_name ?? 'Unknown Patient'}</span>
                    {appt.patients?.phone_number && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {appt.patients.phone_number}
                      </span>
                    )}
                  </div>
                  {/* Doctor */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Stethoscope className="h-4 w-4 shrink-0" />
                    <span>{appt.doctors?.full_name ?? 'Unknown Doctor'}</span>
                    {appt.doctors?.specialisation && (
                      <span className="text-xs">· {appt.doctors.specialisation}</span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {appt.status.replace('_', ' ')}
                </span>
              </div>

              {appt.appointment_slots && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(parseISO(appt.appointment_slots.slot_start), 'EEE, MMM d, yyyy')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {format(parseISO(appt.appointment_slots.slot_start), 'h:mm a')}
                    {' – '}
                    {format(parseISO(appt.appointment_slots.slot_end), 'h:mm a')}
                  </span>
                  <span className="capitalize">{appt.booking_type?.replace('_', ' ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
