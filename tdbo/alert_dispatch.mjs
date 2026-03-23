/**
 * TDBO Alert Dispatch
 * 
 * Governance-wrapped alert dispatch for Discord and Telegram.
 * Every alert passes through the 512 gateway before distribution.
 * Emits AlertDispatched event after every successful push.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

import { v4 as uuidv4 } from 'uuid';

export class AlertDispatch {
  constructor(config = {}) {
    this.gateway = config.gateway || null;
    this.evidenceObject = config.evidenceObject || null;
    this.witnessChain = config.witnessChain || null;
    this.channels = new Map();
    this.dispatched = [];
    this.listeners = new Map();
  }

  registerChannel(name, handler) {
    this.channels.set(name, handler);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      try { handler(data); } catch (e) {
        console.error(`[TDBO:AlertDispatch] Handler error:`, e.message);
      }
    }
  }

  async dispatch(alert, context = {}) {
    const dispatchId = uuidv4();
    const record = {
      dispatchId,
      alert,
      timestamp: Date.now(),
      channels: [],
      gatewayResult: null,
      evidenceId: null,
      status: 'pending'
    };

    // Step 1: Gateway check
    if (this.gateway) {
      const gatewayResult = this.gateway.validate(alert, context);
      record.gatewayResult = gatewayResult;
      if (!gatewayResult.admitted) {
        record.status = 'refused';
        this.dispatched.push(record);
        this._emit('AlertRefused', record);
        console.warn(`[TDBO:AlertDispatch] Alert refused: ${gatewayResult.reason}`);
        return record;
      }
    }

    // Step 2: Dispatch to all registered channels
    for (const [name, handler] of this.channels) {
      try {
        const result = await handler(alert);
        record.channels.push({ name, success: true, result });
      } catch (err) {
        record.channels.push({ name, success: false, error: err.message });
        console.error(`[TDBO:AlertDispatch] Channel ${name} failed:`, err.message);
      }
    }

    // Step 3: Create evidence object
    if (this.evidenceObject) {
      const evidence = this.evidenceObject.create({
        type: 'alert_dispatch',
        dispatchId,
        alert,
        channels: record.channels,
        gatewayResult: record.gatewayResult,
        timestamp: record.timestamp
      });
      record.evidenceId = evidence.id;

      if (this.witnessChain) {
        this.witnessChain.append(evidence);
      }
    }

    record.status = record.channels.some(c => c.success) ? 'dispatched' : 'failed';
    this.dispatched.push(record);

    // Keep only last 500 records
    if (this.dispatched.length > 500) {
      this.dispatched = this.dispatched.slice(-500);
    }

    this._emit('AlertDispatched', record);
    return record;
  }

  getHistory(limit = 50) {
    return this.dispatched.slice(-limit);
  }

  getStats() {
    const total = this.dispatched.length;
    const dispatched = this.dispatched.filter(d => d.status === 'dispatched').length;
    const refused = this.dispatched.filter(d => d.status === 'refused').length;
    const failed = this.dispatched.filter(d => d.status === 'failed').length;
    return { total, dispatched, refused, failed };
  }
}

export default AlertDispatch;
