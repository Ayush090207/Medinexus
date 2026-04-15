import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  Search,
  X,
  User,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  uploadPatientReport,
  searchHospitalPatients,
  listPatientReportsForAdmin,
  type HospitalPatient,
  type PatientReport,
} from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = 'lab' | 'radiology' | 'pathology' | 'discharge_summary' | 'other';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  lab: 'Lab Report',
  radiology: 'Radiology',
  pathology: 'Pathology',
  discharge_summary: 'Discharge Summary',
  other: 'Other',
};

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_MB = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminReports = () => {
  // ── Patient search ──
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<HospitalPatient[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<HospitalPatient | null>(null);
  const patientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Existing reports for selected patient ──
  const [existingReports, setExistingReports] = useState<PatientReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // ── Upload form ──
  const [reportName, setReportName] = useState('');
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Debounced patient search ──
  useEffect(() => {
    if (patientQuery.length < 2) {
      setPatientResults([]);
      return;
    }
    if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current);
    patientDebounceRef.current = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await searchHospitalPatients(patientQuery);
        setPatientResults((res as any).data?.patients ?? []);
      } catch {
        setPatientResults([]);
      } finally {
        setPatientSearching(false);
      }
    }, 300);
    return () => { if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current); };
  }, [patientQuery]);

  // ── Load existing reports when a patient is selected ──
  useEffect(() => {
    if (!selectedPatient) {
      setExistingReports([]);
      return;
    }
    setLoadingReports(true);
    listPatientReportsForAdmin(selectedPatient.id)
      .then(res => setExistingReports((res as any).data?.reports ?? []))
      .catch(() => setExistingReports([]))
      .finally(() => setLoadingReports(false));
  }, [selectedPatient]);

  const selectPatient = (p: HospitalPatient) => {
    setSelectedPatient(p);
    setPatientQuery('');
    setPatientResults([]);
    setSuccess(false);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setPatientQuery('');
    setPatientResults([]);
    setExistingReports([]);
    resetForm();
  };

  const resetForm = () => {
    setReportName('');
    setReportType('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('Only PDF, JPEG, PNG, or WebP files are allowed.');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File must be smaller than ${MAX_FILE_MB} MB.`);
      e.target.value = '';
      return;
    }
    setFile(f);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return toast.error('Please select a patient first.');
    if (!reportName.trim()) return toast.error('Report name is required.');
    if (!reportType) return toast.error('Report type is required.');
    if (!file) return toast.error('Please choose a file to upload.');

    setUploading(true);
    setSuccess(false);

    try {
      await uploadPatientReport(selectedPatient.id, {
        report_name: reportName.trim(),
        report_type: reportType,
        file,
      });
      toast.success(`Report uploaded for ${selectedPatient.full_name}.`);
      setSuccess(true);
      resetForm();
      // Refresh the reports list
      const res = await listPatientReportsForAdmin(selectedPatient.id);
      setExistingReports((res as any).data?.reports ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-500 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Patient Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload lab results, scans, or any medical report. The patient will see it in their Health Passport.
        </p>
      </div>

      {/* ── Step 1: Select patient ── */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          1. Select Patient
        </h2>

        {selectedPatient ? (
          <div className="flex items-center justify-between bg-primary/5 border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{selectedPatient.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPatient.phone_number ?? selectedPatient.email ?? selectedPatient.id}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearPatient}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search by patient name or phone number..."
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            {patientSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {patientResults.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {patientResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                    onClick={() => selectPatient(p)}
                  >
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.phone_number ?? p.email ?? p.id}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {!patientSearching && patientQuery.length >= 2 && patientResults.length === 0 && (
              <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-sm px-4 py-2.5 text-sm text-muted-foreground">
                No patients found. Only patients with appointments at your hospital are searchable.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Step 2: Upload form (only when a patient is selected) ── */}
      {selectedPatient && (
        <div className="bg-card rounded-xl border p-6 space-y-5">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            2. Upload Report
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Report name */}
            <div className="space-y-1.5">
              <Label htmlFor="reportName">Report Name</Label>
              <Input
                id="reportName"
                placeholder="e.g. Complete Blood Count, Chest X-Ray"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
              />
            </div>

            {/* Report type */}
            <div className="space-y-1.5">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(REPORT_TYPE_LABELS) as [ReportType, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* File picker */}
            <div className="space-y-1.5">
              <Label>File</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:bg-muted/30 ${
                  file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8 opacity-40" />
                    <p className="text-sm">Click to choose a file</p>
                    <p className="text-xs">PDF, JPEG, PNG or WebP · max {MAX_FILE_MB} MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={uploading} className="min-w-[140px]">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Report
                  </>
                )}
              </Button>
              {success && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Uploaded successfully
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── Step 3: Existing reports for patient ── */}
      {selectedPatient && (
        <div className="bg-card rounded-xl border p-6 space-y-4">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Previously Uploaded Reports
          </h2>

          {loadingReports ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading reports…
            </div>
          ) : existingReports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No reports uploaded yet for {selectedPatient.full_name}.
            </p>
          ) : (
            <div className="divide-y">
              {existingReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{report.report_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {report.report_type.replace('_', ' ')} ·{' '}
                        {format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <a
                    href={report.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                  >
                    View
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
