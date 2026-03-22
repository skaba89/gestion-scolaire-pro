import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckCircle, AlertTriangle, Book } from "lucide-react";
import { Link } from "react-router-dom";

const Terms = () => {
    return (
        <div className="min-h-screen bg-slate-50 py-12 px-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-slate-900 font-display">Conditions Générales d'Utilisation</h1>
                    <p className="text-slate-500 max-w-2xl mx-auto">
                        En utilisant SchoolFlow Pro, vous acceptez les présentes conditions.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Book className="w-5 h-5 text-indigo-600" />
                            Objet du Service
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600">
                        <p>
                            SchoolFlow Pro est une plateforme de gestion scolaire (ERP/SaaS) permettant l'administration des établissements, le suivi pédagogique des élèves et la gestion financière.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-indigo-600" />
                            Utilisation du Compte
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600">
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
                            <li>Toute activité effectuée depuis votre compte est réputée être de votre fait.</li>
                            <li>L'utilisation de la Double Authentification (MFA) est fortement recommandée.</li>
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-indigo-600" />
                            Responsabilités
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-slate-600">
                        <p>
                            L'éditeur de SchoolFlow Pro ne saurait être tenu responsable des erreurs de saisie ou de l'utilisation frauduleuse de la plateforme par des tiers. L'établissement scolaire est responsable de l'exactitude des données de ses élèves.
                        </p>
                    </CardContent>
                </Card>

                <div className="text-center pt-8">
                    <Link to="/auth" className="text-indigo-600 hover:underline flex items-center justify-center gap-2">
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

export default Terms;
