import { useEffect, useState } from 'react';
import { Loader2, User, Stethoscope, Calendar, Clock, BadgeCheck, BookOpen } from 'lucide-react';
import { doctorService, type DoctorProfile } from '@/services/doctor.service';
import { toast } from 'sonner';

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-normal uppercase tracking-wide">{label}</span>
      <span className="text-sm font-light">{display}</span>
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

export const DoctorProfilePage = () => {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doctorService.getProfile()
      .then((res) => setProfile((res as any).data?.doctor ?? null))
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
          <p className="text-sm text-muted-foreground font-light">
            {[profile.specialisation, profile.department].filter(Boolean).join(' · ')}
          </p>
          {profile.verified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal mt-1">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified
            </span>
          )}
        </div>
      </div>

      {/* Professional details */}
      <Section title="Professional Details" icon={Stethoscope}>
        <Field label="Specialisation" value={profile.specialisation} />
        <Field label="Department" value={profile.department} />
        <Field label="Qualifications" value={profile.qualifications} />
        <Field label="Registration No." value={profile.registration_number} />
        <Field label="Experience" value={profile.experience_years !== null ? `${profile.experience_years} years` : null} />
      </Section>

      {/* Availability & fees */}
      <Section title="Availability & Fees" icon={Calendar}>
        <Field label="Available From" value={profile.available_from} />
        <Field label="Available To" value={profile.available_to} />
        <Field label="Slot Duration" value={profile.slot_duration_mins !== null ? `${profile.slot_duration_mins} min` : null} />
        <Field label="Consultation Fee" value={profile.consultation_fee !== null ? `₹${profile.consultation_fee}` : null} />
      </Section>

      {/* Bio */}
      {profile.bio && (
        <div className="bg-card rounded-xl border p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b pb-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Bio</h2>
          </div>
          <p className="text-sm font-light text-muted-foreground leading-relaxed">{profile.bio}</p>
        </div>
      )}

      {/* Account */}
      <Section title="Account" icon={Clock}>
        <Field label="Member Since" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : null} />
        <Field label="Verified" value={profile.verified} />
      </Section>
    </div>
  );
};
