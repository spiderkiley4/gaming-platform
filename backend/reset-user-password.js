import dotenv from 'dotenv';
dotenv.config();
import db from './db.js';
import bcrypt from 'bcryptjs';

const [,, identifier, newPassword] = process.argv;

if (!identifier || !newPassword) {
  console.error('Usage: node reset-user-password.js <username_or_email> <new_password>');
  process.exit(1);
}

async function resetPassword() {
  try {
    // Find user by username or email (case-insensitive)
    const result = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [identifier.toLowerCase()]
    );
    if (result.rows.length === 0) {
      console.error('User not found');
      process.exit(1);
    }
    const userId = result.rows[0].id;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );
    console.log('Password reset successful for user ID:', userId);
    process.exit(0);
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

resetPassword();
