import fs from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { AUTH_DIR, credentials, loginThroughUi, stateFile, ULS_ROLES, type Role } from './helpers';

/**
 * Une connexion par rôle, par l'interface, puis réutilisation des sessions :
 * la route de connexion est limitée à 5 essais par minute et par IP, et
 * chaque compte à 5 sessions actives.
 *
 * Dix comptes dépassent cette limite : les connexions sont espacées pour ne
 * jamais en faire plus de LOGINS_PER_WINDOW sur une fenêtre glissante (une
 * place reste libre pour la connexion du script de chargement ULS, lancé
 * juste avant). La limite n'est ni relevée ni contournée.
 */
const LOGINS_PER_WINDOW = 4;
const WINDOW_MS = 61_000;

async function paced(history: number[]): Promise<void> {
  const recent = history.filter((t) => Date.now() - t < WINDOW_MS);
  if (recent.length >= LOGINS_PER_WINDOW) {
    const wait = WINDOW_MS - (Date.now() - recent[0]);
    console.log(`Limite de connexion : pause de ${Math.ceil(wait / 1000)} s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  history.push(Date.now());
}
export default async function globalSetup(config: FullConfig): Promise<void> {
  credentials(); // échoue tôt et clairement si le fichier manque
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  const history: number[] = [Date.now()]; // connexion du script ULS
  try {
    for (const role of [...ULS_ROLES, 'witness'] as Role[]) {
      await paced(history);
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
