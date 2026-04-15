import { useEffect, useState } from 'react';
import { Stethoscope, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hospitalService, type HospitalService } from '@/services/hospital.service';
import { toast } from 'sonner';

const emptyForm = {
  service_type: '',
  service_name: '',
  department: '',
  default_duration_mins: 15,
  daily_slot_limit: 10,
  fee: 0,
  pay_at_counter: false,
  is_available: true,
};

export const AdminServices = () => {
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HospitalService | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HospitalService | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    hospitalService
      .listServices()
      .then(res => setServices((res as any).data?.services ?? []))
      .catch(() => toast.error('Failed to load services'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (svc: HospitalService) => {
    setEditTarget(svc);
    setForm({
      service_type: svc.service_type,
      service_name: svc.service_name,
      department: svc.department,
      default_duration_mins: svc.default_duration_mins,
      daily_slot_limit: svc.daily_slot_limit || 10,
      fee: svc.fee,
      pay_at_counter: svc.pay_at_counter,
      is_available: svc.is_available,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_name.trim() || !form.service_type.trim() || !form.department.trim()) {
      toast.error('Name, type, and department are required');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        const res = await hospitalService.updateService(editTarget.id, form);
        const updated = (res as any).data?.service;
        setServices(svcs => svcs.map(s => s.id === editTarget.id ? { ...s, ...updated } : s));
        toast.success('Service updated');
      } else {
        const res = await hospitalService.createService(form);
        const created = (res as any).data?.service;
        if (created) setServices(svcs => [created, ...svcs]);
        toast.success('Service created');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await hospitalService.deleteService(deleteTarget.id);
      setServices(svcs => svcs.filter(s => s.id !== deleteTarget.id));
      toast.success('Service deleted');
    } catch {
      toast.error('Failed to delete service');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-3 animate-in fade-in duration-300">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Services</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {services.length} service{services.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add Service
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
          <Stethoscope className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No services configured yet.</p>
          <p className="text-sm mt-1">Add your first service to let patients book.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map(svc => (
            <div key={svc.id} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{svc.service_name}</p>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    svc.is_available ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                  }`}>
                    {svc.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{svc.department} · {svc.service_type}</p>
                <p className="text-xs text-muted-foreground">
                  ₹{svc.fee} · {svc.default_duration_mins} min · {svc.daily_slot_limit || 10} slots/day
                  {svc.pay_at_counter ? ' · Pay at counter' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(svc)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:text-destructive"
                  onClick={() => setDeleteTarget(svc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Service Name</Label>
              <Input
                placeholder="e.g. General Consultation"
                value={form.service_name}
                onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Input
                placeholder="e.g. consultation"
                value={form.service_type}
                onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input
                placeholder="e.g. General Medicine"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={5}
                value={form.default_duration_mins}
                onChange={e => setForm(f => ({ ...f, default_duration_mins: parseInt(e.target.value) || 15 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Daily Slot Limit</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.daily_slot_limit}
                onChange={e => setForm(f => ({ ...f, daily_slot_limit: parseInt(e.target.value) || 10 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fee (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.fee}
                onChange={e => setForm(f => ({ ...f, fee: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={form.pay_at_counter}
                onCheckedChange={v => setForm(f => ({ ...f, pay_at_counter: v }))}
              />
              <Label>Pay at Counter</Label>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={form.is_available}
                onCheckedChange={v => setForm(f => ({ ...f, is_available: v }))}
              />
              <Label>Available</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '…' : editTarget ? <><Check className="h-4 w-4 mr-1" />Save</> : <><Plus className="h-4 w-4 mr-1" />Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.service_name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
