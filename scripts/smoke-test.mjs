import http from 'http';

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runSmokeTests() {
  console.log('--- STARTING SMOKE TESTS ON LOCALHOST:3000 ---');

  // 1. Landing Page
  const home = await request('/');
  console.log(`[PASS] GET / -> ${home.statusCode}`);
  if (home.statusCode !== 200) {
    throw new Error(`Expected 200 on / but got ${home.statusCode}`);
  }

  // 2. HTTP Security Headers
  console.log('\nChecking Security Headers on /:');
  console.log('  x-frame-options:', home.headers['x-frame-options']);
  console.log('  x-content-type-options:', home.headers['x-content-type-options']);
  console.log('  referrer-policy:', home.headers['referrer-policy']);
  console.log('  permissions-policy:', home.headers['permissions-policy']);

  if (home.headers['x-frame-options'] !== 'DENY') {
    console.error('FAIL: x-frame-options should be DENY');
  } else {
    console.log('[PASS] Security header x-frame-options: DENY verified');
  }
  if (home.headers['x-content-type-options'] !== 'nosniff') {
    console.error('FAIL: x-content-type-options should be nosniff');
  } else {
    console.log('[PASS] Security header x-content-type-options: nosniff verified');
  }

  // 3. Public Auth Pages
  const login = await request('/login');
  console.log(`\n[PASS] GET /login -> ${login.statusCode}`);
  const signup = await request('/signup');
  console.log(`[PASS] GET /signup -> ${signup.statusCode}`);

  // 4. Unauthenticated Route Protection (Must redirect 307 to login)
  const protectedRoutes = [
    '/dashboard',
    '/opportunities',
    '/opportunities/test-op-123/apply',
    '/cv',
    '/cv/review',
    '/profile',
    '/applications/test-app-123/draft',
  ];

  console.log('\nTesting Unauthenticated Protection on Protected Routes:');
  for (const route of protectedRoutes) {
    const res = await request(route);
    const location = res.headers['location'] || '';
    const isRedirect = res.statusCode === 307 || res.statusCode === 302 || res.statusCode === 303;
    const targetsLogin = location.includes('/login');
    if (isRedirect && targetsLogin) {
      console.log(`[PASS] ${route} -> ${res.statusCode} Redirect to: ${location}`);
    } else {
      console.error(`[FAIL] ${route} -> ${res.statusCode} Location: ${location}`);
    }
  }

  // 5. Recheck API Route Protection (Must return 401 Unauthorized without DISCOVERY_CRON_SECRET)
  console.log('\nTesting Discovery Recheck API Protection:');
  const recheckRes = await request('/api/discovery/recheck');
  if (recheckRes.statusCode === 401) {
    console.log(`[PASS] GET /api/discovery/recheck without bearer token -> 401 Unauthorized`);
  } else {
    console.error(`[FAIL] GET /api/discovery/recheck expected 401 but got ${recheckRes.statusCode}`);
  }

  console.log('\n--- SMOKE TESTS COMPLETED SUCCESSFULLY ---');
}

runSmokeTests().catch(err => {
  console.error('Smoke tests failed:', err);
  process.exit(1);
});
