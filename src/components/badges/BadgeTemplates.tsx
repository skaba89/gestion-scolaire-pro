
import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { BADGE_TEMPLATES, BadgeProps } from "./BadgeConstants";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { resolveUploadUrl } from "@/utils/url";

const StandardBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[320px] h-[480px] border-2 border-primary/20 rounded-xl bg-white relative overflow-hidden flex flex-col items-center shadow-lg print:shadow-none print:border">
        {/* Header Background */}
        <div className="absolute top-0 left-0 w-full h-32 bg-primary/10 -skew-y-6 transform -translate-y-12 z-0" />

        {/* Tenant Logo/Name */}
        <div className="z-10 mt-6 text-center w-full px-4">
            {tenant.logo_url ? (
                <img src={resolveUploadUrl(tenant.logo_url)} alt={tenant.name} className="h-12 mx-auto object-contain mb-2" />
            ) : (
                <h3 className="font-bold text-primary text-lg leading-tight uppercase tracking-wider">{tenant.name}</h3>
            )}
            <p className="text-xs text-muted-foreground uppercase font-semibold tracking-widest mt-1">
                Année {academicYear}
            </p>
        </div>

        {/* Photo */}
        <div className="z-10 mt-6 relative">
            <div className="w-32 h-32 rounded-full border-4 border-white shadow-md overflow-hidden bg-muted flex items-center justify-center">
                {student.photo_url ? (
                    <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-4xl font-bold text-muted-foreground">
                        {student.first_name[0]}{student.last_name[0]}
                    </span>
                )}
            </div>
            <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 border-2 border-white rounded-full" />
        </div>

        {/* Student Info */}
        <div className="z-10 mt-4 text-center w-full px-4 flex-grow">
            <h2 className="font-black text-2xl text-slate-800 leading-none mb-1">
                {student.first_name}
            </h2>
            <h2 className="font-black text-2xl text-primary leading-none uppercase mb-2">
                {student.last_name}
            </h2>

            {student.classroomName && (
                <span className="inline-block px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm font-bold mb-1 shadow-sm">
                    {student.classroomName}
                </span>
            )}
            {student.levelName && (
                <div className="text-sm font-medium text-slate-500 mb-2">
                    {student.levelName}
                </div>
            )}

            {student.registration_number && (
                <p className="font-mono text-sm text-slate-500">
                    ID: {student.registration_number}
                </p>
            )}
        </div>

        {/* Footer with QR */}
        <div className="z-10 w-full bg-slate-50 p-4 flex items-center justify-between border-t border-slate-100 mt-auto">
            <div className="bg-white p-1 rounded border border-slate-200">
                <QRCodeSVG value={badge.qr_code_data} size={64} level="M" />
            </div>
            <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Code Badge</p>
                <p className="font-mono font-bold text-slate-700">{badge.badge_code}</p>
                <p className="text-[10px] text-slate-400 mt-1">Expire le: {badge.date_expiry || "Fin d'année"}</p>
            </div>
        </div>
    </div>
);

const ModernBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[320px] h-[480px] bg-white rounded-xl overflow-hidden flex shadow-lg relative print:shadow-none print:border border border-slate-200">
        {/* Side Color Bar */}
        <div className="w-16 h-full bg-primary flex flex-col items-center py-6 text-primary-foreground justify-between">
            <div className="-rotate-90 whitespace-nowrap font-bold text-xl tracking-widest opacity-80 mt-12">
                ÉTUDIANT
            </div>
            <div className="flex flex-col gap-2">
                {/* Decorative dots */}
                <div className="w-2 h-2 rounded-full bg-white/50" />
                <div className="w-2 h-2 rounded-full bg-white/50" />
                <div className="w-2 h-2 rounded-full bg-white/50" />
            </div>
        </div>

        <div className="flex-1 flex flex-col p-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight w-40">{tenant.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{academicYear}</p>
                </div>
                {tenant.logo_url && (
                    <img src={resolveUploadUrl(tenant.logo_url)} alt="Logo" className="h-10 w-10 object-contain" />
                )}
            </div>

            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 mb-6 shadow-inner relative group">
                {student.photo_url ? (
                    <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300 font-bold">
                        {student.first_name[0]}
                    </div>
                )}
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/60 to-transparent p-4">
                    {student.registration_number && (
                        <p className="text-white text-xs font-mono opacity-80">ID: {student.registration_number}</p>
                    )}
                </div>
            </div>

            <div className="mb-auto">
                <h2 className="text-3xl font-bold text-slate-900 leading-none">{student.first_name}</h2>
                <h2 className="text-3xl font-light text-slate-600 uppercase leading-tight mb-2">{student.last_name}</h2>

                {student.classroomName && (
                    <div className="inline-block border-b-2 border-primary pb-1 font-bold text-primary mr-2">
                        {student.classroomName}
                    </div>
                )}
                {student.levelName && (
                    <span className="text-slate-500 font-medium text-sm">
                        {student.levelName}
                    </span>
                )}
            </div>

            <div className="flex items-end justify-between mt-4 md:mt-0">
                <div className="text-xs text-slate-400">
                    <p>Valide jusqu'au</p>
                    <p className="font-semibold text-slate-700">{badge.date_expiry || "30/06"}</p>
                </div>
                <QRCodeSVG value={badge.qr_code_data} size={60} level="L" color="#334155" />
            </div>
        </div>
    </div>
);

const ClassicLandscapeBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[480px] h-[300px] bg-slate-50 rounded-xl overflow-hidden shadow-lg border border-slate-200 flex flex-col print:shadow-none print:border">
        {/* Header Blue Bar */}
        <div className="h-16 bg-primary flex items-center justify-between px-6">
            <div className="text-primary-foreground">
                <h3 className="font-bold text-lg leading-tight">{tenant.name}</h3>
                <p className="text-xs opacity-80 uppercase tracking-wider">Carte d'étudiant • {academicYear}</p>
            </div>
            {tenant.logo_url && (
                <div className="bg-white p-1 rounded-full h-12 w-12 flex items-center justify-center">
                    <img src={resolveUploadUrl(tenant.logo_url)} alt="Logo" className="h-8 w-8 object-contain" />
                </div>
            )}
        </div>

        <div className="flex-1 flex p-6 gap-6 items-center">
            {/* Photo Zone */}
            <div className="flex-shrink-0">
                <div className="w-32 h-40 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden p-1">
                    <div className="w-full h-full bg-slate-100 rounded overflow-hidden">
                        {student.photo_url ? (
                            <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">
                                <span className="sr-only">{student.last_name}</span>
                                ?
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Details Zone */}
            <div className="flex-1 space-y-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 uppercase leading-none">{student.last_name}</h2>
                    <h2 className="text-xl text-slate-600 leading-tight">{student.first_name}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Classe/Niveau</p>
                        <p className="font-bold text-slate-700">
                            {student.classroomName || "-"}
                            {student.levelName && <span className="font-normal text-slate-500 ml-1">({student.levelName})</span>}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">N° Étudiant</p>
                        <p className="font-mono text-slate-700">{student.registration_number || "-"}</p>
                    </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <div className="font-mono text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">
                        {badge.badge_code}
                    </div>
                    <QRCodeSVG value={badge.qr_code_data} size={48} level="L" />
                </div>
            </div>
        </div>
    </div>
);

const MinimalLandscapeBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[480px] h-[300px] bg-white rounded-none border-2 border-black flex flex-row overflow-hidden print:border">
        {/* Left Photo Section */}
        <div className="w-40 border-r-2 border-black p-4 flex flex-col items-center justify-center bg-slate-50">
            <div className="w-32 h-40 border border-black grayscale overflow-hidden mb-2">
                {student.photo_url ? (
                    <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center font-bold text-3xl">
                        {student.first_name[0]}
                    </div>
                )}
            </div>
            <div className="text-center w-full">
                <p className="font-mono text-xs font-bold">{student.registration_number}</p>
            </div>
        </div>

        {/* Right Details Section */}
        <div className="flex-1 p-6 flex flex-col justify-between">
            <div className="border-b-2 border-black pb-4 mb-2">
                <h1 className="font-black text-3xl uppercase tracking-tighter">{tenant.name}</h1>
                <p className="font-mono text-sm uppercase">Carte d'accès {academicYear}</p>
            </div>

            <div className="space-y-1 my-auto">
                <h2 className="text-4xl font-black uppercase leading-none truncate">{student.last_name}</h2>
                <p className="text-xl font-medium">{student.first_name}</p>
                {student.classroomName && (
                    <p className="font-mono bg-black text-white inline-block px-2 py-0.5 mt-2 text-sm">
                        CLASSE: {student.classroomName}
                    </p>
                )}
                {student.levelName && (
                    <p className="font-mono text-xs mt-1 uppercase text-slate-600">
                        NIVEAU: {student.levelName}
                    </p>
                )}
            </div>

            <div className="flex justify-between items-end mt-4">
                <div className="flex flex-col">
                    <span className="text-[10px] font-mono uppercase">CODE</span>
                    <span className="font-mono font-bold">{badge.badge_code}</span>
                </div>
                <div className="border-2 border-black p-1">
                    <QRCodeSVG value={badge.qr_code_data} size={50} level="L" />
                </div>
            </div>
        </div>
    </div>
);

const PremiumBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[320px] h-[480px] border-[6px] border-amber-400 rounded-3xl bg-white relative overflow-hidden flex flex-col items-center shadow-2xl print:shadow-none print:border-4">
        {/* Background Patterns */}
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none z-0">
            <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 2px 2px, #fbbf24 1px, transparent 0)`, backgroundSize: '24px 24px' }} />
        </div>

        {/* Premium Header */}
        <div className="w-full bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 h-2 z-10" />

        <div className="z-10 mt-6 text-center w-full px-6">
            {tenant.logo_url ? (
                <div className="relative inline-block">
                    <img src={resolveUploadUrl(tenant.logo_url)} alt={tenant.name} className="h-14 mx-auto object-contain drop-shadow-sm mb-2" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    </div>
                </div>
            ) : (
                <h3 className="font-serif italic font-black text-amber-600 text-xl leading-tight uppercase tracking-[0.2em]">{tenant.name}</h3>
            )}
            <div className="flex items-center justify-center gap-2 mt-2">
                <div className="h-[1px] w-8 bg-amber-200" />
                <p className="text-[10px] text-amber-500 uppercase font-bold tracking-[0.3em]">
                    {academicYear}
                </p>
                <div className="h-[1px] w-8 bg-amber-200" />
            </div>
        </div>

        {/* Photo with Gold Frame */}
        <div className="z-10 mt-8 relative">
            <div className="w-36 h-36 rounded-full p-1 bg-gradient-to-tr from-amber-500 via-amber-200 to-amber-400 shadow-xl overflow-hidden group">
                <div className="w-full h-full rounded-full border-4 border-white overflow-hidden bg-slate-50 flex items-center justify-center">
                    {student.photo_url ? (
                        <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-5xl font-serif text-amber-200">
                            {student.first_name[0]}{student.last_name[0]}
                        </span>
                    )}
                </div>
            </div>
        </div>

        {/* Student Info Luxe */}
        <div className="z-10 mt-6 text-center w-full px-6 flex-grow">
            <p className="text-[10px] text-amber-600/60 font-bold uppercase tracking-widest mb-1">Badge Étudiant</p>
            <h2 className="font-serif italic font-bold text-3xl text-slate-800 leading-tight">
                {student.first_name}
            </h2>
            <h2 className="font-black text-3xl text-slate-900 leading-none uppercase mt-1">
                {student.last_name}
            </h2>

            <div className="mt-4 flex flex-col items-center gap-2">
                {student.classroomName && (
                    <span className="px-4 py-1.5 bg-slate-900 text-amber-400 rounded-full text-xs font-black tracking-widest shadow-lg border border-amber-400/30">
                        {student.classroomName} {student.levelName && `• ${student.levelName}`}
                    </span>
                )}
                {student.registration_number && (
                    <p className="font-mono text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                        MATRICULE: {student.registration_number}
                    </p>
                )}
            </div>
        </div>

        {/* Elegant Footer */}
        <div className="z-10 w-full bg-slate-900 p-5 flex items-center justify-between border-t-2 border-amber-400 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
            <div className="bg-white p-1.5 rounded-lg shadow-inner">
                <QRCodeSVG value={badge.qr_code_data} size={60} level="H" includeMargin={false} />
            </div>
            <div className="text-right">
                <div className="mb-1">
                    <p className="text-[9px] text-amber-400/50 uppercase font-black tracking-widest leading-none">Vérification</p>
                    <p className="font-mono font-bold text-amber-400 text-lg">{badge.badge_code}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-400/10 rounded-full border border-amber-400/20">
                    <div className="w-1 h-1 bg-amber-400 rounded-full" />
                    <p className="text-[9px] text-amber-400 font-bold uppercase tracking-tighter">Valide: {badge.date_expiry || "Session"}</p>
                </div>
            </div>
        </div>
    </div>
);

const UniversityBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[320px] h-[480px] bg-slate-50 border border-slate-200 rounded-lg relative overflow-hidden flex flex-col items-center shadow-md print:shadow-none print:border">
        {/* Top Accent with Watermark Logo */}
        <div className="absolute top-0 left-0 w-full h-40 bg-white border-b border-slate-200 z-0 flex items-center justify-center overflow-hidden">
            {tenant.logo_url && (
                <img src={resolveUploadUrl(tenant.logo_url)} alt="Watermark" className="w-64 h-64 object-contain opacity-[0.03] scale-150 rotate-12" />
            )}
        </div>

        {/* Institution Info */}
        <div className="z-10 w-full pt-6 px-6 flex flex-col items-center">
            {tenant.logo_url && (
                <img src={resolveUploadUrl(tenant.logo_url)} alt={tenant.name} className="h-12 object-contain mb-3 drop-shadow-sm" />
            )}
            <h3 className="font-bold text-slate-800 text-sm text-center uppercase tracking-wider leading-tight max-w-[200px]">
                {tenant.name}
            </h3>
            <div className="mt-2 text-[10px] font-bold text-slate-400 border border-slate-200 px-3 py-0.5 rounded-full bg-white">
                ANNÉE UNIVERSITAIRE {academicYear}
            </div>
        </div>

        {/* Professional Photo */}
        <div className="z-10 mt-8 relative">
            <div className="w-32 h-40 bg-white border-2 border-slate-100 rounded-md overflow-hidden shadow-sm p-1">
                <div className="w-full h-full rounded bg-slate-200 overflow-hidden">
                    {student.photo_url ? (
                        <img src={resolveUploadUrl(student.photo_url)} alt="Student" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-slate-400 font-light">
                            {student.first_name[0]}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Data Section */}
        <div className="z-10 mt-6 w-full px-8 text-center flex-grow">
            <h2 className="text-2xl font-black text-slate-900 leading-none mb-1 uppercase tracking-tight">
                {student.last_name}
            </h2>
            <h2 className="text-xl font-medium text-slate-600 leading-none">
                {student.first_name}
            </h2>

            <div className="mt-6 flex flex-col gap-3">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Parcours / Classe</span>
                    <span className="text-sm font-bold text-slate-700">
                        {student.classroomName || "Non assigné"}
                        {student.levelName && <span className="block text-xs font-normal text-slate-500">{student.levelName}</span>}
                    </span>
                </div>
                <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-3 shadow-inner">
                    <div className="text-left">
                        <span className="block text-[8px] text-slate-400 font-black uppercase">N° Étudiant</span>
                        <span className="font-mono text-xs font-bold text-slate-900">{student.registration_number || "-"}</span>
                    </div>
                    <div className="text-right">
                        <span className="block text-[8px] text-slate-400 font-black uppercase">Service</span>
                        <span className="font-mono text-xs font-bold text-slate-900">{badge.badge_code}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Bottom Security Bar */}
        <div className="z-10 w-full h-1 bg-primary mb-auto" />
        <div className="z-10 w-full p-4 flex items-center justify-center gap-6">
            <QRCodeSVG value={badge.qr_code_data} size={40} level="M" />
            <div className="h-8 w-[1px] bg-slate-200" />
            <div className="text-[8px] text-slate-400 font-medium leading-tight max-w-[120px]">
                Cette carte est strictement personnelle. En cas de perte, merci de contacter l'administration de l'établissement.
            </div>
        </div>
    </div>
);

