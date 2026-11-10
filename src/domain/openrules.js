// Derives the open-version Firestore rules from firestore.rules, so the two files never diverge.
// The admin e-mail is not hard-coded: it is read from the document meta/admin, which the first user to sign in creates once.
// Used to regenerate firestore.open.rules and checked by tests/domain.test.js.
const ADMIN_LINE = /function poolAdmin\(\) \{[^\n]*\}/;
export function openRules(rules) {
  if (!ADMIN_LINE.test(rules)) throw new Error('В firestore.rules не найдена функция poolAdmin()');
  const out = rules.replace(ADMIN_LINE, [
    'function poolAdmin() { return signedIn() && exists(/databases/$(database)/documents/meta/admin)',
    '      && request.auth.token.email.lower() == get(/databases/$(database)/documents/meta/admin).data.email; }',
    '    // Администратор базы — первый вошедший: документ создаётся один раз и больше не меняется',
    '    // Проверка из мастера настройки (без входа): если этот пустой документ читается — правила вставлены',
    '    match /meta/probe { allow read: if true; allow write: if false; }',
    '    match /meta/admin {',
    '      allow read: if signedIn();',
    '      allow create: if signedIn() && request.resource.data.email == request.auth.token.email.lower();',
    '      allow update, delete: if false;',
    '    }',
  ].join('\n'));
  if (/@gmail\.com/.test(out)) throw new Error('В правилах открытой версии осталась чья-то почта');
  return out;
}
