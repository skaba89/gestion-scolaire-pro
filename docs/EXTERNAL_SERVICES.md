# Configuration des Services Externes

## 📧 Resend (Envoi d'emails)

### Obtenir une clé API

1. Créez un compte sur [resend.com](https://resend.com)
2. Allez dans **API Keys**
3. Cliquez sur **Create API Key**
4. Copiez la clé générée (elle commence par `re_`)

### Configuration

Dans `.env.docker`, remplacez :
```bash
RESEND_API_KEY=re_placeholder_key
```

Par :
```bash
RESEND_API_KEY=re_votre_vraie_cle_ici
```

Puis redémarrez :
```bash
docker compose --env-file .env.docker restart supabase-functions
```

---

## 💳 Stripe (Paiements en ligne)

### Obtenir une clé API

1. Créez un compte sur [stripe.com](https://stripe.com)
2. Allez dans **Developers > API keys**
3. Copiez la **Secret key** (mode Test pour commencer)

### Configuration

Dans `.env.docker`, remplacez :
```bash
STRIPE_SECRET_KEY=sk_test_placeholder_key
```

Par :
```bash
STRIPE_SECRET_KEY=sk_test_votre_vraie_cle_ici
```

Puis redémarrez :
```bash
docker compose --env-file .env.docker restart supabase-functions
```

---

## ✅ Vérification

Après configuration, testez :

1. **Envoi d'email** : Finances > Factures > Actions > Envoyer par email
2. **Téléchargement PDF** : Finances > Factures > Actions > Télécharger PDF
3. **Paiement Stripe** : Portail parent > Payer une facture en ligne

---

## 🔍 Dépannage

Si les fonctions ne marchent toujours pas :

```bash
# Vérifier les logs
docker compose logs --tail 50 supabase-functions

# Vérifier les variables d'environnement
docker exec schoolflow-pro-supabase-functions-1 env | findstr "RESEND\|STRIPE"
```
