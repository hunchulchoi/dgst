import { describe, expect, it } from 'vitest';
import { attachGameProfilePhotos, profilePhotoFromUser } from './gameProfilePhotos.js';

describe('game profile photos', () => {
  it('returns the uploaded profile photo', () => {
    expect(profilePhotoFromUser({ photo: ' /profile.webp ' })).toBe('/profile.webp');
  });

  it('returns null when no profile image exists', () => {
    expect(profilePhotoFromUser({ photo: null })).toBeNull();
    expect(profilePhotoFromUser(null)).toBeNull();
  });

  it('only adds a photo field for ranked users who have one', async () => {
    const rows = [
      { _id: 'one@example.com', nickname: 'one' },
      { _id: 'two@example.com', nickname: 'two' }
    ];
    const result = await attachGameProfilePhotos(rows, {
      findUsers: async () => [
        { email: 'one@example.com', photo: '/one.webp' },
        { email: 'two@example.com', photo: null }
      ]
    });

    expect(result).toEqual([{ ...rows[0], photo: '/one.webp' }, rows[1]]);
  });
});