const CompactBadge = ({ student, badge, tenant, academicYear }: BadgeProps) => (
    <div className="w-[400px] h-[250px] bg-white rounded-lg shadow-xl overflow-hidden border border-slate-200 flex flex-row group print:shadow-none print:border">
        {/* Left Color Indicator & Photo */}
        <div className="w-1/3 bg-slate-900 relative p-4 flex flex-col items-center justify-center">
            <div className="absolute top-0 left-0 w-full h-full bg-primary/20 bg-[radial-gradient(#ffffff22_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="relative z-10">
                <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden shadow-2xl bg-white">
                    {student.photo_url ? (
                        <img src={resolveUploadUrl(student.photo_url)} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-300">
                            {student.first_name[0]}
                        </div>
                    )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full border-4 border-slate-900 flex items-center justify-center" />
            </div>

            <div className="mt-4 z-10 text-center">
                <p className="font-mono text-[10px] text-primary/80 font-bold uppercase">ID Badge</p>
                <p className="font-mono text-sm text-white font-black tracking-widest">{badge.badge_code}</p>
            </div>
        </div>

        {/* Right Info Section */}
        <div className="flex-1 p-5 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <div className="max-w-[150px]">
                    <h3 className="text-[10px] font-black uppercase text-slate-800 tracking-tight truncate">{tenant.name}</h3>
                    <p className="text-[9px] text-slate-400 font-bold">{academicYear}</p>
                </div>
                {tenant.logo_url && (
                    <img src={resolveUploadUrl(tenant.logo_url)} alt="Institution Logo" className="h-6 object-contain opacity-60" />
                )}
            </div>

            <div className="my-auto space-y-0.5">
                <h2 className="text-xl font-black text-slate-900 leading-tight uppercase tracking-tight">
                    {student.last_name}
                </h2>
                <p className="text-lg font-medium text-slate-600 leading-none">
                    {student.first_name}
                </p>

                {student.classroomName && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                        {student.classroomName}
                    </div>
                )}
                {student.levelName && (
                    <div className="text-[10px] uppercase font-bold text-slate-500 mt-1">
                        {student.levelName}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-end justify-between">
                <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">Enregistrement</p>
                    {student.registration_number && (
                        <p className="font-mono text-[10px] font-bold text-slate-600">{student.registration_number}</p>
                    )}
                </div>
                <div className="p-1 bg-white border border-slate-200 rounded shadow-sm">
                    <QRCodeSVG value={badge.qr_code_data} size={36} level="L" />
                </div>
            </div>
        </div>
    </div>
);

export const BadgeRenderer = ({ templateId, ...props }: BadgeProps & { templateId: string }) => {
    switch (templateId) {
        case "premium":
            return <PremiumBadge {...props} />;
        case "university":
            return <UniversityBadge {...props} />;
        case "modern":
            return <ModernBadge {...props} />;
        case "classic":
            return <ClassicLandscapeBadge {...props} />;
        case "minimal":
            return <MinimalLandscapeBadge {...props} />;
        case "compact":
            return <CompactBadge {...props} />;
        case "standard":
        default:
            return <StandardBadge {...props} />;
    }
};
