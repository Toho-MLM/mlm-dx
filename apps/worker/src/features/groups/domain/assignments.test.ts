import { describe, expect, it } from 'vitest';
import { assignmentMemberIds, normalizeAssignments } from './assignments';

const userId = '00000000-0000-4000-8000-000000000001';

describe('normalizeAssignments', () => {
  it('単一IDと配列を配列形式へ正規化する', () => {
    expect(normalizeAssignments({ VO: userId, GT: [userId, userId] })).toEqual({ VO: [userId], GT: [userId] });
  });

  it('未知の楽器と不正なUUIDを拒否する', () => {
    expect(normalizeAssignments({ SAX: userId })).toBeNull();
    expect(normalizeAssignments({ VO: 'invalid' })).toBeNull();
  });

  it('メンバーIDを重複なく返す', () => {
    expect(assignmentMemberIds({ VO: [userId], GT: [userId] })).toEqual([userId]);
  });
});

