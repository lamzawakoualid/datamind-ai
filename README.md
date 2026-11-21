# DataMind AI — Plateforme SaaS d'analytique conversationnelle sécurisée (Maroc · MAD)

**DataMind AI** est une plateforme SaaS multi-tenant **100 % en français**, adaptée au marché marocain (**Dirham marocain — MAD**, TVA 20 %, conformité **Loi 09-08 / CNDP**), permettant aux entreprises de connecter leurs bases **PostgreSQL** et **MySQL** en lecture seule et d'interroger leurs indicateurs métier en langage naturel.

---

## Architecture & sécurité obligatoire

- **Isolation stricte multi-tenant** : toutes les requêtes API filtrent par `organizationId` issu de la session authentifiée ; les migrations PostgreSQL (`migrations/001_initial_schema.sql`) activent le Row-Level Security (RLS) et Firestore applique des règles zero-trust (`firestore.rules`).
- **Pare-feu SQL lecture seule (`src/core/sqlFirewall.ts`)** :
  - Le modèle IA ne reçoit **jamais** d'accès direct à la base de données.
  - Validation côté serveur imposant exclusivement `SELECT` ou `WITH`.
  - Blocage strict de toute commande d'écriture ou DDL (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `EXEC`, `PRAGMA`, multi-instructions `;`, commentaires `--` / `/* */`, tables système).
  - Application stricte de l'**allowlist des tables et colonnes** (blocage des colonnes sensibles comme `customers.iban` / RIB et refus de `SELECT *` dès qu'une colonne est masquée).
  - Plafonnement automatique de `LIMIT` et timeout d'exécution.
- **Protection anti-prompt injection** : détection en amont des tentatives de contournement d'instructions, d'extraction de secrets ou de commandes destructrices, avec blocage immédiat et journalisation d'audit.
- **Chiffrement des identifiants (`src/core/crypto.ts`)** : chiffrement authentifié **AES-256-GCM** des mots de passe de sources externes + connexions **TLS** (`verify-full` / `require`).
- **Couche métier sémantique (`src/core/semanticLayer.ts`)** : définitions centralisées (*Chiffre d'affaires facturé HT*, *Ventes encaissées TTC*, *Factures impayées TTC*, *Marge brute commerciale*, *Taux de marge brute*) exprimées en **MAD** et transmises au moteur IA.
- **Adaptateur IA multi-fournisseurs (`src/server/aiOrchestrator.ts`)** : compatible **Gemini API**, **Ollama (Qwen 2.5 Coder souverain)** et **OpenAI API** via variables d'environnement serveur uniquement.
- **Conformité Maroc (Loi 09-08 / CNDP & Fiscalité)** : notice de confidentialité CNDP, CGU, tarification en **MAD HT / TTC (TVA 20 %)** et génération de facture proforma B2B (ICE, IF, RC, CMI / virement bancaire).

---

## Pages & modules livrés (100 % français)

1. **Connexion & Inscription** — Authentification bcrypt email/mot de passe, Google Sign-In Firebase, accès rapide à l'organisation démo *Atlas Industrie SARL*, mentions légales Loi 09-08 / CGU.
2. **Tableau de bord** — 4 KPI financiers en **MAD** calculés en SQL, graphiques d'évolution mensuelle et par catégorie, factures impayées prioritaires, alertes de stock critiques.
3. **Assistant IA** — Questionnement en français, garde-fou anti-prompt injection testable en un clic, SQL lecture seule validé et copiable, graphique dynamique, tableau de données, export CSV, enregistrement en rapport, historique.
4. **Sources de données & Couche métier sémantique** — Connexion PostgreSQL/MySQL TLS lecture seule, test de connectivité, découverte de schéma, éditeur d'allowlist tables/colonnes (RIB/IBAN masqué) et dictionnaire des indicateurs métier.
5. **Rapports** — Rapports SQL validés, réexécution sécurisée à la demande, export CSV.
6. **Alertes** — Détection automatique des seuils de stock entrepôts (*Casablanca-Aïn Sebaâ*, *Tanger-Med*, *Marrakech-Sidi Ghanem*), prise en charge et résolution.
7. **Équipe et permissions** — Invitations et gestion RBAC granulaire (*Propriétaire*, *Administrateur*, *Analyste*, *Lecteur*).
8. **Abonnement** — Suivi des quotas IA, forfaits en **MAD** (*Essentiel* `1 490 MAD HT`, *Croissance* `3 900 MAD HT`, *Entreprise* `9 900 MAD HT`), téléchargement de **facture proforma TVA 20 % (ICE / CMI / Virement)**.
9. **Paramètres** — Identité organisation, routage fournisseur IA serveur (Gemini / Ollama Qwen / OpenAI), politiques TLS/allowlist/limites SQL, accès aux notices CNDP & CGU.
10. **Administration** — Supervision SaaS multi-tenant, MRR en **MAD**, organisations locataires isolées, journal d'audit sécurité filtrable.

---

## Compte de démonstration (Maroc · MAD)

- **Email** : `salma.benjelloun@atlas-industrie.ma`
- **Mot de passe** : `DataMind2026!`
- **Organisation** : **Atlas Industrie SARL** (Casablanca) — entrepôt SQL analytique prérempli (10 clients B2B marocains, 12 produits industriels tarifés en MAD, 3 entrepôts au Maroc, 100+ commandes & factures 2026, niveaux de stock sous seuil).

---

## Démarrage local & tests

```bash
# 1. Installer les dépendances
npm install

# 2. Copier le fichier de configuration (ne jamais commiter de secrets)
cp .env.example .env

# 3. Exécuter la suite de tests unitaires (Pare-feu SQL, allowlist, prompt injection, AES-256-GCM, RBAC & quotas)
npm test

# 4. Vérification TypeScript et build production
npm run lint
npm run build

# 5. Démarrer la plateforme complète (Frontend + API sur le port 3000)
npm run dev
```

Endpoint de supervision production : `GET /api/health`

---

## Déploiement Docker Compose (Production avec PostgreSQL & Ollama Qwen)

```bash
docker compose up -d --build

# Optionnel : activer le modèle souverain Qwen 2.5 Coder sur Ollama
docker exec -it datamind_ollama_qwen ollama pull qwen2.5-coder:7b
```

---

## Checklist avant mise en production commerciale

1. **Secrets serveur** : définir `GEMINI_API_KEY` (ou `OLLAMA_BASE_URL` / `OPENAI_API_KEY`) et un `APP_ENCRYPTION_KEY` aléatoire de 32+ octets uniquement dans le gestionnaire de secrets (jamais dans le code).
2. **Base PostgreSQL managée** : appliquer `migrations/001_initial_schema.sql` et activer les sauvegardes quotidiennes chiffrées.
3. **Comptes clients en lecture seule** : créer un rôle SQL dédié avec privilège `SELECT` uniquement + TLS obligatoire + filtrage IP.
4. **Règles Firestore** : relire et auditer `firestore.rules` selon votre politique interne.
5. **Encaissement Maroc** : brancher votre compte marchand **CMI** (ou Stripe / virement B2B) sur la page *Abonnement* et renseigner vos propres `ICE`, `IF` et `RC` dans le modèle de facture proforma.
