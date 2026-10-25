/**
 * Seeds a narrative workspace so the application is never empty on first run
 * (DATA-MODEL §7).
 *   npm run seed     add demo data when the database is empty
 *   npm run reset    wipe everything and re-seed
 */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { DEFAULT_WORKFLOW, OrgRole, ProjectRole } from '@taskforge/shared';
import { closeDatabase, db } from './client.js';
import {
  activities, boardColumns, boards, commentMentions, comments, labels, notifications,
  organizationMembers, organizations, projectMembers, projects, taskLabels, taskWatchers, tasks, users,
  workflowStatuses,
} from './schema.js';
import { runMigrations } from './migrate.js';
import { ID_PREFIX, newId, newIdAt } from '../core/ids.js';
import { isStale, seedFingerprint, writeStamp } from './seedStamp.js';
import { STEP } from '../core/lexorank.js';

const RESET = process.argv.includes('--reset');
const PASSWORD = 'Password123!';

runMigrations();

if (RESET) {
  db.run(sql`PRAGMA foreign_keys = OFF`);
  for (const table of [activities, notifications, commentMentions, comments, taskLabels, taskWatchers,
    tasks, labels, boardColumns, workflowStatuses, boards, projectMembers, projects,
    organizationMembers, organizations, users]) {
    db.delete(table).run();
  }
  db.run(sql`PRAGMA foreign_keys = ON`);
  console.log('Cleared existing data.');
}

const existing = db.select({ n: sql<number>`count(*)` }).from(users).get();
if (Number(existing?.n ?? 0) > 0 && !RESET) {
  // Say which of the two situations this is. "Nothing to seed" reads like
  // success when the real state is "your data is older than this code".
  if (isStale()) {
    console.log('');
    console.log('  ⚠  This database was seeded from an older version of the demo data.');
    console.log('     Nothing was changed. To load the current demo workspace:');
    console.log('');
    console.log('         npm run reset');
    console.log('');
    console.log('     That deletes everything in the local database and seeds it again.');
    console.log('');
    closeDatabase();
    process.exit(0);
  }
  console.log('Database is already seeded and up to date — nothing to do.');
  closeDatabase();
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(PASSWORD, 10);
const daysFromNow = (n: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10);
};

/**
 * Audit rows are back-dated across the last few days.
 *
 * Seeding writes everything in one transaction, so every entry in the activity
 * feed otherwise reads "just now" — fifteen identical timestamps with nothing
 * to separate them, and the day grouping in the rail never gets to show what
 * it is for.
 */
let activityClock = 0;
const activityMs = (): number => {
  // The feed is ordered newest first by id, and ids are issued in insertion
  // order, so the clock has to run forwards: the first row written is the
  // oldest. Three days of history at roughly ninety minutes a step, ending a
  // few hours ago, which is enough to fill Today, Yesterday and the day before.
  const start = Date.now() - 76 * 3_600_000;
  activityClock += 1;
  return start + activityClock * 1.5 * 3_600_000;
};

/** Both the id and the timestamp of one audit row, from the same instant. */
const activityRow = (): { id: string; createdAt: string } => {
  const ms = activityMs();
  return { id: newIdAt(ID_PREFIX.activity, ms), createdAt: new Date(ms).toISOString() };
};

const people = [
  { key: 'ayesha', name: 'Ayesha Siddiqui', email: 'ayesha@northwind.test', jobTitle: 'Engineering Director', color: '#6366f1', orgRole: OrgRole.OWNER },
  { key: 'sara', name: 'Sara Khan', email: 'sara@northwind.test', jobTitle: 'Product Manager', color: '#0ea5e9', orgRole: OrgRole.ADMIN },
  { key: 'ali', name: 'Ali Raza', email: 'ali@northwind.test', jobTitle: 'Full Stack Engineer', color: '#14b8a6', orgRole: OrgRole.MEMBER },
  { key: 'bilal', name: 'Bilal Ahmed', email: 'bilal@northwind.test', jobTitle: 'Backend Engineer', color: '#f59e0b', orgRole: OrgRole.MEMBER },
  { key: 'hina', name: 'Hina Malik', email: 'hina@northwind.test', jobTitle: 'Product Designer', color: '#ec4899', orgRole: OrgRole.MEMBER },
] as const;

