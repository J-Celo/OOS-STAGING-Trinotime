// Storage-independent transaction runner. The adapter must use an atomic CAS of
// the complete set of records described by the planner, including its receipt.
// A successful write followed by a lost response is recovered by reading that
// receipt. Never compensate by restoring an older employee/history snapshot.
export async function runIdentityRenameTransaction({ read, compareAndSet, plan, authorizeReceipt, maxAttempts = 4 }) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const snapshot = await read();
    if (!snapshot || !snapshot.etag || snapshot.value === undefined) {
      throw Object.assign(new Error('Identity storage could not be verified.'), { code: 'IDENTITY_SNAPSHOT_UNVERIFIED' });
    }
    const prepared = await plan(snapshot.value);
    if (prepared.receipt) {
      await authorizeReceipt(prepared.receipt, snapshot.value);
      return { receipt: prepared.receipt, alreadyCommitted: true };
    }
    if (!prepared.next || !prepared.committedReceipt) throw new Error('Incomplete identity transaction plan');
    let result;
    try {
      result = await compareAndSet(prepared.next, snapshot.etag);
    } catch (error) {
      // The caller may retry with the SAME operation ID. Do not issue a new
      // mutation or report success after an ambiguous transport failure.
      throw Object.assign(new Error('Identity operation outcome is unknown. Retry the same operation.'), {
        code: 'IDENTITY_OUTCOME_UNKNOWN', cause: error
      });
    }
    if (result?.preconditionFailed) continue;
    if (result?.committed !== true) throw Object.assign(new Error('Identity commit was not acknowledged.'), { code: 'IDENTITY_OUTCOME_UNKNOWN' });
    // Read back through the same authorization path. No credential payload is
    // returned from this runner; the planner owns the minimal public receipt.
    const confirmed = await read();
    if (!confirmed?.etag || confirmed.value === undefined) throw Object.assign(new Error('Identity readback failed.'), { code: 'IDENTITY_READBACK_FAILED' });
    const verification = await plan(confirmed.value);
    if (!verification.receipt) throw Object.assign(new Error('Identity receipt was not found after commit.'), { code: 'IDENTITY_READBACK_FAILED' });
    await authorizeReceipt(verification.receipt, confirmed.value);
    return { receipt: verification.receipt, alreadyCommitted: false };
  }
  throw Object.assign(new Error('Employee records changed concurrently. Retry the same operation.'), { code: 'IDENTITY_RETRY_REQUIRED' });
}
