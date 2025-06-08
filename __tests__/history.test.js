import fs from 'fs';
import path from 'path';
import os from 'os';

let loadHistory;
let saveHistory;
let tempDir;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '.convos-'));
  process.env.HISTORY_DIR = tempDir;
  ({ loadHistory, saveHistory } = await import('../history.js'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.HISTORY_DIR;
});

test('Loading history from an existing file', () => {
  const channelId = '123';
  const expected = [{ role: 'user', content: 'hello' }];
  fs.writeFileSync(path.join(tempDir, `${channelId}.json`), JSON.stringify(expected));
  const result = loadHistory(channelId);
  expect(result).toEqual(expected);
});

test('Handling a corrupted JSON file', () => {
  const channelId = 'bad';
  fs.writeFileSync(path.join(tempDir, `${channelId}.json`), '{bad json');
  const result = loadHistory(channelId);
  expect(Array.isArray(result)).toBe(true);
  expect(result[0].role).toBe('system');
});

test('Saving history and verifying file contents', () => {
  const channelId = 'save';
  const convo = [{ role: 'assistant', content: 'response' }];
  saveHistory(channelId, convo);
  const raw = fs.readFileSync(path.join(tempDir, `${channelId}.json`), 'utf-8');
  expect(JSON.parse(raw)).toEqual(convo);
});
