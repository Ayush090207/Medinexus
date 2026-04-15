import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

interface PrescriptionContext {
  issuedAt: string;
  illnessDescription: string | null;
  doctorSpecialisation: string | null;
  items: {
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    comment: string | null;
  }[];
}

interface ReportContext {
  reportType: string;
  reportName: string;
  uploadedAt: string;
}

interface ReferralContext {
  fromSpecialisation: string | null;
  toSpecialisation: string | null;
  reason: string | null;
  status: string;
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(context: {
  ageYears: number | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  prescriptions: PrescriptionContext[];
  reports: ReportContext[];
  referrals: ReferralContext[];
}): string {
  // ── Prescriptions ────────────────────────────────────────────────────────
  const rxText =
    context.prescriptions.length === 0
      ? 'No prescriptions on record.'
      : context.prescriptions
          .map((rx, i) => {
            const meds =
              rx.items.length === 0
                ? '  (no medicines listed)'
                : rx.items
                    .map(
                      (it) =>
                        `  • ${it.medicineName} — ${it.dosage}, ${it.frequency}, for ${it.duration}` +
                        (it.comment ? ` (note: ${it.comment})` : '')
                    )
                    .join('\n');
            return [
              `Prescription ${i + 1} — issued ${rx.issuedAt}`,
              rx.illnessDescription ? `  Illness/Diagnosis: ${rx.illnessDescription}` : '',
              rx.doctorSpecialisation ? `  Doctor speciality: ${rx.doctorSpecialisation}` : '',
              meds,
            ]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n\n');

  // ── Reports ──────────────────────────────────────────────────────────────
  const reportsText =
    context.reports.length === 0
      ? 'No reports on file.'
      : context.reports
          .map((r) => `• ${r.reportName} (${r.reportType}) — uploaded ${r.uploadedAt}`)
          .join('\n');

  // ── Referrals ────────────────────────────────────────────────────────────
  const referralsText =
    context.referrals.length === 0
      ? 'No referrals on record.'
      : context.referrals
          .map(
            (r) =>
              `• ${r.fromSpecialisation ?? 'Unknown'} → ${r.toSpecialisation ?? 'Unknown'}` +
              (r.reason ? `: ${r.reason}` : '') +
              ` [${r.status}]`
          )
          .join('\n');

  return `You are a personal health assistant integrated into the mediNexus patient portal.
Your role is to help the patient understand their own medical history, past prescriptions, reports, and referrals in plain, compassionate language.

IMPORTANT RULES:
1. You only have the information provided below. Do NOT make up diagnoses, test results, or medicines not listed.
2. Always speak from the patient's perspective ("your records show…", "you were prescribed…").
3. Keep answers concise, clear, empathetic, and non-alarmist.
4. If a question requires in-person evaluation, lab tests, or a doctor's judgment, say so clearly and encourage them to book an appointment.
5. Never advise changing dosages or stopping medicines — only reference what is already in their records.
6. If there are no relevant records for a question, say so honestly.
7. Format responses with clear structure when helpful (use bullet points, line breaks). Keep replies focused and under 300 words unless the question genuinely needs more.
8. Always end EVERY response with this disclaimer on a new line: "⚠️ This overview is based on your past records only. Please consult a doctor for detailed clinical analysis and personalized medical advice."

══════════════════════════════════════════════════════════════
PATIENT HEALTH CONTEXT (anonymized — no names or IDs shared)
══════════════════════════════════════════════════════════════

Age: ${context.ageYears !== null ? `${context.ageYears} years` : 'Not available'}
Blood Group: ${context.bloodGroup ?? 'Not recorded'}
Known Allergies: ${context.knownAllergies?.trim() || 'None reported'}

── PRESCRIPTIONS (most recent first, up to last 10) ──────────
${rxText}

── REPORTS ───────────────────────────────────────────────────
${reportsText}

── REFERRALS ─────────────────────────────────────────────────
${referralsText}
══════════════════════════════════════════════════════════════`;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/patients/me/ai-chat
 *
 * Accepts { message: string, history?: ChatMessage[] }.
 * Fetches the patient's full health context from the DB (server-side — no PII
 * travels in the request body), builds a system prompt with that context,
 * then calls arcee-ai/trinity-large-preview:free on OpenRouter for a reply.
 */
export async function patientAIChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    const { message, history = [] } = req.body as AIChatRequestBody;

    if (!message?.trim()) {
      throw new BadRequestError('message is required');
    }

    if (message.trim().length > 1000) {
      throw new BadRequestError('message must be 1000 characters or less');
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new AppError('AI service is not configured', 503);

    // ── 1. Fetch all patient health data in parallel ─────────────────────────
    const [prescriptionsRes, reportsRes, referralsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from('prescriptions')
        .select(
          `illness_description, issued_at,
           doctors ( specialisation ),
           prescription_items (
             dosage, frequency, duration, doctor_comment,
             medicines ( medicine_name )
           )`
        )
        .eq('patient_id', patient.id)
        .order('issued_at', { ascending: false })
        .limit(10),

      (supabaseAdmin as any)
        .from('patient_reports')
        .select('report_type, report_name, uploaded_at')
        .eq('patient_id', patient.id)
        .order('uploaded_at', { ascending: false })
        .limit(20),

      (supabaseAdmin as any)
        .from('referrals')
        .select(
          `reason, status,
           referring_doctor:referring_doctor_id ( specialisation ),
           referred_to_doctor:referred_to_doctor_id ( specialisation )`
        )
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // ── 2. Calculate age from DOB ────────────────────────────────────────────
    let ageYears: number | null = null;
    if (patient.dob) {
      const dob = new Date(patient.dob);
      const today = new Date();
      ageYears = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        ageYears--;
      }
    }

    // ── 3. Shape data into clean context objects ─────────────────────────────
    const prescriptions: PrescriptionContext[] = (prescriptionsRes.data ?? []).map((rx: any) => ({
      issuedAt: new Date(rx.issued_at).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      illnessDescription: rx.illness_description ?? null,
      doctorSpecialisation: rx.doctors?.specialisation ?? null,
      items: (rx.prescription_items ?? []).map((it: any) => ({
        medicineName: it.medicines?.medicine_name ?? 'Unknown',
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        comment: it.doctor_comment ?? null,
      })),
    }));

    const reports: ReportContext[] = (reportsRes.data ?? []).map((r: any) => ({
      reportType: r.report_type,
      reportName: r.report_name,
      uploadedAt: new Date(r.uploaded_at).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    }));

    const referrals: ReferralContext[] = (referralsRes.data ?? []).map((r: any) => ({
      fromSpecialisation: r.referring_doctor?.specialisation ?? null,
      toSpecialisation: r.referred_to_doctor?.specialisation ?? null,
      reason: r.reason ?? null,
      status: r.status,
    }));

    // ── 4. Build system prompt with anonymized health context ────────────────
    const systemPrompt = buildSystemPrompt({
      ageYears,
      bloodGroup: patient.blood_group ?? null,
      knownAllergies: patient.known_allergies ?? null,
      prescriptions,
      reports,
      referrals,
    });

    // ── 5. Build the message thread (sanitized history + new message) ────────
    const safeHistory: { role: 'user' | 'assistant'; content: string }[] = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20) // at most last 10 turns (20 messages)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...safeHistory,
      { role: 'user' as const, content: message.trim() },
    ];

    // ── 6. Call OpenRouter ───────────────────────────────────────────────────
    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://medinexus.app',
        'X-Title': 'mediNexus Patient Health Assistant',
      },
      body: JSON.stringify({
        model: 'arcee-ai/trinity-large-preview:free',
        messages,
        reasoning: { enabled: true },
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error('[patientAIChat] OpenRouter error:', errText);
      throw new AppError('AI service returned an error', 502);
    }

    const openRouterData = await openRouterRes.json() as any;
    const reply: string =
      openRouterData?.choices?.[0]?.message?.content?.trim() ??
      'I was unable to generate a response. Please try again.';

    sendSuccess(res, { reply }, 'AI response generated');
  } catch (err) {
    next(err);
  }
}
