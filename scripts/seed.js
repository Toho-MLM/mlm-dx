#!/usr/bin/env node

const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const { parseArgs } = require('node:util');

const VALID_ROLES = ['MGR', 'CHF', 'MAC', 'MBR', 'ADM', 'NHD', 'NAC'];
const VALID_INSTRUMENTS = ['VO', 'GT', 'KEY', 'DR', 'BA'];

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
  
  return `INSERT OR IGNORE INTO users (id, name, nickname, email, instruments, grade, role, created_at, updated_at) VALUES 
('${id}', NULL, NULL, '${user.email}', '[]', ${user.grade}, '${user.role}', '${timestamp}', '${timestamp}');`;
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
MLM-DX User Management CLI

Usage:
  node scripts/seed.js user <action> [options]

Actions:
  add                     Add a new user
  remove                  Remove a user
  list                    List all users
  reset                   Reset database (recreate schema)

Add Options:
  --email <email>         User's email address (required)
  --grade <grade>         Grade level 1-6 (required)
  --role <role>           Role: MGR,CHF,MAC,MBR,ADM,NHD,NAC (default: MBR)

Remove Options:
  --email <email>         User's email address (required)

Global Options:
  --local                 Use local database (default: false)
  --help                  Show this help message

Examples:
  # Add a user
  node scripts/seed.js user add --email "tanaka@example.com" --grade 3

  # Remove a user
  node scripts/seed.js user remove --email "tanaka@example.com"

  # List users
  node scripts/seed.js user list

  # Reset database
  node scripts/seed.js user reset

  # Use local database
  node scripts/seed.js user add --email "test@example.com" --grade 2 --local
`);
}

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

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }
  
  if (args[0] !== 'user') {
    console.error('ERROR: Only "user" command is supported. Use --help for usage information.');
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
        email: { type: 'string' },
        grade: { type: 'string' },
        role: { type: 'string' },
        local: { type: 'boolean' },
      },
      allowPositionals: true,
    });
    
    const isLocal = values.local === true;
    
    switch (action) {
      case 'add': {
        const email = values.email;
        const grade = values.grade;
        const role = values.role || 'MBR';
        
        if (!email || !grade) {
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
        console.error(`ERROR: Unknown action: ${action}`);
        showHelp();
        process.exit(1);
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
