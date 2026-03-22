import { supabase } from "@/integrations/supabase/client";

interface MatriculeConfig {
  prefix: string;
  includeYear: boolean;
  yearFormat: "full" | "short";
  sequenceLength: number;
  autoGenerate: boolean;
  currentSequence: number;
  useDepartmentCode?: boolean;
  sequences?: Record<string, number>;
}

const defaultConfig: MatriculeConfig = {
  prefix: "ETU",
  includeYear: true,
  yearFormat: "full",
  sequenceLength: 4,
  autoGenerate: true,
  currentSequence: 1,
  useDepartmentCode: false,
  sequences: {},
};

export async function generateMatricule(
  tenantId: string,
  departmentCode?: string,
  admissionYear?: string
): Promise<string> {
  // Fetch tenant settings
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();

  if (error) throw error;

  const settings = tenant?.settings as Record<string, unknown> | null;
  const matriculeConfig: MatriculeConfig = {
    ...defaultConfig,
    ...(settings?.matricule as Partial<MatriculeConfig> || {}),
  };

  // Determine year for sequence key (always use full year for key consistency)
  const fullYear = admissionYear || new Date().getFullYear().toString();

  // Determine year to use for the string
  let yearStr = "";
  if (admissionYear) {
    yearStr = admissionYear;
    if (matriculeConfig.yearFormat === "short") yearStr = yearStr.slice(-2);
  } else if (matriculeConfig.includeYear) {
    const currentYear = new Date().getFullYear().toString();
    yearStr = matriculeConfig.yearFormat === "full" ? currentYear : currentYear.slice(-2);
  }

  // Determine prefix
  const finalPrefix = (matriculeConfig.useDepartmentCode && departmentCode)
    ? departmentCode.toUpperCase()
    : matriculeConfig.prefix;

  const separator = "-";

  // Determine sequence to use
  let sequenceNumber = matriculeConfig.currentSequence;
  let sequenceKey = "global";

  if (matriculeConfig.useDepartmentCode && departmentCode) {
    sequenceKey = `${departmentCode.toUpperCase()}-${fullYear}`;

    // Check DB for last matricule with this prefix to ensure continuity
    // Pattern: DEPT-YEAR-%
    // We search for the highest number
    const prefixPattern = `${departmentCode.toUpperCase()}${separator}${fullYear}${separator}`;

    const { data: lastStudent, error: lastStudentError } = await supabase
      .from("students")
      .select("registration_number")
      .eq("tenant_id", tenantId)
      .ilike("registration_number", `${prefixPattern}%`)
      .order("registration_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastStudentError && lastStudent?.registration_number) {
      // Extract sequence from existing matricule
      const parts = lastStudent.registration_number.split(separator);
      const lastSeqStr = parts[parts.length - 1];
      const lastSeq = parseInt(lastSeqStr, 10);

      if (!isNaN(lastSeq)) {
        sequenceNumber = lastSeq + 1;
      } else {
        // Fallback if parsing fails
        const sequences = matriculeConfig.sequences || {};
        sequenceNumber = sequences[sequenceKey] || 1;
      }
    } else {
      // No student found, use config or start at 1
      const sequences = matriculeConfig.sequences || {};
      sequenceNumber = sequences[sequenceKey] || 1;
    }
  }

  // Build sequence string
  const sequenceStr = sequenceNumber
    .toString()
    .padStart(matriculeConfig.sequenceLength, "0");

  let newMatricule = "";

  if (matriculeConfig.useDepartmentCode && departmentCode) {
    // University Format: DEP-YEAR-SEQ
    newMatricule = `${finalPrefix}${separator}${fullYear}${separator}${sequenceStr}`;
  } else {
    // School Format: PREFIX-YEAR-SEQ or PREFIX-SEQ
    if (yearStr) {
      newMatricule = `${finalPrefix}${separator}${yearStr}${separator}${sequenceStr}`;
    } else {
      newMatricule = `${finalPrefix}${separator}${sequenceStr}`;
    }
  }

  // Increment sequence for next use (Legacy/Backup update)
  const newSequence = sequenceNumber + 1;
  const updatedSettings = {
    ...settings,
    matricule: {
      ...matriculeConfig,
    },
  };

  if (sequenceKey === "global") {
    updatedSettings.matricule.currentSequence = newSequence;
  } else {
    if (!updatedSettings.matricule.sequences) updatedSettings.matricule.sequences = {};
    updatedSettings.matricule.sequences[sequenceKey] = newSequence;
  }

  await supabase
    .from("tenants")
    .update({ settings: updatedSettings })
    .eq("id", tenantId);

  return newMatricule;
}

export function getMatriculeConfig(settings: Record<string, unknown> | null): MatriculeConfig {
  if (!settings?.matricule) return defaultConfig;
  return {
    ...defaultConfig,
    ...(settings.matricule as Partial<MatriculeConfig>),
  };
}
