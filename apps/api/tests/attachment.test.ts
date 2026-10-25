import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api } from './helpers/app.js';
import { addProjectMember, auth, createProject, createTask, memberOf, registerAccount } from './helpers/factories.js';

const PNG_HEADER = '89504e470d0a1a0a0000000d494844520000000100000001080600000';
/** Dedup is content-addressed and global, so each test needs its own bytes. */
let pngCounter = 0;
const uniquePng = (): Buffer => {
  pngCounter += 1;
  return Buffer.from(`${PNG_HEADER}${pngCounter.toString(16).padStart(7, '0')}`, 'hex');
};
const PNG = uniquePng();
const storageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'test-storage');

const countStoredBlobs = (): number => {
  if (!fs.existsSync(storageDir)) return 0;
  return fs
    .readdirSync(storageDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .reduce((total, dir) => total + fs.readdirSync(path.join(storageDir, dir.name)).length, 0);
};

const setup = async () => {
  const owner = await registerAccount();
  const project = await createProject(owner, { name: 'Attachments Lab', key: 'ATT' });
  const task = await createTask(owner, project.id, { title: 'Card with files' });
  return { owner, project, task };
};

describe('attachments (FR-G)', () => {
  it('uploads a file and reports its sniffed type', async () => {
    const { owner, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken))
      .attach('file', PNG, 'screenshot.png');

    expect(res.status).toBe(201);
    expect(res.body.attachment.fileName).toBe('screenshot.png');
    expect(res.body.attachment.mimeType).toBe('image/png');
    expect(res.body.attachment.sizeBytes).toBe(PNG.length);
    expect(res.body.attachment.uploadedBy.id).toBeTruthy();
  });

  it('ignores a lying Content-Type and sniffs the real one', async () => {
    const { owner, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken))
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.attachment.mimeType).toBe('text/plain');
  });

  it('stores identical content once, however many times it is attached', async () => {
    const { owner, project, task } = await setup();
    const second = await createTask(owner, project.id, { title: 'Another card' });
    const shared = uniquePng();
    const before = countStoredBlobs();

    await api().post(`/api/v1/tasks/${task.id}/attachments`).set(auth(owner.accessToken)).attach('file', shared, 'a.png');
    await api().post(`/api/v1/tasks/${second.id}/attachments`).set(auth(owner.accessToken)).attach('file', shared, 'b.png');

    expect(countStoredBlobs()).toBe(before + 1);
    expect((await api().get(`/api/v1/tasks/${task.id}/attachments`).set(auth(owner.accessToken))).body.attachments).toHaveLength(1);
    expect((await api().get(`/api/v1/tasks/${second.id}/attachments`).set(auth(owner.accessToken))).body.attachments).toHaveLength(1);
  });

  it('downloads the exact bytes that were uploaded', async () => {
    const { owner, task } = await setup();
    const uploaded = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken)).attach('file', PNG, 'screenshot.png');

    const res = await api().get(uploaded.body.attachment.downloadUrl).set(auth(owner.accessToken)).responseType('blob');
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body)).toEqual(PNG);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toContain('inline');
  });

  it('forces a download for anything it cannot identify', async () => {
    const { owner, task } = await setup();
    const uploaded = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken)).attach('file', Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]), 'blob.bin');

    const res = await api().get(uploaded.body.attachment.downloadUrl).set(auth(owner.accessToken));
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('refuses a download to someone outside the project', async () => {
    const { owner, task } = await setup();
    const uploaded = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken)).attach('file', PNG, 'private.png');
    const { token } = await memberOf(owner, 'MEMBER');

    const res = await api().get(uploaded.body.attachment.downloadUrl).set(auth(token));
    expect(res.status).toBe(403);
  });

  it('reports another tenant’s attachment as missing', async () => {
    const { owner, task } = await setup();
    const uploaded = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken)).attach('file', PNG, 'private.png');
    const outsider = await registerAccount();

    const res = await api().get(uploaded.body.attachment.downloadUrl).set(auth(outsider.accessToken));
    expect(res.status).toBe(404);
  });

  it('keeps the bytes while another attachment still references them', async () => {
    const { owner, project, task } = await setup();
    const second = await createTask(owner, project.id, { title: 'Shares the file' });

    const shared = uniquePng();
    const a = await api().post(`/api/v1/tasks/${task.id}/attachments`).set(auth(owner.accessToken)).attach('file', shared, 'a.png');
    const b = await api().post(`/api/v1/tasks/${second.id}/attachments`).set(auth(owner.accessToken)).attach('file', shared, 'b.png');
    const blobsBefore = countStoredBlobs();

    await api().delete(`/api/v1/attachments/${a.body.attachment.id}`).set(auth(owner.accessToken));
    expect(countStoredBlobs()).toBe(blobsBefore);

    // The survivor still downloads intact.
    const still = await api().get(b.body.attachment.downloadUrl).set(auth(owner.accessToken)).responseType('blob');
    expect(Buffer.from(still.body)).toEqual(shared);

    await api().delete(`/api/v1/attachments/${b.body.attachment.id}`).set(auth(owner.accessToken));
    expect(countStoredBlobs()).toBe(blobsBefore - 1);
  });

  it('lets only the uploader or a project manager delete', async () => {
    const { owner, project, task } = await setup();
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

    const ownersFile = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(owner.accessToken)).attach('file', PNG, 'owners.png');

    const refused = await api().delete(`/api/v1/attachments/${ownersFile.body.attachment.id}`).set(auth(token));
    expect(refused.status).toBe(403);

    const devFile = await api().post(`/api/v1/tasks/${task.id}/attachments`)
      .set(auth(token)).attach('file', Buffer.from('dev notes'), 'notes.txt');
    expect((await api().delete(`/api/v1/attachments/${devFile.body.attachment.id}`).set(auth(token))).status).toBe(200);
  });

  it('counts attachments on the task', async () => {
    const { owner, task } = await setup();
    await api().post(`/api/v1/tasks/${task.id}/attachments`).set(auth(owner.accessToken)).attach('file', PNG, 'one.png');
    const res = await api().get(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect(res.body.task.attachmentCount).toBe(1);
  });
});
