// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import 'server-only';
import { headers } from 'next/headers';
import { platformServices } from '../../server/platform.mjs';
export async function currentSession() {
  const services = await platformServices();
  const values = Object.fromEntries(await headers());
  // Automation credentials authenticate only through the scoped timeline API.
  const session =
    services.auth && !(values.authorization ?? '').startsWith('Bearer och_key_')
      ? await services.auth.session({ headers: values })
      : null;
  return {
    services,
    session,
    user: session
      ? {
          id: session.id,
          username: session.username,
          isAdmin: !!session.is_admin,
          avatarUrl: session.avatar_url ?? '',
        }
      : null,
  };
}
