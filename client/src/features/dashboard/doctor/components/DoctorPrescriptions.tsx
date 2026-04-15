import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { doctorService, type Prescription } from '@/services/doctor.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { PrescriptionWriter } from './PrescriptionWriter';
import {
  PrescriptionViewModal,
  normalizePrescriptionData,
  type PDFPrescriptionData,
} from '@/features/dashboard/shared/PrescriptionViewModal';

export const DoctorPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // PDF modal state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      const res = await doctorService.listPrescriptions();
      setPrescriptions((res as any).data?.prescriptions ?? []);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  // Fetcher passed to the modal — loads full detail from the doctor endpoint
  const fetchPDFData = useCallback(async (id: string): Promise<PDFPrescriptionData> => {
    const res = await doctorService.getPrescription(id);
    const raw = (res as any).data?.prescription;
    if (!raw) throw new Error('Prescription not found');
    return normalizePrescriptionData(raw);
  }, []);

  const openModal = (rxId: string) => {
    setSelectedRxId(rxId);
    setViewModalOpen(true);
  };

  // ── Writer mode ────────────────────────────────────────────────────────────

  if (creating) {
    return (
      <PrescriptionWriter
        onCancel={() => setCreating(false)}
        onSuccess={() => {
          setCreating(false);
          fetchPrescriptions();
        }}
      />
    );
  }

  // ── List mode ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-light tracking-tight">Prescriptions</h1>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Prescription
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
            No prescriptions issued yet.
          </div>
        ) : (
          <div className="space-y-3">
            {prescriptions.map((rx) => (
              <div key={rx.id} className="bg-card rounded-xl border overflow-hidden">
                <div className="w-full flex items-center justify-between p-5">
                  <button
                    className="flex-1 flex items-center justify-between text-left"
                    onClick={() => setExpandedId(expandedId === rx.id ? null : rx.id)}
                  >
                    <div>
                      <p className="font-medium">{rx.illness_description ?? 'Prescription'}</p>
                      <p className="text-sm text-muted-foreground">
                        Patient: {(rx as any).patients?.full_name ?? rx.patient_id} ·{' '}
                        {format(parseISO(rx.issued_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {expandedId === rx.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground mx-3" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground mx-3" />
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                    onClick={() => openModal(rx.id)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    View PDF
                  </Button>
                </div>

                {expandedId === rx.id && (
                  <div className="border-t px-5 pb-5 space-y-2">
                    {(rx.prescription_items ?? []).map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between py-2 border-b last:border-0 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {item.medicines?.medicine_name ?? item.medicine_id}
                          </p>
                          {item.doctor_comment && (
                            <p className="text-xs text-muted-foreground">{item.doctor_comment}</p>
                          )}
                        </div>
                        <div className="text-right text-muted-foreground text-xs space-y-0.5">
                          <p>{item.dosage}</p>
                          <p>
                            {item.frequency} · {item.duration}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(rx.prescription_items ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">No medicine items</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRxId && (
        <PrescriptionViewModal
          open={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          prescriptionId={selectedRxId}
          label="Prescription Preview"
          fetchData={fetchPDFData}
        />
      )}
    </>
  );
};
