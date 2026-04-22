import type { Request, Response, NextFunction } from 'express';

// pdf-parse v1.x runs a test-file at require-time which can crash in
// serverless bundles (Vercel). Lazy-load it to surface a clear error instead.
let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
async function getPdfParse() {
  if (!_pdfParse) {
    const mod = await import('pdf-parse');
    _pdfParse = (mod.default ?? mod) as unknown as (buf: Buffer) => Promise<{ text: string }>;
  }
  return _pdfParse;
}
import { supabaseAdmin } from '../../config/supabase.js';
import { requirePatient } from '../../utils/lookup.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError, NotFoundError } from '../../utils/errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'hi';

// ─── In-memory cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  analysisText: string;
  audioBase64: string;
}

/** Cache key includes language so EN and HI results are stored separately. */
const reportCache = new Map<string, CacheEntry>();
const cacheKey = (reportId: string, lang: Lang) => `${reportId}:${lang}`;

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractTextFromPDF(reportUrl: string): Promise<string> {
  console.log(`[reportSpeak] Fetching PDF from: ${reportUrl.slice(0, 80)}...`);
  const res = await fetch(reportUrl);
  if (!res.ok) {
    throw new AppError(`Failed to fetch report PDF: ${res.status} ${res.statusText}`, 502);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const pdfParse = await getPdfParse();
  const parsed = await pdfParse(buffer);
  const text = parsed.text?.trim() ?? '';
  if (!text) {
    throw new AppError('Could not extract any text from the PDF. The file may be a scanned image without selectable text.', 422);
  }
  return text;
}

// ─── OpenRouter analysis ──────────────────────────────────────────────────────

async function analyseReport(extractedText: string, reportName: string, lang: Lang): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[reportSpeak] OPENROUTER_API_KEY is missing from environment variables!');
    throw new AppError('OpenRouter API key not configured', 503);
  }

  // Truncate to stay within token limits (~6000 chars ≈ ~1500 tokens)
  const truncated = extractedText.slice(0, 6000);

  const systemPromptEn =
    'You are an expert medical analyst. A patient has uploaded a medical report and wants to understand the most important takeaways. ' +
    'Your job is NOT to read or repeat the report — your job is to ANALYSE it and surface what actually matters. ' +
    'Do the following: ' +
    'First, identify the type and purpose of the report in one sentence. ' +
    'Second, highlight ONLY the clinically significant findings — abnormal values, confirmed diagnoses, critical markers, or anything that deviates from normal ranges. Skip all normal or unremarkable results entirely. ' +
    'Third, flag anything the patient should act on: follow-up tests, lifestyle changes, medications mentioned, or results that need a doctor\'s attention. ' +
    'Fourth, close with a single plain-language bottom line the patient can remember. ' +
    'Rules: plain prose only — no bullet points, no asterisks, no markdown, no numbering. ' +
    'Speak directly to the patient using "your". Keep the total response under 350 words. ' +
    'If a value is abnormal, say whether it is high or low and briefly explain what that generally means in simple terms.';

  const systemPromptHi =
    'You are a friendly medical expert explaining a patient\'s report in simple Hinglish — a natural mix of Hindi and English the way educated Indians actually speak in daily life. ' +
    'Your job is NOT to read the report — ANALYSE it and tell the patient only what truly matters. ' +
    'CRITICAL LANGUAGE RULES: ' +
    'Write in conversational Hinglish. Use short, easy Hindi words mixed freely with common English medical terms. Never use formal or literary Hindi words that people don\'t use in everyday speech (for example, avoid words like "nैदानिक", "अनुवर्ती", "संकेतक", "उल्लेखनीय" — instead say things like "important finding hai", "follow-up karna hoga", "dhyan dena hoga"). ' +
    'ABBREVIATION RULE: Never say any abbreviation or short form. Always say the full name. For example: never say "CBC" — say "Complete Blood Count"; never say "BP" — say "Blood Pressure"; never say "RBC" — say "Red Blood Cells"; never say "WBC" — say "White Blood Cells"; never say "Hb" — say "Haemoglobin"; never say "FBS" — say "Fasting Blood Sugar"; never say "TSH" — say "Thyroid Stimulating Hormone"; and so on for every abbreviation in the report. ' +
    'Do the following: ' +
    'First, one sentence mein batao ki yeh kaun si report hai aur kyun ki gayi thi. ' +
    'Second, sirf woh findings batao jo abnormal hain ya dhyan dene layak hain — normal results skip karo. Agar koi value high ya low hai toh clearly batao aur simple language mein samjhao ki iska kya matlab hota hai. ' +
    'Third, batao patient ko ab kya karna chahiye — koi follow-up test, doctor se milna, koi lifestyle change, ya koi dawai jo mention ki gayi ho. ' +
    'Fourth, ek simple bottom line do jo patient yaad rakh sake. ' +
    'Rules: plain conversational prose only — no bullet points, no asterisks, no markdown, no numbering. ' +
    'Patient se directly "aapka / aapki / aap" use karke baat karo. Total response 350 words se kam rakho.';

  const messages = [
    {
      role: 'system' as const,
      content: lang === 'hi' ? systemPromptHi : systemPromptEn,
    },
    {
      role: 'user' as const,
      content: `Report name: ${reportName}\n\nFull report content:\n${truncated}`,
    },
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://medinexus.app',
      'X-Title': 'mediNexus Report Audio Analysis',
    },
    body: JSON.stringify({
      model: 'arcee-ai/trinity-large-preview:free',
      messages,
      reasoning: { enabled: true },
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[reportSpeak] OpenRouter error:', errText);
    throw new AppError('AI analysis service returned an error', 502);
  }

  const data = await res.json() as any;
  const reply: string =
    data?.choices?.[0]?.message?.content?.trim() ??
    'Analysis could not be generated. Please try again.';
  return reply;
}

