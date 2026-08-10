import { describe, expect, it } from 'vitest';
import { duplicateEmails } from './bulk';

describe('duplicateEmails', () => {
  it('入力内で重複したメールだけを返す', () => {
    expect([...duplicateEmails([
      { email: 'a@example.com' }, { email: 'b@example.com' }, { email: 'a@example.com' },
    ])]).toEqual(['a@example.com']);
  });
});

