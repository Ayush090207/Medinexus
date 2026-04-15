import { useEffect, useRef, useState } from 'react';
import {
  Calendar, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, XCircle, Settings, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  hospitalService, type HospitalService, type ServiceSlot,
} from '@/services/hospital.service';
import {
  format, addDays, startOfWeek, eachDayOfInterval, parseISO,
} from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as a local-timezone Date (avoids UTC-midnight off-by-one). */
const parseLocalDate = (dateStr: string): Date => parseISO(dateStr);

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const isSunday = (dateStr: string) => parseLocalDate(dateStr).getDay() === 0;

// ─── Initial form state ───────────────────────────────────────────────────────

const emptyGenerateForm = () => ({
  startDate: todayStr(),
  endDate: todayStr(),
  numberOfSlots: 10,
});

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminServiceSlots = () => {
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [slots, setSlots] = useState<ServiceSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Generate dialog
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState(emptyGenerateForm());
  const [generateErrors, setGenerateErrors] = useState<Partial<Record<'startDate' | 'endDate' | 'numberOfSlots', string>>>({});
  const [generating, setGenerating] = useState(false);

  // Delete single slot
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<ServiceSlot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Availability summary
  const [availability, setAvailability] = useState<
    Record<string, { total: number; available: number; booked: number; locked: number }>
  >({});

  // Day-edit dialog
  const [dayEditDialogOpen, setDayEditDialogOpen] = useState(false);
  const [dayEditDate, setDayEditDate] = useState<string>('');
  const [dayEditSlots, setDayEditSlots] = useState<number>(10);
  const [dayEditError, setDayEditError] = useState<string>('');
  const [dayUpdating, setDayUpdating] = useState(false);

  // Use a ref to deduplicate parallel loads triggered by service/week changes
  const loadIdRef = useRef(0);

  // ─── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadServices();
  }, []);

  // Single effect for all data-loading triggered by service/week changes
  useEffect(() => {
    if (selectedService) {
      const id = ++loadIdRef.current;
      loadSlots(id);
      loadAvailability(id);
    } else {
      setSlots([]);
      setAvailability({});
    }
  }, [selectedService, currentWeekStart]);

  // Sync numberOfSlots default when service changes
  useEffect(() => {
    if (!selectedService) return;
    const selected = services.find((svc) => svc.id === selectedService);
    setGenerateForm((prev) => ({
      ...prev,
      numberOfSlots: selected?.daily_slot_limit ?? 10,
    }));
  }, [selectedService, services]);

  const weekEnd = addDays(currentWeekStart, 6);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  const loadSlots = async (callId?: number) => {
    if (!selectedService) return;
    setSlotsLoading(true);
    try {
      const res = await hospitalService.listServiceSlots({
        serviceId: selectedService,
        startDate: weekStartStr,
        endDate: weekEndStr,
      });
      // Ignore stale responses if a newer load was triggered
      if (callId !== undefined && callId !== loadIdRef.current) return;
      const allSlots = (res as any).data?.services?.[0]?.slots ?? [];
      setSlots(
        allSlots.filter(
          (s: ServiceSlot) => s.slot_date >= weekStartStr && s.slot_date <= weekEndStr
        )
      );
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setSlotsLoading(false);
    }
  };

  const loadAvailability = async (callId?: number) => {
    if (!selectedService) return;
    try {
      const res = await hospitalService.getServiceAvailability(
        selectedService,
        weekStartStr,
        weekEndStr
      );
      if (callId !== undefined && callId !== loadIdRef.current) return;
      setAvailability((res as any).data?.availability ?? {});
    } catch {
      // Availability is a secondary view; don't noisily fail
    }
  };

  const refreshAll = () => {
    const id = ++loadIdRef.current;
    loadSlots(id);
    loadAvailability(id);
  };

  // ─── Generate slots ───────────────────────────────────────────────────────

  const validateGenerateForm = (): boolean => {
    const errors: typeof generateErrors = {};
    const today = todayStr();

    if (!generateForm.startDate) {
      errors.startDate = 'Start date is required';
    } else if (generateForm.startDate < today) {
      errors.startDate = 'Start date cannot be in the past';
    } else if (isSunday(generateForm.startDate)) {
      errors.startDate = 'Start date cannot be a Sunday';
    }

    if (!generateForm.endDate) {
      errors.endDate = 'End date is required';
    } else if (generateForm.endDate < generateForm.startDate) {
      errors.endDate = 'End date must be on or after start date';
    }

    if (!generateForm.numberOfSlots || generateForm.numberOfSlots < 1) {
      errors.numberOfSlots = 'At least 1 slot required';
    } else if (generateForm.numberOfSlots > 200) {
      errors.numberOfSlots = 'Maximum 200 slots per day';
    }

    setGenerateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGenerateSlots = async () => {
    if (!selectedService || !validateGenerateForm()) return;
    setGenerating(true);
    try {
      const res = await hospitalService.generateServiceSlots({
        serviceId: selectedService,
        startDate: generateForm.startDate,
        endDate: generateForm.endDate,
        numberOfSlots: generateForm.numberOfSlots,
      });
      const d = (res as any).data;
      toast.success(
        `Generated ${d?.generated ?? 0} slots across ${d?.workingDays ?? '?'} working day(s)`
      );
      setGenerateDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to generate slots';
      toast.error(Array.isArray(msg) ? msg.map((e: any) => e.message).join(', ') : msg);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Delete single slot ───────────────────────────────────────────────────

  const handleDeleteSlot = async () => {
    if (!slotToDelete) return;
    setDeleting(true);
    try {
      await hospitalService.deleteServiceSlot(slotToDelete.id);
      toast.success('Slot deleted');
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to delete slot';
      toast.error(msg);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    }
  };

  // ─── Bulk delete ──────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!selectedService) return;
    try {
      const res = await hospitalService.bulkDeleteServiceSlots({
        serviceId: selectedService,
        startDate: weekStartStr,
        endDate: weekEndStr,
      });
      const deleted = (res as any).data?.deleted ?? 0;
      toast.success(`Deleted ${deleted} available slot${deleted !== 1 ? 's' : ''}`);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to delete slots';
      toast.error(msg);
    }
  };

  // ─── Day-edit dialog ──────────────────────────────────────────────────────

  const openDayEditDialog = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const currentTotal = availability[dateKey]?.total || getSlotsForDay(dateKey).length;
    const selected = services.find((svc) => svc.id === selectedService);
    setDayEditDate(dateKey);
    setDayEditSlots(currentTotal > 0 ? currentTotal : (selected?.daily_slot_limit ?? 10));
    setDayEditError('');
    setDayEditDialogOpen(true);
  };

  const handleDaySlotUpdate = async () => {
    if (!selectedService || !dayEditDate) return;

    if (!dayEditSlots || dayEditSlots < 1) {
      setDayEditError('At least 1 slot is required');
      return;
    }
    if (dayEditSlots > 200) {
      setDayEditError('Maximum 200 slots per day');
      return;
    }
    if (isSunday(dayEditDate)) {
      setDayEditError('Cannot manage slots on a Sunday');
      return;
    }

    setDayEditError('');
    setDayUpdating(true);
    try {
      await hospitalService.updateServiceDaySlots({
        serviceId: selectedService,
        slotDate: dayEditDate,
        numberOfSlots: dayEditSlots,
      });
      toast.success(`Updated ${dayEditDate} to ${dayEditSlots} slots`);
      setDayEditDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to update day slots';
      toast.error(msg);
    } finally {
      setDayUpdating(false);
    }
  };

  // ─── Load services ────────────────────────────────────────────────────────

  const loadServices = async () => {
    try {
      const res = await hospitalService.listServices();
      const svcs = (res as any).data?.services ?? [];
      setServices(svcs);
      if (svcs.length > 0 && !selectedService) {
        setSelectedService(svcs[0].id);
      }
    } catch {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  /** Get slots for a day by string key (avoids timezone issues entirely). */
  const getSlotsForDay = (dayKey: string) =>
    slots.filter((s) => s.slot_date === dayKey);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Service Slots</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage numbered slots for hospital services (Mon – Sat, first-come-first-served)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedService || ''} onValueChange={setSelectedService}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((svc) => (
                <SelectItem key={svc.id} value={svc.id}>
                  {svc.service_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setGenerateErrors({});
              setGenerateForm(emptyGenerateForm());
              setGenerateDialogOpen(true);
            }}
            disabled={!selectedService}
          >
            <Plus className="h-4 w-4 mr-2" /> Generate Slots
          </Button>
        </div>
      </div>

      {selectedService && (
        <>
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">
              {format(currentWeekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Availability summary cards */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const stats = availability[dayKey] || { total: 0, available: 0, booked: 0, locked: 0 };
              const isSun = day.getDay() === 0;
              return (
                <Card
                  key={dayKey}
                  className={`text-center ${isSun ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  <CardHeader className="pb-1 pt-3 px-2">
                    <CardTitle className="text-xs font-semibold">{format(day, 'EEE')}</CardTitle>
                    <p className="text-xs text-muted-foreground">{format(day, 'MMM d')}</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-3">
                    {isSun ? (
                      <p className="text-xs text-muted-foreground mt-1">Closed</p>
                    ) : (
                      <>
                        <div className="text-2xl font-light">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">slots</p>
                        <div className="flex flex-col items-center gap-0.5 mt-1 text-xs">
                          <span className="text-green-600">{stats.available} open</span>
                          <span className="text-blue-600">{stats.booked} booked</span>
                          {stats.locked > 0 && (
                            <span className="text-yellow-600">{stats.locked} locked</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 text-xs w-full"
                          onClick={() => openDayEditDialog(day)}
                        >
                          <Settings className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Weekly slots detail */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Weekly Slots Detail</h2>
              <Button variant="outline" size="sm" onClick={handleBulkDelete} disabled={slotsLoading}>
                <Trash2 className="h-4 w-4 mr-2" /> Clear Available
              </Button>
            </div>

            {slotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const daySlots = getSlotsForDay(dayKey);
                  const isSun = day.getDay() === 0;
                  return (
                    <div key={dayKey} className="space-y-1">
                      <div
                        className={`text-xs font-medium text-center py-1 rounded ${
                          isSun ? 'bg-muted/40 text-muted-foreground/50' : 'bg-muted'
                        }`}
                      >
                        {format(day, 'EEE d')}
                      </div>
                      {isSun ? (
                        <p className="text-xs text-muted-foreground text-center py-2">–</p>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {daySlots.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No slots</p>
                          ) : (
                            daySlots.map((slot) => (
                              <div
                                key={slot.id}
                                title={
                                  slot.status === 'available'
                                    ? 'Click to delete'
                                    : `Status: ${slot.status}`
                                }
                                className={[
                                  'flex items-center justify-between px-2 py-1.5 rounded text-xs transition-opacity',
                                  slot.status === 'available'
                                    ? 'bg-green-500/10 text-green-700 cursor-pointer hover:opacity-70'
                                    : '',
                                  slot.status === 'booked'
                                    ? 'bg-blue-500/10 text-blue-700 cursor-default'
                                    : '',
                                  slot.status === 'locked'
                                    ? 'bg-yellow-500/10 text-yellow-700 cursor-default'
                                    : '',
                      
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => {
                                  if (slot.status === 'available') {
                                    setSlotToDelete(slot);
                                    setDeleteDialogOpen(true);
                                  }
                                }}
                              >
                                <span>#{slot.slot_number}</span>
                                {slot.status === 'available' && (
                                  <XCircle className="h-3 w-3 opacity-50 flex-shrink-0" />
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {services.length === 0 && !loading && (
        <Card className="p-12 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No services configured yet.</p>
          <p className="text-sm mt-1">Add services first from the Services tab.</p>
        </Card>
      )}

      {/* ── Generate Slots Dialog ─────────────────────────────────────────── */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Service Slots</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gen-start">Start Date</Label>
                <Input
                  id="gen-start"
                  type="date"
                  min={todayStr()}
                  value={generateForm.startDate}
                  onChange={(e) => {
                    setGenerateErrors((prev) => ({ ...prev, startDate: undefined }));
                    setGenerateForm((f) => ({
                      ...f,
                      startDate: e.target.value,
                      // auto-push endDate forward if it's behind
                      endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
                    }));
                  }}
                  className={generateErrors.startDate ? 'border-destructive' : ''}
                />
                {generateErrors.startDate && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {generateErrors.startDate}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-end">End Date</Label>
                <Input
                  id="gen-end"
                  type="date"
                  min={generateForm.startDate || todayStr()}
                  value={generateForm.endDate}
                  onChange={(e) => {
                    setGenerateErrors((prev) => ({ ...prev, endDate: undefined }));
                    setGenerateForm((f) => ({ ...f, endDate: e.target.value }));
                  }}
                  className={generateErrors.endDate ? 'border-destructive' : ''}
                />
                {generateErrors.endDate && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {generateErrors.endDate}
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Sundays are automatically skipped. Existing slots on a date are kept (duplicates ignored).
            </p>

            <div className="space-y-2">
              <Label>Slots per Working Day</Label>
              <Select
                value={String(generateForm.numberOfSlots)}
                onValueChange={(v) => {
                  setGenerateErrors((prev) => ({ ...prev, numberOfSlots: undefined }));
                  setGenerateForm((f) => ({ ...f, numberOfSlots: Number(v) }));
                }}
              >
                <SelectTrigger className={generateErrors.numberOfSlots ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} slots
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {generateErrors.numberOfSlots && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {generateErrors.numberOfSlots}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Patients book by slot number on a first-come-first-served basis.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateSlots} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Slot AlertDialog ───────────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete Slot #{slotToDelete?.slot_number} on{' '}
              {slotToDelete?.slot_date}. Booked or locked slots cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSlot}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Day Slots Dialog ─────────────────────────────────────────── */}
      <Dialog open={dayEditDialogOpen} onOpenChange={setDayEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Slots for {dayEditDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input value={dayEditDate} disabled />
            </div>
            <div className="space-y-1">
              <Label>Total Slots for This Day</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={dayEditSlots}
                onChange={(e) => {
                  setDayEditError('');
                  setDayEditSlots(Number(e.target.value) || 1);
                }}
                className={dayEditError ? 'border-destructive' : ''}
              />
              {dayEditError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {dayEditError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Booked and locked slots are preserved. Only available overflow slots are removed.
              </p>
            </div>

            {/* Show existing breakdown */}
            {availability[dayEditDate] && (
              <div className="rounded bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium">Current breakdown for {dayEditDate}</p>
                <div className="grid grid-cols-3 gap-2 text-center mt-1">
                  <div>
                    <span className="text-green-600 font-semibold block">
                      {availability[dayEditDate].available}
                    </span>
                    <span className="text-muted-foreground">Available</span>
                  </div>
                  <div>
                    <span className="text-blue-600 font-semibold block">
                      {availability[dayEditDate].booked}
                    </span>
                    <span className="text-muted-foreground">Booked</span>
                  </div>
                  <div>
                    <span className="text-yellow-600 font-semibold block">
                      {availability[dayEditDate].locked}
                    </span>
                    <span className="text-muted-foreground">Locked</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDaySlotUpdate} disabled={dayUpdating}>
              {dayUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
