/**
 * seed_data.ts — Comprehensive data seeder for mediNexus
 *
 * Creates:
 *  - 1 Hospital Admin + 1 Hospital (approved)
 *  - 3 Doctors (verified, with schedules)
 *  - 3 Hospital Services
 *  - 3 Patients
 *  - Appointment slots for doctors (next 7 days)
 *  - 6 Appointments (2 per doctor)
 *  - 20 Medicines (from CSV)
 *  - Prescriptions & prescription items
 *  - Sample patient PDF reports (uploaded to Supabase Storage)
 *
 * Login credentials for testing:
 *  Hospital Admin:  admin@cityhospital.com / Test@1234
 *  Doctor 1:        dr.sharma@cityhospital.com / Test@1234
 *  Doctor 2:        dr.patel@cityhospital.com / Test@1234
 *  Doctor 3:        dr.gupta@cityhospital.com / Test@1234
 *  Patient 1:       rahul.mehra@gmail.com / Test@1234
 *  Patient 2:       priya.singh@gmail.com / Test@1234
 *  Patient 3:       amit.kumar@gmail.com / Test@1234
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Supabase clients ──────────────────────────────────────────────
const SUPABASE_URL = 'https://vcjvdqhgvdlrzmnymkpf.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjanZkcWhndmRscnptbnlta3BmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NDUzNywiZXhwIjoyMDkxNzUwNTM3fQ.RRCQ0wo30-R-kxQlTXK7UIJUf6WR5ZZmsOD4qiGrHYU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Test@1234';

// ─── Helpers ──────────────────────────────────────────────────────
function futureDate(daysFromNow: number, hour: number, min: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

async function createAuthUser(email: string, role: string, fullName: string, phone?: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    phone_confirm: true,
    phone: phone || undefined,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error) {
    if (error.message.includes('already') || error.message.includes('duplicate')) {
      // User exists — find them
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users?.users?.find((u: any) => u.email === email);
      if (existing) {
        console.log(`  ⚠ User ${email} already exists, reusing.`);
        return existing;
      }
    }
    throw new Error(`Failed to create user ${email}: ${error.message}`);
  }
  return data.user;
}

// ─── Generate a simple PDF buffer (text-based) ──────────────────
function generateSimplePDF(title: string, content: string): Buffer {
  // Create a minimal valid PDF with readable text content
  const textLines = content.split('\n');
  let textStream = `BT\n/F1 12 Tf\n50 750 Td\n14 TL\n`;
  
  // Title
  textStream += `/F1 16 Tf\n(${escapePDF(title)}) Tj\nT*\n/F1 12 Tf\nT*\n`;
  
  // Content lines
  for (const line of textLines) {
    textStream += `(${escapePDF(line)}) Tj\nT*\n`;
  }
  textStream += `ET`;
  
  const streamBytes = Buffer.from(textStream, 'ascii');
  
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamBytes.length} >>
stream
${textStream}
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000${(317 + streamBytes.length).toString().padStart(3, '0')} 00000 n 

trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

  return Buffer.from(pdf, 'ascii');
}

function escapePDF(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ─── Sample report content ──────────────────────────────────────
const REPORT_CONTENTS = [
  {
    name: 'Complete Blood Count Report',
    type: 'lab' as const,
    content: `City General Hospital - Pathology Department
Complete Blood Count (CBC) Report

Patient Name: Rahul Mehra
Age: 28 years | Gender: Male
Date: ${new Date().toLocaleDateString()}
Sample: Venous Blood (EDTA)

Test                    Result      Reference Range     Status
Haemoglobin             11.2 g/dL   13.0 - 17.0        LOW
Red Blood Cell Count    4.1 M/uL    4.5 - 5.5          LOW
White Blood Cell Count  11800 /uL   4000 - 11000       HIGH
Platelet Count          245000 /uL  150000 - 400000    Normal
Packed Cell Volume      34.5 %      40 - 54            LOW
MCV                     84 fL       80 - 100           Normal
MCH                     27.3 pg     27 - 32            Normal
MCHC                    32.5 g/dL   32 - 36            Normal

Differential Count:
Neutrophils             72 %        40 - 70            HIGH
Lymphocytes             20 %        20 - 45            Normal
Monocytes               5 %         2 - 10             Normal
Eosinophils             2 %         1 - 6              Normal
Basophils               1 %         0 - 2              Normal

ESR                     28 mm/hr    0 - 15             HIGH

Interpretation: Mild anaemia with elevated WBC count suggesting possible infection.
Follow-up recommended.

Reported by: Dr. A. Kumar, MD Pathology
Verified by: Dr. S. Nair, Senior Pathologist`,
  },
  {
    name: 'Lipid Profile Report',
    type: 'lab' as const,
    content: `City General Hospital - Biochemistry Department
Lipid Profile Report

Patient Name: Priya Singh
Age: 34 years | Gender: Female
Date: ${new Date().toLocaleDateString()}
Sample: Fasting Blood Sample (12 hours)

Test                        Result      Reference Range     Status
Total Cholesterol           242 mg/dL   < 200 Desirable     HIGH
Triglycerides               185 mg/dL   < 150               HIGH
HDL Cholesterol             42 mg/dL    > 50                LOW
LDL Cholesterol             163 mg/dL   < 100 Optimal       HIGH
VLDL Cholesterol            37 mg/dL    < 30                HIGH
Total Cholesterol/HDL Ratio 5.76        < 4.5               HIGH

Fasting Blood Sugar         108 mg/dL   70 - 100            HIGH
HbA1c                       6.1 %       < 5.7               HIGH

Liver Function:
SGOT (AST)                  32 U/L      0 - 40              Normal
SGPT (ALT)                  28 U/L      0 - 40              Normal

Interpretation: Dyslipidemia with borderline pre-diabetic HbA1c.
Lifestyle modification and dietary changes strongly recommended.
Follow-up in 3 months advised.

Reported by: Dr. M. Reddy, MD Biochemistry`,
  },
  {
    name: 'Thyroid Function Test',
    type: 'lab' as const,
    content: `City General Hospital - Endocrinology Lab
Thyroid Function Test Report

Patient Name: Amit Kumar
Age: 42 years | Gender: Male
Date: ${new Date().toLocaleDateString()}
Sample: Serum

Test                    Result      Reference Range     Status
TSH                     8.45 uIU/mL 0.4 - 4.0          HIGH
Free T3                 2.1 pg/mL   2.3 - 4.2          LOW
Free T4                 0.72 ng/dL  0.8 - 1.8          LOW
Total T3                78 ng/dL    80 - 200            LOW
Total T4                4.2 ug/dL   4.5 - 12.5         LOW

Anti-TPO Antibodies     285 IU/mL   < 35               HIGH

Kidney Function:
Serum Creatinine        1.1 mg/dL   0.7 - 1.3          Normal
Blood Urea             32 mg/dL     15 - 40            Normal
Uric Acid              6.8 mg/dL    3.5 - 7.2          Normal

Vitamin D (25-OH)      12.4 ng/mL   30 - 100           LOW
Vitamin B12            180 pg/mL    200 - 900           LOW

Interpretation: Subclinical hypothyroidism with positive Anti-TPO antibodies
suggestive of Hashimotos thyroiditis. Vitamin D and B12 deficiency noted.
Endocrinology consultation and supplementation recommended.

Reported by: Dr. P. Joshi, MD Pathology
Verified by: Dr. R. Iyer, Consultant Endocrinologist`,
  },
];

// ─── Medicine seed data ─────────────────────────────────────────
const MEDICINES = [
  { medicine_name: 'Paracetamol 500mg', composition: 'Paracetamol 500mg', therapeutic_class: 'Antipyretic/Analgesic', uses: 'Fever, headache, body pain', side_effects: 'Nausea, liver damage in overdose' },
  { medicine_name: 'Amoxicillin 500mg', composition: 'Amoxicillin Trihydrate 500mg', therapeutic_class: 'Antibiotic', uses: 'Bacterial infections, respiratory tract infections', side_effects: 'Diarrhea, nausea, allergic reactions' },
  { medicine_name: 'Omeprazole 20mg', composition: 'Omeprazole 20mg', therapeutic_class: 'Proton Pump Inhibitor', uses: 'Acid reflux, gastric ulcers, GERD', side_effects: 'Headache, stomach pain, nausea' },
  { medicine_name: 'Metformin 500mg', composition: 'Metformin Hydrochloride 500mg', therapeutic_class: 'Antidiabetic', uses: 'Type 2 diabetes, insulin resistance', side_effects: 'Nausea, diarrhea, metallic taste' },
  { medicine_name: 'Amlodipine 5mg', composition: 'Amlodipine Besylate 5mg', therapeutic_class: 'Calcium Channel Blocker', uses: 'Hypertension, angina', side_effects: 'Ankle swelling, dizziness, flushing' },
  { medicine_name: 'Atorvastatin 10mg', composition: 'Atorvastatin Calcium 10mg', therapeutic_class: 'Statin', uses: 'High cholesterol, cardiovascular risk reduction', side_effects: 'Muscle pain, liver enzyme elevation' },
  { medicine_name: 'Cetirizine 10mg', composition: 'Cetirizine Hydrochloride 10mg', therapeutic_class: 'Antihistamine', uses: 'Allergies, allergic rhinitis, urticaria', side_effects: 'Drowsiness, dry mouth' },
  { medicine_name: 'Azithromycin 500mg', composition: 'Azithromycin Dihydrate 500mg', therapeutic_class: 'Macrolide Antibiotic', uses: 'Bacterial infections, respiratory infections', side_effects: 'Nausea, diarrhea, abdominal pain' },
  { medicine_name: 'Pantoprazole 40mg', composition: 'Pantoprazole Sodium 40mg', therapeutic_class: 'Proton Pump Inhibitor', uses: 'GERD, peptic ulcer, Zollinger-Ellison syndrome', side_effects: 'Headache, diarrhea, flatulence' },
  { medicine_name: 'Levothyroxine 50mcg', composition: 'Levothyroxine Sodium 50mcg', therapeutic_class: 'Thyroid Hormone', uses: 'Hypothyroidism, thyroid hormone replacement', side_effects: 'Palpitations, weight loss, insomnia' },
  { medicine_name: 'Ibuprofen 400mg', composition: 'Ibuprofen 400mg', therapeutic_class: 'NSAID', uses: 'Pain, inflammation, fever, arthritis', side_effects: 'Stomach upset, ulcers, kidney issues' },
  { medicine_name: 'Losartan 50mg', composition: 'Losartan Potassium 50mg', therapeutic_class: 'ARB', uses: 'Hypertension, diabetic nephropathy', side_effects: 'Dizziness, hyperkalemia, fatigue' },
  { medicine_name: 'Montelukast 10mg', composition: 'Montelukast Sodium 10mg', therapeutic_class: 'Leukotriene Antagonist', uses: 'Asthma, allergic rhinitis', side_effects: 'Headache, abdominal pain, mood changes' },
  { medicine_name: 'Clopidogrel 75mg', composition: 'Clopidogrel Bisulfate 75mg', therapeutic_class: 'Antiplatelet', uses: 'Prevention of heart attack and stroke', side_effects: 'Bleeding, bruising, stomach upset' },
  { medicine_name: 'Vitamin D3 60000 IU', composition: 'Cholecalciferol 60000 IU', therapeutic_class: 'Vitamin Supplement', uses: 'Vitamin D deficiency, bone health', side_effects: 'Nausea, constipation in excess' },
  { medicine_name: 'Ferrous Sulfate 200mg', composition: 'Ferrous Sulfate 200mg', therapeutic_class: 'Iron Supplement', uses: 'Iron deficiency anaemia', side_effects: 'Constipation, dark stools, nausea' },
  { medicine_name: 'Methylcobalamin 1500mcg', composition: 'Methylcobalamin 1500mcg', therapeutic_class: 'Vitamin B12 Supplement', uses: 'Vitamin B12 deficiency, neuropathy', side_effects: 'Mild nausea, diarrhea' },
  { medicine_name: 'Rabeprazole 20mg', composition: 'Rabeprazole Sodium 20mg', therapeutic_class: 'Proton Pump Inhibitor', uses: 'Acid reflux, duodenal ulcers', side_effects: 'Headache, diarrhea, nausea' },
  { medicine_name: 'Dolo 650', composition: 'Paracetamol 650mg', therapeutic_class: 'Antipyretic/Analgesic', uses: 'Fever, mild to moderate pain', side_effects: 'Liver toxicity in overdose' },
  { medicine_name: 'Aspirin 75mg', composition: 'Acetylsalicylic Acid 75mg', therapeutic_class: 'Antiplatelet/NSAID', uses: 'Heart attack prevention, pain relief', side_effects: 'Bleeding, stomach irritation' },
];

// ═══════════════════════════════════════════════════════════════════
// Main Seed Function
// ═══════════════════════════════════════════════════════════════════

async function seed() {
  console.log('🌱 Starting mediNexus data seeding...\n');

  // ── 1. Create Hospital Admin ────────────────────────────────────
  console.log('1️⃣  Creating Hospital Admin...');
  const adminUser = await createAuthUser('admin@cityhospital.com', 'hospital_admin', 'Dr. Rajesh Kapoor', '+919876543210');
  console.log(`   ✅ Admin user: ${adminUser.id}`);

  // ── 2. Create Hospital ─────────────────────────────────────────
  console.log('2️⃣  Creating Hospital...');
  const { data: existingHospital } = await supabase.from('hospitals').select('id').eq('admin_id', adminUser.id).single();
  
  let hospitalId: string;
  if (existingHospital) {
    hospitalId = existingHospital.id;
    console.log(`   ⚠ Hospital already exists: ${hospitalId}`);
  } else {
    const { data: hospital, error } = await supabase.from('hospitals').insert({
      name: 'City General Hospital',
      type: 'private',
      address: '42 MG Road, Sector 14',
      city: 'Mumbai',
      state: 'Maharashtra',
      registration_number: 'MH-HOSP-2024-0042',
      admin_id: adminUser.id,
      is_approved: true,
    }).select('id').single();
    if (error) throw new Error(`Hospital insert failed: ${error.message}`);
    hospitalId = hospital!.id;
  }
  console.log(`   ✅ Hospital ID: ${hospitalId}`);

  // ── 3. Create Doctors ──────────────────────────────────────────
  console.log('3️⃣  Creating Doctors...');
  const doctorDefs = [
    { email: 'dr.sharma@cityhospital.com', name: 'Dr. Anil Sharma', spec: 'General Medicine', dept: 'Medicine', fee: 500, from: '09:00', to: '17:00', dur: 30, qual: 'MBBS, MD', regNo: 'MCI-12345', exp: 12, bio: 'Senior General Physician with 12 years of experience in internal medicine.' },
    { email: 'dr.patel@cityhospital.com', name: 'Dr. Meena Patel', spec: 'Cardiology', dept: 'Cardiology', fee: 800, from: '10:00', to: '16:00', dur: 30, qual: 'MBBS, DM Cardiology', regNo: 'MCI-23456', exp: 15, bio: 'Consultant Cardiologist specializing in non-invasive cardiac care.' },
    { email: 'dr.gupta@cityhospital.com', name: 'Dr. Vikram Gupta', spec: 'Orthopedics', dept: 'Orthopedics', fee: 700, from: '08:00', to: '14:00', dur: 30, qual: 'MBBS, MS Ortho', regNo: 'MCI-34567', exp: 8, bio: 'Orthopedic surgeon specializing in sports injuries and joint replacements.' },
  ];

  const doctorIds: string[] = [];
  const doctorUserIds: string[] = [];

  for (const d of doctorDefs) {
    const docUser = await createAuthUser(d.email, 'doctor', d.name);
    doctorUserIds.push(docUser.id);

    // Check if doctor profile exists
    const { data: existingDoc } = await supabase.from('doctors').select('id').eq('user_id', docUser.id).single();
    if (existingDoc) {
      doctorIds.push(existingDoc.id);
      console.log(`   ⚠ Doctor ${d.name} already exists: ${existingDoc.id}`);
    } else {
      const { data: doc, error } = await supabase.from('doctors').insert({
        user_id: docUser.id,
        hospital_id: hospitalId,
        full_name: d.name,
        specialisation: d.spec,
        department: d.dept,
        qualifications: d.qual,
        registration_number: d.regNo,
        experience_years: d.exp,
        consultation_fee: d.fee,
        bio: d.bio,
        available_from: d.from,
        available_to: d.to,
        slot_duration_mins: d.dur,
        verified: true,
      }).select('id').single();
      if (error) throw new Error(`Doctor insert failed for ${d.name}: ${error.message}`);
      doctorIds.push(doc!.id);
    }
    console.log(`   ✅ ${d.name} → ${doctorIds[doctorIds.length - 1]}`);
  }

  // ── 4. Create Hospital Services ────────────────────────────────
  console.log('4️⃣  Creating Hospital Services...');
  const serviceDefs = [
    { service_type: 'diagnostic', service_name: 'Full Body Health Checkup', department: 'Diagnostics', default_duration_mins: 60, fee: 2500, daily_slot_limit: 15, pay_at_counter: false },
    { service_type: 'diagnostic', service_name: 'Blood Test - CBC & Lipid Profile', department: 'Pathology', default_duration_mins: 15, fee: 800, daily_slot_limit: 30, pay_at_counter: true },
    { service_type: 'procedure', service_name: 'ECG (Electrocardiogram)', department: 'Cardiology', default_duration_mins: 20, fee: 500, daily_slot_limit: 20, pay_at_counter: false },
  ];

  const serviceIds: string[] = [];
  for (const s of serviceDefs) {
    const { data: existingSvc } = await supabase.from('hospital_services').select('id').eq('hospital_id', hospitalId).eq('service_name', s.service_name).single();
    if (existingSvc) {
      serviceIds.push(existingSvc.id);
      console.log(`   ⚠ Service "${s.service_name}" already exists`);
    } else {
      const { data: svc, error } = await supabase.from('hospital_services').insert({
        hospital_id: hospitalId,
        ...s,
      }).select('id').single();
      if (error) throw new Error(`Service insert failed: ${error.message}`);
      serviceIds.push(svc!.id);
    }
    console.log(`   ✅ ${s.service_name} → ${serviceIds[serviceIds.length - 1]}`);
  }

  // ── 5. Create Patients ─────────────────────────────────────────
  console.log('5️⃣  Creating Patients...');
  const patientDefs = [
    { email: 'rahul.mehra@gmail.com', name: 'Rahul Mehra', phone: '+919812345001', dob: '1997-03-15', blood_group: 'B+', allergies: 'Penicillin' },
    { email: 'priya.singh@gmail.com', name: 'Priya Singh', phone: '+919812345002', dob: '1991-08-22', blood_group: 'A+', allergies: null },
    { email: 'amit.kumar@gmail.com', name: 'Amit Kumar', phone: '+919812345003', dob: '1983-11-05', blood_group: 'O+', allergies: 'Sulfa drugs' },
  ];

  const patientIds: string[] = [];
  for (const p of patientDefs) {
    const patUser = await createAuthUser(p.email, 'patient', p.name, p.phone);

    const { data: existingPat } = await supabase.from('patients').select('id').eq('user_id', patUser.id).single();
    if (existingPat) {
      patientIds.push(existingPat.id);
      console.log(`   ⚠ Patient ${p.name} already exists: ${existingPat.id}`);
    } else {
      const { data: pat, error } = await supabase.from('patients').insert({
        user_id: patUser.id,
        full_name: p.name,
        email: p.email,
        phone_number: p.phone,
        dob: p.dob,
        blood_group: p.blood_group,
        known_allergies: p.allergies,
        language_preference: 'en',
      }).select('id').single();
      if (error) throw new Error(`Patient insert failed for ${p.name}: ${error.message}`);
      patientIds.push(pat!.id);
    }
    console.log(`   ✅ ${p.name} → ${patientIds[patientIds.length - 1]}`);
  }

  // ── 6. Create Appointment Slots (next 7 days) ──────────────────
  console.log('6️⃣  Creating Appointment Slots...');
  const slotIds: string[] = [];

  for (let docIdx = 0; docIdx < doctorIds.length; docIdx++) {
    const fromHour = [9, 10, 8][docIdx];
    const toHour = [17, 16, 14][docIdx];
    let slotsCreated = 0;

    for (let day = 1; day <= 7; day++) {
      for (let hour = fromHour; hour < toHour; hour++) {
        for (const min of [0, 30]) {
          if (hour === toHour - 1 && min === 30) continue;
          const slotStart = futureDate(day, hour, min);
          const slotEnd = futureDate(day, hour, min + 30);

          const { data: existingSlot } = await supabase.from('appointment_slots')
            .select('id').eq('doctor_id', doctorIds[docIdx]).eq('slot_start', slotStart).single();
          
          if (!existingSlot) {
            const { data: slot, error } = await supabase.from('appointment_slots').insert({
              doctor_id: doctorIds[docIdx],
              slot_start: slotStart,
              slot_end: slotEnd,
              status: 'available',
            }).select('id').single();
            if (!error && slot) {
              slotIds.push(slot.id);
              slotsCreated++;
            }
          } else {
            slotIds.push(existingSlot.id);
          }
        }
      }
    }
    console.log(`   ✅ Doctor ${docIdx + 1}: ${slotsCreated} new slots created`);
  }

  // ── 7. Create Appointments (book some slots) ───────────────────
  console.log('7️⃣  Creating Appointments...');
  
  // Get first 6 available slots (2 per doctor)
  const appointmentDefs = [
    { patIdx: 0, docIdx: 0, slotOffset: 0 },
    { patIdx: 1, docIdx: 0, slotOffset: 1 },
    { patIdx: 1, docIdx: 1, slotOffset: 0 },
    { patIdx: 2, docIdx: 1, slotOffset: 1 },
    { patIdx: 0, docIdx: 2, slotOffset: 0 },
    { patIdx: 2, docIdx: 2, slotOffset: 1 },
  ];

  const appointmentIds: string[] = [];
  for (const apt of appointmentDefs) {
    // Find available slots for this doctor
    const { data: availSlots } = await supabase.from('appointment_slots')
      .select('id')
      .eq('doctor_id', doctorIds[apt.docIdx])
      .eq('status', 'available')
      .order('slot_start', { ascending: true })
      .limit(10);

    if (!availSlots || availSlots.length <= apt.slotOffset) continue;
    const slotId = availSlots[apt.slotOffset].id;

    // Book the slot
    await supabase.from('appointment_slots').update({ status: 'booked' }).eq('id', slotId);

    const { data: appt, error } = await supabase.from('appointments').insert({
      slot_id: slotId,
      patient_id: patientIds[apt.patIdx],
      doctor_id: doctorIds[apt.docIdx],
      hospital_id: hospitalId,
      booking_type: 'online',
      status: apt.slotOffset === 0 ? 'completed' : 'booked',
    }).select('id').single();

    if (!error && appt) {
      appointmentIds.push(appt.id);
      console.log(`   ✅ Appointment: Patient ${apt.patIdx + 1} → Doctor ${apt.docIdx + 1}`);
    }
  }

  // ── 8. Insert Medicines ────────────────────────────────────────
  console.log('8️⃣  Inserting Medicines...');
  const { data: existingMeds } = await supabase.from('medicines').select('id').limit(1);
  if (existingMeds && existingMeds.length > 0) {
    console.log('   ⚠ Medicines already exist, skipping.');
  } else {
    const { error: medErr } = await supabase.from('medicines').insert(MEDICINES);
    if (medErr) console.error(`   ❌ Medicine insert error: ${medErr.message}`);
    else console.log(`   ✅ ${MEDICINES.length} medicines inserted`);
  }

  // Get medicine IDs for prescriptions
  const { data: allMeds } = await supabase.from('medicines').select('id, medicine_name').limit(20);

  // ── 9. Create Prescriptions ────────────────────────────────────
  console.log('9️⃣  Creating Prescriptions...');
  if (appointmentIds.length >= 3 && allMeds && allMeds.length >= 5) {
    const prescriptionDefs = [
      { aptIdx: 0, docIdx: 0, patIdx: 0, illness: 'Upper respiratory tract infection with mild fever', meds: [0, 1, 6] },
      { aptIdx: 2, docIdx: 1, patIdx: 1, illness: 'Mild chest discomfort with borderline hypertension', meds: [4, 5, 2] },
      { aptIdx: 4, docIdx: 2, patIdx: 0, illness: 'Lower back pain with muscle spasm', meds: [0, 10, 14] },
    ];

    for (const p of prescriptionDefs) {
      if (appointmentIds.length <= p.aptIdx) continue;

      const { data: rx, error: rxErr } = await supabase.from('prescriptions').insert({
        appointment_id: appointmentIds[p.aptIdx],
        doctor_id: doctorIds[p.docIdx],
        patient_id: patientIds[p.patIdx],
        illness_description: p.illness,
        issued_at: new Date().toISOString(),
      }).select('id').single();

      if (rxErr) {
        console.error(`   ❌ Prescription error: ${rxErr.message}`);
        continue;
      }

      // Add prescription items
      const items = p.meds.map((medIdx, i) => ({
        prescription_id: rx!.id,
        medicine_id: allMeds[medIdx]?.id || allMeds[0].id,
        dosage: ['500mg', '10mg', '1 tab'][i % 3],
        frequency: ['Twice daily', 'Once daily', 'Thrice daily'][i % 3],
        duration: ['5 days', '30 days', '7 days'][i % 3],
        doctor_comment: ['Take after food', 'Take on empty stomach', null][i % 3],
      }));

      const { error: itemErr } = await supabase.from('prescription_items').insert(items);
      if (itemErr) console.error(`   ❌ Prescription item error: ${itemErr.message}`);
      else console.log(`   ✅ Prescription created for ${['Rahul', 'Priya', 'Rahul'][p.patIdx]} with ${items.length} medicines`);
    }
  }

  // ── 10. Create Patient Reports (PDF) ────────────────────────────
  console.log('🔟 Creating Patient Reports with PDF files...');
  
  // First, create the storage bucket if it doesn't exist
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b: any) => b.name === 'patient-reports');
  if (!bucketExists) {
    const { error: bucketErr } = await supabase.storage.createBucket('patient-reports', {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024, // 20MB
    });
    if (bucketErr && !bucketErr.message.includes('already exists')) {
      console.error(`   ❌ Bucket creation error: ${bucketErr.message}`);
    } else {
      console.log('   ✅ Storage bucket "patient-reports" created');
    }
  }

  for (let i = 0; i < REPORT_CONTENTS.length; i++) {
    const report = REPORT_CONTENTS[i];
    const patientId = patientIds[i];
    
    // Generate PDF
    const pdfBuffer = generateSimplePDF(report.name, report.content);
    const storagePath = `reports/${hospitalId}/${patientId}/${Date.now()}_${i}.pdf`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('patient-reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error(`   ❌ Upload error for ${report.name}: ${uploadError.message}`);
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('patient-reports')
      .getPublicUrl(storagePath);

    // Insert report record
    const { error: reportErr } = await supabase.from('patient_reports').insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      report_type: report.type,
      report_name: report.name,
      report_url: urlData.publicUrl,
      uploaded_by: adminUser.id,
      uploaded_at: new Date().toISOString(),
    });

    if (reportErr) {
      console.error(`   ❌ Report record error: ${reportErr.message}`);
    } else {
      console.log(`   ✅ ${report.name} → Patient ${i + 1} (${['Rahul', 'Priya', 'Amit'][i]})`);
    }
  }

  // ── 11. Create Service Slots ───────────────────────────────────
  console.log('1️⃣1️⃣ Creating Service Slots...');
  for (let svcIdx = 0; svcIdx < serviceIds.length; svcIdx++) {
    const limit = [15, 30, 20][svcIdx];
    let created = 0;
    for (let day = 1; day <= 7; day++) {
      const d = new Date();
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];

      for (let slot = 1; slot <= limit; slot++) {
        const { data: existing } = await supabase.from('service_slots')
          .select('id').eq('service_id', serviceIds[svcIdx]).eq('slot_date', dateStr).eq('slot_number', slot).single();
        
        if (!existing) {
          const { error } = await supabase.from('service_slots').insert({
            service_id: serviceIds[svcIdx],
            slot_date: dateStr,
            slot_number: slot,
            status: 'available',
          });
          if (!error) created++;
        }
      }
    }
    console.log(`   ✅ Service ${svcIdx + 1}: ${created} slots created`);
  }

  // ── Done ───────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎉 Seeding complete! Here are the test login credentials:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  🏥 Hospital Admin:');
  console.log('     Email: admin@cityhospital.com');
  console.log('     Password: Test@1234');
  console.log('');
  console.log('  👨‍⚕️ Doctors:');
  console.log('     dr.sharma@cityhospital.com / Test@1234 (General Medicine)');
  console.log('     dr.patel@cityhospital.com  / Test@1234 (Cardiology)');
  console.log('     dr.gupta@cityhospital.com  / Test@1234 (Orthopedics)');
  console.log('');
  console.log('  🧑‍🤝‍🧑 Patients:');
  console.log('     rahul.mehra@gmail.com / Test@1234');
  console.log('     priya.singh@gmail.com / Test@1234');
  console.log('     amit.kumar@gmail.com  / Test@1234');
  console.log('');
  console.log('  📋 Sample Reports: 3 PDF reports uploaded (CBC, Lipid, Thyroid)');
  console.log('  💊 Medicines: 20 common medicines seeded');
  console.log('  📅 Appointments: 6 appointments created');
  console.log('  📝 Prescriptions: 3 prescriptions with items');
  console.log('═══════════════════════════════════════════════════════\n');
}

seed().catch((err) => {
  console.error('\n💥 Seeding failed:', err.message);
  process.exit(1);
});
