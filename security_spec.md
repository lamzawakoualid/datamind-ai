# Spécification de sécurité Firestore — DataMind AI (Phase 0 TDD)

## 1. Invariants de données (Multi-tenant & Zero-Trust)
1. **Isolation stricte des locataires** : Aucun document sous `/organizations/{orgId}/...` n'est lisible ou modifiable par un utilisateur qui n'est pas membre vérifié dans `/organizations/{orgId}/members/{uid}`.
2. **Protection PII** : Les profils `/users/{userId}` contenant `email` ne sont accessibles qu'au propriétaire (`request.auth.uid == userId`) ou à un administrateur plateforme vérifié (`email_verified == true`).
3. **Intégrité d'identité** : Tout champ `ownerId`, `authorId`, `uid` ou `userId` doit correspondre exactement à `request.auth.uid` à la création et demeure immuable à la mise à jour.
4. **Anti-élévation de privilèges** : Un utilisateur ne peut jamais s'auto-attribuer le rôle `owner` ou `admin` sur une organisation existante ni injecter de champs fantômes (`hasOnly`).
5. **Intégrité temporelle & bornes** : Tous les `createdAt` / `updatedAt` sont validés via `request.time`, tous les identifiants respectent `^[a-zA-Z0-9_\-]+$` (<= 128 caractères) et toutes les chaînes sont bornées.

## 2. Les 12 charges utiles adverses (« Dirty Dozen ») devant retourner PERMISSION_DENIED
1. **Usurpation d'identité à la création d'organisation** : `POST /organizations/org-2` avec `ownerId: "autre-uid"` différent de `request.auth.uid`.
2. **Shadow Update / champ fantôme** : `UPDATE /organizations/org-1` ajoutant `isEnterpriseFree: true` ou `isPlatformAdmin: true`.
3. **Spoofing d'email administrateur non vérifié** : Lecture `/users/victime` avec `token.email == "ramadankarim2131@gmail.com"` mais `token.email_verified == false`.
4. **Fuite PII inter-utilisateurs** : `GET /users/autre-uid` par un utilisateur authentifié standard.
5. **Poisoning d'identifiant (ID > 128 chars ou caractères spéciaux)** : `CREATE /organizations/../../../admin` ou ID de 200 caractères.
6. **Dépassement de taille de champ (Denial of Wallet)** : `CREATE /organizations/org-1/reports/rep-1` avec `sqlQuery` de 50 000 caractères.
7. **Auto-élévation de rôle RBAC** : Un membre `viewer` tente `UPDATE /organizations/org-1/members/{uid}` avec `role: "owner"`.
8. **Violation d'isolation cross-tenant** : Un membre de `org-1` tente de lire `/organizations/org-2/reports/rep-9`.
9. **Mutation de champ immuable** : `UPDATE /organizations/org-1/reports/rep-1` modifiant `authorId` ou `createdAt`.
10. **Falsification d'horodatage** : `CREATE /organizations/org-1/conversations/c-1` avec `createdAt` antidaté (différent de `request.time`).
11. **Value Poisoning sur clé autorisée** : `UPDATE /organizations/org-1` avec `plan: "unlimited_hack"` (hors enum `starter|pro|enterprise`).
12. **Écriture sur conversation terminale/immuable** : Tentative d'`UPDATE` ou `DELETE` d'une entrée d'historique de conversation par un non-administrateur.