// ─── Sarvam Bulbul v3 TTS ─────────────────────────────────────────────────────

/** Split text into ≤490-char chunks at sentence boundaries. */
function chunkText(text: string, maxLen = 490): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('. ', maxLen);
    if (cut === -1) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut === -1) cut = maxLen;
    else cut += 1;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

async function ttsChunk(text: string, lang: Lang): Promise<Buffer> {
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) {
    console.error('[reportSpeak] SARVAM_API_KEY is missing from environment variables!');
    throw new AppError('Sarvam API key not configured', 503);
  }

  console.log(`[reportSpeak] Calling Sarvam TTS (${text.length} chars, lang=${lang})`);
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': sarvamKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: lang === 'hi' ? 'hi-IN' : 'en-IN',
      speaker: lang === 'hi' ? 'priya' : 'aditya',
      model: 'bulbul:v3',
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[reportSpeak] Sarvam TTS error (${res.status}):`, txt);
    throw new AppError(`Sarvam TTS failed: ${txt}`, 502);
  }
  const data = await res.json() as any;
  const audioB64: string | undefined = Array.isArray(data?.audios) ? data.audios[0] : undefined;
  if (!audioB64) {
    console.error('[reportSpeak] Sarvam TTS returned no audio. Response:', JSON.stringify(data).slice(0, 500));
    throw new AppError('Sarvam TTS returned no audio', 502);
  }
  return Buffer.from(audioB64, 'base64');
}

async function textToSpeech(analysisText: string, lang: Lang): Promise<string> {
  const chunks = chunkText(analysisText);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    buffers.push(await ttsChunk(chunk, lang));
  }

  if (buffers.length === 1) return buffers[0].toString('base64');

  // Stitch multiple WAV buffers: concatenate PCM data, rewrite header sizes
  const WAV_HEADER_SIZE = 44;
  const pcmChunks = buffers.map((b) => b.subarray(WAV_HEADER_SIZE));
  const totalPcm = Buffer.concat(pcmChunks);
  const header = Buffer.from(buffers[0].subarray(0, WAV_HEADER_SIZE));
  header.writeUInt32LE(totalPcm.length + WAV_HEADER_SIZE - 8, 4);
  header.writeUInt32LE(totalPcm.length, 40);
  return Buffer.concat([header, totalPcm]).toString('base64');
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function reportSpeak(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) throw new AppError('Not authenticated', 401);

    const { reportId: reportIdParam } = req.params;
    if (!reportIdParam) throw new BadRequestError('reportId param is required');
    const reportId = Array.isArray(reportIdParam) ? reportIdParam[0] : reportIdParam;

    const rawLang = req.body?.lang;
    const lang: Lang = rawLang === 'hi' ? 'hi' : 'en';

    // ── 1. Cache check ──────────────────────────────────────────────────
    const key = cacheKey(reportId, lang);
    const cached = reportCache.get(key);
    if (cached) {
      sendSuccess(res, { audio_base64: cached.audioBase64, analysis_text: cached.analysisText }, 'Report audio (cached)');
      return;
    }

    // ── 2. Verify patient owns the report ───────────────────────────────
    const patient = await requirePatient(userId);

    const { data: report, error: reportErr } = await supabaseAdmin
      .from('patient_reports')
      .select('id, report_name, report_url, patient_id')
      .eq('id', reportId)
      .single();

    if (reportErr || !report) throw new NotFoundError('Report not found');
    if (report.patient_id !== patient.id) throw new AppError('Forbidden', 403);
    if (!report.report_url) throw new BadRequestError('Report has no associated file URL');

    // ── 3. Extract text from PDF ────────────────────────────────────────
    console.log(`[reportSpeak] Extracting text from PDF for report ${reportId}`);
    const extractedText = await extractTextFromPDF(report.report_url);
    console.log(`[reportSpeak] Extracted ${extractedText.length} chars`);

    // ── 4. AI analysis ──────────────────────────────────────────────────
    console.log(`[reportSpeak] Running AI analysis for report ${reportId} (lang=${lang})`);
    const analysisText = await analyseReport(extractedText, report.report_name, lang);

    // ── 5. TTS ──────────────────────────────────────────────────────────
    console.log(`[reportSpeak] Generating TTS for report ${reportId} (lang=${lang})`);
    const audioBase64 = await textToSpeech(analysisText, lang);

    // ── 6. Cache & respond ──────────────────────────────────────────────
    reportCache.set(key, { analysisText, audioBase64 });
    sendSuccess(res, { audio_base64: audioBase64, analysis_text: analysisText }, 'Report audio generated');
  } catch (err) {
    next(err);
  }
}
