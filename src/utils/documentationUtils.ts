import { ModuleDoc, CATEGORY_IMAGES } from "@/data/documentation";
import { escapeHTML } from '@/lib/security';

interface GeneratePDFParams {
  modules: ModuleDoc[];
  categories: { id: string; label: string }[];
  studentLabel?: string;
  studentsLabel?: string;
  onComplete: () => void;
}

export const generateDocumentationPDF = async ({ modules, categories, onComplete, studentLabel = "élève", studentsLabel = "élèves" }: GeneratePDFParams) => {
  // Create printable content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    onComplete();
    return;
  }

  // Convert images to base64 for PDF embedding
  const imageToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  // Load all images
  const loadedImages: Record<string, string> = {};

  await Promise.all(
    Object.entries(CATEGORY_IMAGES).map(async ([key, url]) => {
      loadedImages[key] = await imageToBase64(url);
    })
  );

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Manuel d'utilisation - Plateforme de Gestion Scolaire</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; padding: 40px; }
        .cover { text-align: center; page-break-after: always; padding: 100px 0; }
        .cover h1 { font-size: 36px; color: #1e40af; margin-bottom: 20px; }
        .cover p { font-size: 18px; color: #64748b; }
        .cover .date { margin-top: 40px; font-size: 14px; }
        .cover-logo { width: 120px; height: 120px; margin: 0 auto 30px; background: linear-gradient(135deg, #1e40af, #7c3aed); border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 60px; }
        .toc { page-break-after: always; }
        .toc h2 { font-size: 24px; color: #1e40af; margin-bottom: 30px; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
        .toc ul { list-style: none; }
        .toc li { padding: 8px 0; border-bottom: 1px dotted #e2e8f0; }
        .toc a { text-decoration: none; color: #1a1a1a; }
        .toc .toc-section { margin-bottom: 20px; }
        .toc .toc-section-title { font-size: 16px; font-weight: 600; color: #1e40af; margin-bottom: 10px; }
        .toc .toc-section ul { padding-left: 20px; }
        .toc .toc-section li { font-size: 14px; border-bottom: none; padding: 4px 0; }
        .category { page-break-before: always; margin-bottom: 40px; }
        .category-title { font-size: 28px; color: #1e40af; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #1e40af; }
        .category-image { width: 100%; max-width: 800px; margin: 20px auto 30px; display: block; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; }
        .category-image-caption { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 30px; font-style: italic; }
        .module { margin-bottom: 40px; page-break-inside: avoid; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
        .module-header { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
        .module-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #1e40af, #7c3aed); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; }
        .module-title { font-size: 20px; color: #0f172a; }
        .module-desc { color: #475569; margin-bottom: 15px; font-style: italic; background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #1e40af; }
        .section { margin-bottom: 15px; }
        .section-title { font-size: 14px; font-weight: 600; color: #1e40af; margin-bottom: 8px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
        .section ul { margin-left: 20px; }
        .section li { margin-bottom: 5px; }
        .section ol { margin-left: 20px; counter-reset: step; list-style: none; }
        .section ol li { margin-bottom: 8px; position: relative; padding-left: 30px; }
        .section ol li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0; width: 22px; height: 22px; background: #1e40af; color: white; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; }
        .tip { background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-left: 4px solid #0ea5e9; padding: 15px 20px; margin-top: 15px; border-radius: 0 8px 8px 0; }
        .tip-title { font-weight: 600; color: #0284c7; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .tip ul { margin-left: 15px; }
        .tip li { color: #0369a1; font-size: 13px; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .page-number { position: fixed; bottom: 20px; right: 40px; font-size: 12px; color: #94a3b8; }
        @media print {
          .no-print { display: none; }
          body { padding: 20px; }
          .module { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="cover">
        <div class="cover-logo">📚</div>
        <h1>Manuel d'utilisation</h1>
        <p>Plateforme de Gestion Scolaire</p>
        <p style="margin-top: 20px; color: #94a3b8;">Guide complet pour tous les utilisateurs</p>
        <p class="date">Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <div style="margin-top: 60px; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
          <p style="font-size: 14px; color: #64748b; margin-bottom: 10px;"><strong>Ce manuel couvre :</strong></p>
          <ul style="font-size: 13px; color: #475569; margin-left: 20px;">
            <li>Module Administration</li>
            <li>Portail Enseignant</li>
            <li>Portail Parent</li>
            <li>Portail ${escapeHTML(studentLabel.charAt(0).toUpperCase() + studentLabel.slice(1))}</li>
            <li>Espace Alumni</li>
            <li>Gestion Département</li>
          </ul>
        </div>
      </div>

      <div class="toc">
        <h2>📑 Table des matières</h2>
        ${categories.map(cat => `
          <div class="toc-section">
            <div class="toc-section-title">${escapeHTML(cat.label)}</div>
            <ul>
              ${modules.filter(m => m.category === cat.id).map(m => `<li>• ${escapeHTML(m.title)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>

      ${categories.map(cat => `
        <div class="category">
          <h2 class="category-title">📋 ${escapeHTML(cat.label)}</h2>
          ${loadedImages[cat.id] ? `
            <img src="${escapeHTML(loadedImages[cat.id])}" alt="Aperçu ${escapeHTML(cat.label)}" class="category-image" />
            <p class="category-image-caption">Aperçu de l'interface ${escapeHTML(cat.label)}</p>
          ` : ''}
          ${modules.filter(m => m.category === cat.id).map(module => `
            <div class="module">
              <div class="module-header">
                <div class="module-icon">📌</div>
                <h3 class="module-title">${escapeHTML(module.title)}</h3>
              </div>
              <p class="module-desc">${escapeHTML(module.description)}</p>
              
              ${module.prerequisites ? `
                <div class="section" style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                  <h4 class="section-title" style="color: #92400e;">⚠️ Prérequis</h4>
                  <ul style="margin-left: 15px;">
                    ${module.prerequisites.map(p => `<li style="color: #78350f;">${escapeHTML(p)}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}

              <div class="section">
                <h4 class="section-title">✨ Fonctionnalités</h4>
                <ul>
                  ${module.features.map(f => `<li>✓ ${escapeHTML(f)}</li>`).join('')}
                </ul>
              </div>

              ${module.stepByStep ? `
                <div class="section" style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h4 class="section-title" style="color: #166534;">📋 Guide détaillé étape par étape</h4>
                  ${module.stepByStep.map(guide => `
                    <div style="margin-bottom: 20px;">
                      <h5 style="font-size: 14px; font-weight: 600; color: #15803d; margin-bottom: 10px; border-bottom: 1px solid #bbf7d0; padding-bottom: 5px;">
                        ▶ ${escapeHTML(guide.title)}
                      </h5>
                      <ol style="margin-left: 20px; counter-reset: step-detail;">
                        ${guide.steps.map(step => `
                          <li style="margin-bottom: 6px; padding-left: 25px; position: relative; font-size: 13px; color: #166534;">
                            ${escapeHTML(step)}
                          </li>
                        `).join('')}
                      </ol>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="section">
                  <h4 class="section-title">📝 Comment utiliser</h4>
                  <ol>
                    ${module.howToUse.map(step => `<li>${escapeHTML(step)}</li>`).join('')}
                  </ol>
                </div>
              `}

              <div class="tip">
                <div class="tip-title">💡 Conseils pratiques</div>
                <ul>
                  ${module.tips.map(t => `<li>${escapeHTML(t)}</li>`).join('')}
                </ul>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}

      <div class="footer">
        <p>© ${new Date().getFullYear()} - Plateforme de Gestion Scolaire - Tous droits réservés</p>
      </div>

    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.print(); };
  onComplete();
};
