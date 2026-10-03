/** API route composition root mounted by server.js at /api/v1. */
import { Router } from 'express';
import { registerAuthRoutes } from './auth.js';
import { registerAuditRoutes } from './audit.js';
import { registerPegawaiRoutes } from './pegawai.js';
import { registerMasterRoutes } from './master.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerPersonelRoutes } from './personel.js';

export const router = Router();

// Keep registration order explicit: public/auth routes first, then resources.
registerAuthRoutes(router);
registerAuditRoutes(router);
registerPegawaiRoutes(router);
registerMasterRoutes(router);
registerDashboardRoutes(router);
registerPersonelRoutes(router);
