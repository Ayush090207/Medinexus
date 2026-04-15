import type { Request, Response, NextFunction } from 'express';
import pdfParseLib from 'pdf-parse';
const pdfParse = pdfParseLib as unknown as (buf: Buffer) => Promise<{ text: string }>;
import { supabaseAdmin } from '../../config/supabase.js';
import { requirePatient } from '../../utils/lookup.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError } from '../../utils/errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendItem {
  parameter: string;
  direction: 'improving' | 'declining' | 'stable' | 'variable';
  concern: 'none' | 'watch' | 'urgent';
  note: string;
}

export interface TrendsResult {
  summary: string;
  trends: TrendItem[];
  report_count: number;
  generated_at: string;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Bust automatically when the patient uploads a new report (reportCount changes)

interface CacheEntry {
  result: TrendsResult;
  reportCount: number;
}

const trendsCache = new Map<string, CacheEntry>();

// ─── PDF text extraction (silent — returns null on any failure) ────────────────

async function extractTextSafe(url: string, maxChars = 1500): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { text } = await pdfParse(buf);
    return text?.trim().slice(0, maxChars) || null;
  } catch {
    return null;
  }
}

// ─── OpenRouter trend analysis ────────────────────────────────────────────────

async function generateTrends(
  reports: { name: string; date: string; text: string }[]
): Promise<TrendsResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError('OpenRouter API key not configured', 503);

  const reportsBlock = reports
    .map((r, i) => `--- Report ${i + 1}: "${r.name}" (${r.date}) ---\n${r.text}`)
    .join('\n\n');

  const systemPrompt =
    'You are a clinical AI that analyses a patient\'s medical reports over time to identify health trends. ' +
    'You will be given multiple reports in chronological order. Your job is to:\n' +
    '1. Identify parameters that appear in multiple reports (e.g. haemoglobin, blood glucose, cholesterol, creatinine, blood pressure, white blood cell count, platelets, kidney function, liver enzymes).\n' +
    '2. For each such parameter, determine whether it is improving, declining, stable, or variable across the reports.\n' +
    '3. Flag which trends are clinically concerning.\n' +
    '4. Write a concise overall narrative for the patient.\n\n' +
    'IMPORTANT: Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text before or after. Use this exact structure:\n' +
    '{\n' +
    '  "summary": "2-4 sentence overall narrative for the patient, using \'your\'",\n' +
    '  "trends": [\n' +
    '    {\n' +
    '      "parameter": "Full parameter name — never abbreviate (e.g. Haemoglobin, Fasting Blood Glucose, Total Cholesterol)",\n' +
    '      "direction": "improving" or "declining" or "stable" or "variable",\n' +
    '      "concern": "none" or "watch" or "urgent",\n' +
    '      "note": "1-2 sentences explaining the specific values seen across reports and what the trend means for the patient"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Only include parameters that appear in at least 2 reports with measurable/numerical values.\n' +
    '- "urgent" concern = clinically dangerous trend requiring immediate attention.\n' +
    '- "watch" concern = abnormal or worsening but not immediately dangerous — worth monitoring.\n' +
    '- "none" concern = improving or holding at a healthy range.\n' +
    '- Maximum 6 trend items — pick the most clinically significant.\n' +
    '- Never abbreviate parameter names. Write the full name.\n' +
    '- Speak directly to the patient using "your" in the summary and trend notes.';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://medinexus.app',
      'X-Title': 'mediNexus Health Trend Analysis',
    },
    body: JSON.stringify({
      model: 'arcee-ai/trinity-large-preview:free',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyse these ${reports.length} medical reports in chronological order:\n\n${reportsBlock}`,
        },
      ],
      reasoning: { enabled: true },
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[healthTrends] OpenRouter error:', errText);
    throw new AppError('AI trend analysis service returned an error', 502);
  }

  const data = (await res.json()) as any;
  const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? '';

  let jsonStr = raw;
  // Robust JSON extraction: find first '{' and last '}'
  const startIndex = raw.indexOf('{');
  const endIndex = raw.lastIndexOf('}');

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    jsonStr = raw.substring(startIndex, endIndex + 1);
  }

  let parsed: { summary: string; trends: TrendItem[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('[healthTrends] JSON parse failed, err:', err);
    console.error('[healthTrends] raw string was:', raw);
    // Fallback: return the raw text as summary with no trends
    parsed = {
      summary: 'We generated a summary but could not format it as trends. Details:\n\n' + raw,
      trends: [],
    };
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    trends: Array.isArray(parsed.trends) ? parsed.trends : [],
    report_count: reports.length,
    generated_at: new Date().toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function getHealthTrends(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new AppError('Not authenticated', 401);

    const patient = await requirePatient(userId);

    // Fetch all reports with a URL, ordered oldest-first
    const { data: reports, error } = await supabaseAdmin
      .from('patient_reports')
      .select('id, report_name, report_url, uploaded_at')
      .eq('patient_id', patient.id)
      .not('report_url', 'is', null)
      .order('uploaded_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch reports', 502);

    if (!reports || reports.length < 2) {
      throw new BadRequestError(
        'At least 2 reports are needed to analyse health trends.'
      );
    }

    // Check cache — bust if the number of reports has changed (new upload detected)
    const cached = trendsCache.get(patient.id);
    if (cached && cached.reportCount === reports.length) {
      sendSuccess(res, { ...cached.result, cached: true }, 'Health trends (cached)');
      return;
    }

    // Extract text from each PDF in parallel (silently skip failed ones)
    console.log(
      `[healthTrends] Extracting text from ${reports.length} PDFs for patient ${patient.id}`
    );
    const extracted = await Promise.all(
      reports.map(async (r) => ({
        name: r.report_name,
        date: (r.uploaded_at as string).split('T')[0],
        text: await extractTextSafe(r.report_url as string),
      }))
    );

    const usable = extracted.filter(
      (r): r is { name: string; date: string; text: string } => r.text !== null
    );

    if (usable.length < 2) {
      throw new AppError(
        'Not enough readable reports to analyse trends. Your reports may be scanned images without selectable text.',
        422
      );
    }

    console.log(
      `[healthTrends] Running trend analysis on ${usable.length} reports for patient ${patient.id}`
    );
    const result = await generateTrends(usable);

    trendsCache.set(patient.id, { result, reportCount: reports.length });
    sendSuccess(res, result, 'Health trends generated');
  } catch (err) {
    next(err);
  }
}
