#!/usr/bin/env node

const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const { parseArgs } = require('node:util');

const VALID_ROLES = ['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC'];

function generateTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function createUserSQL(user) {
  const id = randomUUID();
  const timestamp = generateTimestamp();
  const safeName = (user.name && user.name.trim().length > 0)
    ? user.name.trim()
    : (user.email.split('@')[0]);
  
  return `INSERT INTO users (id, name, nickname, email, instruments, grade, role, created_at, updated_at) VALUES 
('${id}', '${safeName}', NULL, '${user.email}', '[]', ${user.grade}, '${user.role}', '${timestamp}', '${timestamp}');`;
}

function createGroupSQL(group) {
  const id = randomUUID();
  const timestamp = generateTimestamp();
  
  return `INSERT OR IGNORE INTO groups (id, name, is_main, is_active, created_at, updated_at) VALUES 
('${id}', '${group.name}', ${group.isMain ? 'TRUE' : 'FALSE'}, ${group.isActive ? 'TRUE' : 'FALSE'}, '${timestamp}', '${timestamp}');`;
}

function createGroupMemberSQL(groupId, userId, instrument) {
  const id = randomUUID();
  const timestamp = generateTimestamp();
  
  return `INSERT OR IGNORE INTO group_member_instruments (id, group_id, user_id, instrument, created_at, updated_at) VALUES 
('${id}', '${groupId}', '${userId}', '${instrument}', '${timestamp}', '${timestamp}');`;
}

function executeSQL(sql, isLocal = false) {
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --command="${sql}" --local`
    : `wrangler d1 execute mlm-dx-db --command="${sql}"`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
    console.log('SQL executed successfully');
  } catch (error) {
    console.error('ERROR: Failed to execute SQL:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
MLM-DX Database Management CLI

Usage:
  node scripts/seed.js <table> <action> [options]

Tables:
  user                    User management
  reservation             Reservation management
  group                   Group management
  group_member_instrument  Group member instrument management

User Actions:
  add                     Add a new user
  remove                  Remove a user
  list                    List all users
  reset                   Reset database (recreate schema)

Reservation Actions:
  list                    List all reservations
  reset                   Reset reservations table

Group Actions:
  list                    List all groups
  reset                   Reset group table

Group Member Instrument Actions:
  list                    List all group member instruments

Add Options:
  --name <name>          User's display name (required)
  --email <email>         User's email address (required)
  --grade <grade>         Grade level 1-6 (required)
  --role <role>           Role: MGR,CHF,MAC,MBR,ADM,NHD,NAC (default: MBR)

Remove Options:
  --email <email>         User's email address (required)

Global Options:
  --local                 Use local database (default: true)
  --help                  Show this help message

Examples:
  # User management
  node scripts/seed.js user add --email "tanaka@example.com" --grade 3 --name "田中"
  node scripts/seed.js user remove --email "tanaka@example.com"
  node scripts/seed.js user list
  node scripts/seed.js user reset

  # List reservations
  node scripts/seed.js reservation list
  
  # Reset reservations table
  node scripts/seed.js reservation reset

  # List groups
  node scripts/seed.js group list
  
  # List group member instruments
  node scripts/seed.js group_member_instrument list
  
  # Reset group table
  node scripts/seed.js group reset

  # Use local database
  node scripts/seed.js user add --email "test@example.com" --grade 2 --name "テスト" --local
  node scripts/seed.js reservation list --local
  node scripts/seed.js reservation reset --local
  node scripts/seed.js group list --local
  node scripts/seed.js group reset --local
  node scripts/seed.js group_member_instrument list --local
`);
}

// Database utility functions
function resetDatabase(isLocal = false) {
  console.log('Resetting database...');
  
  const schemaPath = './schema.sql';
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --file=${schemaPath} --local`
    : `wrangler d1 execute mlm-dx-db --file=${schemaPath}`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
    console.log('Database reset successfully');
  } catch (error) {
    console.error('ERROR: Failed to reset database:', error.message);
    process.exit(1);
  }
}

function listUsers(isLocal = false) {
  console.log('Listing users...');
  
  const query = 'SELECT id, name, email, grade, role, created_at FROM users ORDER BY created_at DESC';
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --command="${query}" --local`
    : `wrangler d1 execute mlm-dx-db --command="${query}"`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
  } catch (error) {
    console.error('ERROR: Failed to list users:', error.message);
    process.exit(1);
  }
}

function removeUser(email, isLocal = false) {
  console.log(`Removing user with email: ${email}`);
  
  const sql = `DELETE FROM users WHERE email = '${email}'`;
  executeSQL(sql, isLocal);
  console.log('User removed successfully');
}

