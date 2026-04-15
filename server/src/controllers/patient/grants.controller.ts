import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

// ─── Schema note ─────────────────────────────────────────────────────────────
//
// The `record_access_grants` table was created with:
//   id, patient_id, granted_to_hospital_id, granted_to_doctor_id,
//   record_types TEXT[], valid_until, created_at
//
// The columns document_type / document_id / source have NOT been applied to
// the live DB yet.  Until that migration runs we encode document info inside
// record_types as a two-element array:
//   record_types[0] = document type  ('prescription' | 'report')
//   record_types[1] = document id    (UUID string)
//   record_types[2] = source         ('manual' | 'booking' | 'referral')  [optional, default 'manual']
//
// This lets us store and retrieve all information we need without any DDL.

// ─── Types ───────────────────────────────────────────────────────────

interface DocumentInput {
  document_type: 'prescription' | 'report';
  document_id: string;
}

interface CreateGrantBody {
  granted_to_doctor_id: string;
  documents: DocumentInput[];
  valid_days?: number;
  source?: 'manual' | 'booking' | 'referral';
}

// ─── Codec helpers ────────────────────────────────────────────────────────────

function encodeGrant(docType: string, docId: string, source = 'manual'): string[] {
  return [docType, docId, source];
}

function decodeGrant(record_types: string[]): { document_type: string; document_id: string; source: string } {
  return {
    document_type: record_types[0] ?? '',
    document_id:   record_types[1] ?? '',
    source:        record_types[2] ?? 'manual',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function enrichGrants(grants: any[]) {
  if (grants.length === 0) return [];

  // Decode record_types into document_type / document_id / source
  const decoded = grants.map(g => ({
    ...g,
    ...decodeGrant(g.record_types ?? []),
  }));

  // Collect unique doctor IDs
  const doctorIds = [...new Set(decoded.map((g: any) => g.granted_to_doctor_id).filter(Boolean))];
  const prescriptionIds = decoded.filter(g => g.document_type === 'prescription').map(g => g.document_id).filter(Boolean);
  const reportIds = decoded.filter(g => g.document_type === 'report').map(g => g.document_id).filter(Boolean);

  const [doctorsResult, prescriptionsResult, reportsResult] = await Promise.all([
    doctorIds.length > 0
      ? supabaseAdmin.from('doctors').select('id, full_name, specialisation, hospitals ( name, city )').in('id', doctorIds)
      : Promise.resolve({ data: [] }),
    prescriptionIds.length > 0
      ? supabaseAdmin.from('prescriptions').select('id, illness_description, issued_at, doctors ( full_name )').in('id', prescriptionIds)
      : Promise.resolve({ data: [] }),
    reportIds.length > 0
      ? supabaseAdmin.from('patient_reports').select('id, report_name, report_type, uploaded_at').in('id', reportIds)
      : Promise.resolve({ data: [] }),
  ]);

  const doctorMap: Record<string, any> = {};
  for (const d of (doctorsResult.data ?? [])) doctorMap[d.id] = d;

  const prescriptionMap: Record<string, any> = {};
  for (const p of (prescriptionsResult.data ?? [])) prescriptionMap[p.id] = p;

  const reportMap: Record<string, any> = {};
  for (const r of (reportsResult.data ?? [])) reportMap[r.id] = r;

  return decoded.map((g: any) => ({
    ...g,
    doctor: g.granted_to_doctor_id ? (doctorMap[g.granted_to_doctor_id] ?? null) : null,
    document: g.document_id
      ? (g.document_type === 'prescription' ? prescriptionMap[g.document_id] : reportMap[g.document_id]) ?? null
      : null,
    is_active: new Date(g.valid_until) > new Date(),
  }));
}

// ─── Controllers ─────────────────────────────────────────────────────

/**
 * GET /api/patients/me/grants
 */
export async function listAccessGrants(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    const { data, error } = await supabaseAdmin
      .from('record_access_grants')
      .select('id, patient_id, granted_to_hospital_id, granted_to_doctor_id, record_types, valid_until, created_at')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listAccessGrants] query failed:', error.message);
      throw new AppError('Failed to fetch access grants', 500);
    }

    const enriched = await enrichGrants(data ?? []);
    sendSuccess(res, { grants: enriched }, 'Access grants retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients/me/grants
 * Creates one grant row per document, encoding doc info in record_types[].
 */
export async function createAccessGrant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const {
      granted_to_doctor_id,
      documents,
      valid_days = 30,
      source = 'manual',
    } = req.body as CreateGrantBody;

    if (!granted_to_doctor_id) throw new BadRequestError('granted_to_doctor_id is required');
    if (!documents || documents.length === 0) throw new BadRequestError('At least one document must be specified');
    if (valid_days < 1 || valid_days > 365) throw new BadRequestError('valid_days must be between 1 and 365');

    // Verify doctor exists
    const { data: doctor, error: doctorError } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name, specialisation, hospital_id, hospitals ( name )')
      .eq('id', granted_to_doctor_id)
      .single();

    if (doctorError || !doctor) throw new NotFoundError('Doctor not found');

    // Verify all documents belong to this patient
    for (const doc of documents) {
      if (doc.document_type === 'prescription') {
        const { data: rx } = await supabaseAdmin
          .from('prescriptions')
          .select('id')
          .eq('id', doc.document_id)
          .eq('patient_id', patient.id)
          .maybeSingle();
        if (!rx) throw new BadRequestError(`Prescription ${doc.document_id} not found or does not belong to you`);
      } else if (doc.document_type === 'report') {
        const { data: rpt } = await supabaseAdmin
          .from('patient_reports')
          .select('id')
          .eq('id', doc.document_id)
          .eq('patient_id', patient.id)
          .maybeSingle();
        if (!rpt) throw new BadRequestError(`Report ${doc.document_id} not found or does not belong to you`);
      } else {
        throw new BadRequestError(`Invalid document_type: ${doc.document_type}`);
      }
    }

    const validUntil = new Date(Date.now() + valid_days * 24 * 60 * 60 * 1000).toISOString();

    // Remove existing grants for same doctor + same documents to avoid duplicates
    // We identify them by checking record_types[0] (type) and record_types[1] (id)
    const { data: existing } = await supabaseAdmin
      .from('record_access_grants')
      .select('id, record_types')
      .eq('patient_id', patient.id)
      .eq('granted_to_doctor_id', granted_to_doctor_id);

    const docIds = new Set(documents.map(d => d.document_id));
    const toDelete = (existing ?? [])
      .filter(g => {
        const decoded = decodeGrant(g.record_types ?? []);
        return docIds.has(decoded.document_id);
      })
      .map(g => g.id);

    if (toDelete.length > 0) {
      await supabaseAdmin
        .from('record_access_grants')
        .delete()
        .in('id', toDelete);
    }

    // Create one row per document — encode doc info in record_types AND
    // populate dedicated columns so new readers don't need to decode the array.
    const rows = documents.map(doc => ({
      patient_id:             patient.id,
      granted_to_doctor_id,
      granted_to_hospital_id: doctor.hospital_id,
      record_types:           encodeGrant(doc.document_type, doc.document_id, source),
      document_type:          doc.document_type,
      document_id:            doc.document_id,
      valid_until:            validUntil,
      created_at:             new Date().toISOString(),
    }));

    const { data: created, error: insertError } = await supabaseAdmin
      .from('record_access_grants')
      .insert(rows)
      .select();

    if (insertError || !created) {
      console.error('[createAccessGrant] insert failed:', insertError?.message);
      throw new AppError('Failed to create access grants', 500);
    }

    const enriched = await enrichGrants(created);
    sendSuccess(
      res,
      { grants: enriched },
      `${documents.length} document(s) shared with Dr. ${doctor.full_name} for ${valid_days} days`,
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/patients/me/grants/:grantId
 */
export async function revokeAccessGrant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { grantId } = req.params as { grantId: string };

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('record_access_grants')
      .select('id, patient_id')
      .eq('id', grantId)
      .eq('patient_id', patient.id)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Access grant not found');

    const { error } = await supabaseAdmin
      .from('record_access_grants')
      .delete()
      .eq('id', grantId);

    if (error) {
      console.error('[revokeAccessGrant] delete failed:', error.message);
      throw new AppError('Failed to revoke access grant', 500);
    }

    sendSuccess(res, null, 'Access grant revoked');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/patients/me/grants/doctor/:doctorId
 */
export async function revokeAllGrantsForDoctor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { doctorId } = req.params as { doctorId: string };

    const { error, count } = await supabaseAdmin
      .from('record_access_grants')
      .delete()
      .eq('patient_id', patient.id)
      .eq('granted_to_doctor_id', doctorId);

    if (error) {
      console.error('[revokeAllGrantsForDoctor] delete failed:', error.message);
      throw new AppError('Failed to revoke grants', 500);
    }

    sendSuccess(res, { revoked: count ?? 0 }, 'All grants for this doctor revoked');
  } catch (err) {
    next(err);
  }
}
