import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Modal } from './ui/primitives.tsx';

export type LegalDocType = 'privacy' | 'terms';

export function LegalModal({
  open,
  docType,
  onClose,
}: {
  open: boolean;
  docType: LegalDocType;
  onClose: () => void;
}) {
  const isPrivacy = docType === 'privacy';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isPrivacy
          ? 'Protection des données personnelles (Loi 09-08 · CNDP)'
          : 'Conditions Générales d’Utilisation (CGU)'
      }
      description={
        isPrivacy
          ? 'Engagements de DataMind AI relatifs à la confidentialité et à la sécurité des bases métiers.'
          : 'Cadre contractuel d’utilisation de la plateforme SaaS DataMind AI.'
      }
    >
      <div className="space-y-4 text-sm text-slate-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
        {isPrivacy ? (
          <>
            <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-slate-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                Conformément à la <strong>Loi n° 09-08</strong> relative à la protection des personnes physiques à l’égard du traitement des données à caractère personnel (CNDP — Royaume du Maroc), DataMind AI applique les principes de minimisation, de chiffrement et d’isolation stricte par organisation.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">1. Accès strictement contrôlé en lecture seule</h4>
              <p>
                Les bases de données PostgreSQL et MySQL connectées ne sont jamais exposées directement aux modèles d’IA. Seules les métadonnées autorisées par votre politique d’allowlist sont transmises pour générer des requêtes <code className="font-mono text-xs">SELECT</code> validées côté serveur.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">2. Chiffrement et masquage des colonnes sensibles</h4>
              <p>
                Les identifiants de connexion externes sont chiffrés au repos en <strong>AES-256-GCM</strong> et les échanges s’effectuent exclusivement via <strong>TLS</strong>. Les colonnes sensibles (RIB/IBAN, CIN, données personnelles) sont exclues par défaut de l’allowlist analytique.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">3. Hébergement souverain & droits des personnes</h4>
              <p>
                Pour les entreprises exigeant un traitement 100 % sur site (on-premise), DataMind AI peut être déployé via Docker Compose avec <strong>Ollama (Qwen)</strong> sans sortie de données vers un cloud tiers. Vous disposez à tout moment des droits d’accès, de rectification et d’opposition auprès de votre administrateur d’organisation.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">1. Objet du service</h4>
              <p>
                DataMind AI fournit une plateforme SaaS multi-tenant d’analytique conversationnelle permettant aux organisations clientes d’interroger leurs indicateurs commerciaux, financiers et logistiques en français et en dirhams marocains (MAD).
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">2. Responsabilités sécurité du client</h4>
              <p>
                Chaque organisation s’engage à connecter exclusivement des comptes SQL disposant de privilèges <strong>lecture seule (SELECT)</strong>, à maintenir sa liste d’autorisation (allowlist) à jour et à attribuer les rôles RBAC appropriés à ses collaborateurs.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">3. Facturation, TVA et quotas</h4>
              <p>
                Les abonnements sont facturés mensuellement hors taxes en dirhams marocains (MAD), majorés de la <strong>TVA applicable au Maroc (20 %)</strong>. Le règlement s’effectue par carte bancaire (CMI) ou par virement bancaire sur présentation de la facture comportant l’ICE.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-[#0F172A] mb-1">4. Traçabilité et journal d’audit</h4>
              <p>
                Toutes les connexions, modifications d’allowlist, requêtes exécutées et tentatives bloquées par le pare-feu SQL sont consignées dans le journal d’audit pendant la durée prévue par l’offre souscrite (30 à 730 jours).
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
        <Button onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  );
}
