import { creerBase } from './base.js';
import { creerHttp } from './http.js';
import { brancherTempsReel } from './temps-reel.js';

export function creerApplication(options = {}) {
  const base = creerBase(options.dbPath);
  const contexte = { base, temps: null };
  const server = creerHttp(contexte);
  contexte.temps = brancherTempsReel(server, contexte);

  return {
    server,
    base,
    close() {
      return new Promise((resolve) => {
        contexte.temps.arreter();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close(() => {
          try { base.fermer(); } catch { /* déjà fermée */ }
          resolve();
        });
      });
    },
  };
}
