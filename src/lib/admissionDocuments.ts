/**
 * Pièces à fournir pour une candidature — source unique partagée par la page d'informations
 * d'admission et le formulaire de candidature (2026-11-25 : la page d'informations en annonçait
 * six, inventées, quand le formulaire en exigeait deux ou quatre). Libellés = clés i18n.
 */
export interface RequiredDocument {
  type: string;
  label: string;
}

export const BASE_REQUIRED_DOCUMENTS: RequiredDocument[] = [
  { type: "birth_certificate", label: "publicJourney.form.docs.birth" },
  { type: "id_photo", label: "publicJourney.form.docs.photo" },
];

// Un candidat qui postule à un niveau autre que le tout premier de l'établissement est considéré
// comme un transfert : on exige en plus le dossier scolaire de l'année précédente.
export const TRANSFER_REQUIRED_DOCUMENTS: RequiredDocument[] = [
  { type: "previous_transcript", label: "publicJourney.form.docs.transcript" },
  { type: "previous_school_certificate", label: "publicJourney.form.docs.certificate" },
];

export function getRequiredDocuments(
  levelId: string,
  levels: { id: string; order_index?: number | null }[] | undefined,
): RequiredDocument[] {
  if (!levelId || !levels || levels.length === 0) return BASE_REQUIRED_DOCUMENTS;
  const sorted = [...levels].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const isEntryLevel = sorted[0]?.id === levelId;
  return isEntryLevel ? BASE_REQUIRED_DOCUMENTS : [...BASE_REQUIRED_DOCUMENTS, ...TRANSFER_REQUIRED_DOCUMENTS];
}
