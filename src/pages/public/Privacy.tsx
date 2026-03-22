import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Shield, Eye, Lock, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const Privacy = () => {
    return (
        <div className="min-h-screen bg-slate-50 py-12 px-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-slate-900 font-display">Politique de Confidentialité</h1>
                    <p className="text-slate-500 max-w-2xl mx-auto">
                        Dernière mise à jour : 5 mars 2026. Votre vie privée est notre priorité absolue.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-blue-600" />
                            Collecte des Données
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600 leading-relaxed">
                        <p>
                            SchoolFlow Pro collecte les données nécessaires à la gestion administrative et pédagogique des établissements scolaires :
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Identité :</strong> Nom, prénom, date de naissance des élèves et parents.</li>
                            <li><strong>Contact :</strong> Email, numéro de téléphone, adresse postale.</li>
                            <li><strong>Scolarité :</strong> Notes, assiduité, comportement, classes.</li>
                            <li><strong>Santé (Si activé) :</strong> Allergies, contre-indications (données ultra-sensibles et chiffrées).</li>
                            <li><strong>Financier :</strong> Historique des paiements, factures.</li>
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-blue-600" />
                            Protection & Sécurité
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600">
                        <p>
                            Nous mettons en œuvre des mesures de sécurité de pointe pour protéger vos informations :
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Chiffrement :</strong> Les données sensibles (santé, IBAN) sont chiffrées en AES-256.</li>
                            <li><strong>Audit :</strong> Chaque accès ou modification est tracé (IP, utilisateur, horodatage).</li>
                            <li><strong>Souveraineté :</strong> Les données sont hébergées sur des serveurs conformes au RGPD.</li>
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Vos Droits (RGPD)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600">
                        <p> Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Droit d'accès :</strong> Obtenir une copie de vos données (disponible dans vos paramètres).</li>
                            <li><strong>Droit de rectification :</strong> Corriger des informations inexactes.</li>
                            <li><strong>Droit à l'effacement :</strong> Demander la suppression de votre compte (soumis aux obligations légales de conservation).</li>
                            <li><strong>Droit à la portabilité :</strong> Exporter vos données dans un format structuré.</li>
                        </ul>
                        <p className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-400 text-sm italic">
                            Pour exercer ces droits, vous pouvez utiliser les outils d'auto-service dans votre profil ou contacter le DPO de votre établissement.
                        </p>
                    </CardContent>
                </Card>

                <div className="text-center pt-8">
                    <Link to="/auth" className="text-blue-600 hover:underline flex items-center justify-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Retour à la connexion
                    </Link>
                </div>
            </div>
        </div>
    );
};

const ArrowLeft = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
);

export default Privacy;
