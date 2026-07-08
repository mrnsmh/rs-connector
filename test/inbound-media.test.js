'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { describeIncomingMedia } = require('../src/session');

test('describeIncomingMedia: message texte pur → null', () => {
  assert.equal(describeIncomingMedia({ conversation: 'bonjour' }), null);
  assert.equal(describeIncomingMedia({ extendedTextMessage: { text: 'x' } }), null);
  assert.equal(describeIncomingMedia(null), null);
  assert.equal(describeIncomingMedia({}), null);
});

test('describeIncomingMedia: image avec légende', () => {
  const r = describeIncomingMedia({ imageMessage: { mimetype: 'image/jpeg', caption: 'ma photo' } });
  assert.equal(r.type, 'image');
  assert.equal(r.mimetype, 'image/jpeg');
  assert.equal(r.caption, 'ma photo');
});

test('describeIncomingMedia: document (fileName + fileLength Long) au-delà du cap', () => {
  const r = describeIncomingMedia({
    documentMessage: { mimetype: 'application/pdf', fileName: 'devis.pdf', fileLength: { toNumber: () => 12345 } },
  });
  assert.equal(r.type, 'document');
  assert.equal(r.filename, 'devis.pdf');
  assert.equal(r.fileLength, 12345);
});

test('describeIncomingMedia: note vocale (audio)', () => {
  const r = describeIncomingMedia({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' } });
  assert.equal(r.type, 'audio');
  assert.equal(r.mimetype, 'audio/ogg; codecs=opus');
});

test('describeIncomingMedia: documentWithCaptionMessage → document + légende', () => {
  const r = describeIncomingMedia({
    documentWithCaptionMessage: {
      message: { documentMessage: { mimetype: 'application/pdf', fileName: 'facture.pdf', caption: 'la facture' } },
    },
  });
  assert.equal(r.type, 'document');
  assert.equal(r.filename, 'facture.pdf');
  assert.equal(r.caption, 'la facture');
});
