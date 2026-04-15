import { useEffect, useState } from 'react';
import { Loader2, User, HeartPulse, Globe, Calendar, Clock } from 'lucide-react';
import { patientService, type PatientProfile } from '@/services/patient.service';
import { toast } from 'sonner';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-normal uppercase tracking-wide">{label}</span>
      <span className="text-sm font-light">{String(value)}</span>
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

export const PatientProfilePage = () => {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientService.getProfile()
      .then((res) => setProfile((res as any).data?.patient ?? null))
      .catch((e: any) => toast.error(e.message ?? 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground font-light">Could not load profile.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Header card */}
      <div className="bg-card rounded-xl border p-6 flex items-center gap-5">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-secondary/60 shrink-0">
          <User className="h-8 w-8 text-foreground" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-serif font-light">{profile.full_name}</h1>
          <p className="text-sm text-muted-foreground font-light">{profile.email}</p>
          {profile.phone_number && (
            <p className="text-sm text-muted-foreground font-light">{profile.phone_number}</p>
          )}
        </div>
      </div>

      {/* Personal details */}
      <Section title="Personal Details" icon={Calendar}>
        <Field label="Full Name" value={profile.full_name} />
        <Field label="Date of Birth" value={profile.dob} />
        <Field label="Blood Group" value={profile.blood_group} />
        <Field label="Language Preference" value={profile.language_preference} />
      </Section>

      {/* Contact */}
      <Section title="Contact" icon={Globe}>
        <Field label="Email" value={profile.email} />
        <Field label="Phone" value={profile.phone_number} />
      </Section>

      {/* Health info */}
      {profile.known_allergies && (
        <div className="bg-card rounded-xl border p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b pb-3">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Health Information</h2>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-normal uppercase tracking-wide">Known Allergies</span>
            <p className="text-sm font-light leading-relaxed">{profile.known_allergies}</p>
          </div>
        </div>
      )}

      {/* Account */}
      <Section title="Account" icon={Clock}>
        <Field label="Member Since" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : null} />
        <Field label="No-Show Count" value={profile.no_show_count} />
      </Section>
    </div>
  );
};
