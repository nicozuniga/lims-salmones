/**
 * db.js — Capa de acceso a datos.
 *
 * Toda la app habla con esta capa, nunca con localStorage directamente.
 * Cada método imita la forma de una futura llamada a API/SQLite
 * (getAll/getById/create/update/remove) para que migrar el storage
 * más adelante solo implique reescribir este archivo.
 */

// ponytail: claves distintas a las de la versión vigente para que, si ambas
// se abren en el mismo navegador (file://), no compartan ni corrompan datos.
const STORAGE_KEYS = {
  CASES: 'lims_cases_legacy_v1',
  PATHOLOGIES: 'lims_pathologies_legacy_v1',
};

// ponytail: seed data fijo, sin importador de archivos. Si el catálogo crece,
// mover esto a un JSON separado cargado por fetch.
const SEED_PATHOLOGIES = [
  { name: 'SRS (Piscirickettsia salmonis)', ctCutoff: 35, description: 'Síndrome Rickettsial del Salmón', status: 'Activo' },
  { name: 'ISA (Anemia Infecciosa del Salmón)', ctCutoff: 32, description: 'Orthomyxovirus, notificación obligatoria', status: 'Activo' },
  { name: 'IPN (Necrosis Pancreática Infecciosa)', ctCutoff: 33, description: 'Birnavirus, alta prevalencia en agua dulce', status: 'Activo' },
  { name: 'Caligus rogercresseyi', ctCutoff: 30, description: 'Copépodo ectoparásito (piojo de mar)', status: 'Activo' },
  { name: 'BKD (Renibacterium salmoninarum)', ctCutoff: 34, description: 'Enfermedad bacteriana renal', status: 'Activo' },
  { name: 'Flavobacterium psychrophilum', ctCutoff: 33, description: 'Enfermedad del agua fría / RTFS', status: 'Activo' },
  { name: 'Tenacibaculum maritimum', ctCutoff: 32, description: 'Tenacibaculosis, lesiones cutáneas', status: 'Activo' },
  { name: 'Yersinia ruckeri', ctCutoff: 33, description: 'Enfermedad de la boca roja (ERM)', status: 'Activo' },
  { name: 'Vibrio anguillarum', ctCutoff: 31, description: 'Vibriosis clásica', status: 'Activo' },
];

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeeded() {
  if (!readStore(STORAGE_KEYS.PATHOLOGIES)) {
    const seeded = SEED_PATHOLOGIES.map((p) => ({ id: Utils.generateId(), ...p }));
    writeStore(STORAGE_KEYS.PATHOLOGIES, seeded);
  }
  if (!readStore(STORAGE_KEYS.CASES)) {
    writeStore(STORAGE_KEYS.CASES, []);
  }
}

const DB = {
  init() {
    ensureSeeded();
  },

  // ---------- Patologías ----------
  pathologies: {
    getAll() {
      return readStore(STORAGE_KEYS.PATHOLOGIES) || [];
    },
    getById(id) {
      return this.getAll().find((p) => p.id === id) || null;
    },
    create(data) {
      const all = this.getAll();
      const record = { id: Utils.generateId(), ...data };
      all.push(record);
      writeStore(STORAGE_KEYS.PATHOLOGIES, all);
      return record;
    },
    update(id, data) {
      const all = this.getAll();
      const idx = all.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      all[idx] = { ...all[idx], ...data, id };
      writeStore(STORAGE_KEYS.PATHOLOGIES, all);
      return all[idx];
    },
    remove(id) {
      const all = this.getAll().filter((p) => p.id !== id);
      writeStore(STORAGE_KEYS.PATHOLOGIES, all);
    },
  },

  // ---------- Casos ----------
  cases: {
    getAll() {
      return readStore(STORAGE_KEYS.CASES) || [];
    },
    getById(id) {
      return this.getAll().find((c) => c.id === id) || null;
    },
    create(data) {
      const all = this.getAll();
      const record = { id: Utils.generateId(), ...data };
      all.push(record);
      writeStore(STORAGE_KEYS.CASES, all);
      return record;
    },
    update(id, data) {
      const all = this.getAll();
      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      all[idx] = { ...all[idx], ...data, id };
      writeStore(STORAGE_KEYS.CASES, all);
      return all[idx];
    },
    remove(id) {
      const all = this.getAll().filter((c) => c.id !== id);
      writeStore(STORAGE_KEYS.CASES, all);
    },
  },
};
