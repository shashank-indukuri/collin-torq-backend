import type { FastifyInstance } from 'fastify';
import type { RawOffer } from './domain.js';
export const fixtureParts = { board: 'S1-33101975102', capacitor: 'S1-02420043700' };
export const fixtureModel = 'E1RD036S46B';
export const fixtureDefaults = {
  mode: 'fixture',
  model: fixtureModel,
  suppliers: ['johnstone', 'partstown', 'grainger'],
  lines: [
    { name: 'control board', quantity: 1 },
    { name: 'capacitor', quantity: 1 },
  ],
};
export function fixtureOffer(supplier: string, query: string): RawOffer | null {
  const q = query.toLowerCase();
  const board = /33101975102|control|board/.test(q);
  const cap = /02420043700|capacitor/.test(q);
  if (!board && !cap) return null;
  const exact = supplier === 'johnstone' && board;
  return {
    manufacturer: exact ? 'York' : board ? 'White-Rodgers' : 'Titan',
    partNumber: exact ? fixtureParts.board : board ? 'DEMO-47D01U-843' : 'DEMO-TOCF5',
    supplierSku: `DEMO-${supplier}-${board ? 'board' : 'cap'}`,
    description: board ? 'Heat pump defrost control board' : 'Run capacitor 5 uF 370 V oval',
    price: exact ? 196.72 : board ? 104.99 : 2.72,
    currency: 'USD',
    unit: 'each',
    packSize: 1,
    branch: 'Synthetic Demo Branch',
    stockQuantity: exact ? 0 : 3,
    stockText: exact ? 'Available in 1–2 days' : '3 available at synthetic branch',
    pickupReady: !exact,
    shippingText: null,
    condition: 'new',
  };
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function registerFixtures(app: FastifyInstance) {
  app.get('/fixtures/:supplier', async (req, reply) => {
    const supplier = (req.params as { supplier: string }).supplier;
    const query = req.query as { q?: string; recovery?: string };
    const offer = query.q ? fixtureOffer(supplier, query.q) : null;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Torq synthetic supplier</title></head><body>
    <h1>DEMO FIXTURE — ${escape(supplier)}</h1><p>All prices, stock and model applicability on this page are synthetic test data.</p>
    <p>Account: Demo shop. Branch: Synthetic Demo Branch.</p>
    <form><label>Search part <input name="q" value="${escape(query.q ?? '')}"></label><button>Search</button></form>
    ${query.recovery ? '<button id="reveal" onclick="document.getElementById(\'details\').hidden=false">Show availability</button>' : ''}
    <section id="details" ${query.recovery ? 'hidden' : ''}><h2>Product details</h2><pre id="offer">${escape(JSON.stringify(offer))}</pre></section>
    <p id="status">${offer ? 'Product found' : 'No product found'}</p></body></html>`;
    return reply.type('text/html').send(html);
  });
}
