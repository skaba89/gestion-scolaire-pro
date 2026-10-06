---
description: REGRESSION CHECK — suites complètes, lint, type-check, i18n, build, migrations, appelants et alias
argument-hint: "[vide]"
---

Délègue à l'agent `production-readiness-reviewer` la section REGRESSION CHECK du
skill `testing-guide` :

```bash
cd backend && python -m pytest tests/ -q && alembic heads
npm run type-check
npm run lint            # comparer au budget --max-warnings de .github/workflows/ci.yml
npm run check:i18n
npx vitest run
npm run build
```

Plus : appelants des fonctions modifiées, alias (`aliases.py`), contrat API utilisé
par le frontend. Rapporter les totaux réels et chaque échec ; ne rien affirmer qui
n'a pas été exécuté. Aucune modification de fichier.
