# Structure des Fichiers et Documentation

**Dernière mise à jour**: 16 Janvier 2026
**Langue**: Français
**Audience**: Nouveaux développeurs, contributeurs

---

## 📖 Vue d'Ensemble

Ce document vous aide à naviguer dans la codebase de SchoolFlow Pro. Vous allez apprendre:

- ✅ Structure générale du projet
- ✅ Où trouver chaque type de fichier
- ✅ Convention de nommage
- ✅ Comment ajouter de nouvelles pages/composants
- ✅ Liens vers la documentation spécifique

---

## 🗂️ Arborescence Complète

```
schoolflow-pro/
├── 📁 src/
│   ├── 📁 components/          # Composants React réutilisables
│   ├── 📁 pages/               # Pages de l'application
│   ├── 📁 contexts/            # Providers React (Auth, Tenant, etc.)
│   ├── 📁 hooks/               # Hooks personnalisés
│   ├── 📁 lib/                 # Code utilitaire
│   ├── 📁 integrations/        # Intégrations (Supabase)
│   ├── 📄 main.tsx             # Point d'entrée
│   ├── 📄 App.tsx              # Composant racine
│   └── 📄 index.css            # Styles globaux
│
├── 📁 docker/                  # Docker configuration
│   ├── 📁 init/                # Migration PostgreSQL
│   └── 📄 docker-compose.yml   # Services locaux
│
├── 📁 dist/                    # Build output (généré)
├── 📁 node_modules/            # Dépendances (généré)
│
├── 📄 package.json             # Dépendances npm
├── 📄 vite.config.ts           # Configuration Vite
├── 📄 tsconfig.json            # Configuration TypeScript
├── 📄 tailwind.config.ts       # Configuration Tailwind
├── 📄 capacitor.config.ts      # Configuration Capacitor (mobile)
├── 📄 README.md                # Documentation principale
└── 📄 .env.example             # Variables d'environnement exemple
```

---

## 📁 Détail: src/components/

```
src/components/
│
├── 📁 layouts/                 # Layouts par rôle
│   ├── AdminLayout.tsx         # Layout pour administrateurs
│   ├── TeacherLayout.tsx       # Layout pour enseignants
│   ├── StudentLayout.tsx       # Layout pour étudiants
│   ├── ParentLayout.tsx        # Layout pour parents
│   └── PublicLayout.tsx        # Layout pour utilisateurs non auth
│
├── 📁 ui/                      # Composants shadcn/ui primitives
│   ├── button.tsx              # <Button />
│   ├── input.tsx               # <Input />
│   ├── select.tsx              # <Select />
│   ├── modal.tsx               # <Modal />
│   ├── card.tsx                # <Card />
│   ├── tabs.tsx                # <Tabs />
│   ├── dialog.tsx              # <Dialog />
│   └── ... (15+ autres primitives)
│
├── 📁 settings/                # NEW - Composants de paramètres
│   ├── BrandingSettings.tsx    # Logo + Couleurs
│   └── SystemSettings.tsx      # 20+ paramètres système
│
├── 📁 students/                # Composants liés aux étudiants
│   ├── StudentList.tsx         # Liste des étudiants
│   ├── StudentCard.tsx         # Fiche étudiant
│   ├── StudentForm.tsx         # Formulaire création/édition
│   ├── StudentDetails.tsx      # Détails complets
│   └── ...
│
├── 📁 grades/                  # Composants de notes
│   ├── GradeBook.tsx           # Tableau des notes
│   ├── GradeForm.tsx           # Formulaire note
│   ├── GradeReport.tsx         # Rapport notes
│   └── ...
│
├── 📁 attendance/              # Composants de présence
│   ├── AttendanceList.tsx      # Tableau présence
│   ├── AttendanceForm.tsx      # Formulaire marquage
│   ├── AttendanceStats.tsx     # Statistiques
│   └── ...
│
├── 📁 invoices/                # Composants de factures
│   ├── InvoiceList.tsx         # Liste factures
│   ├── InvoiceForm.tsx         # Création facture
│   ├── InvoiceView.tsx         # Détails facture
│   └── ...
│
├── 📁 messages/                # Composants de messages
│   ├── MessageList.tsx         # Boîte de réception
│   ├── MessageForm.tsx         # Compose message
│   ├── ChatWindow.tsx          # Fenêtre chat
│   └── ...
│
├── ProtectedRoute.tsx          # HOC pour routes protégées
├── TenantBranding.tsx          # Logo + branding dynamique
├── ThemeSwitcher.tsx           # Toggle dark/light mode
└── NotificationAlert.tsx       # Notifications toast
```

