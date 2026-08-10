import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLastOpenedProjectId,
  getLastOpenedProjectId,
  setLastOpenedProjectId,
} from './lastOpened';
import { clearAllStores } from './test-helpers';

beforeEach(async () => {
  await clearAllStores();
});

describe('last-opened project pointer', () => {
  it('is null when nothing has been opened', async () => {
    expect(await getLastOpenedProjectId()).toBeNull();
  });

  it('round-trips a set value', async () => {
    await setLastOpenedProjectId('project_abc');
    expect(await getLastOpenedProjectId()).toBe('project_abc');
  });

  it('overwrites the previous pointer rather than accumulating', async () => {
    await setLastOpenedProjectId('project_a');
    await setLastOpenedProjectId('project_b');
    expect(await getLastOpenedProjectId()).toBe('project_b');
  });

  it('returns null again after clearing', async () => {
    await setLastOpenedProjectId('project_abc');
    await clearLastOpenedProjectId();
    expect(await getLastOpenedProjectId()).toBeNull();
  });
});
