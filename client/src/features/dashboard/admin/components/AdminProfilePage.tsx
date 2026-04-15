import { useEffect, useState } from 'react';
import { Loader2, Building2, MapPin, BadgeCheck, Clock, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hospitalService, type HospitalProfile } from '@/services/hospital.service';
import { toast } from 'sonner';

function Field({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-normal uppercase tracking-wide">{label}</span>
      <span className="text-sm font-light capitalize">{display}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {children}
      </div>
    </div>
  );
}

export const AdminProfilePage = () => {
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Pick<HospitalProfile, 'name' | 'type' | 'address' | 'city' | 'state'>>>({});

  useEffect(() => {
    hospitalService.getProfile()
      .then((res) => {
        const h = (res as any).data?.hospital ?? null;
        setHospital(h);
        if (h) setForm({ name: h.name, type: h.type, address: h.address, city: h.city, state: h.state });
      })
      .catch((e: any) => toast.error(e.message ?? 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!hospital) return;
    setSaving(true);
    try {
      const res = await hospitalService.updateProfile(form);
      const updated = (res as any).data?.hospital ?? hospital;
      setHospital(updated);
      setForm({ name: updated.name, type: updated.type, address: updated.address, city: updated.city, state: updated.state });
      setEditing(false);
      toast.success('Hospital profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hospital) setForm({ name: hospital.name, type: hospital.type, address: hospital.address, city: hospital.city, state: hospital.state });
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hospital) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground font-light">Could not load profile.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Header card */}
      <div className="bg-card rounded-xl border p-6 flex items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-secondary/60 shrink-0">
            <Building2 className="h-8 w-8 text-foreground" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-serif font-light">{hospital.name}</h1>
            <p className="text-sm text-muted-foreground font-light capitalize">
              {hospital.type?.replace('_', ' ')} · {hospital.city}, {hospital.state}
            </p>
            {hospital.is_approved ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal mt-1">
                <BadgeCheck className="h-3.5 w-3.5" /> Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-600 font-normal mt-1">
                Pending Approval
              </span>
            )}
          </div>
        </div>

        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Check className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Hospital details — view or edit */}
      {!editing ? (
        <Section title="Hospital Details" icon={Building2}>
          <Field label="Name" value={hospital.name} />
          <Field label="Type" value={hospital.type?.replace('_', ' ')} />
          <Field label="Registration No." value={hospital.registration_number} />
          <Field label="Approved" value={hospital.is_approved} />
        </Section>
      ) : (
        <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b pb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Hospital Details</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={form.type ?? ''} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="nursing_home">Nursing Home</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Location — view or edit */}
      {!editing ? (
        <Section title="Location" icon={MapPin}>
          <Field label="Address" value={hospital.address} />
          <Field label="City" value={hospital.city} />
          <Field label="State" value={hospital.state} />
        </Section>
      ) : (
        <div className="bg-card rounded-xl border p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b pb-3">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Location</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
              <Input value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
              <Input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">State</Label>
              <Input value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {/* Account */}
      <Section title="Account" icon={Clock}>
        <Field label="Member Since" value={hospital.created_at ? new Date(hospital.created_at).toLocaleDateString() : null} />
        <Field label="Registration No." value={hospital.registration_number} />
      </Section>
    </div>
  );
};
