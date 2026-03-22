import React from "react";

export interface ModuleDoc {
    id: string;
    title: string;
    icon: React.ReactNode;
    category: "admin" | "teacher" | "parent" | "student" | "alumni" | "department";
    description: string;
    features: string[];
    howToUse: string[];
    tips: string[];
    prerequisites?: string[];
    stepByStep?: {
        title: string;
        steps: string[];
    }[];
}

export type DocCategory = {
    id: ModuleDoc["category"];
    label: string;
    icon: React.ReactNode;
};
