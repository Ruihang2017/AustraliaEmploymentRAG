import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../../src/crypto/cipher.js';
import { createEphemeralStore } from '../../src/ephemeral/store.js';
import { at, withTempEphemeralDatabase } from './helpers.js';

const CREATED = at(0);

/**
 * Deliverable 3: the *distinct purpose* is carried by the table component of the AAD. These tests are
 * what prove an app ciphertext cannot be replayed into the ephemeral store, and vice versa.
 */
describe('AAD binding separates app and ephemeral ciphertext', () => {
  it('an app-table ciphertext written into an ephemeral row fails to decrypt', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      const appBytes = encryptField(
        'the sanitized question',
        { organizationId: 'org-ref-1', table: 'job', column: 'payload_ciphertext', rowId: 'job-1' },
        registry,
      );
      handle.run(
        'INSERT INTO ephemeral_job_content (job_id, organization_ref, payload_ciphertext, created_at) ' +
          'VALUES (:jobId, :org, :payload, :createdAt)',
        {
          jobId: 'job-1',
          org: 'org-ref-1',
          payload: appBytes,
          createdAt: CREATED.toISOString(),
        },
      );

      let thrown: unknown;
      try {
        store.getEphemeral('JOB_CONTENT', 'job-1', at(60_000));
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { code?: string } | undefined)?.code).toBe('FIELD_DECRYPT_FAILED');
      expect(JSON.stringify(thrown)).not.toContain('sanitized question');
    });
  });

  it('an ephemeral ciphertext fails to decrypt under the app-table binding', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('JOB_CONTENT', {
        jobId: 'job-2',
        organizationRef: 'org-ref-1',
        payload: 'the sanitized question',
        createdAt: CREATED,
      });
      const row = handle.get<{ payload_ciphertext: Uint8Array }>(
        'SELECT payload_ciphertext FROM ephemeral_job_content WHERE job_id = :jobId',
        { jobId: 'job-2' },
      );
      expect(row?.payload_ciphertext).toBeInstanceOf(Buffer);

      expect(() =>
        decryptField(
          row!.payload_ciphertext,
          { organizationId: 'org-ref-1', table: 'job', column: 'payload_ciphertext', rowId: 'job-2' },
          registry,
        ),
      ).toThrowError(/FIELD_DECRYPT_FAILED/);
    });
  });

  it('a ciphertext written for one ephemeral table fails to decrypt as another', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('EVIDENCE', {
        jobId: 'job-3',
        organizationRef: 'org-ref-1',
        payload: 'evidence excerpts',
        createdAt: CREATED,
      });
      const row = handle.get<{ payload_ciphertext: Uint8Array }>(
        'SELECT payload_ciphertext FROM ephemeral_evidence WHERE job_id = :jobId',
        { jobId: 'job-3' },
      );
      handle.run(
        'INSERT INTO ephemeral_result (job_id, organization_ref, payload_ciphertext, created_at) ' +
          'VALUES (:jobId, :org, :payload, :createdAt)',
        {
          jobId: 'job-3',
          org: 'org-ref-1',
          payload: row?.payload_ciphertext ?? null,
          createdAt: CREATED.toISOString(),
        },
      );

      expect(() => store.getEphemeral('RESULT', 'job-3', at(60_000))).toThrowError(
        /FIELD_DECRYPT_FAILED/,
      );
      expect(store.getEphemeral('EVIDENCE', 'job-3', at(60_000))).toEqual({
        status: 'PRESENT',
        payload: 'evidence excerpts',
      });
    });
  });

  it('binds the row id and the organisation reference too', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      store.putEphemeral('RESULT', {
        jobId: 'job-4',
        organizationRef: 'org-ref-1',
        payload: 'answer',
        createdAt: CREATED,
      });
      const row = handle.get<{ payload_ciphertext: Uint8Array }>(
        'SELECT payload_ciphertext FROM ephemeral_result WHERE job_id = :jobId',
        { jobId: 'job-4' },
      );

      // Same bytes, different job id.
      handle.run(
        'INSERT INTO ephemeral_result (job_id, organization_ref, payload_ciphertext, created_at) ' +
          'VALUES (:jobId, :org, :payload, :createdAt)',
        {
          jobId: 'job-5',
          org: 'org-ref-1',
          payload: row?.payload_ciphertext ?? null,
          createdAt: CREATED.toISOString(),
        },
      );
      expect(() => store.getEphemeral('RESULT', 'job-5', at(60_000))).toThrowError(
        /FIELD_DECRYPT_FAILED/,
      );

      // Same bytes and job id, different organisation reference.
      handle.run('UPDATE ephemeral_result SET organization_ref = :org WHERE job_id = :jobId', {
        jobId: 'job-4',
        org: 'org-ref-2',
      });
      expect(() => store.getEphemeral('RESULT', 'job-4', at(60_000))).toThrowError(
        /FIELD_DECRYPT_FAILED/,
      );
    });
  });
});
