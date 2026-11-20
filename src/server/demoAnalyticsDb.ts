import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { TableAllowlistItem } from '../core/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEMO_DB_PATH = path.join(DATA_DIR, 'demo_warehouse.sqlite');

export function ensureDemoWarehouse(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DEMO_DB_PATH)) {
    return DEMO_DB_PATH;
  }

  const db = new Database(DEMO_DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      company_name TEXT NOT NULL,
      segment TEXT NOT NULL,
      region TEXT NOT NULL,
      city TEXT NOT NULL,
      account_manager TEXT NOT NULL,
      created_at TEXT NOT NULL,
      iban TEXT NOT NULL
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL,
      supplier TEXT NOT NULL
    );

    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      city TEXT NOT NULL
    );

    CREATE TABLE stock_levels (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      quantity_on_hand INTEGER NOT NULL,
      min_threshold INTEGER NOT NULL,
      daily_run_rate REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_date TEXT NOT NULL,
      status TEXT NOT NULL,
      channel TEXT NOT NULL
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL
    );

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      issued_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      paid_at TEXT,
      amount_ht REAL NOT NULL,
      amount_ttc REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE internal_audit_secrets (
      id INTEGER PRIMARY KEY,
      secret_label TEXT NOT NULL,
      secret_value TEXT NOT NULL
    );
  `);

  const insertCustomer = db.prepare(
    'INSERT INTO customers (id, company_name, segment, region, city, account_manager, created_at, iban) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const customers = [
    [1, 'Énergie Rhône Industrie', 'Grand Compte', 'Auvergne-Rhône-Alpes', 'Lyon', 'Camille Laurent', '2024-03-14', 'FR7630006000011234567890189'],
    [2, 'AéroTech Toulouse SAS', 'Grand Compte', 'Occitanie', 'Toulouse', 'Marc Delacroix', '2024-05-02', 'FR7630004000019876543210112'],
    [3, 'NordLogistique Services', 'ETI', 'Hauts-de-France', 'Lille', 'Camille Laurent', '2024-07-19', 'FR7610278060010002019482155'],
    [4, 'Seine Distribution Pro', 'Grand Compte', 'Île-de-France', 'Nanterre', 'Sofia Benali', '2024-09-10', 'FR7630003011000005012345611'],
    [5, 'Aquitaine Mécanique', 'ETI', 'Nouvelle-Aquitaine', 'Bordeaux', 'Marc Delacroix', '2024-11-28', 'FR7617515006000800192837461'],
    [6, 'Alsace Automatisme', 'PME', 'Grand Est', 'Strasbourg', 'Sofia Benali', '2025-01-12', 'FR7614707000103192837465190'],
    [7, 'Bretagne Capteurs & Systèmes', 'PME', 'Bretagne', 'Rennes', 'Camille Laurent', '2025-02-24', 'FR7615589291000001928374612'],
    [8, 'Provence Équipements', 'ETI', 'Provence-Alpes-Côte d’Azur', 'Marseille', 'Marc Delacroix', '2025-04-06', 'FR7611315000010800918273645'],
    [9, 'Val-de-Loire Process', 'PME', 'Centre-Val de Loire', 'Tours', 'Sofia Benali', '2025-06-18', 'FR7614505000010800123987451'],
    [10, 'Paris Infra Réseaux', 'Grand Compte', 'Île-de-France', 'Paris', 'Camille Laurent', '2025-08-04', 'FR7630002005500000157845Z02'],
  ];
  for (const c of customers) insertCustomer.run(...c);

  const insertProduct = db.prepare(
    'INSERT INTO products (id, sku, name, category, unit_price, unit_cost, supplier) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const products = [
    [1, 'CAP-TH400', 'Capteur thermique industriel TH-400', 'Capteurs IoT', 420, 215, 'SensoTech Europe'],
    [2, 'CAP-PR210', 'Sonde de pression différentielle PR-210', 'Capteurs IoT', 580, 310, 'SensoTech Europe'],
    [3, 'CAP-VB90', 'Accéléromètre vibration prédictive VB-90', 'Capteurs IoT', 690, 360, 'Alps Micro'],
    [4, 'EQP-PLC8', 'Automate programmable modulaire PLC-8', 'Équipements industriels', 1850, 1080, 'Helvetia Controls'],
    [5, 'EQP-VAR32', 'Variateur de fréquence triphasé 32A', 'Équipements industriels', 1420, 840, 'Helvetia Controls'],
    [6, 'EQP-ALIM24', 'Alimentation redondante rail DIN 24V', 'Équipements industriels', 340, 175, 'VoltPro Lyon'],
    [7, 'RES-SW16', 'Switch Ethernet industriel 16 ports PoE', 'Composants réseau', 960, 520, 'NetCore France'],
    [8, 'RES-GW5G', 'Passerelle Edge 5G chiffrée TLS', 'Composants réseau', 1290, 690, 'NetCore France'],
    [9, 'RES-FIB10', 'Module optique SFP+ 10Gb durci', 'Composants réseau', 240, 110, 'OptiLink SAS'],
    [10, 'MNT-KIT01', 'Kit maintenance préventive joints & filtres', 'Maintenance & Pièces', 195, 78, 'Atelier Pièces Nord'],
    [11, 'MNT-BAT48', 'Pack batterie secours LiFePO4 48V', 'Maintenance & Pièces', 510, 295, 'VoltPro Lyon'],
    [12, 'MNT-CAB20', 'Câble blindé haute température 20m', 'Maintenance & Pièces', 145, 62, 'Atelier Pièces Nord'],
  ];
  for (const p of products) insertProduct.run(...p);

  const insertWarehouse = db.prepare('INSERT INTO warehouses (id, code, name, city) VALUES (?, ?, ?, ?)');
  insertWarehouse.run(1, 'WH-LYO', 'Entrepôt Lyon-Est', 'Lyon');
  insertWarehouse.run(2, 'WH-LIL', 'Entrepôt Lille-Nord', 'Lille');
  insertWarehouse.run(3, 'WH-BDX', 'Entrepôt Bordeaux-Ouest', 'Bordeaux');

  const insertStock = db.prepare(
    'INSERT INTO stock_levels (id, product_id, warehouse_id, quantity_on_hand, min_threshold, daily_run_rate, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const stockRows: Array<[number, number, number, number, number, number, string]> = [
    [1, 1, 1, 14, 30, 3.2, '2026-11-20'],
    [2, 2, 1, 48, 25, 1.8, '2026-11-20'],
    [3, 3, 2, 6, 20, 2.4, '2026-11-20'],
    [4, 4, 1, 9, 15, 1.5, '2026-11-20'],
    [5, 5, 2, 34, 18, 1.1, '2026-11-20'],
    [6, 6, 3, 82, 40, 2.9, '2026-11-20'],
    [7, 7, 1, 11, 22, 1.9, '2026-11-20'],
    [8, 8, 2, 4, 16, 1.6, '2026-11-20'],
    [9, 9, 3, 120, 45, 3.5, '2026-11-20'],
    [10, 10, 3, 19, 35, 4.1, '2026-11-20'],
    [11, 11, 2, 27, 20, 1.2, '2026-11-20'],
    [12, 12, 1, 145, 50, 4.8, '2026-11-20'],
  ];
  for (const s of stockRows) insertStock.run(...s);

  const insertOrder = db.prepare(
    'INSERT INTO orders (id, order_number, customer_id, order_date, status, channel) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)'
  );
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (id, invoice_number, order_id, customer_id, issued_at, due_at, paid_at, amount_ht, amount_ttc, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const channels = ['Vente directe', 'Portail B2B', 'Partenaire intégrateur'];
  const productPrices = new Map<number, number>(products.map((p) => [p[0] as number, p[4] as number]));

  let orderId = 1;
  let itemId = 1;
  // Deterministic 11 months of 2026 (Jan -> Nov) with growing revenue trajectory
  for (let month = 1; month <= 11; month++) {
    const ordersInMonth = 7 + (month % 3) + Math.floor(month / 4);
    for (let k = 0; k < ordersInMonth; k++) {
      const day = Math.min(27, 2 + k * 2 + (month % 3));
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const orderDate = `2026-${mm}-${dd}`;
      const customerId = ((orderId * 3 + month) % 10) + 1;
      const channel = channels[(orderId + month) % channels.length];
      const orderStatus = month === 11 && k >= ordersInMonth - 2 ? 'processing' : 'delivered';

      insertOrder.run(
        orderId,
        `CMD-2026-${String(orderId).padStart(4, '0')}`,
        customerId,
        orderDate,
        orderStatus,
        channel
      );

      let amountHt = 0;
      const lineCount = 2 + (orderId % 2);
      for (let li = 0; li < lineCount; li++) {
        const prodId = ((orderId * 5 + li * 3 + month) % 12) + 1;
        const qty = 2 + ((orderId + li + month) % 7);
        const unitPrice = productPrices.get(prodId) || 500;
        insertItem.run(itemId, orderId, prodId, qty, unitPrice);
        amountHt += qty * unitPrice;
        itemId++;
      }

      const amountTtc = Math.round(amountHt * 1.2 * 100) / 100;
      const dueMonth = month < 12 ? month + 1 : 12;
      const dueDate = `2026-${String(dueMonth).padStart(2, '0')}-${dd}`;

      let invStatus = 'paid';
      let paidAt: string | null = `2026-${mm}-${String(Math.min(28, day + 8)).padStart(2, '0')}`;
      if (orderId % 19 === 0) {
        invStatus = 'cancelled';
        paidAt = null;
      } else if (month >= 10 && orderId % 4 === 0) {
        invStatus = 'overdue';
        paidAt = null;
      } else if (month === 11 && k >= ordersInMonth - 3) {
        invStatus = 'pending';
        paidAt = null;
      } else if (month === 9 && orderId % 7 === 0) {
        invStatus = 'overdue';
        paidAt = null;
      }

      insertInvoice.run(
        orderId,
        `FAC-2026-${String(orderId).padStart(4, '0')}`,
        orderId,
        customerId,
        orderDate,
        dueDate,
        paidAt,
        Math.round(amountHt * 100) / 100,
        amountTtc,
        invStatus
      );
      orderId++;
    }
  }

  db.prepare('INSERT INTO internal_audit_secrets (id, secret_label, secret_value) VALUES (?, ?, ?)').run(
    1,
    'cle_interne_non_autorisee',
    'NE_JAMAIS_EXPOSER_AU_LLM'
  );

  db.close();
  return DEMO_DB_PATH;
}

export function getDefaultDemoAllowlist(): TableAllowlistItem[] {
  return [
    {
      name: 'customers',
      allowed: true,
      rowCount: 10,
      description: 'Comptes clients B2B par région et segment',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'company_name', type: 'TEXT', allowed: true, description: 'Raison sociale' },
        { name: 'segment', type: 'TEXT', allowed: true, description: 'Grand Compte, ETI, PME' },
        { name: 'region', type: 'TEXT', allowed: true, description: 'Région française' },
        { name: 'city', type: 'TEXT', allowed: true },
        { name: 'account_manager', type: 'TEXT', allowed: true },
        { name: 'created_at', type: 'TEXT', allowed: true },
        { name: 'iban', type: 'TEXT', allowed: false, sensitive: true, description: 'Coordonnée bancaire masquée' },
      ],
    },
    {
      name: 'products',
      allowed: true,
      rowCount: 12,
      description: 'Catalogue produits, prix de vente et coût d’achat',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'sku', type: 'TEXT', allowed: true },
        { name: 'name', type: 'TEXT', allowed: true },
        { name: 'category', type: 'TEXT', allowed: true },
        { name: 'unit_price', type: 'REAL', allowed: true, description: 'Prix unitaire HT (MAD)' },
        { name: 'unit_cost', type: 'REAL', allowed: true, description: 'Coût d’achat unitaire HT (MAD)' },
        { name: 'supplier', type: 'TEXT', allowed: true },
      ],
    },
    {
      name: 'warehouses',
      allowed: true,
      rowCount: 3,
      description: 'Entrepôts logistiques régionaux',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'code', type: 'TEXT', allowed: true },
        { name: 'name', type: 'TEXT', allowed: true },
        { name: 'city', type: 'TEXT', allowed: true },
      ],
    },
    {
      name: 'stock_levels',
      allowed: true,
      rowCount: 12,
      description: 'Niveaux de stock courants et seuils minimums par entrepôt',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'product_id', type: 'INTEGER', allowed: true },
        { name: 'warehouse_id', type: 'INTEGER', allowed: true },
        { name: 'quantity_on_hand', type: 'INTEGER', allowed: true },
        { name: 'min_threshold', type: 'INTEGER', allowed: true },
        { name: 'daily_run_rate', type: 'REAL', allowed: true },
        { name: 'updated_at', type: 'TEXT', allowed: true },
      ],
    },
    {
      name: 'orders',
      allowed: true,
      rowCount: 103,
      description: 'Commandes clients et canal d’acquisition',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'order_number', type: 'TEXT', allowed: true },
        { name: 'customer_id', type: 'INTEGER', allowed: true },
        { name: 'order_date', type: 'TEXT', allowed: true },
        { name: 'status', type: 'TEXT', allowed: true },
        { name: 'channel', type: 'TEXT', allowed: true },
      ],
    },
    {
      name: 'order_items',
      allowed: true,
      rowCount: 258,
      description: 'Détail des lignes de commande par produit',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'order_id', type: 'INTEGER', allowed: true },
        { name: 'product_id', type: 'INTEGER', allowed: true },
        { name: 'quantity', type: 'INTEGER', allowed: true },
        { name: 'unit_price', type: 'REAL', allowed: true },
      ],
    },
    {
      name: 'invoices',
      allowed: true,
      rowCount: 103,
      description: 'Factures clients, statuts (paid, pending, overdue, cancelled)',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: true },
        { name: 'invoice_number', type: 'TEXT', allowed: true },
        { name: 'order_id', type: 'INTEGER', allowed: true },
        { name: 'customer_id', type: 'INTEGER', allowed: true },
        { name: 'issued_at', type: 'TEXT', allowed: true },
        { name: 'due_at', type: 'TEXT', allowed: true },
        { name: 'paid_at', type: 'TEXT', allowed: true },
        { name: 'amount_ht', type: 'REAL', allowed: true },
        { name: 'amount_ttc', type: 'REAL', allowed: true },
        { name: 'status', type: 'TEXT', allowed: true },
      ],
    },
    {
      name: 'internal_audit_secrets',
      allowed: false,
      rowCount: 1,
      description: 'Table technique interne exclue de l’allowlist IA',
      columns: [
        { name: 'id', type: 'INTEGER', allowed: false },
        { name: 'secret_label', type: 'TEXT', allowed: false, sensitive: true },
        { name: 'secret_value', type: 'TEXT', allowed: false, sensitive: true },
      ],
    },
  ];
}

export function executeDemoReadOnlyQuery(sql: string): {
  columns: string[];
  rows: Record<string, unknown>[];
  executionMs: number;
} {
  const dbPath = ensureDemoWarehouse();
  const started = performance.now();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all() as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : stmt.columns().map((c) => c.name);
    const executionMs = Math.max(1, Math.round(performance.now() - started));
    return { columns, rows, executionMs };
  } finally {
    db.close();
  }
}

export function discoverDemoSchema(): TableAllowlistItem[] {
  const dbPath = ensureDemoWarehouse();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const defaults = new Map(getDefaultDemoAllowlist().map((t) => [t.name, t]));
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;

    return tables.map((t) => {
      const existing = defaults.get(t.name);
      const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM "${t.name}"`).get() as { cnt: number };
      const colInfo = db.prepare(`PRAGMA table_info("${t.name}")`).all() as Array<{ name: string; type: string }>;
      const existingCols = new Map((existing?.columns || []).map((c) => [c.name, c]));
      const isSensitiveTable = /secret|password|credential|token/i.test(t.name);

      return {
        name: t.name,
        allowed: existing ? existing.allowed : !isSensitiveTable,
        rowCount: countRow.cnt,
        description: existing?.description || 'Table découverte automatiquement',
        columns: colInfo.map((c) => {
          const prev = existingCols.get(c.name);
          const isSensitiveCol = /iban|password|secret|token|hash|ssn/i.test(c.name);
          return {
            name: c.name,
            type: c.type || 'TEXT',
            allowed: prev ? prev.allowed : !isSensitiveCol && !isSensitiveTable,
            sensitive: prev?.sensitive ?? isSensitiveCol,
            description: prev?.description,
          };
        }),
      };
    });
  } finally {
    db.close();
  }
}
