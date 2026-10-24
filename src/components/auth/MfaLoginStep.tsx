import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Copy, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Second login step, shared by the generic (/auth) and tenant (/:slug/auth)
 * login pages:
 * - "challenge": the account has MFA — exchange mfa_token + a TOTP/backup
 *   code for the session (POST /mfa/login/verify/);
 * - "setup": privileged account without MFA while the platform enforces it —
 *   enroll an authenticator app first (POST /mfa/setup/enroll|verify/), which
 *   then opens the session.
 */
type MfaLoginStepProps = {
  mode: "challenge" | "setup";
  token: string;
  tenantId?: string | null;
  onSuccess: (profileData: unknown) => void;
  onCancel: () => void;
  /** Submit button color (tenant branding); defaults to the theme primary. */
  accentColor?: string;
};

// TOTP: 6 digits. Backup code (challenge only): 8 hex chars, shown as
// XXXX-XXXX — the backend ignores case and the dash (_hash_code in mfa.py).
const TOTP_CODE = /^\d{6}$/;
const BACKUP_CODE = /^[0-9A-F]{8}$/;

export function MfaLoginStep({ mode, token, tenantId, onSuccess, onCancel, accentColor }: MfaLoginStepProps) {
  const { t } = useTranslation();
  const { completeMfaLogin, startMfaSetup, completeMfaSetup } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  // null = no error; "" = failure without a server message (generic text).
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "setup") return;
    let cancelled = false;
    startMfaSetup(token).then(({ error, secret, uri }) => {
      if (cancelled) return;
      if (error || !secret || !uri) {
        setEnrollmentError(error?.message || "");
      } else {
        setEnrollment({ secret, uri });
      }
    });
    return () => {
      cancelled = true;
    };
    // Deliberately not depending on `t`: a language change must not restart
    // the enrollment (it would replace the pending secret already scanned).
  }, [mode, token, startMfaSetup]);

  const acceptsBackupCode = mode === "challenge";
  const normalizeCode = (value: string) =>
    acceptsBackupCode
      ? value.toUpperCase().replace(/[^0-9A-F-]/g, "").slice(0, 9)
      : value.replace(/\D/g, "").slice(0, 6);
  const codeIsComplete =
    TOTP_CODE.test(code) || (acceptsBackupCode && BACKUP_CODE.test(code.replace(/-/g, "")));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!codeIsComplete) return;

    setSubmitting(true);
    try {
      const { error, profileData } = mode === "setup"
        ? await completeMfaSetup(token, code, tenantId)
        : await completeMfaLogin(token, code, tenantId);
      if (error) {
        toast({
          title: t("auth.mfa.invalidCode"),
          description: error.message || t("auth.mfa.invalidCodeDescription"),
          variant: "destructive",
        });
        setCode("");
        return;
      }
      onSuccess(profileData);
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast({ title: t("auth.mfa.keyCopied") });
    } catch {
      toast({ title: t("auth.mfa.copyFailed"), description: t("auth.mfa.copyFailedDescription"), variant: "destructive" });
    }
  };

  const waitingForEnrollment = mode === "setup" && !enrollment;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {mode === "setup" ? t("auth.mfa.setupTitle") : t("auth.mfa.challengeTitle")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {mode === "setup" ? t("auth.mfa.setupDescription") : t("auth.mfa.challengeDescription")}
        </p>
      </div>

      {mode === "setup" && (
        enrollmentError !== null ? (
          <p role="alert" className="text-sm text-destructive">{enrollmentError || t("auth.mfa.setupStartFailed")}</p>
        ) : enrollment ? (
          <div className="space-y-3">
            <div className="flex justify-center rounded-xl border bg-white p-4">
              <QRCodeSVG value={enrollment.uri} size={192} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("auth.mfa.manualKey")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{enrollment.secret}</code>
                <Button type="button" variant="ghost" size="icon" onClick={copySecret} aria-label={t("auth.mfa.copyKey")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="mfa-code">{t("auth.mfa.codeLabel")}</Label>
          <Input
            id="mfa-code"
            inputMode={acceptsBackupCode ? "text" : "numeric"}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            autoFocus
            autoComplete="one-time-code"
            disabled={waitingForEnrollment || enrollmentError !== null}
            className="h-12 text-center text-2xl tracking-widest"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold"
          style={accentColor ? { backgroundColor: accentColor } : undefined}
          disabled={submitting || !codeIsComplete || waitingForEnrollment}
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t("auth.mfa.verifying")}
            </>
          ) : (
            <>
              {mode === "setup" ? t("auth.mfa.activateAndSignIn") : t("auth.mfa.verify")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel} disabled={submitting}>
          {t("auth.mfa.backToLogin")}
        </Button>
      </form>
    </div>
  );
}
