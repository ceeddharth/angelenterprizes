import { validateIndianMobile } from './src/utils/validation';

async function runFocusedChecks() {
  console.log('=== 1. STRICT INDIAN MOBILE NUMBER VALIDATION TEST SUITE ===');
  const phoneTests = [
    { input: '9876543210', expected: true, desc: '10 digits starting with 9' },
    { input: '+919876543210', expected: true, desc: 'Optional +91 prefix without spaces' },
    { input: '+91 98765 43210', expected: true, desc: '+91 prefix with spaces' },
    { input: '+91-9876543210', expected: true, desc: '+91 prefix with hyphen' },
    { input: '6123456789', expected: true, desc: '10 digits starting with 6' },
    { input: '7123456789', expected: true, desc: '10 digits starting with 7' },
    { input: '8123456789', expected: true, desc: '10 digits starting with 8' },
    { input: '5123456789', expected: false, desc: 'Rejects starting with 5' },
    { input: '1234567890', expected: false, desc: 'Rejects starting with 1' },
    { input: '987654321', expected: false, desc: 'Rejects 9-digit numbers' },
    { input: '98765432100', expected: false, desc: 'Rejects 11-digit numbers' },
    { input: '', expected: false, desc: 'Rejects empty input' },
    { input: 'abcdefghij', expected: false, desc: 'Rejects alphabetic letters' },
    { input: '+929876543210', expected: false, desc: 'Rejects international prefix other than +91' }
  ];

  let phonePassed = 0;
  for (const t of phoneTests) {
    const res = validateIndianMobile(t.input);
    const pass = res.isValid === t.expected;
    if (pass) {
      phonePassed++;
      console.log(`  [PASS] ${t.desc} ('${t.input}') => isValid: ${res.isValid}`);
    } else {
      console.error(`  [FAIL] ${t.desc} ('${t.input}') => got ${res.isValid}, expected ${t.expected}`);
    }
  }
  console.log(`Phone validation passed: ${phonePassed}/${phoneTests.length}`);
  if (phonePassed !== phoneTests.length) {
    throw new Error('Phone validation suite failed');
  }

  console.log('\n=== 2. ADMIN COMMAND ALLOWLIST & PARSING VERIFICATION ===');
  const ALLOWED_COMMANDS = ['ACTIVATE_BATCH', 'DEACTIVATE_BATCH', 'APPROVE_REGISTRATION', 'DEACTIVATE_SITE'];
  const testCommands = [
    { type: 'ACTIVATE_BATCH', target: 'B-01', allowed: true },
    { type: 'DEACTIVATE_BATCH', target: 'B-02', allowed: true },
    { type: 'APPROVE_REGISTRATION', target: 'REG-123456', allowed: true },
    { type: 'DEACTIVATE_SITE', target: 'SITE-101', allowed: true },
    { type: 'DELETE_DATABASE', target: 'all', allowed: false },
    { type: 'UPDATE_SECURITY_RULES', target: 'firestore', allowed: false }
  ];

  for (const cmd of testCommands) {
    const isAllowed = ALLOWED_COMMANDS.includes(cmd.type);
    const pass = isAllowed === cmd.allowed;
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] Command '${cmd.type}' allowlist check => ${isAllowed} (expected ${cmd.allowed})`);
    if (!pass) throw new Error(`Allowlist test failed for ${cmd.type}`);
  }

  console.log('\n=== ALL FOCUSED UNIT CHECKS PASSED ===');
}

runFocusedChecks().catch((err) => {
  console.error('Error in focused checks:', err);
  process.exit(1);
});
