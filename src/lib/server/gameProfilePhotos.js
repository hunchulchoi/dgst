import { getPrisma } from '$lib/database/prisma.js';

/** @param {{ photo?: unknown; image?: unknown } | null | undefined} user */
export function profilePhotoFromUser(user) {
  for (const value of [user?.photo, user?.image]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * @template {Record<string, unknown>} T
 * @param {T[]} rows
 * @param {{ findUsers?: (args: Record<string, unknown>) => Promise<Array<{ email: string | null; photo?: string | null; image?: string | null }>> }} [options]
 * @returns {Promise<Array<T & { photo?: string }>>}
 */
export async function attachGameProfilePhotos(rows, options = {}) {
  const emails = [
    ...new Set(
      rows
        .map((row) => row.email ?? row._id)
        .filter((value) => typeof value === 'string' && value.length > 0)
    )
  ];
  if (emails.length === 0) return rows;

  try {
    const userRepo = options.findUsers ? null : getPrisma().user;
    const findUsers = options.findUsers ?? userRepo?.findMany?.bind(userRepo);
    if (!findUsers) return rows;
    const users = await findUsers({
      where: { email: { in: /** @type {string[]} */ (emails) } },
      select: { email: true, photo: true, image: true }
    });
    const photos = new Map(
      users
        .filter((user) => typeof user.email === 'string')
        .map((user) => [user.email, profilePhotoFromUser(user)])
    );
    return rows.map((row) => {
      const photo = photos.get(String(row.email ?? row._id ?? ''));
      return photo ? { ...row, photo } : row;
    });
  } catch (error) {
    console.error('[game profile photos]', error);
    return rows;
  }
}
