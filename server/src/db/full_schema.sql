-- ═══════════════════════════════════════════════════════════════════
-- mediNexus – Full Database Schema
-- Combined from all migration files (001 → 006)
-- Run this in the Supabase SQL Editor to set up all tables.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────────

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hospital_type') THEN
  CREATE TYPE hospital_type AS ENUM ('government', 'private', 'clinic', 'nursing_home');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_status') THEN
  CREATE TYPE slot_status AS ENUM ('available', 'booked', 'locked', 'cancelled');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
  CREATE TYPE appointment_status AS ENUM ('booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_type') THEN
  CREATE TYPE booking_type AS ENUM ('online', 'walk_in', 'referral');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
  CREATE TYPE waitlist_status AS ENUM ('waiting', 'notified', 'accepted', 'expired', 'cancelled');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
  CREATE TYPE report_type AS ENUM ('lab', 'radiology', 'pathology', 'discharge_summary', 'other');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
  CREATE TYPE referral_status AS ENUM ('pending', 'accepted', 'declined', 'completed');
END IF; END $$;


-- ─── Migration 003: Extend enums ───────────────────────────────────
ALTER TYPE slot_status     ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE waitlist_status ADD VALUE IF NOT EXISTS 'offered';


-- ─── 1. hospitals ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  type                hospital_type NOT NULL DEFAULT 'private',
  address             TEXT NOT NULL,
  city                TEXT NOT NULL,
  state               TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  admin_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_approved         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_city  ON hospitals(city);
CREATE INDEX IF NOT EXISTS idx_hospitals_state ON hospitals(state);
CREATE INDEX IF NOT EXISTS idx_hospitals_admin ON hospitals(admin_id);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;


-- ─── 2. hospital_services ───────────────────────────────────

CREATE TABLE IF NOT EXISTS hospital_services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_type          TEXT NOT NULL,
  service_name          TEXT NOT NULL,
  department            TEXT NOT NULL,
  default_duration_mins INT  NOT NULL DEFAULT 30,
  fee                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  pay_at_counter        BOOLEAN NOT NULL DEFAULT false,
  is_available          BOOLEAN NOT NULL DEFAULT true,
  daily_slot_limit      INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_hospital_services_hospital ON hospital_services(hospital_id);

ALTER TABLE hospital_services ENABLE ROW LEVEL SECURITY;


-- ─── 3. doctors ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id           UUID NOT NULL REFERENCES hospitals(id)  ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  specialisation        TEXT NOT NULL,
  prescription_template TEXT,
  qualifications        TEXT,
  registration_number   TEXT,
  experience_years      INT,
  consultation_fee      NUMERIC(10,2),
  department            TEXT,
  bio                   TEXT,
  available_from        TIME,
  available_to          TIME,
  slot_duration_mins    INT,
  verified              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_user     ON doctors(user_id);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;


