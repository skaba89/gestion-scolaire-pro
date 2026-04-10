/**
 * Utilitaires pour les données de test
 */

export const TEST_USERS = {
  admin: {
    email: 'admin@test.local',
    password: 'Password123!',
    role: 'TENANT_ADMIN',
    first_name: 'Admin',
    last_name: 'Test',
  },
  teacher: {
    email: 'teacher@test.local',
    password: 'Password123!',
    role: 'TEACHER',
    first_name: 'Jean',
    last_name: 'Dupont',
  },
  parent: {
    email: 'parent@test.local',
    password: 'Password123!',
    role: 'PARENT',
    first_name: 'Marie',
    last_name: 'Dupont',
  },
  student: {
    email: 'student@test.local',
    password: 'Password123!',
    role: 'STUDENT',
    first_name: 'Pierre',
    last_name: 'Dupont',
  },
};

export const TEST_STUDENT_DATA = {
  valid: {
    first_name: 'Jean',
    last_name: 'Dupont',
    email: 'jean.dupont@example.com',
    date_of_birth: '2010-05-15',
    nationality: 'Française',
    gender: 'male',
    address: '123 Rue de la Paix',
    postal_code: '75000',
    city: 'Paris',
    country: 'France',
  },
  withPhoto: {
    first_name: 'Marie',
    last_name: 'Martin',
    email: 'marie.martin@example.com',
    date_of_birth: '2011-03-20',
    photo: {
      fileName: 'test-photo.png',
      mimeType: 'image/png',
      // PNG 1x1 pixel blanc
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  },
  invalid: {
    first_name: '', // Champ obligatoire manquant
    last_name: 'Dupont',
    email: 'invalid-email', // Format invalide
  },
};

export const TEST_CLASSROOM_DATA = {
  sixiemeA: {
    name: '6ème A',
    level: 'Sixième',
    max_capacity: 30,
  },
  sixiemeB: {
    name: '6ème B',
    level: 'Sixième',
    max_capacity: 28,
  },
  cinquiemeA: {
    name: '5ème A',
    level: 'Cinquième',
    max_capacity: 32,
  },
};

export const TEST_SUBJECT_DATA = [
  { name: 'Mathématiques', code: 'MATH' },
  { name: 'Français', code: 'FR' },
  { name: 'Anglais', code: 'EN' },
  { name: 'Histoire-Géographie', code: 'HG' },
  { name: 'Sciences Physiques', code: 'SP' },
  { name: 'SVT', code: 'SVT' },
];

export const TEST_GRADES_DATA = [
  { mark: 18, assessment_type: 'EXAM', description: 'Exam Trimestre 1' },
  { mark: 16, assessment_type: 'HOMEWORK', description: 'DM Algèbre' },
  { mark: 17, assessment_type: 'PROJECT', description: 'Projet Géométrie' },
  { mark: 15, assessment_type: 'PARTICIPATION', description: 'Participation Classe' },
];

export const TEST_ATTENDANCE_DATA = [
  { status: 'PRESENT', date: new Date().toISOString().split('T')[0] },
  { status: 'ABSENT', date: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
  { status: 'LATE', date: new Date(Date.now() - 172800000).toISOString().split('T')[0] },
  { status: 'EXCUSED', date: new Date(Date.now() - 259200000).toISOString().split('T')[0] },
];

/**
 * Générer un email unique pour les tests
 */
export function generateUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}@test.local`;
}

/**
 * Générer des données d'élève uniques
 */
export function generateUniqueStudent() {
  const timestamp = Date.now();
  return {
    first_name: `Jean_${timestamp}`,
    last_name: `Dupont_${timestamp}`,
    email: generateUniqueEmail('student'),
    date_of_birth: '2010-05-15',
    registration_number: `REG-${timestamp}`,
  };
}

/**
 * Créer une image test en base64
 */
export function createTestImage(width: number = 100, height: number = 100): string {
  // PNG blanc 1x1 pixel (peut être étendu)
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Selectors communs pour les tests
 */
export const SELECTORS = {
  // Boutons
  buttons: {
    add: 'button:has-text("Ajouter"), button:has-text("Créer"), button:has-text("Nouveau")',
    save: 'button:has-text("Enregistrer"), button:has-text("Sauvegarder")',
    edit: 'button:has-text("Éditer"), button:has-text("Modifier")',
    delete: 'button:has-text("Supprimer"), button:has-text("×")',
    confirm: 'button:has-text("Confirmer"), button:has-text("Oui")',
    cancel: 'button:has-text("Annuler"), button:has-text("Non")',
    login: 'button:has-text("Se connecter")',
    logout: 'button:has-text("Déconnexion")',
  },
  
  // Formulaires
  forms: {
    email: 'input[name="email"]',
    password: 'input[name="password"]',
    firstName: 'input[name="first_name"]',
    lastName: 'input[name="last_name"]',
    phone: 'input[name="phone"]',
    studentPhoto: 'input[type="file"]',
  },
  
  // Messages
  messages: {
    success: 'text=/Succès|créé|mis à jour|enregistré|supprimé/i',
    error: 'text=/Erreur|échoué|invalide/i',
    loading: 'text=/Chargement|En cours/i',
  },
  
  // Éléments
  elements: {
    studentRow: '[data-testid="student-row"], table tbody tr',
    studentName: '[data-testid="student-name"]',
    studentList: '[data-testid="student-list"], table',
    gradeTable: '[data-testid="grades-table"], table',
    attendanceTable: '[data-testid="attendance-table"], table',
  },
};

/**
 * Attendre un message avec timeout
 */
export async function waitForMessage(
  page: any,
  messageType: 'success' | 'error',
  timeout: number = 5000
) {
  const selector = messageType === 'success' 
    ? SELECTORS.messages.success 
    : SELECTORS.messages.error;
  
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

/**
 * Remplir un formulaire d'élève
 */
export async function fillStudentForm(page: any, studentData: any) {
  if (studentData.first_name) {
    await page.fill(SELECTORS.forms.firstName, studentData.first_name);
  }
  if (studentData.last_name) {
    await page.fill(SELECTORS.forms.lastName, studentData.last_name);
  }
  if (studentData.email) {
    await page.fill(SELECTORS.forms.email, studentData.email);
  }
  if (studentData.date_of_birth) {
    await page.fill('input[name="date_of_birth"]', studentData.date_of_birth);
  }
  if (studentData.phone) {
    await page.fill(SELECTORS.forms.phone, studentData.phone);
  }
}

/**
 * Uploader une photo
 */
export async function uploadPhoto(page: any, imageBase64: string, fileName: string = 'test.png') {
  const fileInput = page.locator(SELECTORS.forms.studentPhoto);
  
  if (await fileInput.isVisible()) {
    const buffer = Buffer.from(imageBase64, 'base64');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer,
    });
  }
}

/**
 * Attendre le chargement des données
 */
export async function waitForData(page: any) {
  await page.waitForLoadState('networkidle');
}
