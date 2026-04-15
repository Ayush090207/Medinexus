import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, User, Phone, Search, Lock, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  hospitalService,
  type AdminDoctorSlot,
  type AdminDoctorSlotStatus,
  type HospitalDoctor,
} from '@/services/hospital.service';
import { searchHospitalPatients, type HospitalPatient } from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AdminDoctorSlotStatus, string> = {
  available: 'bg-green-500/10 text-green-600 border-green-200',
  booked:    'bg-blue-500/10 text-blue-600 border-blue-200',
  locked:    'bg-yellow-500/10 text-yellow-600 border-yellow-200',
  blocked:   'bg-red-500/10 text-red-500 border-red-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const STATUS_LABEL: Record<AdminDoctorSlotStatus, string> = {
  available: 'Available',
  booked:    'Booked',
  locked:    'Locked',
  blocked:   'Blocked',
  cancelled: 'Cancelled',
};

const BOOKING_TYPE_COLORS: Record<string, string> = {
  online:   'bg-indigo-500/10 text-indigo-500',
  walk_in:  'bg-orange-500/10 text-orange-500',
  referral: 'bg-purple-500/10 text-purple-500',
};

// ─── Walk-in Dialog ───────────────────────────────────────────────────────────

interface WalkInDialogProps {
  doctorId: string;
  slot: AdminDoctorSlot;
  onClose: () => void;
  onSuccess: (updated: AdminDoctorSlot) => void;
}

