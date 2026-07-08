'use strict';

/**
 * Simulation « réception WhatsApp » AU NIVEAU rs-connect, sans aucun téléphone ni socket réel.
 * Baileys est entièrement mocké (même approche que session.test.js). On injecte un
 * `downloadMediaMessage` mocké (c'est une dépendance injectée) et on émet un événement
 * `messages.upsert` : on vérifie que rs-connect construit bien le payload `media` (base64)
 * transmis à l'application via onIncomingMessage — exactement ce qui part ensuite au webhook.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSession } = require('../src/session');

function buildDeps({ downloadImpl } = {}) {
  const sockEmitter = new EventEmitter();
  const mockSock = {
    ev: {
      on: (e, h) => sockEmitter.on(e, h),
      removeAllListeners: () => sockEmitter.removeAllListeners(),
    },
    ws: { close: () => {} },
    updateMediaMessage: async () => {},
  };
  const deps = {
    makeWASocket: () => mockSock,
    useMultiFileAuthState: async () => ({ state: { creds: { registered: true }, keys: {} }, saveCreds: async () => {} }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0], isLatest: true }),
    makeCacheableSignalKeyStore: (k) => k,
    DisconnectReason: { loggedOut: 401 },
    downloadMediaMessage: downloadImpl || (async () => Buffer.from('FAKE-IMAGE-BYTES')),
    fs: { readdir: async () => [], rm: async () => {} },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  };
  return { deps, sockEmitter };
}

const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function receive(deps, sockEmitter, waMessage, { id = 'WAMID-1', jid = '212600000909@s.whatsapp.net' } = {}) {
  const captured = [];
  const session = createSession(deps, '/tmp/test-auth-sim', { autoReconnect: false, onIncomingMessage: (p) => captured.push(p) });
  await session.connect();
  sockEmitter.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: jid, id }, message: waMessage }] });
  await tick();
  return captured;
}

test('IMAGE reçue → média téléchargé et forwardé en base64 (légende = texte)', async () => {
  const { deps, sockEmitter } = buildDeps();
  const cap = await receive(deps, sockEmitter, { imageMessage: { mimetype: 'image/jpeg', caption: 'Voici la photo', fileLength: 15 } });
  assert.equal(cap.length, 1);
  assert.equal(cap[0].text, 'Voici la photo');
  assert.ok(cap[0].media);
  assert.equal(cap[0].media.type, 'image');
  assert.equal(cap[0].media.mimetype, 'image/jpeg');
  assert.equal(cap[0].media.dataBase64, Buffer.from('FAKE-IMAGE-BYTES').toString('base64'));
});

test('DOCUMENT reçu (PDF) → type/filename/base64 forwardés', async () => {
  const { deps, sockEmitter } = buildDeps({ downloadImpl: async () => Buffer.from('%PDF-1.7 fake') });
  const cap = await receive(deps, sockEmitter, { documentMessage: { mimetype: 'application/pdf', fileName: 'devis.pdf', caption: 'mon devis' } });
  assert.equal(cap[0].media.type, 'document');
  assert.equal(cap[0].media.filename, 'devis.pdf');
  assert.equal(cap[0].media.dataBase64, Buffer.from('%PDF-1.7 fake').toString('base64'));
  assert.equal(cap[0].text, 'mon devis');
});

test('TEXTE seul → aucun média (régression : flux inchangé)', async () => {
  const { deps, sockEmitter } = buildDeps();
  const cap = await receive(deps, sockEmitter, { conversation: 'bonjour' });
  assert.equal(cap[0].text, 'bonjour');
  assert.equal(cap[0].media, null);
});

test('Échec de téléchargement → métadonnées transmises sans octets (dégradation gracieuse)', async () => {
  const { deps, sockEmitter } = buildDeps({ downloadImpl: async () => { throw new Error('download KO'); } });
  const cap = await receive(deps, sockEmitter, { audioMessage: { mimetype: 'audio/ogg' } });
  assert.equal(cap[0].media.type, 'audio');
  assert.equal(cap[0].media.dataBase64, null);
});
