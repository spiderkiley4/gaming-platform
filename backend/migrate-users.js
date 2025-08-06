import db from './db.js';

async function migrateUsers() {
  try {
    console.log('Starting user migration...');
    
    // Get all users
    const result = await db.query('SELECT id, username, email FROM users');
    console.log(`Found ${result.rows.length} users to migrate`);
    
    for (const user of result.rows) {
      // Handle null values
      const normalizedUsername = user.username ? user.username.toLowerCase().trim() : '';
      const normalizedEmail = user.email ? user.email.toLowerCase().trim() : '';
      
      // Only update if normalization would change the values
      if (normalizedUsername !== user.username || normalizedEmail !== user.email) {
        console.log(`Migrating user ${user.id}: "${user.username}" -> "${normalizedUsername}", "${user.email}" -> "${normalizedEmail}"`);
        
        await db.query(
          'UPDATE users SET username = $1, email = $2 WHERE id = $3',
          [normalizedUsername, normalizedEmail, user.id]
        );
      }
    }
    
    console.log('User migration completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await db.end();
  }
}

migrateUsers(); 