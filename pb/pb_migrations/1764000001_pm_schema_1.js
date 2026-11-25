/// <reference path="../pb_data/types.d.ts" />
// Migration 1 of the NAS copy: the app's collections (spec 4 § 2.1) and the rules of PocketBase's `users` collection.
// Every app collection is read by its list/view rule and written by nobody through the record API: create, update and delete
// rules are null, so users write only through the write route POST /api/pm/save of pb/pb_hooks/pm.pb.js (coding-standards rule 14).
// Never touches Settings or the `users` auth options (docs/nas-requirements.md, "Who sets what") and never deletes app data:
// the down step is empty on purpose. Checked by tests/pb-server.test.js against a real PocketBase.

migrate((app) => {
  const JSON_MAX = 2097152;
  const users = app.findCollectionByNameOrId('users');

  // PocketBase's own users: each sees only themself; a new user only through OAuth2 sign-in; no edits through the record API
  users.listRule = 'id = @request.auth.id';
  users.viewRule = 'id = @request.auth.id';
  users.createRule = '@request.context = "oauth2"';
  users.updateRule = null;
  users.deleteRule = null;
  app.save(users);

  const stamps = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ];
  // A base collection with the app's rule for reading and no write rules
  function make(name, rule, fields, indexes) {
    const c = new Collection({
      type: 'base',
      name: name,
      listRule: rule,
      viewRule: rule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: fields.concat(stamps),
      indexes: indexes,
    });
    app.save(c);
    return c;
  }

  const projects = make('projects', 'members.id ?= @request.auth.id', [
    { name: 'key', type: 'text', required: true, max: 64 },
    { name: 'members', type: 'relation', collectionId: users.id, cascadeDelete: false, maxSelect: 999 },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_projects_key ON projects (key)',
    'CREATE INDEX idx_pm_projects_updated ON projects (updated)',
  ]);

  const memberRule = 'project.members.id ?= @request.auth.id';
  make('records', memberRule, [
    { name: 'project', type: 'relation', collectionId: projects.id, cascadeDelete: true, maxSelect: 1, required: true },
    { name: 'coll', type: 'text', required: true, max: 40, pattern: '^[A-Za-z]{1,40}$' },
    { name: 'key', type: 'text', required: true, max: 400 },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_records_key ON records (project, coll, key)',
    'CREATE INDEX idx_pm_records_project_updated ON records (project, updated)',
    'CREATE INDEX idx_pm_records_updated ON records (updated)',
  ]);

  make('history', memberRule, [
    { name: 'project', type: 'relation', collectionId: projects.id, cascadeDelete: true, maxSelect: 1, required: true },
    { name: 'key', type: 'text', required: true, max: 400 },
    { name: 'at', type: 'number' },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_history_key ON history (key)',
    'CREATE INDEX idx_pm_history_project_at ON history (project, at)',
  ]);

  make('pool', '@request.auth.id != ""', [
    { name: 'kind', type: 'text', required: true, max: 40 },
    { name: 'key', type: 'text', required: true, max: 400 },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_pool_key ON pool (kind, key)',
    'CREATE INDEX idx_pm_pool_updated ON pool (updated)',
  ]);

  // `admin` comes before `inbox` and `allowed`: their rules name it
  make('admin', '@request.auth.id != ""', [
    { name: 'slot', type: 'text', required: true, max: 20 },
    { name: 'email', type: 'text', max: 400 },
  ], [
    'CREATE UNIQUE INDEX idx_pm_admin_slot ON admin (slot)',
  ]);

  make('inbox', '@collection.admin.email ?= @request.auth.email:lower', [
    { name: 'key', type: 'text', required: true, max: 400 },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_inbox_key ON inbox (key)',
    'CREATE INDEX idx_pm_inbox_updated ON inbox (updated)',
  ]);

  make('allowed', 'email = @request.auth.email:lower || @collection.admin.email ?= @request.auth.email:lower', [
    { name: 'email', type: 'text', required: true, max: 400 },
  ], [
    'CREATE UNIQUE INDEX idx_pm_allowed_email ON allowed (email)',
  ]);

  make('prefs', 'user = @request.auth.id', [
    { name: 'user', type: 'relation', collectionId: users.id, cascadeDelete: true, maxSelect: 1, required: true },
    { name: 'data', type: 'json', maxSize: JSON_MAX },
  ], [
    'CREATE UNIQUE INDEX idx_pm_prefs_user ON prefs (user)',
  ]);

  // The route keeps it in step with each project's `invitedEmails`; an invitee finds their invitation by exact e-mail
  make('invites', 'email = @request.auth.email:lower', [
    { name: 'project', type: 'relation', collectionId: projects.id, cascadeDelete: true, maxSelect: 1, required: true },
    { name: 'email', type: 'text', required: true, max: 400 },
    { name: 'data', type: 'json', maxSize: 65536 },
  ], [
    'CREATE UNIQUE INDEX idx_pm_invites_key ON invites (project, email)',
  ]);
}, (app) => {
  // Empty on purpose: a migration never deletes app data (spec 4 § 2.7)
});
