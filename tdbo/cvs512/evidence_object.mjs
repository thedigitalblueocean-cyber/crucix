/**
 * TDBO Evidence Object — Five Anchors Schema
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Every governance event produces an immutable evidence object with five anchors:
 * WHO, WHAT, WHEN, WHERE, OBSERVED_BY
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';
import { v4 as uuidv4 } from 'uuid';

const FIVE_ANCHORS = ['who', 'what', 'when', 'where', 'observed_by'];

export class EvidenceObject {
  static create(payload, eventType, meta = {}) {
    const obj = {
      id: uuidv4(),
      version: '1.0.0',
      protocol: 'CVS-512',
      eventType,
      anchors: {
        who: meta.who || 'crucix-agent',
        what: eventType,
        when: new Date().toISOString(),
        where: meta.where || 'crucix-runtime',
        observed_by: meta.observed_by || 'tdbo-governance-layer'
      },
      payload_hash: EvidenceObject.hashPayload(payload),
      payload_size: JSON.stringify(payload).length,
      created_at: Date.now()
    };
    obj.evidence_hash = EvidenceObject.hashObject(obj);
    return Object.freeze(obj);
  }

  static hashPayload(payload) {
    const canonical = canonicalize(payload);
    const digest = sha256(new TextEncoder().encode(canonical));
    return bytesToHex(digest);
  }

  static hashObject(obj) {
    const { evidence_hash, ...rest } = obj;
    const canonical = canonicalize(rest);
    const digest = sha256(new TextEncoder().encode(canonical));
    return bytesToHex(digest);
  }

  static validate(obj) {
    if (!obj || !obj.anchors) return false;
    for (const anchor of FIVE_ANCHORS) {
      if (!obj.anchors[anchor]) return false;
    }
    if (!obj.evidence_hash || !obj.payload_hash) return false;
    const { evidence_hash, ...rest } = obj;
    const recomputed = EvidenceObject.hashObject({ ...rest, evidence_hash: undefined });
    return recomputed === evidence_hash;
  }
}