**Exemple: Ajouter un nouveau composant**

```typescript
// src/components/students/StudentAvatar.tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface StudentAvatarProps {
  name: string;
  avatar_url?: string;
  size?: "sm" | "md" | "lg";
}

export function StudentAvatar({ name, avatar_url, size = "md" }: StudentAvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <Avatar className={size === "sm" ? "w-8 h-8" : size === "lg" ? "w-16 h-16" : "w-10 h-10"}>
      {avatar_url && <AvatarImage src={avatar_url} alt={name} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
```

---

## 📁 Détail: src/pages/

```
src/pages/
│
├── 📁 admin/                   # Pages administrateurs
│   ├── Dashboard.tsx           # Tableau de bord admin
│   ├── Settings.tsx            # ← Inclut BrandingSettings & SystemSettings
│   ├── Users.tsx               # Gestion utilisateurs
│   ├── Tenants.tsx             # Gestion locataires
│   ├── Reports.tsx             # Rapports
│   └── ...
│
├── 📁 teacher/                 # Pages enseignants
│   ├── Dashboard.tsx           # Mon tableau de bord
│   ├── GradeBook.tsx           # Carnet de notes
│   ├── Classes.tsx             # Mes classes
│   ├── Attendance.tsx          # Marquage présence
│   ├── Messages.tsx            # Messagerie
│   └── ...
│
├── 📁 student/                 # Pages étudiants
│   ├── Dashboard.tsx           # Mon tableau de bord
│   ├── Grades.tsx              # Mes notes
│   ├── Schedule.tsx            # Mon emploi du temps
│   ├── Attendance.tsx          # Ma présence
│   ├── Messages.tsx            # Messagerie
│   └── ...
│
├── 📁 parent/                  # Pages parents
│   ├── Dashboard.tsx           # Tableau de bord parent
│   ├── Children.tsx            # Mes enfants
│   ├── Grades.tsx              # Notes enfants
│   ├── Attendance.tsx          # Présence enfants
│   ├── Messages.tsx            # Communication école
│   └── ...
│
├── 📁 public/                  # Pages publiques
│   ├── Login.tsx               # Connexion
│   ├── Register.tsx            # Inscription
│   ├── ForgotPassword.tsx      # Récupération mot de passe
│   └── SchoolList.tsx          # Liste des écoles
│
├── 404.tsx                     # Page non trouvée
└── Layout.tsx                  # Layout principal
```

**Exemple: Structure d'une page**

```typescript
// src/pages/admin/Dashboard.tsx
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { currentTenant } = useTenant();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats", currentTenant?.id],
    queryFn: async () => {
      // Récupérer les stats
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("tenant_id", currentTenant!.id);
      
      if (error) throw error;
      return { total_students: data?.length || 0 };
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Bienvenue {profile?.first_name}</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Vue d'ensemble</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Chargement...</p>
            ) : (
              <p>Total d'étudiants: {stats?.total_students}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
```

---

## 📁 Détail: src/contexts/

```
src/contexts/
│
├── AuthContext.tsx
│   ├─ Fournit: useAuth()
│   ├─ Propriétés: profile, isLoading, signOut(), hasRole()
│   └─ Données: User profile + roles
│
├── TenantContext.tsx
│   ├─ Fournit: useTenant()
│   ├─ Propriétés: currentTenant, switchTenant()
│   └─ Données: Tenant actuel (cache 5 min)
│
├── ThemeContext.tsx
│   ├─ Fournit: useTheme()
│   ├─ Propriétés: theme, toggleTheme()
│   └─ Données: dark/light mode
│
└── NotificationContext.tsx
    ├─ Fournit: useNotification()
    ├─ Propriétés: notify(), clearNotifications()
    └─ Données: Notifications actives
```

**Exemple: Utiliser AuthContext**

