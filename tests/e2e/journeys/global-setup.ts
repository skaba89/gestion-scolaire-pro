import fs from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { AUTH_DIR, credentials, loginThroughUi, stateFile, type Role } from './helpers';

/**
 * Une connexion par rôle, par l'interface, puis réutilisation des sessions :
 * la route de connexion est limitée à 5 essais par minute et par IP, et
 * chaque compte à 5 sessions actives.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  credentials(); // échoue tôt et clairement si le fichier manque
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  try {
    for (const role of ['admin', 'teacher', 'witness'] as Role[]) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await loginThroughUi(page, role);
      await context.storageState({ path: stateFile(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
