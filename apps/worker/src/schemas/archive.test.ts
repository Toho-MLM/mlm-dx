import { describe, expect, it } from 'vitest';
import { CreateArchiveRequestSchema } from './index';

const validArchive = {
  title: '忘年会',
  year: 2025,
};

describe('CreateArchiveRequestSchema', () => {
  it.each([
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=share-token',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL1234567890',
  ])('accepts YouTube URL %s', (youtube_url) => {
    expect(CreateArchiveRequestSchema.safeParse({ ...validArchive, youtube_url }).success).toBe(true);
  });

  it('rejects URLs outside YouTube', () => {
    expect(CreateArchiveRequestSchema.safeParse({
      ...validArchive,
      youtube_url: 'https://example.com/video',
    }).success).toBe(false);
  });

  it.each([1900, 2025, 9999])('accepts four-digit archive year %i', (year) => {
    expect(CreateArchiveRequestSchema.safeParse({
      ...validArchive,
      youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
      year,
    }).success).toBe(true);
  });

  it.each([1899, 10000])('rejects archive year outside the four-digit range: %i', (year) => {
    expect(CreateArchiveRequestSchema.safeParse({
      ...validArchive,
      youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
      year,
    }).success).toBe(false);
  });
});
