import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audit des langues (2026-11-13) : en anglais ou en arabe, les portails
 * restaient en français, faute de traduction des textes écrits en dur.
 * Pour chaque dossier déjà traduit, cette garde refuse tout nouveau texte
 * d'interface en dur (texte JSX, placeholder/title/aria-label/alt,
 * notifications). Ajouter un dossier ici quand son lot de traduction est fait.
 */
const GUARDED = [
    "src/pages/student",
    "src/pages/parent",
    "src/pages/alumni",
    "src/components/student",
    "src/components/parent",
    "src/components/dashboard/parent",
    "src/components/layouts",
    "src/components/messages/MessengerInterface.tsx",
    "src/components/reminders/ReminderSystem.tsx",
    "src/components/attendance/AttendanceHistory.tsx",
    "src/components/attendance/CheckInHistoryList.tsx",
    "src/components/homework/HomeworkSubmissionDialog.tsx",
    "src/components/collaboration/SharedNotes.tsx",
    "src/components/collaboration/CollaborativeTools.tsx",
    "src/components/dashboard/ParentChildCard.tsx",
    "src/pages/teacher",
    "src/components/teacher",
    "src/components/offline/OfflineAttendance.tsx",
    "src/components/dashboard/TeacherDashboardCharts.tsx",
    "src/components/badges/QRScanner.tsx",
    "src/components/announcements/RecentAnnouncements.tsx",
    "src/features/homework/components",
    "src/pages/department",
    "src/components/dashboard/DepartmentDashboardCharts.tsx",
    "src/pages/admin/Dashboard.tsx",
    "src/pages/admin/Analytics.tsx",
    "src/pages/admin/AIInsights.tsx",
    "src/pages/admin/DecisionDashboard.tsx",
    "src/pages/admin/MinistryDashboard.tsx",
    "src/components/dashboard/DashboardCharts.tsx",
    "src/components/dashboard/DashboardSkeleton.tsx",
    "src/components/onboarding/OnboardingTour.tsx",
    "src/components/admin/security/SecurityAlerts.tsx",
    "src/components/dashboard/widgets/StudentsAtRiskWidget.tsx",
    "src/components/dashboard/AnalyticsReportButton.tsx",
    "src/components/admin/analytics",
    "src/components/admin/ai",
    "src/pages/admin/Admissions.tsx",
    "src/pages/admin/Students.tsx",
    "src/pages/admin/ClassLists.tsx",
    "src/pages/admin/Enrollments.tsx",
    "src/components/students",
    "src/components/admin/students",
    "src/components/admin/admissions",
    "src/components/enrollments",
    "src/components/ui/DataTablePagination.tsx",
];

/** Noms propres et codes affichés tels quels. */
const ALLOWED = new Set([
    "Academy Guinéenne", "SUPER ADMIN", "Super Admin", "CinetPay", "Mobile Money (PayTech)",
    "Wave · Orange Money · MTN", "LinkedIn", "QR", "PDF", "GNF",
]);

const root = process.cwd();
function files(target: string): string[] {
    const abs = resolve(root, target);
    if (statSync(abs).isFile()) return [target];
    return readdirSync(abs).flatMap((name) => {
        const rel = join(target, name);
        if (name === "__tests__") return [];
        if (statSync(resolve(root, rel)).isDirectory()) return files(rel);
        return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [rel] : [];
    });
}

const WORD = /[A-Za-zÀ-ÿ]{3,}/;
function findings(source: string): string[] {
    const code = source
        // Documents officiels rédigés en français (ex. déclaration MEN) :
        // zone délimitée par i18n-official-start / i18n-official-end.
        .replace(/i18n-official-start[\s\S]*?i18n-official-end/g, "")
        // Contenu volontairement non traduit, avec sa raison en commentaire.
        .replace(/i18n-ignore-start[\s\S]*?i18n-ignore-end/g, "")
        .replace(/^import[\s\S]*?;$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .split("\n")
        .map((line) => (/^\s*\/\//.test(line) ? "" : line))
        .join("\n");
    const out: string[] = [];
    // Texte JSX entre balises : >Texte<
    // (?<![=-]) : exclut les flèches « => Promise<…> ».
    for (const m of code.matchAll(/(?<![=-])>([^<>{}`]*?)</g)) {
        const text = m[1].trim();
        if (text && WORD.test(text) && !/[(){};=&|?$]/.test(text)) out.push(text);
    }
    // Ligne de texte seule à l'intérieur du JSX
    for (const m of code.matchAll(/\n[ \t]+([A-ZÀ-Ü][^<>{}=;()`'"|&?:,\n]*[ \t][^<>{}=;()`'"|&?:,\n]*)\n/g)) {
        out.push(m[1].trim());
    }
    // Attributs et notifications
    for (const m of code.matchAll(/\b(?:placeholder|title|aria-label|alt|recipientLabel|portalName|content|heading|tooltip)="([^"]*)"/g)) {
        if (WORD.test(m[1])) out.push(m[1]);
    }
    for (const m of code.matchAll(/toast\.(?:success|error|info|warning)\(\s*["'`]([^"'`]+)["'`]/g)) out.push(m[1]);
    // Gabarits `${t("…")}` : déjà traduits.
    return out.filter((text) => !ALLOWED.has(text) && !text.startsWith("${"));
}

describe("translated folders have no hard-coded interface text", () => {
    it.each(GUARDED.flatMap(files))("%s", (file) => {
        expect(findings(readFileSync(resolve(root, file), "utf8"))).toEqual([]);
    });
});