function listReservations(isLocal = false) {
  console.log('Listing reservations...');
  
  const query = 'SELECT id, user_id, group_id, start_time, end_time, state, created_at FROM reservations ORDER BY created_at DESC';
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --command="${query}" --local`
    : `wrangler d1 execute mlm-dx-db --command="${query}"`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
  } catch (error) {
    console.error('ERROR: Failed to list reservations:', error.message);
    process.exit(1);
  }
}

function listGroups(isLocal = false) {
  console.log('Listing groups...');
  
  const query = 'SELECT id, name, is_main, is_active, created_at FROM groups ORDER BY created_at DESC';
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --command="${query}" --local`
    : `wrangler d1 execute mlm-dx-db --command="${query}"`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
  } catch (error) {
    console.error('ERROR: Failed to list groups:', error.message);
    process.exit(1);
  }
}

function resetReservations(isLocal = false) {
  console.log('Resetting reservations table...');
  
  const sql = 'DELETE FROM reservations';
  executeSQL(sql, isLocal);
  console.log('Reservations table reset successfully');
}

function resetGroups(isLocal = false) {
  console.log('Resetting groups and group_member_instruments tables...');
  
  const sql = 'DELETE FROM group_member_instruments; DELETE FROM groups';
  executeSQL(sql, isLocal);
  console.log('Groups and group_member_instruments tables reset successfully');
}

function listGroupMemberInstruments(isLocal = false) {
  console.log('Listing group member instruments...');
  
  const query = 'SELECT id, group_id, user_id, instrument, created_at FROM group_member_instruments ORDER BY created_at DESC';
  const command = isLocal 
    ? `wrangler d1 execute mlm-dx-db --command="${query}" --local`
    : `wrangler d1 execute mlm-dx-db --command="${query}"`;
  
  try {
    execSync(command, { stdio: 'inherit', cwd: './apps/worker' });
  } catch (error) {
    console.error('ERROR: Failed to list group member instruments:', error.message);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }
  
  const validTables = ['user', 'reservation', 'group', 'group_member_instrument'];
  const table = args[0];
  
  if (!validTables.includes(table)) {
    console.error(`ERROR: Invalid table "${table}". Valid tables: ${validTables.join(', ')}. Use --help for usage information.`);
    process.exit(1);
  }
  
  if (args.length < 2) {
    console.error('ERROR: Missing action. Use --help for usage information.');
    process.exit(1);
  }
  
  const action = args[1];
  
  try {
    const { values } = parseArgs({
      args: args.slice(2),
      options: {
        name: { type: 'string' },
        email: { type: 'string' },
        grade: { type: 'string' },
        role: { type: 'string' },
        local: { type: 'boolean' },
      },
      allowPositionals: true,
    });
    
    const isLocal = values.local !== false;
    
    if (table === 'user') {
      switch (action) {
        case 'add': {
          const email = values.email;
          const grade = values.grade;
          const role = values.role || 'MBR';
          const name = values.name;
          
          if (!email || !grade || !name) {
            console.error('ERROR: Missing required fields. Use --help for usage information.');
            process.exit(1);
          }
          
          if (!validateEmail(email)) {
            console.error('ERROR: Invalid email format');
            process.exit(1);
          }
          
          if (!VALID_ROLES.includes(role)) {
            console.error('ERROR: Invalid role. Valid roles: MGR,CHF,MAC,MBR,ADM,NHD,NAC');
            process.exit(1);
          }
          
          const gradeNum = parseInt(grade);
          if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 6) {
            console.error('ERROR: Grade must be a number between 1 and 6');
            process.exit(1);
          }
          
          const user = {
            name,
            email,
            grade: gradeNum,
            role
          };
          
          const sql = createUserSQL(user);
          executeSQL(sql, isLocal);
          console.log('User added successfully');
          break;
        }
        
        case 'remove': {
          const email = values.email;
          
          if (!email) {
            console.error('ERROR: Email is required for remove action. Use --help for usage information.');
            process.exit(1);
          }
          
          if (!validateEmail(email)) {
            console.error('ERROR: Invalid email format');
            process.exit(1);
          }
          
          removeUser(email, isLocal);
          break;
        }
        
        case 'list': {
          listUsers(isLocal);
          break;
        }
        
        case 'reset': {
          resetDatabase(isLocal);
          break;
        }
        
        default:
          console.error(`ERROR: Unknown action for user table: ${action}`);
          showHelp();
          process.exit(1);
      }
    } else if (table === 'reservation') {
      switch (action) {
        case 'list': {
          listReservations(isLocal);
          break;
        }
        
        case 'reset': {
          resetReservations(isLocal);
          break;
        }
        
        default:
          console.error(`ERROR: Unknown action for reservation table: ${action}`);
          showHelp();
          process.exit(1);
      }
    } else if (table === 'group') {
      switch (action) {
        case 'list': {
          listGroups(isLocal);
          break;
        }
        
        case 'reset': {
          resetGroups(isLocal);
          break;
        }
        
        default:
          console.error(`ERROR: Unknown action for group table: ${action}`);
          showHelp();
          process.exit(1);
      }
    } else if (table === 'group_member_instrument') {
      switch (action) {
        case 'list': {
          listGroupMemberInstruments(isLocal);
          break;
        }
        
        default:
          console.error(`ERROR: Unknown action for group_member_instrument table: ${action}`);
          showHelp();
          process.exit(1);
      }
    }
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createUserSQL, createGroupSQL, createGroupMemberSQL };