```typescript
import { useAuth } from "@/contexts/AuthContext";

function MyComponent() {
  const { profile, isLoading, hasRole, signOut } = useAuth();

  if (isLoading) return <div>Chargement...</div>;

  return (
    <div>
      <p>Bienvenue {profile?.first_name}</p>
      {hasRole("TEACHER") && <p>Vous êtes enseignant</p>}
      <button onClick={signOut}>Déconnexion</button>
    </div>
  );
}
```

---

## 📁 Détail: src/hooks/

```
src/hooks/
│
├── useSettings.ts              # NEW - Paramètres dynamiques
│   ├─ Fonction: useSettings()
│   ├─ Fonction: useSetting<K>()
│   └─ Utilisation: Accéder aux paramètres tenant
│
├── useAuth.ts
│   ├─ Fonction: useAuth()
│   └─ Utilisation: Authentification
│
├── useTenant.ts
│   ├─ Fonction: useTenant()
│   └─ Utilisation: Tenant courant
│
├── useToast.ts
│   ├─ Fonction: useToast()
│   └─ Utilisation: Notifications toast
│
├── useLocalStorage.ts
│   ├─ Fonction: useLocalStorage<T>(key)
│   └─ Utilisation: Stockage local
│
├── useFetch.ts
│   ├─ Fonction: useFetch<T>(url)
│   └─ Utilisation: Requêtes fetch
│
└── useDebounce.ts
    ├─ Fonction: useDebounce<T>(value, delay)
    └─ Utilisation: Debounce pour recherche
```

**Exemple: Créer un hook personnalisé**

```typescript
// src/hooks/useStudents.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export function useStudents(classroomId?: string) {
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["students", currentTenant?.id, classroomId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*")
        .eq("tenant_id", currentTenant!.id);

      if (classroomId) {
        query = query.eq("classroom_id", classroomId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// Utilisation
function StudentList() {
  const { data: students, isLoading } = useStudents();
  // ...
}
```

---

## 📁 Détail: src/lib/

```
src/lib/
│
├── types.ts
│   ├─ AppRole (tous les rôles)
│   ├─ Tenant (structure tenant)
│   ├─ Profile (structure user)
│   ├─ Student (structure étudiant)
│   ├─ Grade (structure note)
│   ├─ Attendance (structure présence)
│   ├─ Invoice (structure facture)
│   └─ ... (30+ types)
│
├── constants.ts
│   ├─ ROLE_LABELS
│   ├─ GENDER_OPTIONS
│   ├─ TENANT_TYPES
│   ├─ ATTENDANCE_STATUSES
│   └─ ... (10+ constantes)
│
├── utils.ts
│   ├─ formatDate(date)
│   ├─ formatCurrency(amount)
│   ├─ calculateGPA(grades)
│   ├─ getInitials(name)
│   └─ ... (20+ utilitaires)
│
└── validators.ts
    ├─ validateEmail(email)
    ├─ validatePhone(phone)
    ├─ validateStudent(data)
    └─ ... (10+ validateurs)
```

**Exemple: Ajouter un type**

```typescript
// src/lib/types.ts
export interface Classroom {
  id: string;
  tenant_id: string;
  level_id: string;
  name: string;
  capacity: number;
  teacher_id: string;
  academic_year_id: string;
  created_at: string;
  updated_at: string;
}

export interface TenantSettingsSchema {
  logo_url?: string;
  primary_color?: string;
  // ... 30+ propriétés
}
```

---

## 📁 Détail: src/integrations/supabase/

```
src/integrations/supabase/
│
├── client.ts
│   └─ Initialise le client Supabase
│      export const supabase = createClient(...)
│
└── types.ts
    └─ Types auto-générés par Supabase
       export type Database = { ... }
       export type Student = Database["public"]["Tables"]["students"]["Row"]
```

**Utilisation**:

```typescript
import { supabase } from "@/integrations/supabase/client";
import type { Student } from "@/integrations/supabase/types";

const { data, error } = await supabase
  .from("students")
  .select("*")
  .eq("tenant_id", tenantId);

const students: Student[] = data || [];
```

---

## 🔗 Routes de l'Application

**Fichier**: `src/App.tsx`

