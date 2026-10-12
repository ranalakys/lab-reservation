// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION — fill these in after creating your Supabase project
//  See SETUP.md for step-by-step instructions
// ─────────────────────────────────────────────────────────────────

const CONFIG = {
  // Supabase project URL — looks like: https://xxxxxxxxxxxx.supabase.co
  SUPABASE_URL: 'sb_publishable_BYvNuLBIwehbb_Y_eee7XQ_Y83G2y-6',

  // Supabase anon/public key — safe to expose in frontend code
  SUPABASE_ANON_KEY: 'sb_secret_RciM2RC3YzICWOvonXWxoQ_pLUzluZ_',

  // Your university email domain — only this domain can sign in
  ALLOWED_EMAIL_DOMAIN: '@au.edu.kw',

  // Admin emails — these users see the Admin panel
  // Add as many as needed
  ADMIN_EMAILS: [
    'r.lakys@au.edu.kw',
    'a.jumaah@au.edu.kw',
    'a.alnouri@au.edu.kw'
  ],

  // Lab definitions
  LABS: [
    { id: 'lab-a', name: 'Structural Lab',  icon: '🏗️', desc: 'Materials testing & structural analysis' },
    { id: 'lab-b', name: 'Civil Lab',       icon: '🧱', desc: 'Concrete, soil & site investigation' },
  ],

  // Time slots: start hours (24h). Each slot is 1.5 hours.
  // Default: 8:00 AM to 8:00 PM, 8 slots
  SLOT_START_HOURS: [8, 9.5, 11, 12.5, 14, 15.5, 17, 18.5],

  // Max reservations per team per lab per week
  MAX_SLOTS_PER_WEEK: 2,
};
