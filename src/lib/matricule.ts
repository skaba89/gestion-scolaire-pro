import { apiClient } from "@/api/client";

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
  const { data: tenant } = await apiClient.get<any>(`/tenants/${tenantId}/`);

  const settings = tenant?.settings as Record<string, unknown> | null;
  const matriculeConfig: MatriculeConfig = {
    ...defaultConfig,
    ...(settings?.matricule as Partial<MatriculeConfig> || {}),
  };

  const fullYear = admissionYear || new Date().getFullYear().toString();

  let yearStr = "";
  if (admissionYear) {
    yearStr = admissionYear;
    if (matriculeConfig.yearFormat === "short") yearStr = yearStr.slice(-2);
  } else if (matriculeConfig.includeYear) {
    const currentYear = new Date().getFullYear().toString();
    yearStr = matriculeConfig.yearFormat === "full" ? currentYear : currentYear.slice(-2);
  }

  const finalPrefix = (matriculeConfig.useDepartmentCode && departmentCode)
    ? departmentCode.toUpperCase()
    : matriculeConfig.prefix;

  const separator = "-";

  let sequenceNumber = matriculeConfig.currentSequence;
  let sequenceKey = "global";

  if (matriculeConfig.useDepartmentCode && departmentCode) {
    sequenceKey = `${departmentCode.toUpperCase()}-${fullYear}`;
    const prefixPattern = `${departmentCode.toUpperCase()}${separator}${fullYear}${separator}`;

    try {
      const { data: lastStudent } = await apiClient.get<any[]>("/students/", {
        params: { tenant_id: tenantId, registration_number_prefix: prefixPattern, limit: "1" },
      });

      if (lastStudent?.[0]?.registration_number) {
        const parts = lastStudent[0].registration_number.split(separator);
        const lastSeqStr = parts[parts.length - 1];
        const lastSeq = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeq)) sequenceNumber = lastSeq + 1;
        else {
          const sequences = matriculeConfig.sequences || {};
          sequenceNumber = sequences[sequenceKey] || 1;
        }
      } else {
        const sequences = matriculeConfig.sequences || {};
        sequenceNumber = sequences[sequenceKey] || 1;
      }
    } catch {
      const sequences = matriculeConfig.sequences || {};
      sequenceNumber = sequences[sequenceKey] || 1;
    }
  }

  const sequenceStr = sequenceNumber.toString().padStart(matriculeConfig.sequenceLength, "0");

  let newMatricule = "";
  if (matriculeConfig.useDepartmentCode && departmentCode) {
    newMatricule = `${finalPrefix}${separator}${fullYear}${separator}${sequenceStr}`;
  } else {
    if (yearStr) {
      newMatricule = `${finalPrefix}${separator}${yearStr}${separator}${sequenceStr}`;
    } else {
      newMatricule = `${finalPrefix}${separator}${sequenceStr}`;
    }
  }

  // Update tenant settings with new sequence
  const newSequence = sequenceNumber + 1;
  const updatedSettings = { ...settings, matricule: { ...matriculeConfig } };
  if (sequenceKey === "global") {
    updatedSettings.matricule.currentSequence = newSequence;
  } else {
    if (!updatedSettings.matricule.sequences) updatedSettings.matricule.sequences = {};
    updatedSettings.matricule.sequences[sequenceKey] = newSequence;
  }

  await apiClient.patch(`/tenants/${tenantId}/`, { settings: updatedSettings });

  return newMatricule;
}

export function getMatriculeConfig(settings: Record<string, unknown> | null): MatriculeConfig {
  if (!settings?.matricule) return defaultConfig;
  return { ...defaultConfig, ...(settings.matricule as Partial<MatriculeConfig>) };
}