```typescript
const routes = [
  // Routes publiques
  { path: "/", element: <Home /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },

  // Routes protégées (admin)
  {
    path: "/admin",
    element: <ProtectedRoute allowedRoles={["TENANT_ADMIN", "SUPER_ADMIN"]}>
      <AdminLayout />
    </ProtectedRoute>,
    children: [
      { path: "dashboard", element: <AdminDashboard /> },
      { path: "settings", element: <Settings /> },
      { path: "users", element: <Users /> },
    ],
  },

  // Routes protégées (enseignants)
  {
    path: "/teacher",
    element: <ProtectedRoute allowedRoles={["TEACHER", "DIRECTOR"]}>
      <TeacherLayout />
    </ProtectedRoute>,
    children: [
      { path: "dashboard", element: <TeacherDashboard /> },
      { path: "grades", element: <GradeBook /> },
    ],
  },

  // Routes protégées (étudiants)
  {
    path: "/student",
    element: <ProtectedRoute allowedRoles={["STUDENT"]}>
      <StudentLayout />
    </ProtectedRoute>,
    children: [
      { path: "dashboard", element: <StudentDashboard /> },
      { path: "grades", element: <MyGrades /> },
    ],
  },

  // Routes protégées (parents)
  {
    path: "/parent",
    element: <ProtectedRoute allowedRoles={["PARENT"]}>
      <ParentLayout />
    </ProtectedRoute>,
    children: [
      { path: "dashboard", element: <ParentDashboard /> },
      { path: "children", element: <MyChildren /> },
    ],
  },

  // Catch all
  { path: "*", element: <NotFound /> },
];
```

---

## 🎨 Conventions de Nommage

### Fichiers et Dossiers

```
// Composants React: PascalCase
src/components/StudentList.tsx
src/components/GradeForm.tsx

// Hooks: camelCase avec prefix "use"
src/hooks/useStudents.ts
src/hooks/useGrades.ts

// Utilitaires: camelCase
src/lib/utils.ts
src/lib/validators.ts

// Types: PascalCase
src/lib/types.ts (contient interface Student {})

// Pages: PascalCase (même si composant)
src/pages/admin/Dashboard.tsx
src/pages/teacher/GradeBook.tsx

// Dossiers: kebab-case (minuscules avec tirets)
src/components/students/
src/components/grade-components/
```

### Exports

```typescript
// ✅ Exporter nommé
export function StudentList() { }
export const DEFAULT_SETTINGS = { };

// ✅ Ou export par défaut pour pages
export default function AdminDashboard() { }

// ❌ Éviter les exports par défaut pour hooks
// Au lieu de:
export default function useStudents() { }
// Utiliser:
export function useStudents() { }
```

---

## 📊 Dépendances Principales

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.x",
  "@tanstack/react-query": "^5.x",
  "zustand": "^4.x",
  "@supabase/supabase-js": "^2.x",
  "typescript": "^5.x",
  "tailwindcss": "^3.x",
  "shadcn/ui": "latest"
}
```

**Installation de dépendances**:

```bash
# Ajouter une dépendance
npm install nom-du-package

# Ajouter un composant shadcn/ui
npx shadcn-ui@latest add button

# Installer les dépendances d'un projet
npm install
```

---

## 🔨 Scripts npm

```bash
# Développement
npm run dev                # Démarre Vite dev server (http://localhost:8080)

# Build
npm run build              # Production build (dist/)

# Linting & Type Checking
npm run lint               # ESLint checks
npx tsc --noEmit          # TypeScript check

# Testing
npm run test               # Tests unitaires

# Mobile
npm run build              # Puis...
npx cap add ios            # Ajouter iOS
npx cap add android        # Ajouter Android
npx cap sync               # Sync des assets
npx cap open ios           # Ouvrir dans Xcode
npx cap open android       # Ouvrir dans Android Studio
```

---

## 🚀 Workflow Développement

### 1. Créer une Nouvelle Page

```bash
# 1. Créer le fichier
touch src/pages/admin/NewFeature.tsx

# 2. Ajouter la route dans App.tsx
{
  path: "/admin/new-feature",
  element: <NewFeaturePage />,
}

# 3. Ajouter un lien dans la navigation (e.g., AdminLayout.tsx)
<Link to="/admin/new-feature">Nouvelle Fonction</Link>

