import { describe, expect, it } from 'vitest';
import { initialAdminRegistrationError } from './initial-admin';

describe('initial admin registration policy', () => {
  it('許可メール未設定では登録できない', () => {
    expect(initialAdminRegistrationError('admin@example.invalid', undefined)).toBe('SETUP_NOT_CONFIGURED');
  });

  it('事前設定メール以外の管理者登録を拒否する', () => {
    expect(initialAdminRegistrationError('attacker@example.invalid', 'admin@example.invalid'))
      .toBe('INITIAL_ADMIN_EMAIL_MISMATCH');
  });

  it('メールの大文字小文字と空白を正規化する', () => {
    expect(initialAdminRegistrationError('Admin@Example.invalid', ' admin@example.invalid ')).toBeNull();
  });
});
