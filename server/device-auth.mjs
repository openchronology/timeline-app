// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { randomBytes } from 'node:crypto';
import { tokenHash } from './auth.mjs';
import { HttpError } from './store.mjs';
export class DeviceAuth {
  constructor(auth) {
    this.auth = auth;
    this.pool = auth.pool;
  }
  async start(ip) {
    await this.auth.rateLimit(ip);
    const deviceCode = randomBytes(32).toString('hex'),
      alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const userCode = [...randomBytes(10)].map((n) => alphabet[n % alphabet.length]).join('');
    await this.pool.query('DELETE FROM oc_device_logins WHERE expires_at<=now()');
    await this.pool.query(
      "INSERT INTO oc_device_logins(device_hash,user_code,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [tokenHash(deviceCode), userCode],
    );
    return {
      deviceCode,
      userCode,
      verificationUri: this.auth.origin + '/connect/desktop/' + userCode,
      interval: 3,
      expiresIn: 600,
    };
  }
  async approve(session, req, code) {
    this.auth.require(session, req);
    if (
      !Number.isFinite(new Date(session.created_at).getTime()) ||
      Date.now() - new Date(session.created_at).getTime() > 5 * 60000
    )
      throw new HttpError(403, 'Sign in again before approving a desktop connection.');
    if (!/^[A-Z2-9]{10}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop code.');
    await this.auth.rateLimit(req.clientAddress ?? req.socket.remoteAddress ?? 'unknown');
    return this.auth.security.transaction(async (c) => {
      await c.query('SELECT id FROM oc_users WHERE id=$1 FOR UPDATE', [session.id]);
      const live = await this.auth.session(req, c);
      this.auth.require(live, req);
      const result = await c.query(
        'UPDATE oc_device_logins SET user_id=$2,mfa_verified=$3 WHERE user_code=$1 AND user_id IS NULL AND expires_at>now() RETURNING user_code',
        [code, session.id, !!live.mfa_verified],
      );
      if (!result.rows.length)
        throw new HttpError(400, 'Desktop request expired or was already approved.');
      return { ok: true };
    });
  }
  async poll(code) {
    if (!/^[a-f0-9]{64}$/.test(code ?? '')) throw new HttpError(400, 'Invalid desktop request.');
    const { rows } = await this.pool.query(
      "UPDATE oc_device_logins SET last_poll_at=now() WHERE device_hash=$1 AND expires_at>now() AND (last_poll_at IS NULL OR last_poll_at<=now()-interval '3 seconds') RETURNING user_id",
      [tokenHash(code)],
    );
    if (!rows.length)
      throw new HttpError(
        400,
        'Desktop request expired, was used, or is being polled too quickly.',
      );
    if (!rows[0].user_id) return { pending: true };
    return this.auth.security.transaction(async (c) => {
      const user = (
        await c.query('SELECT * FROM oc_users WHERE id=$1 FOR UPDATE', [rows[0].user_id])
      ).rows[0];
      const consumed = await c.query(
        'DELETE FROM oc_device_logins WHERE device_hash=$1 AND user_id IS NOT NULL AND expires_at>now() RETURNING user_id,mfa_verified',
        [tokenHash(code)],
      );
      if (!user || !consumed.rows.length)
        throw new HttpError(400, 'Desktop request was already consumed or revoked.');
      return this.auth.issue(user, 'desktop', consumed.rows[0].mfa_verified, c);
    });
  }
}