# 4. Développer la page
# 5. Test local: npm run dev
# 6. Commit & push
```

### 2. Créer un Nouveau Composant

```bash
# 1. Créer le fichier
touch src/components/students/NewComponent.tsx

# 2. Implémenter le composant
# 3. Ajouter les tests
# 4. Utiliser dans une page
# 5. Commit & push
```

### 3. Ajouter un Hook

```bash
# 1. Créer le fichier
touch src/hooks/useNewFeature.ts

# 2. Implémenter le hook
# 3. Exporter de src/hooks/index.ts (si applicable)
# 4. Utiliser dans les composants
# 5. Commit & push
```

---

## 📚 Liens Documentation

### Technique
- [GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md](GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md) - Architecture complète
- [Documentation Supabase](https://supabase.com/docs) - Client + API
- [Documentation React](https://react.dev) - Hooks + Composants
- [Documentation Vite](https://vitejs.dev) - Build tool
- [Documentation TypeScript](https://www.typescriptlang.org/docs/) - Types

### Guides Admin
- [GUIDE_ADMIN_PARAMETRES.md](GUIDE_ADMIN_PARAMETRES.md) - Pour administrateurs
- [DEMARRAGE_PARAMETRES_DYNAMIQUES.md](DEMARRAGE_PARAMETRES_DYNAMIQUES.md) - Quick start

### Checklists
- [LISTE_VALIDATION_PARAMETRES_DYNAMIQUES.md](LISTE_VALIDATION_PARAMETRES_DYNAMIQUES.md) - Tests et validation

---

## ⚠️ Pièges Courants

### 1. Oublier de Filtrer par Tenant

**❌ Mauvais**:
```typescript
const { data } = await supabase
  .from("students")
  .select("*");  // ← Récupère données d'AUTRES tenants!
```

**✅ Bon**:
```typescript
const { data } = await supabase
  .from("students")
  .select("*")
  .eq("tenant_id", currentTenant.id);  // ← Isolation correcte
```

### 2. Oublier les Props de Type

**❌ Mauvais**:
```typescript
function StudentCard(props) {  // ← any type!
  return <div>{props.name}</div>;
}
```

**✅ Bon**:
```typescript
interface StudentCardProps {
  name: string;
  avatar?: string;
}

function StudentCard({ name, avatar }: StudentCardProps) {
  return <div>{name}</div>;
}
```

### 3. Oublier les Dépendances React Query

**❌ Mauvais**:
```typescript
const { data: students } = useQuery({
  queryKey: ["students"],  // ← Pas d'ID tenant!
  queryFn: fetchStudents,
});
```

**✅ Bon**:
```typescript
const { data: students } = useQuery({
  queryKey: ["students", tenantId],  // ← Inclut tenant!
  queryFn: () => fetchStudents(tenantId),
});
```

---

## 🤝 Contribution

### Avant de Commencer

1. Lire ce document
2. Lire [GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md](GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md)
3. Configurer l'environnement local

### Workflow de Contribution

```bash
# 1. Créer une branche
git checkout -b feature/ma-fonction

# 2. Développer
npm run dev
# ... éditer les fichiers ...

# 3. Tester
npm run build     # Vérifier que ça compile
npm run lint      # Vérifier linting

# 4. Commit
git add .
git commit -m "feat: Ajouter ma fonction"

# 5. Push
git push origin feature/ma-fonction

# 6. Pull Request
# → Créer PR sur GitHub
```

### Checklist Avant Pull Request

- [ ] Code compile sans erreur
- [ ] Tests passent
- [ ] Pas de console.errors/warnings
- [ ] TypeScript strict mode OK
- [ ] Pas de breaking changes
- [ ] Documentation mise à jour
- [ ] Commit messages clairs

---

## 📞 Questions?

- **Techniquement**: Voir [GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md](GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md#faq-technique)
- **Admin**: Voir [GUIDE_ADMIN_PARAMETRES.md](GUIDE_ADMIN_PARAMETRES.md)
- **Général**: Voir [DEMARRAGE_PARAMETRES_DYNAMIQUES.md](DEMARRAGE_PARAMETRES_DYNAMIQUES.md#faq---réponses-rapides)

---

**Dernière mise à jour**: 16 Janvier 2026
**Prochaine révision**: Quand nouvelle feature majeure