type PersonKey = (typeof people)[number]['key'];

db.transaction((tx) => {
  const organizationId = newId(ID_PREFIX.organization);
  tx.insert(organizations).values({ id: organizationId, name: 'Northwind Labs', slug: 'northwind-labs' }).run();

  const userIds = {} as Record<PersonKey, string>;
  for (const person of people) {
    const id = newId(ID_PREFIX.user);
    userIds[person.key] = id;
    tx.insert(users).values({
      id, email: person.email, passwordHash, name: person.name,
      jobTitle: person.jobTitle, avatarColor: person.color,
    }).run();
    tx.insert(organizationMembers).values({
      id: newId(ID_PREFIX.orgMember), organizationId, userId: id, role: person.orgRole,
    }).run();
  }

  const buildProject = (
    name: string,
    key: string,
    color: string,
    description: string,
    lead: PersonKey,
    members: Array<[PersonKey, ProjectRole]>,
  ) => {
    const projectId = newId(ID_PREFIX.project);
    tx.insert(projects).values({
      id: projectId, organizationId, key, name, color, createdBy: userIds[lead], leadId: userIds[lead],
      description,
    }).run();

    for (const [person, role] of members) {
      tx.insert(projectMembers).values({
        id: newId(ID_PREFIX.projectMember), projectId, userId: userIds[person], role, addedBy: userIds[lead],
      }).run();
    }

    const boardId = newId(ID_PREFIX.board);
    tx.insert(boards).values({ id: boardId, projectId, name: `${name} Board`, isDefault: true }).run();

    const columns = DEFAULT_WORKFLOW.map((status, index) => {
      const statusId = newId(ID_PREFIX.status);
      const columnId = newId(ID_PREFIX.column);
      tx.insert(workflowStatuses).values({
        id: statusId, projectId, name: status.name, category: status.category,
        position: (index + 1) * STEP, isInitial: status.isInitial,
      }).run();
      tx.insert(boardColumns).values({
        id: columnId, boardId, statusId, name: status.name, position: (index + 1) * STEP,
      }).run();
      return { columnId, statusId, category: status.category };
    });

    return { projectId, boardId, columns };
  };

  const platform = buildProject(
    'Platform Core', 'TFG', '#5e6ad2',
    'Authentication, permissions and the board engine. Everything the other teams build on top of.',
    'ayesha',
    [
      ['ayesha', ProjectRole.PROJECT_MANAGER], ['sara', ProjectRole.PROJECT_MANAGER],
      ['ali', ProjectRole.DEVELOPER], ['bilal', ProjectRole.DEVELOPER], ['hina', ProjectRole.VIEWER],
    ],
  );
  const mobile = buildProject(
    'Mobile Revamp', 'MOB', '#0ea5e9',
    'Rebuilding the phone experience for Q4, starting with research and a shared component library.',
    'sara',
    [['sara', ProjectRole.PROJECT_MANAGER], ['hina', ProjectRole.DEVELOPER], ['ali', ProjectRole.DEVELOPER]],
  );
  const portal = buildProject(
    'Customer Portal', 'CUS', '#2f9e68',
    'Self-service billing, invoices and support tickets for customers who would rather not email us.',
    'sara',
    [['sara', ProjectRole.PROJECT_MANAGER], ['bilal', ProjectRole.DEVELOPER], ['hina', ProjectRole.VIEWER]],
  );
  const data = buildProject(
    'Data Platform', 'DAT', '#dd7b1e',
    'The warehouse, the nightly pipelines and the reporting API everything else reads its numbers from.',
    'ayesha',
    [['ayesha', ProjectRole.PROJECT_MANAGER], ['bilal', ProjectRole.DEVELOPER], ['ali', ProjectRole.DEVELOPER]],
  );

  const labelIds: Record<string, string> = {};
  for (const [name, color] of [['backend', '#3d7fd6'], ['frontend', '#8b5cf6'], ['security', '#d93a3f'],
    ['design', '#c2489b'], ['infra', '#dd7b1e'], ['docs', '#2f9e68']] as const) {
    const id = newId(ID_PREFIX.label);
    labelIds[name] = id;
    tx.insert(labels).values({ id, projectId: platform.projectId, name, color }).run();
  }

  const sequences = new Map<string, number>();
  const positions = new Map<string, number>();

  interface TaskSeed {
    title: string; column: number; type?: string; priority?: string;
    assignee?: PersonKey; reporter?: PersonKey; points?: number; due?: number;
    labels?: string[]; parent?: string; description?: string;
  }

  const created = new Map<string, { id: string; path: string; depth: number }>();

  const addTask = (project: typeof platform, seed: TaskSeed, alias?: string): string => {
    const column = project.columns[seed.column]!;
    const id = newId(ID_PREFIX.task);
    const number = (sequences.get(project.projectId) ?? 0) + 1;
    sequences.set(project.projectId, number);
    const positionKey = column.columnId;
    const position = (positions.get(positionKey) ?? 0) + STEP;
    positions.set(positionKey, position);

    const parent = seed.parent ? created.get(seed.parent) : undefined;
    const reporter = userIds[seed.reporter ?? 'sara'];

    tx.insert(tasks).values({
      id, organizationId, projectId: project.projectId, boardId: project.boardId,
      columnId: column.columnId, statusId: column.statusId,
      number,
      type: seed.type ?? (parent ? 'SUBTASK' : 'TASK'),
      title: seed.title, description: seed.description ?? '', priority: seed.priority ?? 'MEDIUM',
      assigneeId: seed.assignee ? userIds[seed.assignee] : null,
      reporterId: reporter,
      parentTaskId: parent?.id ?? null,
      path: parent ? `${parent.path}${parent.id}/` : '/',
      depth: parent ? parent.depth + 1 : 0,
      position,
      storyPoints: seed.points ?? null,
      dueDate: seed.due === undefined ? null : daysFromNow(seed.due),
      resolvedAt: column.category === 'DONE' ? new Date().toISOString() : null,
    }).run();

    tx.insert(taskWatchers).values({ taskId: id, userId: reporter }).onConflictDoNothing().run();
    if (seed.assignee) {
      tx.insert(taskWatchers).values({ taskId: id, userId: userIds[seed.assignee] }).onConflictDoNothing().run();
    }
    for (const label of seed.labels ?? []) {
      if (labelIds[label]) tx.insert(taskLabels).values({ taskId: id, labelId: labelIds[label]! }).run();
    }
    tx.insert(activities).values({
      ...activityRow(),
      organizationId, projectId: project.projectId, actorId: reporter,
      entityType: 'TASK', entityId: id, action: 'created',
      changesJson: JSON.stringify({ title: { from: null, to: seed.title } }),
    }).run();

    // Cards that ended up somewhere other than the first column got there by
    // being moved, and cards with an assignee got there by being assigned.
    // Recording both makes the feed read like work rather than like a fixture.
    if (seed.column > 0) {
      tx.insert(activities).values({
        ...activityRow(),
        organizationId, projectId: project.projectId,
        actorId: seed.assignee ? userIds[seed.assignee] : reporter,
        entityType: 'TASK', entityId: id, action: 'moved',
        changesJson: JSON.stringify({ columnId: { from: project.columns[0]!.columnId, to: column.columnId } }),
      }).run();
    }
    if (seed.assignee && userIds[seed.assignee] !== reporter) {
      tx.insert(activities).values({
        ...activityRow(),
        organizationId, projectId: project.projectId, actorId: reporter,
        entityType: 'TASK', entityId: id, action: 'assigned',
        changesJson: JSON.stringify({ assigneeId: { from: null, to: userIds[seed.assignee] } }),
      }).run();
    }

    if (alias) created.set(alias, { id, path: parent ? `${parent.path}${parent.id}/` : '/', depth: parent ? parent.depth + 1 : 0 });
    return id;
  };

  // A three-level tree, so the hierarchy is visible the moment you open the board.
  addTask(platform, {
    title: 'Identity and access management', column: 2, type: 'EPIC', priority: 'HIGH',
    assignee: 'ayesha', reporter: 'ayesha', labels: ['security'],
    description: 'Everything covering who someone is and what they may do: sign-in, sessions, '
      + 'organisation and project roles, and the audit trail that records the answer.',
  }, 'epic');
  addTask(platform, {
    title: 'Refresh token rotation with reuse detection', column: 2, type: 'STORY', priority: 'CRITICAL',
    assignee: 'ali', points: 8, due: 2, parent: 'epic', labels: ['backend', 'security'],
    description: 'Each refresh issues a new token and retires the old one. Presenting a retired token '
      + 'means it leaked, so the whole session family is revoked.\n\nAcceptance: reuse revokes every '
      + 'session in the family, and the revocation survives the error being thrown.',
  }, 'story');
  addTask(platform, {
    title: 'Hash refresh tokens before storing them', column: 3, priority: 'HIGH',
    assignee: 'ali', points: 2, parent: 'story',
    description: 'A stolen database should not hand over working sessions.',
  });
  addTask(platform, {
    title: 'Revoke the whole family on reuse', column: 1, priority: 'CRITICAL',
    assignee: 'bilal', points: 3, parent: 'story',
    description: 'Revocation must commit outside the transaction that detects the breach.',
  });

  const board: TaskSeed[] = [
    { title: 'Empty states for every board view', column: 0, assignee: 'hina', labels: ['design'], priority: 'LOW',
      description: 'An empty column, an empty My Work and a project with no members currently render as blank space.' },
    { title: 'Audit N+1 queries on the board endpoint', column: 0, assignee: 'bilal', labels: ['backend'], points: 5,
      description: 'The board snapshot issues one query per column for its cards. Fold them into a single scan.' },
    { title: 'Rate-limit the sign-in endpoint', column: 0, assignee: 'bilal', labels: ['security'], priority: 'HIGH', points: 3 },
    { title: 'Set up CI on GitHub Actions', column: 1, assignee: 'bilal', labels: ['infra'], points: 3, due: 5,
      description: 'Typecheck, the API suite and the browser suite on every push.' },
    { title: 'Drag and drop with a keyboard alternative', column: 1, assignee: 'ali', labels: ['frontend'], points: 8, due: 4,
      description: 'Pointer dragging is not enough — every move needs a keyboard path (FR-E-06).' },
    { title: 'Activity feed pagination', column: 1, assignee: 'bilal', labels: ['backend'], points: 3, due: 9 },
    { title: 'Cursor pagination for the comment thread', column: 1, assignee: 'ali', labels: ['backend'], points: 3, priority: 'LOW' },
    { title: 'Permission matrix documentation', column: 2, assignee: 'ayesha', priority: 'LOW', labels: ['docs'], due: 4,
      description: 'One table: organisation role × project role → the permissions that result.' },
    { title: 'Attachment virus scanning', column: 2, assignee: 'bilal', labels: ['security', 'infra'], points: 5, due: 12 },
    { title: 'Tenant isolation test suite', column: 3, assignee: 'ali', labels: ['security'], points: 5,
      description: 'Cross-tenant reads must answer 404, never 403 — a 403 confirms the record exists.' },
    { title: 'Decide on the ordering algorithm', column: 3, assignee: 'ayesha', points: 2, labels: ['docs'],
      description: 'Sparse fractional ranking won: moving one card writes one row.' },
    { title: 'Agree the API error envelope', column: 3, assignee: 'sara', points: 1, labels: ['docs'] },
    { title: 'Content-addressed attachment storage', column: 3, assignee: 'bilal', labels: ['backend'], points: 8 },
  ];
  const boardIds = board.map((seed) => addTask(platform, seed));

  for (const seed of [
    { title: 'Audit the current screens', column: 0, assignee: 'hina' as PersonKey, reporter: 'sara' as PersonKey,
      description: 'Screen-by-screen inventory before anything is redrawn.' },
    { title: 'Define the mobile navigation model', column: 0, assignee: 'hina' as PersonKey, reporter: 'sara' as PersonKey, priority: 'LOW' },
    { title: 'Choose a cross-platform framework', column: 1, assignee: 'ali' as PersonKey, reporter: 'sara' as PersonKey, priority: 'HIGH', due: 7,
      description: 'React Native or a progressive web app. Decide before the component library starts.' },
    { title: 'Shared component library', column: 1, assignee: 'hina' as PersonKey, reporter: 'hina' as PersonKey, points: 13 },
    { title: 'Offline draft syncing', column: 2, assignee: 'ali' as PersonKey, reporter: 'sara' as PersonKey, points: 8, due: 16 },
    { title: 'Interview twenty students', column: 3, assignee: 'sara' as PersonKey, reporter: 'sara' as PersonKey,
      description: 'Six themes came out of it; the top three shaped this quarter.' },
  ]) addTask(mobile, seed);

  for (const seed of [
    { title: 'Invoice history and PDF download', column: 1, assignee: 'bilal' as PersonKey, reporter: 'sara' as PersonKey, points: 8, due: 11 },
    { title: 'Support ticket submission', column: 1, assignee: 'bilal' as PersonKey, reporter: 'sara' as PersonKey, points: 5 },
    { title: 'Payment method management', column: 0, assignee: 'bilal' as PersonKey, reporter: 'sara' as PersonKey, priority: 'HIGH' },
    { title: 'Single sign-on for enterprise customers', column: 0, assignee: 'ayesha' as PersonKey, reporter: 'sara' as PersonKey, priority: 'LOW', due: 14 },
    { title: 'Portal information architecture', column: 3, assignee: 'hina' as PersonKey, reporter: 'sara' as PersonKey, points: 3 },
  ]) addTask(portal, seed);

  for (const seed of [
    { title: 'Nightly pipeline retry and alerting', column: 1, assignee: 'bilal' as PersonKey, reporter: 'ayesha' as PersonKey, priority: 'HIGH', points: 5, due: 6 },
    { title: 'Reporting API cursor pagination', column: 2, assignee: 'ali' as PersonKey, reporter: 'ayesha' as PersonKey, points: 3 },
    { title: 'Warehouse schema for task history', column: 0, assignee: 'ali' as PersonKey, reporter: 'ayesha' as PersonKey, points: 8 },
    { title: 'Drop the legacy metrics table', column: 0, assignee: 'ayesha' as PersonKey, reporter: 'bilal' as PersonKey, priority: 'LOW' },
    { title: 'Backfill six months of activity', column: 3, assignee: 'bilal' as PersonKey, reporter: 'ayesha' as PersonKey, points: 5 },
    { title: 'Query cost budget per workspace', column: 3, assignee: 'ali' as PersonKey, reporter: 'ayesha' as PersonKey, points: 2 },
  ]) addTask(data, seed);

  // Discussion, with a mention that resolves to a real person.
  const dragCardId = boardIds[4]!;
  const thread = newId(ID_PREFIX.comment);
  tx.insert(comments).values({
    id: thread, organizationId, taskId: dragCardId, authorId: userIds.sara,
    body: 'Remember the keyboard path here — @ali can you confirm dnd-kit covers it?',
  }).run();
  tx.insert(commentMentions).values({ commentId: thread, userId: userIds.ali }).run();
  tx.insert(comments).values({
    id: newId(ID_PREFIX.comment), organizationId, taskId: dragCardId, authorId: userIds.ali,
    parentCommentId: thread, body: 'Confirmed — its keyboard sensor is exactly why I picked it.',
  }).run();
  tx.insert(comments).values({
    id: newId(ID_PREFIX.comment), organizationId, taskId: dragCardId, authorId: userIds.hina,
    parentCommentId: thread, body: 'Then the focus ring needs to survive the drop as well. I will mock it.',
  }).run();

  tx.insert(notifications).values({
    id: newId(ID_PREFIX.notification), organizationId, userId: userIds.ali, actorId: userIds.sara,
    type: 'MENTIONED', message: 'mentioned you in Drag and drop with a keyboard alternative',
    projectId: platform.projectId, taskId: dragCardId, commentId: thread,
  }).run();
  tx.insert(notifications).values({
    id: newId(ID_PREFIX.notification), organizationId, userId: userIds.ali, actorId: userIds.ayesha,
    type: 'TASK_ASSIGNED', message: 'assigned you Refresh token rotation with reuse detection',
    projectId: platform.projectId, taskId: created.get('story')!.id,
  }).run();

  for (const [projectId, used] of sequences) {
    tx.update(projects).set({ taskSequence: used }).where(sql`${projects.id} = ${projectId}`).run();
  }
});

writeStamp();
console.log(`\nDemo workspace ready — Northwind Labs. (seed ${seedFingerprint()})`);
console.log('Sign in with any of these accounts (password for all: %s)\n', PASSWORD);
for (const person of people) {
  console.log(`   ${person.email.padEnd(26)} ${person.name.padEnd(18)} ${person.orgRole}`);
}
console.log('');
closeDatabase();
