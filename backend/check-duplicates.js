import db from './db.js';

async function checkDuplicates() {
  try {
    console.log('Checking for duplicate usernames and emails...');
    
    // Check for duplicate usernames (case-insensitive)
    const duplicateUsernames = await db.query(`
      SELECT LOWER(username) as normalized_username, COUNT(*) as count, 
             array_agg(username) as usernames, array_agg(id) as user_ids
      FROM users 
      GROUP BY LOWER(username) 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateUsernames.rows.length > 0) {
      console.log('Found duplicate usernames:');
      duplicateUsernames.rows.forEach(row => {
        console.log(`  "${row.normalized_username}" appears ${row.count} times:`, row.usernames);
        console.log(`    User IDs:`, row.user_ids);
      });
    } else {
      console.log('No duplicate usernames found');
    }
    
    // Check for duplicate emails (case-insensitive)
    const duplicateEmails = await db.query(`
      SELECT LOWER(email) as normalized_email, COUNT(*) as count, 
             array_agg(email) as emails, array_agg(id) as user_ids
      FROM users 
      GROUP BY LOWER(email) 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateEmails.rows.length > 0) {
      console.log('Found duplicate emails:');
      duplicateEmails.rows.forEach(row => {
        console.log(`  "${row.normalized_email}" appears ${row.count} times:`, row.emails);
        console.log(`    User IDs:`, row.user_ids);
      });
    } else {
      console.log('No duplicate emails found');
    }
    
    // Show all users for reference
    const allUsers = await db.query('SELECT id, username, email FROM users ORDER BY id');
    console.log('\nAll users in database:');
    allUsers.rows.forEach(user => {
      console.log(`  ID: ${user.id}, Username: "${user.username}", Email: "${user.email}"`);
    });
    
  } catch (error) {
    console.error('Error checking duplicates:', error);
  } finally {
    await db.end();
  }
}

checkDuplicates(); 