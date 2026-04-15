/**
 * seed_reports.ts — Generate realistic hospital medical reports for each patient
 *
 * Creates 4 reports per patient (12 total) with detailed clinical data,
 * formatted like real Indian hospital pathology / radiology reports.
 * Uploaded to Supabase Storage as PDFs for Sarvam AI report-speak.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vcjvdqhgvdlrzmnymkpf.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjanZkcWhndmRscnptbnlta3BmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NDUzNywiZXhwIjoyMDkxNzUwNTM3fQ.RRCQ0wo30-R-kxQlTXK7UIJUf6WR5ZZmsOD4qiGrHYU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── PDF Generation ──────────────────────────────────────────────

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPDF(lines: string[]): Buffer {
  // Build multiple pages if content exceeds one page
  const pages: string[] = [];
  let textOps = '';
  let y = 760;
  const PAGE_BOTTOM = 40;
  const PAGE_TOP = 760;

  function startNewPage() {
    if (textOps) pages.push(textOps);
    textOps = '';
    y = PAGE_TOP;
  }

  for (const rawLine of lines) {
    if (y < PAGE_BOTTOM) {
      startNewPage();
    }

    // Detect formatting markers
    let fontSize = 10;
    let line = rawLine;

    if (line.startsWith('##')) {
      line = line.slice(2).trim();
      fontSize = 12;
      y -= 4;
    } else if (line.startsWith('#')) {
      line = line.slice(1).trim();
      fontSize = 14;
      y -= 6;
    } else if (line === '---') {
      y -= 8;
      continue;
    } else if (line === '') {
      y -= 6;
      continue;
    }

    if (y < PAGE_BOTTOM) {
      startNewPage();
    }

    // Use Tm (absolute text matrix) instead of Td (relative)
    // Tm sets: [a b c d tx ty] where tx,ty is the absolute position
    textOps += `BT /F1 ${fontSize} Tf 1 0 0 1 40 ${y} Tm (${esc(line)}) Tj ET\n`;

    y -= fontSize + 3;
  }

  // Push final page
  if (textOps) pages.push(textOps);
  if (pages.length === 0) pages.push('');

  // Build PDF with all pages
  const objParts: string[] = [];
  let nextObj = 1;

  // Object 1 — Catalog
  const catalogObj = nextObj++;
  // Object 2 — Pages
  const pagesObj = nextObj++;
  // Object 3 — Font
  const fontObj = nextObj++;

  // Allocate page + content objects
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(nextObj++);
    contentObjNums.push(nextObj++);
  }

  // Write Catalog
  objParts.push(`${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj`);

  // Write Pages
  const kidsList = pageObjNums.map(n => `${n} 0 R`).join(' ');
  objParts.push(`${pagesObj} 0 obj\n<< /Type /Pages /Kids [${kidsList}] /Count ${pages.length} >>\nendobj`);

  // Write Font
  objParts.push(`${fontObj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj`);

  // Write each page + content stream
  for (let i = 0; i < pages.length; i++) {
    const streamContent = pages[i];
    const streamLen = Buffer.byteLength(streamContent, 'latin1');

    objParts.push(`${pageObjNums[i]} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792]\n   /Contents ${contentObjNums[i]} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>\nendobj`);

    objParts.push(`${contentObjNums[i]} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj`);
  }

  // Build final PDF bytes
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  // Sort objects by object number for correct ordering
  for (const obj of objParts) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj + '\n\n';
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nextObj}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += off.toString().padStart(10, '0') + ' 00000 n \n';
  }

  pdf += `\ntrailer\n<< /Size ${nextObj} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// ─── Report Data ─────────────────────────────────────────────────

const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface ReportDef {
  patientIndex: number;
  reportName: string;
  reportType: 'lab' | 'radiology' | 'pathology' | 'discharge_summary' | 'other';
  lines: string[];
}

const REPORTS: ReportDef[] = [
  // ══════════════════════════════════════════════════════════════
  // RAHUL MEHRA — Patient 0
  // ══════════════════════════════════════════════════════════════
  {
    patientIndex: 0,
    reportName: 'Complete Blood Count with ESR',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Pathology and Laboratory Medicine',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      'Phone: 022-2456-7890  |  NABL Accredited',
      '---',
      '##COMPLETE BLOOD COUNT (CBC) WITH ESR',
      '',
      'Patient Name     : Rahul Mehra',
      'Age / Gender     : 28 Years / Male',
      'Patient ID       : CGH-PAT-20240015',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}, 08:15 AM`,
      `Date of Reporting : ${today}, 02:30 PM`,
      'Sample Type      : Venous Blood (EDTA & Citrate)',
      'Fasting Status   : Fasting (12 hours)',
      '---',
      '##HAEMATOLOGY PANEL',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Haemoglobin               11.2       g/dL       13.0 - 17.0        LOW',
      'Total RBC Count           4.10       million/uL 4.50 - 5.50        LOW',
      'Packed Cell Volume (HCT)  34.5       %          40.0 - 54.0        LOW',
      'Mean Corpuscular Vol(MCV) 84.1       fL         80.0 - 100.0       NORMAL',
      'Mean Corp. Hb (MCH)       27.3       pg         27.0 - 32.0        NORMAL',
      'Mean Corp. Hb Conc(MCHC)  32.5       g/dL       32.0 - 36.0        NORMAL',
      'RDW-CV                    15.8       %          11.5 - 14.5        HIGH',
      '',
      '##WHITE BLOOD CELL COUNT',
      '',
      'Total WBC Count           11800      /uL        4000 - 11000       HIGH',
      '',
      'Differential Count:',
      '  Neutrophils              72        %          40 - 70            HIGH',
      '  Lymphocytes              20        %          20 - 45            NORMAL',
      '  Monocytes                 5        %           2 - 10            NORMAL',
      '  Eosinophils               2        %           1 - 6             NORMAL',
      '  Basophils                 1        %           0 - 2             NORMAL',
      '',
      'Absolute Neutrophil Count  8496      /uL        2000 - 7000        HIGH',
      'Absolute Lymphocyte Count  2360      /uL        1000 - 3000        NORMAL',
      '',
      '##PLATELET INDICES',
      '',
      'Platelet Count            245000     /uL        150000 - 400000    NORMAL',
      'Mean Platelet Volume      9.2        fL         7.5 - 12.5         NORMAL',
      '',
      '##ERYTHROCYTE SEDIMENTATION RATE',
      '',
      'ESR (Westergren)          28         mm/hr      0 - 15             HIGH',
      '',
      '##PERIPHERAL SMEAR EXAMINATION',
      '',
      'RBCs    : Mild microcytic hypochromic anaemia noted.',
      '          Some target cells seen. No fragmented cells.',
      'WBCs    : Leucocytosis with neutrophilia. No immature',
      '          cells or blast cells seen. Toxic granulation',
      '          noted in some neutrophils.',
      'Platelets: Adequate on smear. Normal morphology.',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Mild anaemia (Hb 11.2 g/dL) with microcytic picture and',
      'elevated RDW suggesting iron deficiency anaemia. Leucocytosis',
      'with neutrophilia and elevated ESR suggest an active bacterial',
      'infection. Recommend serum iron studies, serum ferritin, and',
      'TIBC for confirmation. Clinical correlation advised.',
      '',
      '---',
      'Reported by : Dr. Ananya Kumar, MD Pathology',
      'Verified by : Dr. Suresh Nair, Senior Consultant Pathologist',
      'Lab Ref No  : CBH-LAB-2024-04587',
    ],
  },
  {
    patientIndex: 0,
    reportName: 'Kidney Function Test (KFT/RFT)',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      'Phone: 022-2456-7890  |  NABL Accredited',
      '---',
      '##RENAL FUNCTION TEST (KFT / RFT)',
      '',
      'Patient Name     : Rahul Mehra',
      'Age / Gender     : 28 Years / Male',
      'Patient ID       : CGH-PAT-20240015',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}, 08:15 AM`,
      `Date of Reporting : ${today}, 04:00 PM`,
      'Sample Type      : Serum (Fasting)',
      '---',
      '##RENAL PROFILE',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Blood Urea                38         mg/dL      15 - 40            NORMAL',
      'Blood Urea Nitrogen(BUN)  17.7       mg/dL      7 - 20             NORMAL',
      'Serum Creatinine          1.3        mg/dL      0.7 - 1.3          BORDERLINE',
      'eGFR (CKD-EPI)            78         mL/min     >90                LOW',
      'Uric Acid                 7.8        mg/dL      3.5 - 7.2          HIGH',
      'BUN/Creatinine Ratio      13.6                  10 - 20            NORMAL',
      '',
      '##ELECTROLYTES',
      '',
      'Serum Sodium              139        mEq/L      136 - 145          NORMAL',
      'Serum Potassium           4.8        mEq/L      3.5 - 5.1          NORMAL',
      'Serum Chloride            101        mEq/L      98 - 106           NORMAL',
      'Serum Calcium (Total)     9.1        mg/dL      8.5 - 10.5         NORMAL',
      'Serum Phosphorus          4.0        mg/dL      2.5 - 4.5          NORMAL',
      '',
      '##URINE ROUTINE AND MICROSCOPY',
      '',
      'Colour                    Pale Yellow',
      'Appearance                Clear',
      'Specific Gravity          1.018               1.005 - 1.030       NORMAL',
      'pH                        6.0                 4.6 - 8.0           NORMAL',
      'Protein                   Nil                 Nil                  NORMAL',
      'Glucose                   Nil                 Nil                  NORMAL',
      'Ketone Bodies             Nil                 Nil                  NORMAL',
      'Bilirubin                 Nil                 Nil                  NORMAL',
      'Blood / Hb                Nil                 Nil                  NORMAL',
      'Pus Cells                 2-3       /HPF      0-5                  NORMAL',
      'RBCs                      0-1       /HPF      0-2                  NORMAL',
      'Epithelial Cells          1-2       /HPF      0-5                  NORMAL',
      'Casts                     Nil',
      'Crystals                  Few calcium oxalate crystals seen',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Serum creatinine is at the upper limit of normal with mildly',
      'reduced eGFR (78 mL/min) suggesting early Stage 2 CKD. Elevated',
      'uric acid (7.8 mg/dL) may indicate impaired renal clearance or',
      'purine-rich diet. Calcium oxalate crystals in urine noted.',
      'Recommend hydration, dietary modification, and follow-up renal',
      'function tests in 3 months. 24-hour urine protein may be',
      'considered if clinical suspicion warrants.',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
      'Verified by : Dr. K. Venkatesh, HOD Biochemistry',
    ],
  },
  {
    patientIndex: 0,
    reportName: 'Iron Studies and Vitamin Panel',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##IRON STUDIES AND VITAMIN PANEL',
      '',
      'Patient Name     : Rahul Mehra',
      'Age / Gender     : 28 Years / Male',
      'Patient ID       : CGH-PAT-20240015',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}`,
      `Date of Reporting : ${today}`,
      'Sample Type      : Serum',
      '---',
      '##IRON STUDIES',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Serum Iron                42         ug/dL      60 - 170           LOW',
      'Total Iron Binding Cap.   420        ug/dL      250 - 370          HIGH',
      'Transferrin Saturation    10.0       %          20 - 50            LOW',
      'Serum Ferritin            8          ng/mL      20 - 250           LOW',
      '',
      '##VITAMIN PROFILE',
      '',
      'Vitamin D (25-OH)         14.2       ng/mL      30 - 100           LOW',
      '  Status: DEFICIENT (below 20 ng/mL)',
      '',
      'Vitamin B12               195        pg/mL      200 - 900          LOW',
      '  Status: BORDERLINE DEFICIENT',
      '',
      'Folic Acid                12.5       ng/mL      3.0 - 17.0         NORMAL',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Iron studies confirm iron deficiency anaemia: low serum iron,',
      'low ferritin, elevated TIBC, and reduced transferrin saturation.',
      'This is consistent with the CBC findings of microcytic',
      'hypochromic anaemia. Vitamin D is severely deficient and',
      'Vitamin B12 is borderline low. Recommend:',
      '1. Oral iron supplementation (ferrous sulfate 200mg twice daily)',
      '   with Vitamin C for 3 months.',
      '2. Vitamin D3 60,000 IU weekly for 8 weeks, then monthly.',
      '3. Methylcobalamin 1500 mcg daily for 3 months.',
      '4. Dietary counselling for iron and vitamin-rich foods.',
      '5. Repeat CBC and iron studies after 3 months.',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
    ],
  },
  {
    patientIndex: 0,
    reportName: 'Chest X-Ray PA View',
    reportType: 'radiology',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Radiology and Imaging',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##CHEST X-RAY (PA VIEW) REPORT',
      '',
      'Patient Name     : Rahul Mehra',
      'Age / Gender     : 28 Years / Male',
      'Patient ID       : CGH-PAT-20240015',
      'Referred By      : Dr. Anil Sharma',
      `Date of Examination: ${today}`,
      `Date of Reporting  : ${today}`,
      'Clinical History : Persistent cough x 2 weeks, fever',
      '---',
      '##FINDINGS',
      '',
      'Heart: Normal in size and configuration. Cardiothoracic',
      'ratio is 0.45 (within normal limits). No pericardial',
      'effusion noted.',
      '',
      'Mediastinum: Trachea is central. No mediastinal widening.',
      'Hilar shadows appear prominent bilaterally, likely',
      'reactive lymphadenopathy.',
      '',
      'Lungs: Bilateral lung fields show increased',
      'bronchovascular markings, more prominent in the lower',
      'zones. A patchy opacity is noted in the right lower',
      'zone (posterior basal segment) measuring approximately',
      '3 x 2 cm, with air bronchograms seen within — suggestive',
      'of consolidation. No cavitation or nodular lesions.',
      'Left lung field is clear.',
      '',
      'Pleura: No pleural effusion or pneumothorax seen on',
      'either side. Costophrenic angles are clear bilaterally.',
      '',
      'Diaphragm: Both hemidiaphragms are normal in position',
      'and contour.',
      '',
      'Bony Thorax: Visualised ribs and thoracic spine appear',
      'normal. No fractures or lytic lesions.',
      '',
      'Soft Tissues: No subcutaneous emphysema.',
      '',
      '---',
      '##IMPRESSION',
      '',
      '1. Right lower zone consolidation (posterior basal',
      '   segment) — likely community-acquired pneumonia.',
      '   Clinical correlation with sputum culture recommended.',
      '',
      '2. Bilateral prominent hilar shadows — likely reactive.',
      '   CT thorax may be considered if symptoms persist',
      '   despite antibiotic therapy.',
      '',
      '3. No pleural effusion or pneumothorax.',
      '',
      '4. Heart size normal.',
      '',
      '---',
      'Reported by : Dr. Prashant Kulkarni, MD Radiology',
      'Verified by : Dr. Sunita Menon, Senior Radiologist',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // PRIYA SINGH — Patient 1
  // ══════════════════════════════════════════════════════════════
  {
    patientIndex: 1,
    reportName: 'Comprehensive Lipid Profile with Risk Assessment',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      'Phone: 022-2456-7890  |  NABL Accredited',
      '---',
      '##COMPREHENSIVE LIPID PROFILE WITH CARDIAC RISK ASSESSMENT',
      '',
      'Patient Name     : Priya Singh',
      'Age / Gender     : 34 Years / Female',
      'Patient ID       : CGH-PAT-20240023',
      'Referred By      : Dr. Meena Patel (Cardiology)',
      `Date of Collection: ${today}, 07:30 AM`,
      `Date of Reporting : ${today}, 01:00 PM`,
      'Sample Type      : Serum (Fasting 14 hours)',
      '---',
      '##LIPID PROFILE',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Total Cholesterol         248        mg/dL      <200 Desirable     HIGH',
      '                                                200-239 Borderline',
      '                                                >=240 High',
      '',
      'Triglycerides             192        mg/dL      <150 Normal        HIGH',
      '                                                150-199 Borderline',
      '                                                >=200 High',
      '',
      'HDL Cholesterol           38         mg/dL      >50 for women      LOW',
      '  Risk Category: LOW HDL (Major cardiac risk factor)',
      '',
      'LDL Cholesterol           171.6      mg/dL      <100 Optimal       HIGH',
      '                                                100-129 Near Optimal',
      '                                                130-159 Borderline',
      '                                                >=160 High',
      '',
      'VLDL Cholesterol          38.4       mg/dL      <30                HIGH',
      'Non-HDL Cholesterol       210        mg/dL      <130               HIGH',
      '',
      '##CARDIAC RISK RATIOS',
      '',
      'Total Chol/HDL Ratio      6.52                  <4.5               HIGH',
      'LDL/HDL Ratio             4.52                  <3.0               HIGH',
      'Triglyceride/HDL Ratio    5.05                  <2.0               HIGH',
      '',
      '##ADDITIONAL CARDIAC MARKERS',
      '',
      'Apolipoprotein A1         118        mg/dL      120 - 175          LOW',
      'Apolipoprotein B          142        mg/dL      <120               HIGH',
      'Lipoprotein(a)            48         nmol/L     <75                NORMAL',
      'hs-CRP                    3.8        mg/L       <1.0 Low Risk      HIGH',
      '                                                1-3 Average Risk',
      '                                                >3 High Risk',
      '',
      '---',
      '##CARDIAC RISK ASSESSMENT',
      '',
      '10-Year Cardiovascular Risk: MODERATE-HIGH',
      'Based on lipid profile, hs-CRP, and ApoB/ApoA1 ratio.',
      '',
      'Recommendations:',
      '- Therapeutic lifestyle changes: diet, exercise, weight mgmt',
      '- Mediterranean or DASH diet recommended',
      '- Regular aerobic exercise (150 min/week minimum)',
      '- Consider statin therapy if lifestyle changes insufficient',
      '- Repeat lipid profile in 3 months after lifestyle changes',
      '- Annual cardiac check-up recommended',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
      'Verified by : Dr. K. Venkatesh, HOD Biochemistry',
    ],
  },
  {
    patientIndex: 1,
    reportName: 'Diabetes Screening Panel (HbA1c, FBS, PPBS)',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##DIABETES SCREENING PANEL',
      '',
      'Patient Name     : Priya Singh',
      'Age / Gender     : 34 Years / Female',
      'Patient ID       : CGH-PAT-20240023',
      'Referred By      : Dr. Meena Patel',
      `Date of Collection: ${today}`,
      `Date of Reporting : ${today}`,
      'Sample Type      : Fluoride Plasma / Whole Blood (EDTA)',
      '---',
      '##GLUCOSE TESTS',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Fasting Blood Sugar       118        mg/dL      70 - 100 Normal    HIGH',
      '                                                101-125 Pre-diab.',
      '                                                >=126 Diabetes',
      '  STATUS: PRE-DIABETIC (Impaired Fasting Glucose)',
      '',
      'Post-Prandial Blood Sugar 168        mg/dL      <140 Normal        HIGH',
      '  (2 hours after 75g glucose load)',
      '  STATUS: IMPAIRED GLUCOSE TOLERANCE',
      '',
      '##GLYCATED HAEMOGLOBIN',
      '',
      'HbA1c                     6.2        %          <5.7 Normal        HIGH',
      '                                                5.7-6.4 Pre-diab.',
      '                                                >=6.5 Diabetes',
      '  STATUS: PRE-DIABETIC',
      '',
      'Estimated Average Glucose 131        mg/dL      (derived from HbA1c)',
      '',
      '##INSULIN RESISTANCE MARKERS',
      '',
      'Fasting Insulin           18.5       uIU/mL     2.6 - 24.9         NORMAL',
      'HOMA-IR Index             5.39                  <2.5               HIGH',
      '  STATUS: INSULIN RESISTANCE PRESENT',
      '',
      'C-Peptide (Fasting)       3.2        ng/mL      1.1 - 4.4          NORMAL',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Patient shows pre-diabetic state with impaired fasting glucose,',
      'impaired glucose tolerance, and HbA1c of 6.2%. HOMA-IR of 5.39',
      'confirms significant insulin resistance despite normal fasting',
      'insulin levels. Combined with the elevated lipid profile and',
      'hs-CRP, this indicates metabolic syndrome.',
      '',
      'Recommendations:',
      '- Strict dietary modification: reduce refined carbs, sugar',
      '- Weight loss target: 5-7% of body weight over 6 months',
      '- Regular exercise: 30 min brisk walking daily minimum',
      '- Consider Metformin if lifestyle changes insufficient',
      '- Repeat HbA1c and FBS in 3 months',
      '- Screen for PCOS if applicable',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
    ],
  },
  {
    patientIndex: 1,
    reportName: 'Liver Function Test (LFT)',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##LIVER FUNCTION TEST (LFT)',
      '',
      'Patient Name     : Priya Singh',
      'Age / Gender     : 34 Years / Female',
      'Patient ID       : CGH-PAT-20240023',
      'Referred By      : Dr. Meena Patel',
      `Date of Collection: ${today}`,
      `Date of Reporting : ${today}`,
      'Sample Type      : Serum',
      '---',
      '##LIVER ENZYMES',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'SGOT (AST)                52         U/L        0 - 40             HIGH',
      'SGPT (ALT)                68         U/L        0 - 40             HIGH',
      'Alkaline Phosphatase      92         U/L        44 - 147           NORMAL',
      'Gamma GT (GGT)            58         U/L        0 - 38             HIGH',
      '',
      'De Ritis Ratio (AST/ALT)  0.76                  <1.0 suggests',
      '                                                hepatocellular cause',
      '',
      '##LIVER PROTEINS',
      '',
      'Total Protein             7.2        g/dL       6.0 - 8.3          NORMAL',
      'Serum Albumin             4.1        g/dL       3.5 - 5.5          NORMAL',
      'Serum Globulin            3.1        g/dL       2.0 - 3.5          NORMAL',
      'A/G Ratio                 1.32                  1.0 - 2.2          NORMAL',
      '',
      '##BILIRUBIN',
      '',
      'Total Bilirubin           0.9        mg/dL      0.1 - 1.2          NORMAL',
      'Direct Bilirubin          0.3        mg/dL      0.0 - 0.4          NORMAL',
      'Indirect Bilirubin        0.6        mg/dL      0.1 - 0.8          NORMAL',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Mildly elevated liver transaminases (SGOT 52, SGPT 68) with',
      'elevated GGT (58) suggesting early Non-Alcoholic Fatty Liver',
      'Disease (NAFLD), which is commonly associated with metabolic',
      'syndrome, dyslipidemia, and insulin resistance as seen in this',
      'patients other reports. De Ritis ratio <1 supports hepato-',
      'cellular pattern. Liver synthetic function (albumin, bilirubin)',
      'is preserved.',
      '',
      'Recommendations:',
      '- Ultrasound abdomen to assess fatty liver grade',
      '- Lifestyle modification and weight loss',
      '- Avoid alcohol completely',
      '- Repeat LFT in 3 months',
      '- Consider hepatology referral if enzymes worsen',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
    ],
  },
  {
    patientIndex: 1,
    reportName: 'ECG (Electrocardiogram) Report',
    reportType: 'other',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Cardiology',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##12-LEAD ELECTROCARDIOGRAM (ECG) REPORT',
      '',
      'Patient Name     : Priya Singh',
      'Age / Gender     : 34 Years / Female',
      'Patient ID       : CGH-PAT-20240023',
      'Referred By      : Dr. Meena Patel (Cardiology)',
      `Date of Test     : ${today}, 10:30 AM`,
      'Clinical Indication: Chest discomfort, dyslipidemia screening',
      '---',
      '##ECG PARAMETERS',
      '',
      'Heart Rate       : 82 bpm (Regular)',
      'Rhythm           : Normal Sinus Rhythm',
      'PR Interval      : 0.16 sec (Normal: 0.12 - 0.20)',
      'QRS Duration     : 0.08 sec (Normal: <0.12)',
      'QT Interval      : 0.38 sec',
      'QTc (Bazett)     : 0.44 sec (Normal: <0.46 for women)',
      'Axis             : Normal (+60 degrees)',
      '',
      '##DETAILED ANALYSIS',
      '',
      'P Wave: Normal morphology, upright in lead II. No evidence',
      'of left or right atrial enlargement.',
      '',
      'PR Interval: Normal. No AV block.',
      '',
      'QRS Complex: Normal duration and morphology. No bundle',
      'branch block pattern. No pathological Q waves. Normal',
      'R-wave progression across precordial leads.',
      '',
      'ST Segment: No significant ST elevation or depression in',
      'any lead. No evidence of acute ischemic changes.',
      '',
      'T Wave: Normal T-wave morphology. Mild T-wave flattening',
      'noted in lead V5-V6 (non-specific finding). No T-wave',
      'inversions.',
      '',
      'U Wave: Not prominent.',
      '',
      '---',
      '##IMPRESSION',
      '',
      '1. Normal sinus rhythm at 82 bpm.',
      '2. Normal intervals and axis.',
      '3. Non-specific T-wave flattening in V5-V6 — may be',
      '   a normal variant or related to electrolyte status.',
      '   Clinical correlation recommended.',
      '4. No acute ischemic changes.',
      '5. No arrhythmia detected.',
      '',
      'Recommendation: Given the patients cardiovascular risk',
      'factors (dyslipidemia, pre-diabetes), a Treadmill Test',
      '(TMT) or 2D Echocardiography may be considered for',
      'comprehensive cardiac evaluation.',
      '',
      '---',
      'Reported by : Dr. Meena Patel, DM Cardiology',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // AMIT KUMAR — Patient 2
  // ══════════════════════════════════════════════════════════════
  {
    patientIndex: 2,
    reportName: 'Thyroid Function Test with Anti-TPO',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      'Phone: 022-2456-7890  |  NABL Accredited',
      '---',
      '##THYROID FUNCTION TEST WITH ANTIBODY PANEL',
      '',
      'Patient Name     : Amit Kumar',
      'Age / Gender     : 42 Years / Male',
      'Patient ID       : CGH-PAT-20240031',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}, 08:00 AM`,
      `Date of Reporting : ${today}, 05:00 PM`,
      'Sample Type      : Serum',
      'Method           : Electrochemiluminescence (ECLIA)',
      '---',
      '##THYROID HORMONES',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'TSH (Ultra-sensitive)     8.45       uIU/mL     0.35 - 4.94        HIGH',
      '  STATUS: ELEVATED',
      '',
      'Free T3 (FT3)             2.1        pg/mL      2.3 - 4.2          LOW',
      'Free T4 (FT4)             0.72       ng/dL      0.70 - 1.48        LOW-NORMAL',
      'Total T3                  78         ng/dL      80 - 200           LOW',
      'Total T4                  4.2        ug/dL      4.5 - 12.5         LOW',
      '',
      '##THYROID ANTIBODIES',
      '',
      'Anti-TPO Antibodies       285        IU/mL      <35                HIGH',
      '  STATUS: STRONGLY POSITIVE',
      '',
      'Anti-Thyroglobulin Ab     62         IU/mL      <40                HIGH',
      '  STATUS: POSITIVE',
      '',
      '##THYROID ULTRASOUND CORRELATION SUGGESTED',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Thyroid profile shows elevated TSH (8.45) with low-normal',
      'FT4 and low FT3/T3/T4 indicating progression from sub-',
      'clinical to early overt hypothyroidism. Strongly positive',
      'Anti-TPO antibodies (285 IU/mL) and elevated Anti-Thyro-',
      'globulin antibodies confirm autoimmune thyroiditis',
      '(Hashimotos Thyroiditis) as the underlying cause.',
      '',
      'Recommendations:',
      '- Initiate Levothyroxine replacement therapy',
      '  Suggested starting dose: 50 mcg once daily, early morning,',
      '  30 minutes before breakfast',
      '- Thyroid ultrasound to assess gland morphology',
      '- Repeat TSH and FT4 after 6-8 weeks for dose adjustment',
      '- Monitor for symptoms: fatigue, weight gain, cold intolerance',
      '- Long-term annual thyroid monitoring required',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
      'Verified by : Dr. R. Iyer, Consultant Endocrinologist',
    ],
  },
  {
    patientIndex: 2,
    reportName: 'Vitamin D, B12, and Calcium Panel',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##VITAMIN AND MINERAL PANEL',
      '',
      'Patient Name     : Amit Kumar',
      'Age / Gender     : 42 Years / Male',
      'Patient ID       : CGH-PAT-20240031',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}`,
      `Date of Reporting : ${today}`,
      'Sample Type      : Serum',
      '---',
      '##VITAMIN PROFILE',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Vitamin D (25-OH)         12.4       ng/mL      30 - 100           LOW',
      '  Category: DEFICIENT (Severe, <20 ng/mL)',
      '  Optimal range: 40-60 ng/mL',
      '',
      'Vitamin B12               180        pg/mL      200 - 900          LOW',
      '  Category: DEFICIENT',
      '  Optimal range: >400 pg/mL',
      '',
      'Folic Acid (Folate)       8.2        ng/mL      3.0 - 17.0         NORMAL',
      '',
      '##CALCIUM AND BONE MARKERS',
      '',
      'Total Calcium             8.4        mg/dL      8.5 - 10.5         LOW',
      'Ionized Calcium           4.0        mg/dL      4.2 - 5.2          LOW',
      'Serum Phosphorus          4.8        mg/dL      2.5 - 4.5          HIGH',
      'Serum Magnesium           1.7        mg/dL      1.7 - 2.2          LOW-NORMAL',
      'Alkaline Phosphatase      148        U/L        44 - 147           HIGH',
      '',
      'Parathyroid Hormone(PTH)  78         pg/mL      15 - 65            HIGH',
      '  STATUS: SECONDARY HYPERPARATHYROIDISM',
      '  (Compensatory elevation due to Vitamin D deficiency)',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Severe Vitamin D deficiency (12.4 ng/mL) with secondary',
      'hyperparathyroidism (elevated PTH) and borderline low',
      'calcium. This is a common finding in hypothyroidism and',
      'can lead to bone demineralization over time. Elevated',
      'alkaline phosphatase reflects increased bone turnover.',
      'Vitamin B12 deficiency may contribute to the patients',
      'fatigue and neurological symptoms.',
      '',
      'Recommendations:',
      '- Vitamin D3 60,000 IU weekly x 8 weeks (loading dose)',
      '  then 60,000 IU monthly for maintenance',
      '- Calcium supplementation: 1000 mg daily with food',
      '- Methylcobalamin 1500 mcg daily for 3 months',
      '- DEXA scan for bone mineral density assessment',
      '- Repeat Vitamin D and calcium at 3 months',
      '- Sunlight exposure 20-30 minutes daily recommended',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
    ],
  },
  {
    patientIndex: 2,
    reportName: 'Complete Metabolic Panel (CMP)',
    reportType: 'lab',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Clinical Biochemistry',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##COMPLETE METABOLIC PANEL',
      '',
      'Patient Name     : Amit Kumar',
      'Age / Gender     : 42 Years / Male',
      'Patient ID       : CGH-PAT-20240031',
      'Referred By      : Dr. Anil Sharma',
      `Date of Collection: ${today}`,
      `Date of Reporting : ${today}`,
      'Sample Type      : Serum (Fasting 12 hours)',
      '---',
      '##GLUCOSE',
      '',
      'TEST                      RESULT     UNIT       REFERENCE RANGE    FLAG',
      '-------------------------------------------------------------------------',
      'Fasting Blood Sugar       96         mg/dL      70 - 100           NORMAL',
      'HbA1c                     5.4        %          <5.7               NORMAL',
      '',
      '##LIVER FUNCTION',
      '',
      'Total Bilirubin           0.8        mg/dL      0.1 - 1.2          NORMAL',
      'Direct Bilirubin          0.2        mg/dL      0.0 - 0.4          NORMAL',
      'SGOT (AST)                28         U/L        0 - 40             NORMAL',
      'SGPT (ALT)                32         U/L        0 - 40             NORMAL',
      'Alkaline Phosphatase      148        U/L        44 - 147           HIGH',
      'Total Protein             6.8        g/dL       6.0 - 8.3          NORMAL',
      'Albumin                   3.8        g/dL       3.5 - 5.5          NORMAL',
      '',
      '##KIDNEY FUNCTION',
      '',
      'Blood Urea                28         mg/dL      15 - 40            NORMAL',
      'Serum Creatinine          0.9        mg/dL      0.7 - 1.3          NORMAL',
      'eGFR                      98         mL/min     >90                NORMAL',
      'Uric Acid                 6.2        mg/dL      3.5 - 7.2          NORMAL',
      '',
      '##LIPID PROFILE',
      '',
      'Total Cholesterol         218        mg/dL      <200               HIGH',
      'Triglycerides             165        mg/dL      <150               HIGH',
      'HDL Cholesterol           45         mg/dL      >40                NORMAL',
      'LDL Cholesterol           140        mg/dL      <100               HIGH',
      'VLDL Cholesterol          33         mg/dL      <30                HIGH',
      '',
      '##ELECTROLYTES',
      '',
      'Sodium                    141        mEq/L      136 - 145          NORMAL',
      'Potassium                 4.2        mEq/L      3.5 - 5.1          NORMAL',
      'Chloride                  103        mEq/L      98 - 106           NORMAL',
      '',
      '---',
      '##INTERPRETATION',
      '',
      'Blood sugar and HbA1c are normal, ruling out diabetes.',
      'Liver and kidney functions are preserved. Mildly elevated',
      'lipids (Total Cholesterol 218, LDL 140, TG 165) — consistent',
      'with hypothyroidism-related dyslipidemia. Elevated ALP is',
      'likely from bone turnover (correlate with Vitamin D/PTH panel).',
      'Lipid profile should be rechecked 3 months after thyroid',
      'hormone replacement is optimized, as hypothyroidism commonly',
      'causes secondary dyslipidemia that improves with treatment.',
      '',
      '---',
      'Reported by : Dr. Meera Reddy, MD Biochemistry',
    ],
  },
  {
    patientIndex: 2,
    reportName: 'Neck Ultrasound - Thyroid',
    reportType: 'radiology',
    lines: [
      '#CITY GENERAL HOSPITAL',
      'Department of Radiology and Imaging',
      '42 MG Road, Sector 14, Mumbai, Maharashtra 400001',
      '---',
      '##ULTRASOUND NECK - THYROID GLAND',
      '',
      'Patient Name     : Amit Kumar',
      'Age / Gender     : 42 Years / Male',
      'Patient ID       : CGH-PAT-20240031',
      'Referred By      : Dr. Anil Sharma / Dr. R. Iyer',
      `Date of Examination: ${today}`,
      'Clinical History : Hypothyroidism, Anti-TPO positive',
      '---',
      '##FINDINGS',
      '',
      'RIGHT LOBE:',
      '  Size: 4.8 x 1.8 x 1.6 cm (mildly enlarged)',
      '  Volume: 6.9 mL (normal <6 mL per lobe)',
      '  Echotexture: Diffusely heterogeneous with coarse',
      '  echopattern. Multiple small hypoechoic areas noted.',
      '  Vascularity: Increased on Color Doppler (thyroid',
      '  inferno pattern)',
      '  Nodules: A 6mm isoechoic nodule in mid-pole,',
      '  well-defined margins, no calcification. TIRADS 2.',
      '',
      'LEFT LOBE:',
      '  Size: 4.5 x 1.7 x 1.5 cm (mildly enlarged)',
      '  Volume: 5.7 mL',
      '  Echotexture: Diffusely heterogeneous, similar to',
      '  right lobe.',
      '  Vascularity: Increased diffusely',
      '  Nodules: No discrete nodule identified.',
      '',
      'ISTHMUS:',
      '  Thickness: 4 mm (normal <3mm) - mildly thickened',
      '  Echotexture: Heterogeneous',
      '',
      'CERVICAL LYMPH NODES:',
      '  Few small reactive lymph nodes seen in bilateral',
      '  level II and III regions, largest measuring 8 x 4 mm',
      '  on right side. Normal hilum preserved. No suspicious',
      '  lymphadenopathy.',
      '',
      '---',
      '##IMPRESSION',
      '',
      '1. Diffusely enlarged and heterogeneous thyroid gland',
      '   with increased vascularity bilaterally —',
      '   CONSISTENT WITH HASHIMOTOS THYROIDITIS.',
      '',
      '2. Small benign-appearing nodule (6mm) in right lobe',
      '   mid-pole — TIRADS 2 (benign features).',
      '   No FNA required. Annual follow-up ultrasound',
      '   recommended.',
      '',
      '3. Mildly thickened isthmus.',
      '',
      '4. Reactive cervical lymph nodes — no suspicious',
      '   features.',
      '',
      '---',
      'Reported by : Dr. Prashant Kulkarni, MD Radiology',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function seedReports() {
  console.log('📄 Generating realistic medical reports...\n');

  // Fetch patient and hospital info
  const { data: patients, error: patErr } = await supabase
    .from('patients')
    .select('id, full_name')
    .order('created_at', { ascending: true })
    .limit(3);

  if (patErr || !patients || patients.length < 3) {
    throw new Error('Could not find 3 patients. Run seed_data.ts first.');
  }

  const { data: hospital } = await supabase
    .from('hospitals')
    .select('id, admin_id')
    .limit(1)
    .single();

  if (!hospital) throw new Error('No hospital found. Run seed_data.ts first.');

  console.log('Patients found:');
  patients.forEach((p, i) => console.log(`  ${i + 1}. ${p.full_name} (${p.id})`));
  console.log(`Hospital: ${hospital.id}\n`);

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b: any) => b.name === 'patient-reports')) {
    await supabase.storage.createBucket('patient-reports', { public: true });
  }

  // ── Clean up old reports ────────────────────────────────────────
  console.log('🗑️  Deleting old reports...');
  for (const patient of patients) {
    // Delete DB records
    const { data: oldReports } = await supabase
      .from('patient_reports')
      .select('id')
      .eq('patient_id', patient.id);
    if (oldReports && oldReports.length > 0) {
      await supabase.from('patient_reports').delete().eq('patient_id', patient.id);
      console.log(`   Deleted ${oldReports.length} old records for ${patient.full_name}`);
    }

    // Delete storage files
    const dir = `reports/${hospital.id}/${patient.id}`;
    const { data: files } = await supabase.storage.from('patient-reports').list(dir);
    if (files && files.length > 0) {
      const paths = files.map((f: any) => `${dir}/${f.name}`);
      await supabase.storage.from('patient-reports').remove(paths);
      console.log(`   Removed ${files.length} old files from storage`);
    }
  }
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const report of REPORTS) {
    const patient = patients[report.patientIndex];
    const patientId = patient.id;
    const patientName = patient.full_name;

    // Generate PDF
    const pdfBuffer = buildPDF(report.lines);
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
    const storagePath = `reports/${hospital.id}/${patientId}/${timestamp}.pdf`;

    // Upload
    const { error: uploadErr } = await supabase.storage
      .from('patient-reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error(`  ❌ Upload failed: ${report.reportName} — ${uploadErr.message}`);
      errorCount++;
      continue;
    }

    // Public URL
    const { data: urlData } = supabase.storage
      .from('patient-reports')
      .getPublicUrl(storagePath);

    // Insert DB record
    const { error: dbErr } = await supabase.from('patient_reports').insert({
      patient_id: patientId,
      hospital_id: hospital.id,
      report_type: report.reportType,
      report_name: report.reportName,
      report_url: urlData.publicUrl,
      uploaded_by: hospital.admin_id,
      uploaded_at: new Date().toISOString(),
    });

    if (dbErr) {
      console.error(`  ❌ DB insert failed: ${report.reportName} — ${dbErr.message}`);
      errorCount++;
    } else {
      console.log(`  ✅ ${report.reportName} → ${patientName}`);
      successCount++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`📊 Results: ${successCount} uploaded, ${errorCount} errors`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`\nReports by patient:`);
  console.log(`  Rahul Mehra: CBC, KFT, Iron/Vitamin Panel, Chest X-Ray`);
  console.log(`  Priya Singh: Lipid Profile, Diabetes Panel, LFT, ECG`);
  console.log(`  Amit Kumar : Thyroid, Vitamin Panel, CMP, Neck Ultrasound`);
  console.log(`\nAll reports contain detailed clinical data for Sarvam AI analysis.`);
}

seedReports().catch((err) => {
  console.error('💥 Failed:', err.message);
  process.exit(1);
});
