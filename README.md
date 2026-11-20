# DataMind AI — Plateforme SaaS d'analytique conversationnelle sécurisée

**DataMind AI** est une plateforme SaaS multi-tenant intégralement en français permettant aux entreprises de connecter leurs bases **PostgreSQL** et **MySQL** en lecture seule et d'interroger leurs indicateurs métier en langage naturel.

---

## Architecture & sécurité obligatoire

- **Isolation stricte multi-tenant** : toutes les requêtes API filtrent par `organizationId` issu de la session authentifiée ; les migrations PostgreSQL (`migrations/001_initial_schema.sql`) activent également le Row-Level Security (RLS) et Firestore applique des règles zero-trust (`firestore.rules`).
- **Pare-feu SQL lecture seule (`src/core/sqlFirewall.ts`)** :
  - Le modèle IA ne reçoit **jamais** d'accès direct à la base de données.
  - Validation côté serveur imposant exclusivement `SELECT` ou `WITH`.
  - Blocage strict de toute commande d'écriture ou DDL (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `EXEC`, `PRAGMA`, multi-statements `;`, commentaires `--` / `/* */`, tables système).
  - Application stricte de l'**allowlist des tables et colonnes** (blocage des colonnes sensibles comme `customers.iban` et refus de `SELECT *` dès qu'une colonne est masquée).
  - Plafonnement automatique de `LIMIT` et timeout d'exécution.
- **Protection anti-prompt injection** : détection en amont des tentatives de contournement d'instructions, d'extraction de secrets ou de commandes destructrices, avec blocage immédiat et journalisation d'audit.
- **Chiffrement des identifiants (`src/core/crypto.ts`)** : chiffrement authentifié **AES-256-GCM** des mots de passe de sources externes + connexions **TLS** (`verify-full` / `require`).
- **Couche métier sémantique (`src/core/semanticLayer.ts`)** : définitions centralisées (*Chiffre d'affaires facturé HT*, *Ventes encaissées TTC*, *Factures impayées TTC*, *Marge brute commerciale*, *Taux de marge brute*) transmises au moteur IA.
- **Adaptateur IA multi-fournisseurs (`src/server/aiOrchestrator.ts`)** : compatible **Gemini API**, **Ollama (Qwen 2.5 Coder)** et **OpenAI API** via variables d'environnement serveur uniquement.

---

## Pages disponibles (100 % français)

1. **Connexion** & **Inscription** (email/mot de passe bcrypt, Google Sign-In Firebase, ou accès rapide à l'organisation démo *Atelier Nord SAS*)
2. **Tableau de bord** (KPI financiers calculés en SQL, graphiques de tendances, factures impayées prioritaires, alertes de stock)
3. **Assistant IA** (chat en français, SQL validé inspectable, graphique dynamique, tableau triable, export CSV, sauvegarde en rapport, historique)
4. **Sources de données** (ajout PostgreSQL/MySQL TLS, test de connexion, découverte de schéma, éditeur d'allowlist tables/colonnes et gestion de la couche sémantique)
5. **Rapports** (rapports SQL enregistrés, réexécution sécurisée en un clic, export CSV)
6. **Alertes** (surveillance des seuils de stock entrepôts, prise en charge et résolution)
7. **Équipe et permissions** (invitations, gestion des rôles RBAC : Propriétaire, Administrateur, Analyste, Lecteur)
8. **Abonnement** (suivi du quota mensuel de requêtes IA et changement d'offre Essentiel / Croissance / Entreprise)
9. **Paramètres** (organisation, sélection du fournisseur IA serveur, politiques TLS/allowlist/limites SQL)
10. **Administration** (supervision SaaS multi-tenant, MRR, organisations locataires, journal d'audit filtrable)

---

## Compte de démonstration

- **Email** : `camille.laurent@atelier-nord.fr`
- **Mot de passe** : `DataMind2026!`
- **Organisation** : Atelier Nord SAS (entrepôt SQL analytique de démonstration prérempli : 10 clients B2B, 12 produits, 3 entrepôts, 100+ commandes et factures 2026, niveaux de stock sous seuil).

---

## Démarrage local & tests

```bash
# 1. Installer les dépendances
npm install

# 2. Copier la configuration d'exemple (ne jamais commiter de clés)
cp .env.example .env

# 3. Lancer les tests unitaires (Pare-feu SQL, allowlist, prompt injection, AES-256-GCM, RBAC, quotas)
npm test

# 4. Démarrer la plateforme complète (Frontend + Backend API sur le port 3000)
npm run dev
```

## Déploiement Docker Compose (avec PostgreSQL & Ollama Qwen)

```bash
docker compose up -d --build
# Optionnel : télécharger Qwen 2.5 Coder dans le conteneur Ollama
docker exec -it datamind_ollama_qwen ollama pull qwen2.5-coder:7b
```