-- ─── 4. patients ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  phone_number         TEXT,
  email                TEXT,
  dob                  DATE,
  blood_group          TEXT,
  known_allergies      TEXT,
  language_preference  TEXT NOT NULL DEFAULT 'en',
  no_show_count        INT  NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_contact_check CHECK (phone_number IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_user ON patients(user_id);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;


-- ─── 5. appointment_slots ───────────────────────────────────

CREATE TABLE IF NOT EXISTS appointment_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    UUID NOT NULL REFERENCES doctors(id)   ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  slot_end     TIMESTAMPTZ NOT NULL,
  status       slot_status NOT NULL DEFAULT 'available',
  locked_by    UUID REFERENCES auth.users(id),
  locked_until TIMESTAMPTZ,
  UNIQUE (doctor_id, slot_start)
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor ON appointment_slots(doctor_id);
CREATE INDEX IF NOT EXISTS idx_slots_start  ON appointment_slots(slot_start);
CREATE INDEX IF NOT EXISTS idx_slots_status ON appointment_slots(status);

ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;


-- ─── 6. appointments ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES doctors(id)           ON DELETE CASCADE,
  hospital_id  UUID NOT NULL REFERENCES hospitals(id)         ON DELETE CASCADE,
  service_id   UUID REFERENCES hospital_services(id) ON DELETE CASCADE,
  booking_type booking_type       NOT NULL DEFAULT 'online',
  status       appointment_status NOT NULL DEFAULT 'booked',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor   ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital ON appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status   ON appointments(status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;


-- ─── 7. slot_waitlist ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS slot_waitlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id          UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at      TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  status           waitlist_status NOT NULL DEFAULT 'waiting'
);

CREATE INDEX IF NOT EXISTS idx_waitlist_slot    ON slot_waitlist(slot_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON slot_waitlist(patient_id);

ALTER TABLE slot_waitlist ENABLE ROW LEVEL SECURITY;


-- ─── 8. medicines ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS medicines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_name     TEXT NOT NULL,
  composition       TEXT,
  therapeutic_class TEXT,
  chemical_class    TEXT,
  uses              TEXT,
  side_effects      TEXT,
  substitutes       TEXT,
  description       TEXT,
  image_url         TEXT,
  search_vector     TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(medicine_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(composition, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(therapeutic_class, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(chemical_class, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(uses, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(side_effects, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(substitutes, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines USING GIN (search_vector);

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;


-- ─── 9. prescriptions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id           UUID NOT NULL REFERENCES doctors(id)      ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
  illness_description TEXT,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url             TEXT
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient     ON prescriptions(patient_id);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;


-- ─── 10. prescription_items ─────────────────────────────────

CREATE TABLE IF NOT EXISTS prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id     UUID NOT NULL REFERENCES medicines(id)     ON DELETE CASCADE,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration        TEXT NOT NULL,
  doctor_comment  TEXT
);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription ON prescription_items(prescription_id);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;


-- ─── 11. patient_reports ────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  report_type report_type NOT NULL,
  report_name TEXT NOT NULL,
  report_url  TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_patient  ON patient_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_hospital ON patient_reports(hospital_id);

ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;


-- ─── 12. record_access_grants ───────────────────────────────

CREATE TABLE IF NOT EXISTS record_access_grants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  granted_to_hospital_id UUID REFERENCES hospitals(id)          ON DELETE CASCADE,
  granted_to_doctor_id   UUID REFERENCES doctors(id)            ON DELETE CASCADE,
  record_types           TEXT[] NOT NULL DEFAULT '{}',
  document_type          TEXT,
  document_id            UUID,
  source                 TEXT NOT NULL DEFAULT 'manual',
  valid_until            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grants_patient   ON record_access_grants(patient_id);
CREATE INDEX IF NOT EXISTS idx_grants_hospital  ON record_access_grants(granted_to_hospital_id);
CREATE INDEX IF NOT EXISTS idx_grants_doctor    ON record_access_grants(granted_to_doctor_id);
CREATE INDEX IF NOT EXISTS idx_grants_document  ON record_access_grants(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_grants_source    ON record_access_grants(source);

ALTER TABLE record_access_grants ENABLE ROW LEVEL SECURITY;


-- ─── 13. search_cache ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_cache (
  query_hash TEXT PRIMARY KEY,
  results    JSONB NOT NULL DEFAULT '{}',
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;


-- ─── 14. appointment_status_log ─────────────────────────────

CREATE TABLE IF NOT EXISTS appointment_status_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  old_status     appointment_status,
  new_status     appointment_status NOT NULL,
  changed_by     UUID NOT NULL REFERENCES auth.users(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_log_appointment ON appointment_status_log(appointment_id);

ALTER TABLE appointment_status_log ENABLE ROW LEVEL SECURITY;


-- ─── 15. service_slots ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  slot_date       DATE NOT NULL,
  slot_number     INT NOT NULL,
  status          slot_status NOT NULL DEFAULT 'available',
  locked_by       UUID REFERENCES auth.users(id),
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, slot_date, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_service_slots_service ON service_slots(service_id);
CREATE INDEX IF NOT EXISTS idx_service_slots_date ON service_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_service_slots_status ON service_slots(status);
CREATE INDEX IF NOT EXISTS idx_service_slots_service_date ON service_slots(service_id, slot_date);

ALTER TABLE service_slots ENABLE ROW LEVEL SECURITY;


-- ─── 16. service_appointments ───────────────────────────────

CREATE TABLE IF NOT EXISTS service_appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID NOT NULL REFERENCES service_slots(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  booking_type    booking_type NOT NULL DEFAULT 'online',
  status          appointment_status NOT NULL DEFAULT 'booked',
  notes           TEXT,
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_appointments_patient ON service_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_hospital ON service_appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_service ON service_appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_slot ON service_appointments(slot_id);

ALTER TABLE service_appointments ENABLE ROW LEVEL SECURITY;


-- ─── 17. referrals ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  referred_to_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reason                TEXT,
  status                referral_status NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referrals_no_self_referral CHECK (referring_doctor_id != referred_to_doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referring ON referrals(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred  ON referrals(referred_to_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_patient   ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status    ON referrals(status);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════
-- RLS Policies (from migration 002)
-- ═══════════════════════════════════════════════════════════════════

-- ── hospitals ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospitals: approved hospitals are publicly readable') THEN
    CREATE POLICY "hospitals: approved hospitals are publicly readable"
      ON hospitals FOR SELECT USING (is_approved = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospitals: admin reads own hospital') THEN
    CREATE POLICY "hospitals: admin reads own hospital"
      ON hospitals FOR SELECT USING (admin_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospitals: admin updates own hospital') THEN
    CREATE POLICY "hospitals: admin updates own hospital"
      ON hospitals FOR UPDATE USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospitals: admin deletes own hospital') THEN
    CREATE POLICY "hospitals: admin deletes own hospital"
      ON hospitals FOR DELETE USING (admin_id = auth.uid());
  END IF;
END $$;

-- ── hospital_services ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospital_services: readable for approved hospitals') THEN
    CREATE POLICY "hospital_services: readable for approved hospitals"
      ON hospital_services FOR SELECT
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = hospital_services.hospital_id AND h.is_approved = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hospital_services: admin manages own hospital services') THEN
    CREATE POLICY "hospital_services: admin manages own hospital services"
      ON hospital_services FOR ALL
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = hospital_services.hospital_id AND h.admin_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = hospital_services.hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

-- ── doctors ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'doctors: verified doctors are publicly readable') THEN
    CREATE POLICY "doctors: verified doctors are publicly readable"
      ON doctors FOR SELECT USING (verified = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'doctors: doctor reads own profile') THEN
    CREATE POLICY "doctors: doctor reads own profile"
      ON doctors FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'doctors: doctor updates own profile') THEN
    CREATE POLICY "doctors: doctor updates own profile"
      ON doctors FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'doctors: hospital admin reads own hospital doctors') THEN
    CREATE POLICY "doctors: hospital admin reads own hospital doctors"
      ON doctors FOR SELECT
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = doctors.hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'doctors: hospital admin manages own hospital doctors') THEN
    CREATE POLICY "doctors: hospital admin manages own hospital doctors"
      ON doctors FOR UPDATE
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = doctors.hospital_id AND h.admin_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = doctors.hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

-- ── patients ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients: patient reads own profile') THEN
    CREATE POLICY "patients: patient reads own profile"
      ON patients FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients: patient updates own profile') THEN
    CREATE POLICY "patients: patient updates own profile"
      ON patients FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients: doctor reads patients with shared appointment') THEN
    CREATE POLICY "patients: doctor reads patients with shared appointment"
      ON patients FOR SELECT
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
        AND EXISTS (
          SELECT 1 FROM appointments a
          JOIN doctors d ON d.id = a.doctor_id
          WHERE a.patient_id = patients.id AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients: hospital admin reads patients with appointments') THEN
    CREATE POLICY "patients: hospital admin reads patients with appointments"
      ON patients FOR SELECT
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
        AND EXISTS (
          SELECT 1 FROM appointments a
          JOIN hospitals h ON h.id = a.hospital_id
          WHERE a.patient_id = patients.id AND h.admin_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── appointment_slots ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointment_slots: authenticated users view available slots') THEN
    CREATE POLICY "appointment_slots: authenticated users view available slots"
      ON appointment_slots FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointment_slots: doctor manages own slots') THEN
    CREATE POLICY "appointment_slots: doctor manages own slots"
      ON appointment_slots FOR ALL
      USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointment_slots.doctor_id AND d.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointment_slots.doctor_id AND d.user_id = auth.uid()));
  END IF;
END $$;

-- ── appointments ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointments: patient reads own appointments') THEN
    CREATE POLICY "appointments: patient reads own appointments"
      ON appointments FOR SELECT
      USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = appointments.patient_id AND p.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointments: doctor reads own appointments') THEN
    CREATE POLICY "appointments: doctor reads own appointments"
      ON appointments FOR SELECT
      USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointments.doctor_id AND d.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointments: hospital admin reads own hospital appointments') THEN
    CREATE POLICY "appointments: hospital admin reads own hospital appointments"
      ON appointments FOR SELECT
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = appointments.hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

-- ── patient_reports ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_reports: patient reads own reports') THEN
    CREATE POLICY "patient_reports: patient reads own reports"
      ON patient_reports FOR SELECT
      USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = patient_reports.patient_id AND p.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_reports: doctor reads with access grant') THEN
    CREATE POLICY "patient_reports: doctor reads with access grant"
      ON patient_reports FOR SELECT
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
        AND EXISTS (
          SELECT 1 FROM record_access_grants g
          JOIN doctors d ON d.id = g.granted_to_doctor_id
          WHERE g.patient_id = patient_reports.patient_id
            AND d.user_id = auth.uid()
            AND g.valid_until > now()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_reports: hospital admin reads own hospital reports') THEN
    CREATE POLICY "patient_reports: hospital admin reads own hospital reports"
      ON patient_reports FOR SELECT
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = patient_reports.hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

-- ── prescriptions ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescriptions: patient reads own') THEN
    CREATE POLICY "prescriptions: patient reads own"
      ON prescriptions FOR SELECT
      USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = prescriptions.patient_id AND p.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescriptions: doctor manages own') THEN
    CREATE POLICY "prescriptions: doctor manages own"
      ON prescriptions FOR ALL
      USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = prescriptions.doctor_id AND d.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM doctors d WHERE d.id = prescriptions.doctor_id AND d.user_id = auth.uid()));
  END IF;
END $$;

-- ── prescription_items ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescription_items: patient reads own') THEN
    CREATE POLICY "prescription_items: patient reads own"
      ON prescription_items FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM prescriptions pr
        JOIN patients p ON p.id = pr.patient_id
        WHERE pr.id = prescription_items.prescription_id AND p.user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescription_items: doctor manages own') THEN
    CREATE POLICY "prescription_items: doctor manages own"
      ON prescription_items FOR ALL
      USING (EXISTS (
        SELECT 1 FROM prescriptions pr
        JOIN doctors d ON d.id = pr.doctor_id
        WHERE pr.id = prescription_items.prescription_id AND d.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM prescriptions pr
        JOIN doctors d ON d.id = pr.doctor_id
        WHERE pr.id = prescription_items.prescription_id AND d.user_id = auth.uid()
      ));
  END IF;
END $$;

-- ── record_access_grants ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'record_access_grants: patient manages own') THEN
    CREATE POLICY "record_access_grants: patient manages own"
      ON record_access_grants FOR ALL
      USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = record_access_grants.patient_id AND p.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM patients p WHERE p.id = record_access_grants.patient_id AND p.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'record_access_grants: doctor reads own grants') THEN
    CREATE POLICY "record_access_grants: doctor reads own grants"
      ON record_access_grants FOR SELECT
      USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = record_access_grants.granted_to_doctor_id AND d.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'record_access_grants: hospital admin reads own grants') THEN
    CREATE POLICY "record_access_grants: hospital admin reads own grants"
      ON record_access_grants FOR SELECT
      USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = record_access_grants.granted_to_hospital_id AND h.admin_id = auth.uid()));
  END IF;
END $$;

-- ── slot_waitlist ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'slot_waitlist: patient manages own') THEN
    CREATE POLICY "slot_waitlist: patient manages own"
      ON slot_waitlist FOR ALL
      USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = slot_waitlist.patient_id AND p.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM patients p WHERE p.id = slot_waitlist.patient_id AND p.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'slot_waitlist: doctor reads own slot waitlists') THEN
    CREATE POLICY "slot_waitlist: doctor reads own slot waitlists"
      ON slot_waitlist FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM appointment_slots s
        JOIN doctors d ON d.id = s.doctor_id
        WHERE s.id = slot_waitlist.slot_id AND d.user_id = auth.uid()
      ));
  END IF;
END $$;

-- ── appointment_status_log ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'appointment_status_log: parties can read') THEN
    CREATE POLICY "appointment_status_log: parties can read"
      ON appointment_status_log FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM appointments a
        LEFT JOIN patients pt ON pt.id = a.patient_id AND pt.user_id = auth.uid()
        LEFT JOIN doctors  dr ON dr.id = a.doctor_id  AND dr.user_id = auth.uid()
        LEFT JOIN hospitals h ON h.id  = a.hospital_id AND h.admin_id = auth.uid()
        WHERE a.id = appointment_status_log.appointment_id
          AND (pt.id IS NOT NULL OR dr.id IS NOT NULL OR h.id IS NOT NULL)
      ));
  END IF;
END $$;

-- ── medicines (public read-only) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'medicines: publicly readable') THEN
    CREATE POLICY "medicines: publicly readable"
      ON medicines FOR SELECT USING (true);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- RPC Functions (from migration 005)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_medicines(p_query TEXT, p_limit INT DEFAULT 25)
RETURNS TABLE (
  id UUID,
  medicine_name TEXT,
  composition TEXT,
  therapeutic_class TEXT,
  chemical_class TEXT,
  uses TEXT,
  side_effects TEXT,
  substitutes TEXT,
  description TEXT,
  image_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.medicine_name,
    m.composition,
    m.therapeutic_class,
    m.chemical_class,
    m.uses,
    m.side_effects,
    m.substitutes,
    m.description,
    m.image_url,
    ts_rank_cd(m.search_vector, q) AS rank
  FROM medicines m,
       websearch_to_tsquery('english', trim(p_query)) AS q
  WHERE trim(coalesce(p_query, '')) <> ''
    AND m.search_vector @@ q
  ORDER BY rank DESC, m.medicine_name ASC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_medicines(TEXT, INT) TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════
-- Notify PostgREST to reload schema cache
-- ═══════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
