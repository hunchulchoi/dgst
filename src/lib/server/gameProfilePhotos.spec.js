import { describe, expect, it } from 'vitest';
import { attachGameProfilePhotos, profilePhotoFromUser } from './gameProfilePhotos.js';

describe('game profile photos', () => {
  it('prefers an uploaded profile photo over the account image', () => {
    expect(profilePhotoFromUser({ photo: ' /profile.webp ', image: '/google.png' })).toBe(
      '/profile.webp'
    );
  });

  it('falls back to the account image', () => {
    expect(profilePhotoFromUser({ photo: ' ', image: ' /google.png ' })).toBe('/google.png');
  });

  it('returns null when no profile image exists', () => {
    expect(profilePhotoFromUser({ photo: null, image: '' })).toBeNull();
    expect(profilePhotoFromUser(null)).toBeNull();
  });

  it('only adds a photo field for ranked users who have one', async () => {
    const rows = [
      { _id: 'one@example.com', nickname: 'one' },
      { _id: 'two@example.com', nickname: 'two' }
    ];
    const result = await attachGameProfilePhotos(rows, {
      findUsers: async () => [
        { email: 'one@example.com', photo: '/one.webp', image: null },
        { email: 'two@example.com', photo: null, image: null }
      ]
    });

    expect(result).toEqual([{ ...rows[0], photo: '/one.webp' }, rows[1]]);
  });
});
