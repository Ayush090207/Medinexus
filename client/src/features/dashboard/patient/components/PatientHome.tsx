import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, FileText, Search, ChevronRight, Activity, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientService, type PatientAppointment } from '@/services/patient.service';
import { format, parseISO } from 'date-fns';
import { useAppointmentRefresh } from '@/hooks/useAppointmentRefresh';

function statusColor(status: string) {
  const map: Record<string, string> = {
    booked: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    checked_in: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    in_progress: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
    cancelled: 'bg-red-500/10 text-red-500',
    no_show: 'bg-muted text-muted-foreground',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export const PatientHome = ({ setActiveTab }: { setActiveTab?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUpcoming = useCallback(() => {
    patientService
      .listAppointments('upcoming')
      .then((res) => setUpcoming((res as any).data?.appointments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  // Re-fetch whenever a booking is confirmed anywhere in the app
  useAppointmentRefresh(fetchUpcoming);

  const nextAppt = upcoming[0] ?? null;

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-5xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-light tracking-tight font-serif">Welcome Back</h1>
        <p className="text-muted-foreground mt-2 text-sm">Here's a snapshot of your health activity.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Upcoming Appointments</h3>
            <Calendar className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-4xl font-light mt-4">{loading ? '—' : upcoming.length}</p>
          <p className="text-xs text-muted-foreground mt-1">scheduled</p>
        </div>
        <div
          className="bg-card rounded-xl border p-6 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
          onClick={() => setActiveTab?.('passport')}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Health Passport</h3>
            <FileText className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">View records, prescriptions & grants</p>
        </div>
        <div
          className="bg-card rounded-xl border p-6 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
          onClick={() => navigate('/patient/discover')}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Find a Doctor</h3>
            <Search className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">Search hospitals and book slots</p>
        </div>
      </div>

      {/* Next appointment */}
      {!loading && nextAppt && (
        <div className="bg-card rounded-xl border p-6 space-y-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-lg">Next Appointment</h2>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setActiveTab?.('appointments')}>
              View all <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 p-4 rounded-lg bg-muted/30">
            <div className="flex-1 space-y-2">
              <p className="font-medium text-lg">{nextAppt.doctors?.full_name ?? 'Doctor'}</p>
              <p className="text-sm text-muted-foreground">{nextAppt.doctors?.specialisation}</p>
              <p className="text-sm text-muted-foreground">{nextAppt.hospitals?.name}, {nextAppt.hospitals?.city}</p>
            </div>
            <div className="space-y-2 text-sm">
              {nextAppt.appointment_slots && (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {format(parseISO(nextAppt.appointment_slots.slot_start), 'EEE, MMM d, yyyy')}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {format(parseISO(nextAppt.appointment_slots.slot_start), 'h:mm a')}
                    {' – '}
                    {format(parseISO(nextAppt.appointment_slots.slot_end), 'h:mm a')}
                  </div>
                </>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(nextAppt.status)}`}>
                {nextAppt.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="font-medium text-lg mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button variant="outline" className="h-14 flex items-center gap-3 justify-start px-5 rounded-lg hover:bg-muted/50" onClick={() => navigate('/patient/discover')}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium">Find a Doctor</span>
          </Button>
          <Button variant="outline" className="h-14 flex items-center gap-3 justify-start px-5 rounded-lg hover:bg-muted/50" onClick={() => navigate('/patient/services')}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium">Book a Service</span>
          </Button>
          <Button variant="outline" className="h-14 flex items-center gap-3 justify-start px-5 rounded-lg hover:bg-muted/50" onClick={() => setActiveTab?.('appointments')}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium">My Appointments</span>
          </Button>
          <Button variant="outline" className="h-14 flex items-center gap-3 justify-start px-5 rounded-lg hover:bg-muted/50" onClick={() => setActiveTab?.('passport')}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium">Health Passport</span>
          </Button>
        </div>
      </div>

      {/* Health tips */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-lg mb-1">Health Tip of the Day</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Regular health check-ups can help detect problems early before they become more serious. 
              Schedule your annual check-up today!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