const WalkInDialog = ({ doctorId, slot, onClose, onSuccess }: WalkInDialogProps) => {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<HospitalPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<HospitalPatient | null>(null);
  const [notes, setNotes] = useState('');
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchHospitalPatients(query.trim());
      setPatients((res as any).data?.patients ?? []);
    } catch {
      toast.error('Failed to search patients');
    } finally {
      setSearching(false);
    }
  };

  const handleBook = async () => {
    if (!selectedPatient) return;
    setBooking(true);
    try {
      await hospitalService.bookWalkIn(doctorId, {
        slot_id: slot.id,
        patient_id: selectedPatient.id,
        notes: notes.trim() || undefined,
      });
      toast.success(`Walk-in booked for ${selectedPatient.full_name}`);
      onSuccess({ ...slot, status: 'booked' });
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to book walk-in');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl w-full max-w-md mx-4 p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-semibold">Book Walk-in</h2>
        <p className="text-sm text-muted-foreground">
          Slot: <strong>{format(parseISO(slot.slot_start), 'h:mm a')} – {format(parseISO(slot.slot_end), 'h:mm a')}</strong>
        </p>

        {/* Patient search */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Search Patient</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name or phone..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching}>
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {patients.length > 0 && (
            <div className="max-h-36 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setPatients([]); setQuery(p.full_name); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${selectedPatient?.id === p.id ? 'bg-muted' : ''}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  {p.phone_number && <div className="text-muted-foreground text-xs">{p.phone_number}</div>}
                </button>
              ))}
            </div>
          )}

          {selectedPatient && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-200">
              <User className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-700">{selectedPatient.full_name}</span>
              <button onClick={() => { setSelectedPatient(null); setQuery(''); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Reason for visit..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={booking}>Cancel</Button>
          <Button size="sm" onClick={handleBook} disabled={!selectedPatient || booking}>
            {booking ? 'Booking…' : 'Confirm Walk-in'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Slot Card ────────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: AdminDoctorSlot;
  doctorId: string;
  onSlotUpdate: (updated: AdminDoctorSlot) => void;
  onSlotDelete: (slotId: string) => void;
}

const SlotCard = ({ slot, doctorId, onSlotUpdate, onSlotDelete }: SlotCardProps) => {
  const [loading, setLoading] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const start = parseISO(slot.slot_start);
  const end   = parseISO(slot.slot_end);

  // Countdown for locked slots
  const lockExpiry = slot.locked_until ? parseISO(slot.locked_until) : null;
  const lockMinsLeft = lockExpiry ? Math.max(0, Math.ceil((lockExpiry.getTime() - Date.now()) / 60000)) : null;

  const handleBlock = async () => {
    setLoading(true);
    try {
      const res = await hospitalService.blockDoctorSlot(doctorId, slot.id);
      onSlotUpdate((res as any).data?.slot ?? { ...slot, status: 'blocked' });
      toast.success('Slot blocked');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to block slot');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    setLoading(true);
    try {
      const res = await hospitalService.unblockDoctorSlot(doctorId, slot.id);
      onSlotUpdate((res as any).data?.slot ?? { ...slot, status: 'available' });
      toast.success('Slot unblocked');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to unblock slot');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setLoading(true);
    try {
      await hospitalService.deleteDoctorSlot(doctorId, slot.id);
      onSlotDelete(slot.id);
      toast.success('Slot deleted');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete slot');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!slot.appointment) return;
    setConfirmCancel(false);
    setLoading(true);
    try {
      await hospitalService.cancelDoctorAppointment(doctorId, slot.appointment.id);
      onSlotUpdate({ ...slot, status: 'available', appointment: null });
      toast.success('Appointment cancelled — slot freed');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  const patient = slot.appointment?.patients;

  return (
    <>
      <div className={`rounded-lg border p-4 space-y-3 transition-all ${STATUS_COLORS[slot.status] ?? 'bg-muted border-border'}`}>
        {/* Time + status */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </div>
            <span className={`mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[slot.status]}`}>
              {STATUS_LABEL[slot.status]}
            </span>
          </div>
          {slot.status !== 'booked' && slot.status !== 'locked' && slot.status !== 'cancelled' && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
              title="Delete slot"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Booked patient info */}
        {slot.status === 'booked' && patient && (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">{patient.full_name}</span>
            </div>
            {patient.phone_number && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{patient.phone_number}</span>
              </div>
            )}
            {slot.appointment?.booking_type && (
              <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${BOOKING_TYPE_COLORS[slot.appointment.booking_type] ?? 'bg-muted text-muted-foreground'}`}>
                {slot.appointment.booking_type.replace('_', ' ')}
              </span>
            )}
          </div>
        )}

        {/* Locked info */}
        {slot.status === 'locked' && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-600">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Patient mid-booking{lockMinsLeft !== null ? ` (~${lockMinsLeft}m left)` : ''}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {slot.status === 'available' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBlock} disabled={loading}>
                Block
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowWalkIn(true)} disabled={loading}>
                Walk-in
              </Button>
            </>
          )}
          {slot.status === 'blocked' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleUnblock} disabled={loading}>
                Unblock
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowWalkIn(true)} disabled={loading}>
                Walk-in
              </Button>
            </>
          )}
          {slot.status === 'booked' && slot.appointment && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => setConfirmCancel(true)}
              disabled={loading}
            >
              Cancel Appointment
            </Button>
          )}
          {slot.status === 'locked' && (
            <span className="text-xs text-muted-foreground italic">Read-only while locked</span>
          )}
          {slot.status === 'cancelled' && (
            <span className="text-xs text-muted-foreground italic">Cancelled</span>
          )}
        </div>
      </div>

      {/* Walk-in Dialog */}
      {showWalkIn && (
        <WalkInDialog
          doctorId={doctorId}
          slot={slot}
          onClose={() => setShowWalkIn(false)}
          onSuccess={(updated) => { onSlotUpdate(updated); setShowWalkIn(false); }}
        />
      )}

      {/* Cancel confirmation */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl max-w-sm w-full mx-4 p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold">Cancel appointment?</h3>
            <p className="text-sm text-muted-foreground">
              This will cancel the appointment for <strong>{patient?.full_name ?? 'this patient'}</strong> and free the slot for new bookings.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmCancel(false)}>Keep</Button>
              <Button size="sm" variant="destructive" onClick={handleCancel}>Yes, cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl max-w-sm w-full mx-4 p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold">Delete slot?</h3>
            <p className="text-sm text-muted-foreground">
              This will permanently remove the <strong>{format(start, 'h:mm a')}</strong> slot. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AdminDoctorSlots = () => {
  const [doctors, setDoctors]       = useState<HospitalDoctor[]>([]);
  const [doctorId, setDoctorId]     = useState<string>('');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [slots, setSlots]           = useState<AdminDoctorSlot[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  // Load doctors once
  useEffect(() => {
    setLoadingDoctors(true);
    hospitalService
      .listDoctors()
      .then(res => {
        const list: HospitalDoctor[] = (res as any).data?.doctors ?? [];
        setDoctors(list);
        if (list.length > 0) setDoctorId(list[0].id);
      })
      .catch(() => toast.error('Failed to load doctors'))
      .finally(() => setLoadingDoctors(false));
  }, []);

  // Load slots when doctor or date changes
  const fetchSlots = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    try {
      const res = await hospitalService.listDoctorSlots(doctorId, dateStr);
      setSlots((res as any).data?.slots ?? []);
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, [doctorId, dateStr]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const handleSlotUpdate = (updated: AdminDoctorSlot) => {
    setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleSlotDelete = (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const selectedDoctor = doctors.find(d => d.id === doctorId);

  const slotsByStatus = {
    available: slots.filter(s => s.status === 'available'),
    booked:    slots.filter(s => s.status === 'booked'),
    blocked:   slots.filter(s => s.status === 'blocked'),
    locked:    slots.filter(s => s.status === 'locked'),
    cancelled: slots.filter(s => s.status === 'cancelled'),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Doctor Slots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage appointment slots for any doctor in your hospital.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-500/5 p-4 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Slot changes (block/unblock/cancel/walk-in) propagate in real time to patients viewing this doctor's availability.</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Doctor selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Doctor</label>
          <select
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            disabled={loadingDoctors}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
          >
            {loadingDoctors && <option>Loading…</option>}
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.specialisation ? ` — ${d.specialisation}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentDate(d => subDays(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium min-w-[140px] justify-center">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>{isToday(currentDate) ? 'Today' : format(currentDate, 'MMM d, yyyy')}</span>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentDate(d => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday(currentDate) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Stats summary */}
      {!loading && slots.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {([
            { label: 'Available', count: slotsByStatus.available.length, color: 'text-green-600' },
            { label: 'Booked',    count: slotsByStatus.booked.length,    color: 'text-blue-600' },
            { label: 'Blocked',   count: slotsByStatus.blocked.length,   color: 'text-red-500' },
            { label: 'Locked',    count: slotsByStatus.locked.length,    color: 'text-yellow-600' },
          ] as const).filter(s => s.count > 0).map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-sm">
              <span className={`font-semibold ${s.color}`}>{s.count}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Slot grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse py-8 text-center">Loading slots…</div>
      ) : slots.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {doctorId
              ? `No slots for ${selectedDoctor?.full_name ?? 'this doctor'} on ${format(currentDate, 'MMMM d, yyyy')}.`
              : 'Select a doctor to view their slots.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {slots.map(slot => (
            <SlotCard
              key={slot.id}
              slot={slot}
              doctorId={doctorId}
              onSlotUpdate={handleSlotUpdate}
              onSlotDelete={handleSlotDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
