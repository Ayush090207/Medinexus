import { useEffect, useState } from 'react';
import { Building2, Users, Stethoscope, Calendar, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { hospitalService, type HospitalProfile } from '@/services/hospital.service';
import { toast } from 'sonner';

export const AdminOverview = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<HospitalProfile>>({});
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const [apptCount, setApptCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      hospitalService.getProfile(),
      hospitalService.listDoctors(),
      hospitalService.listServices(),
      hospitalService.listAppointments('upcoming'),
    ])
      .then(([profRes, docRes, svcRes, apptRes]) => {
        const h = (profRes as any).data?.hospital;
        setHospital(h);
        setForm({ name: h?.name, type: h?.type, address: h?.address, city: h?.city, state: h?.state });
        setDoctorCount((docRes as any).data?.doctors?.length ?? 0);
        setServiceCount((svcRes as any).data?.services?.length ?? 0);
        setApptCount((apptRes as any).data?.appointments?.length ?? 0);
      })
      .catch(() => toast.error('Failed to load hospital data'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!hospital) return;
    setSaving(true);
    try {
      const res = await hospitalService.updateProfile(form);
      setHospital((res as any).data?.hospital ?? hospital);
      setEditing(false);
      toast.success('Hospital profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({ name: hospital?.name, type: hospital?.type, address: hospital?.address, city: hospital?.city, state: hospital?.state });
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-in fade-in duration-300">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">{hospital?.name ?? 'Hospital'}</h1>
          <p className="text-muted-foreground mt-1 text-sm capitalize">
            {hospital?.type?.replace('_', ' ')} · {hospital?.city}, {hospital?.state}
          </p>
          {hospital?.is_approved ? (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-500/10 text-green-500 mt-2">
              Approved
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-500 mt-2">
              Pending Approval
            </span>
          )}
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

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="bg-card rounded-xl border p-6 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setActiveTab('doctors')}
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
            <Users className="h-4 w-4" /> Doctors
          </div>
          <p className="text-4xl font-light">{doctorCount ?? '—'}</p>
        </div>
        <div
          className="bg-card rounded-xl border p-6 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setActiveTab('services')}
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
            <Stethoscope className="h-4 w-4" /> Services
          </div>
          <p className="text-4xl font-light">{serviceCount ?? '—'}</p>
        </div>
        <div
          className="bg-card rounded-xl border p-6 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setActiveTab('appointments')}
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
            <Calendar className="h-4 w-4" /> Upcoming Appts
          </div>
          <p className="text-4xl font-light">{apptCount ?? '—'}</p>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-card rounded-xl border p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Hospital Details</h2>
        </div>

        {!editing ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              ['Name', hospital?.name],
              ['Type', hospital?.type?.replace('_', ' ')],
              ['Address', hospital?.address],
              ['City', hospital?.city],
              ['State', hospital?.state],
              ['Registration', hospital?.registration_number],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{label}</dt>
                <dd className="capitalize">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
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
            <div className="space-y-1 sm:col-span-2">
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
        )}
      </div>
    </div>
  );
};
